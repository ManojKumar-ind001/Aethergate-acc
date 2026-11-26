import { getDb } from '../database/db.ts';
import {
  decryptSecret,
  encryptSecret,
  generateId,
  isPersistentEncryptionKeyConfigured,
} from '../security/crypto.ts';
import { fetchGoogleUserInfo, refreshGoogleAccessToken, verifyGoogleTokenInfo } from '../providers/google/googleAdapter.ts';
import { fetchGitHubUser } from '../providers/github/githubAdapter.ts';
import { verifyAwsIamRole } from '../providers/aws/awsAdapter.ts';
import { createNotification, recordAuditLog, recordSyncHistory } from '../logging/audit.ts';
import type { AccountStatus, ConnectedAccount, ProviderType } from '../../shared/types.ts';

interface AccountRow {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: ProviderType;
  provider_account_id: string;
  display_name: string;
  email: string | null;
  username: string | null;
  avatar_url: string | null;
  status: AccountStatus;
  granted_scopes_json: string;
  token_expires_at: string | null;
  last_verified_at: string | null;
  last_refreshed_at: string | null;
  last_error: string | null;
  authorized_at: string;
  created_at: string;
  algorithm: string | null;
  has_refresh_token: number | null;
  connection_mode: 'iam_role' | 'identity_center' | null;
  aws_account_id: string | null;
  role_arn: string | null;
  external_id_encrypted: string | null;
  region: string | null;
  access_portal_url: string | null;
  role_name: string | null;
  friendly_name: string | null;
}

function mapAccountRow(row: AccountRow): ConnectedAccount {
  let scopes: string[] = [];
  try {
    scopes = JSON.parse(row.granted_scopes_json) as string[];
  } catch {
    scopes = [];
  }

  return {
    id: row.id,
    workspaceId: row.workspace_id,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    displayName: row.display_name,
    email: row.email,
    username: row.username,
    avatarUrl: row.avatar_url,
    status: row.status,
    grantedScopes: scopes,
    tokenExpiresAt: row.token_expires_at,
    lastVerifiedAt: row.last_verified_at,
    lastRefreshedAt: row.last_refreshed_at,
    lastError: row.last_error,
    authorizedAt: row.authorized_at,
    createdAt: row.created_at,
    awsMeta: row.connection_mode
      ? {
          connectionMode: row.connection_mode,
          awsAccountId: row.aws_account_id,
          roleArn: row.role_arn,
          externalIdPresent: Boolean(row.external_id_encrypted),
          region: row.region || 'us-east-1',
          accessPortalUrl: row.access_portal_url,
          roleName: row.role_name,
          friendlyName: row.friendly_name,
        }
      : null,
    credentialSecurity: {
      encryptedAtRest: Boolean(row.algorithm),
      algorithm: row.algorithm || 'aes-256-gcm',
      hasRefreshToken: Boolean(row.has_refresh_token),
      keyConfigured: isPersistentEncryptionKeyConfigured(),
    },
  };
}

export function listWorkspaceAccounts(workspaceId: string): ConnectedAccount[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT ca.*, pc.algorithm, pc.has_refresh_token,
             ac.connection_mode, ac.aws_account_id, ac.role_arn, ac.external_id_encrypted,
             ac.region, ac.access_portal_url, ac.role_name, ac.friendly_name
      FROM connected_accounts ca
      LEFT JOIN provider_credentials pc ON pc.connected_account_id = ca.id
      LEFT JOIN aws_connections ac ON ac.connected_account_id = ca.id
      WHERE ca.workspace_id = ?
      ORDER BY ca.created_at DESC
    `)
    .all(workspaceId) as AccountRow[];

  return rows.map(mapAccountRow);
}

export function getWorkspaceAccountById(workspaceId: string, accountId: string): ConnectedAccount | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT ca.*, pc.algorithm, pc.has_refresh_token,
             ac.connection_mode, ac.aws_account_id, ac.role_arn, ac.external_id_encrypted,
             ac.region, ac.access_portal_url, ac.role_name, ac.friendly_name
      FROM connected_accounts ca
      LEFT JOIN provider_credentials pc ON pc.connected_account_id = ca.id
      LEFT JOIN aws_connections ac ON ac.connected_account_id = ca.id
      WHERE ca.workspace_id = ? AND ca.id = ?
    `)
    .get(workspaceId, accountId) as AccountRow | undefined;

  return row ? mapAccountRow(row) : null;
}

export function getDecryptedCredentials(accountId: string): {
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  awsExternalId?: string;
} | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT encrypted_payload, iv, auth_tag
      FROM provider_credentials
      WHERE connected_account_id = ?
    `)
    .get(accountId) as { encrypted_payload: string; iv: string; auth_tag: string } | undefined;

  if (!row) return null;
  try {
    const json = decryptSecret({
      ciphertext: row.encrypted_payload,
      iv: row.iv,
      authTag: row.auth_tag,
    });
    return JSON.parse(json) as {
      accessToken?: string;
      refreshToken?: string;
      idToken?: string;
      awsExternalId?: string;
    };
  } catch {
    return null;
  }
}

export function upsertOAuthConnectedAccount(params: {
  workspaceId: string;
  userId: string;
  provider: 'google' | 'github';
  providerAccountId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  scopes: string[];
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  tokenExpiresAt: string | null;
}): ConnectedAccount {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare(`
      SELECT id FROM connected_accounts
      WHERE workspace_id = ? AND provider = ? AND provider_account_id = ?
    `)
    .get(params.workspaceId, params.provider, params.providerAccountId) as { id: string } | undefined;

  const accountId = existing?.id ?? generateId('acc');
  const encrypted = encryptSecret(
    JSON.stringify({
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      idToken: params.idToken,
    })
  );

  const tx = db.transaction(() => {
    if (existing) {
      db.prepare(`
        UPDATE connected_accounts
        SET display_name = ?, email = ?, username = ?, avatar_url = ?,
            status = 'connected', granted_scopes_json = ?, token_expires_at = ?,
            last_verified_at = ?, last_refreshed_at = ?, last_error = NULL,
            authorized_at = ?, updated_at = ?
        WHERE id = ?
      `).run(
        params.displayName,
        params.email,
        params.username,
        params.avatarUrl,
        JSON.stringify(params.scopes),
        params.tokenExpiresAt,
        now,
        now,
        now,
        now,
        accountId
      );

      db.prepare(`
        UPDATE provider_credentials
        SET encrypted_payload = ?, iv = ?, auth_tag = ?, has_refresh_token = ?, updated_at = ?
        WHERE connected_account_id = ?
      `).run(
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        params.refreshToken ? 1 : 0,
        now,
        accountId
      );
    } else {
      db.prepare(`
        INSERT INTO connected_accounts (
          id, workspace_id, user_id, provider, provider_account_id, display_name,
          email, username, avatar_url, status, granted_scopes_json, token_expires_at,
          last_verified_at, last_refreshed_at, last_error, authorized_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', ?, ?, ?, ?, NULL, ?, ?, ?)
      `).run(
        accountId,
        params.workspaceId,
        params.userId,
        params.provider,
        params.providerAccountId,
        params.displayName,
        params.email,
        params.username,
        params.avatarUrl,
        JSON.stringify(params.scopes),
        params.tokenExpiresAt,
        now,
        now,
        now,
        now,
        now
      );

      db.prepare(`
        INSERT INTO provider_credentials (
          id, connected_account_id, encrypted_payload, iv, auth_tag, algorithm, has_refresh_token, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'aes-256-gcm', ?, ?)
      `).run(
        generateId('crd'),
        accountId,
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        params.refreshToken ? 1 : 0,
        now
      );
    }
  });

  tx();
  return getWorkspaceAccountById(params.workspaceId, accountId)!;
}

export async function verifyConnectedAccount(
  workspaceId: string,
  accountId: string,
  actorLabel: string
): Promise<ConnectedAccount> {
  const db = getDb();
  const account = getWorkspaceAccountById(workspaceId, accountId);
  if (!account) {
    throw new Error('Connected account not found');
  }

  const now = new Date().toISOString();

  if (account.provider === 'google') {
    const creds = getDecryptedCredentials(accountId);
    if (!creds?.accessToken) {
      db.prepare(`UPDATE connected_accounts SET status = 'reauth_required', last_error = ?, updated_at = ? WHERE id = ?`)
        .run('Encrypted credentials could not be decrypted. Reauthentication is required.', now, accountId);
      throw new Error('Encrypted credentials unavailable. Please reconnect Google account.');
    }

    const tokenInfo = await verifyGoogleTokenInfo(creds.accessToken);
    if (tokenInfo.active) {
      const userInfo = await fetchGoogleUserInfo(creds.accessToken);
      const expiresAt = tokenInfo.expiresIn
        ? new Date(Date.now() + tokenInfo.expiresIn * 1000).toISOString()
        : account.tokenExpiresAt;
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'connected', display_name = ?, email = ?, avatar_url = ?,
            token_expires_at = ?, last_verified_at = ?, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        userInfo.name || account.displayName,
        userInfo.email || account.email,
        userInfo.picture || account.avatarUrl,
        expiresAt,
        now,
        now,
        accountId
      );
    } else if (creds.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(creds.refreshToken);
        const userInfo = await fetchGoogleUserInfo(refreshed.access_token);
        const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
        const encrypted = encryptSecret(
          JSON.stringify({
            accessToken: refreshed.access_token,
            refreshToken: refreshed.refresh_token || creds.refreshToken,
            idToken: refreshed.id_token || creds.idToken,
          })
        );
        db.prepare(`
          UPDATE provider_credentials
          SET encrypted_payload = ?, iv = ?, auth_tag = ?, updated_at = ?
          WHERE connected_account_id = ?
        `).run(encrypted.ciphertext, encrypted.iv, encrypted.authTag, now, accountId);

        db.prepare(`
          UPDATE connected_accounts
          SET status = 'connected', display_name = ?, email = ?, avatar_url = ?,
              token_expires_at = ?, last_verified_at = ?, last_refreshed_at = ?, last_error = NULL, updated_at = ?
          WHERE id = ?
        `).run(
          userInfo.name || account.displayName,
          userInfo.email || account.email,
          userInfo.picture || account.avatarUrl,
          expiresAt,
          now,
          now,
          now,
          accountId
        );

        recordAuditLog({
          workspaceId,
          actorLabel,
          eventType: 'token_refreshed',
          provider: 'google',
          resourceType: 'connected_account',
          resourceId: accountId,
          action: `Refreshed OAuth access token for ${account.email || account.displayName}`,
          result: 'success',
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Google token refresh failed';
        db.prepare(`
          UPDATE connected_accounts
          SET status = 'reauth_required', last_error = ?, updated_at = ?
          WHERE id = ?
        `).run(msg, now, accountId);
        createNotification({
          workspaceId,
          category: 'token_refresh_failed',
          severity: 'error',
          title: 'Google token refresh failed',
          message: `${account.email || account.displayName} requires reauthentication: ${msg}`,
          actionRoute: 'accounts',
          actionLabel: 'Reconnect Account',
        });
        recordAuditLog({
          workspaceId,
          actorLabel,
          eventType: 'authorization_failed',
          provider: 'google',
          resourceType: 'connected_account',
          resourceId: accountId,
          action: `Token refresh failed for ${account.email || account.displayName}`,
          result: 'failure',
          metadata: { error: msg },
        });
        return getWorkspaceAccountById(workspaceId, accountId)!;
      }
    } else {
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'expired', last_error = 'Access token expired and no refresh token is stored.', updated_at = ?
        WHERE id = ?
      `).run(now, accountId);
    }
  } else if (account.provider === 'github') {
    const creds = getDecryptedCredentials(accountId);
    if (!creds?.accessToken) {
      db.prepare(`UPDATE connected_accounts SET status = 'reauth_required', last_error = 'Missing encrypted token', updated_at = ? WHERE id = ?`)
        .run(now, accountId);
      return getWorkspaceAccountById(workspaceId, accountId)!;
    }
    try {
      const gh = await fetchGitHubUser(creds.accessToken);
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'connected', display_name = ?, email = ?, username = ?, avatar_url = ?,
            granted_scopes_json = ?, last_verified_at = ?, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(
        gh.profile.name || gh.profile.login,
        gh.primaryEmail,
        gh.profile.login,
        gh.profile.avatar_url,
        JSON.stringify(gh.scopes),
        now,
        now,
        accountId
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'GitHub verification failed';
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'reauth_required', last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(msg, now, accountId);
      createNotification({
        workspaceId,
        category: 'auth_expired',
        severity: 'error',
        title: 'GitHub authorization verification failed',
        message: `${account.username || account.displayName}: ${msg}`,
        actionRoute: 'accounts',
        actionLabel: 'Reconnect GitHub',
      });
    }
  } else if (account.awsMeta?.connectionMode === 'iam_role' && account.awsMeta.roleArn) {
    const awsRow = db
      .prepare('SELECT external_id_encrypted, external_id_iv, external_id_tag FROM aws_connections WHERE connected_account_id = ?')
      .get(accountId) as
      | { external_id_encrypted: string | null; external_id_iv: string | null; external_id_tag: string | null }
      | undefined;

    let externalId: string | undefined;
    if (awsRow?.external_id_encrypted && awsRow.external_id_iv && awsRow.external_id_tag) {
      try {
        externalId = decryptSecret({
          ciphertext: awsRow.external_id_encrypted,
          iv: awsRow.external_id_iv,
          authTag: awsRow.external_id_tag,
        });
      } catch {
        externalId = undefined;
      }
    }

    try {
      const stsResult = await verifyAwsIamRole({
        roleArn: account.awsMeta.roleArn,
        externalId,
        region: account.awsMeta.region,
      });
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'connected', last_verified_at = ?, token_expires_at = ?, last_error = NULL, updated_at = ?
        WHERE id = ?
      `).run(now, stsResult.expiration, now, accountId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AWS STS AssumeRole verification failed';
      db.prepare(`
        UPDATE connected_accounts
        SET status = 'verification_failed', last_error = ?, updated_at = ?
        WHERE id = ?
      `).run(msg, now, accountId);
      createNotification({
        workspaceId,
        category: 'aws_access_denied',
        severity: 'error',
        title: 'AWS IAM Role verification failed',
        message: `${account.displayName}: ${msg}`,
        actionRoute: 'accounts',
        actionLabel: 'Inspect AWS Connection',
      });
    }
  } else {
    db.prepare(`UPDATE connected_accounts SET last_verified_at = ?, updated_at = ? WHERE id = ?`)
      .run(now, now, accountId);
  }

  const updated = getWorkspaceAccountById(workspaceId, accountId)!;
  recordAuditLog({
    workspaceId,
    actorLabel,
    eventType: 'account_verified',
    provider: updated.provider,
    resourceType: 'connected_account',
    resourceId: accountId,
    action: `Verified connection status for ${updated.displayName}`,
    result: updated.status === 'connected' ? 'success' : 'warning',
    metadata: { status: updated.status },
  });
  recordSyncHistory({
    workspaceId,
    connectedAccountId: accountId,
    syncType: 'account_verification',
    status: updated.status === 'connected' ? 'success' : 'failed',
    summary: `Status=${updated.status}`,
  });

  return updated;
}
