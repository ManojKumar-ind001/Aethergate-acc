import { Router, type Request } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.ts';
import { requireUserSession } from '../middleware/sessionAuth.ts';
import {
  encryptSecret,
  generateId,
  generatePkcePair,
  isPersistentEncryptionKeyConfigured,
} from '../security/crypto.ts';
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  isGoogleOAuthConfigured,
} from '../providers/google/googleAdapter.ts';
import {
  buildGitHubAuthUrl,
  exchangeGitHubCode,
  fetchGitHubUser,
  isGitHubOAuthConfigured,
} from '../providers/github/githubAdapter.ts';
import {
  isAwsServerCredentialsConfigured,
  validateAwsAccountId,
  validateAwsRegion,
  validateAwsRoleArn,
  validateIdentityCenterPortalUrl,
  verifyAwsIamRole,
} from '../providers/aws/awsAdapter.ts';
import {
  getWorkspaceAccountById,
  listWorkspaceAccounts,
  upsertOAuthConnectedAccount,
  verifyConnectedAccount,
} from '../services/accountService.ts';
import { createNotification, recordAuditLog } from '../logging/audit.ts';
import type { ProviderConfigStatus } from '../../shared/types.ts';

export const oauthRouter = Router();

function getBaseUrl(req: Request): string {
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL') {
    return envUrl.replace(/\/$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string | undefined) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`.replace(/\/$/, '');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPopupCallbackHtml(payload: {
  ok: boolean;
  provider: string;
  accountLabel?: string;
  error?: string;
}): string {
  const safeJson = JSON.stringify({
    type: 'ACCOUNTBRIDGE_OAUTH_RESULT',
    ok: payload.ok,
    provider: payload.provider,
    accountLabel: payload.accountLabel,
    error: payload.error,
  }).replace(/</g, '\\u003c');

  const title = payload.ok ? 'Account Connected' : 'Authorization Failed';
  const msg = payload.ok
    ? `${escapeHtml(payload.provider)} identity (${escapeHtml(payload.accountLabel || 'authorized')}) connected to AetherGate. This window will close automatically.`
    : `Could not complete ${escapeHtml(payload.provider)} authorization: ${escapeHtml(payload.error || 'Unknown error')}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title} — AetherGate</title>
    <style>
      body { background:#06080C; color:#F5F7FA; font-family:system-ui,-apple-system,sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:24px; }
      .box { max-width:420px; background:rgba(20,24,33,0.85); border:1px solid rgba(255,255,255,0.12); border-radius:16px; padding:24px; backdrop-filter:blur(24px); }
      h1 { font-size:16px; margin:0 0 8px; }
      p { font-size:13px; color:#9AA5B2; line-height:1.5; margin:0 0 16px; }
      button { background:#0A84FF; color:#FFFFFF; border:none; border-radius:8px; padding:8px 14px; font-weight:600; font-size:13px; cursor:pointer; }
    </style>
  </head>
  <body>
    <div class="box">
      <h1>${title}</h1>
      <p>${msg}</p>
      <button onclick="window.close()">Close Window</button>
    </div>
    <script>
      (function() {
        var payload = ${safeJson};
        if (window.opener) {
          window.opener.postMessage(payload, '*');
          setTimeout(function() { window.close(); }, 600);
        }
      })();
    </script>
  </body>
</html>`;
}

oauthRouter.get('/providers/config', requireUserSession, (req, res) => {
  const baseUrl = getBaseUrl(req);
  const status: ProviderConfigStatus = {
    google: {
      configured: isGoogleOAuthConfigured(),
      callbackUrls: [`${baseUrl}/api/oauth/google/callback`],
    },
    github: {
      configured: isGitHubOAuthConfigured(),
      callbackUrls: [`${baseUrl}/api/oauth/github/callback`],
    },
    aws: {
      serverCredentialsConfigured: isAwsServerCredentialsConfigured(),
      defaultRegion: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    },
    gemini: {
      serverKeyConfigured: Boolean(
        process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
      ),
    },
    encryption: {
      persistentKeyConfigured: isPersistentEncryptionKeyConfigured(),
    },
  };
  res.json(status);
});

oauthRouter.get('/oauth/google/url', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/oauth/google/callback`;

  if (!isGoogleOAuthConfigured()) {
    res.status(503).json({
      code: 'GOOGLE_OAUTH_NOT_CONFIGURED',
      error: 'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured on the server.',
      callbackUrl: redirectUri,
    });
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO oauth_states (state, workspace_id, user_id, provider, code_verifier, redirect_uri, expires_at, created_at)
    VALUES (?, ?, ?, 'google', ?, ?, ?, ?)
  `).run(state, auth.workspaceId, auth.userId, codeVerifier, redirectUri, expiresAt, new Date().toISOString());

  const url = buildGoogleAuthUrl({ redirectUri, state, codeChallenge });
  res.json({ url, redirectUri });
});

oauthRouter.get(['/oauth/google/callback', '/oauth/google/callback/'], async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'Google', error: oauthError }));
    return;
  }
  if (!code || !state) {
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'Google', error: 'Missing code or state parameter.' }));
    return;
  }

  const db = getDb();
  const stateRow = db
    .prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?')
    .get(state, 'google') as
    | {
        state: string;
        workspace_id: string;
        user_id: string;
        code_verifier: string;
        redirect_uri: string;
        expires_at: string;
      }
    | undefined;

  if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
    if (stateRow) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'Google', error: 'OAuth state expired or invalid.' }));
    return;
  }

  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

  try {
    const tokens = await exchangeGoogleCode({
      code,
      redirectUri: stateRow.redirect_uri,
      codeVerifier: stateRow.code_verifier,
    });
    const userInfo = await fetchGoogleUserInfo(tokens.access_token);
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    const account = upsertOAuthConnectedAccount({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      provider: 'google',
      providerAccountId: userInfo.sub,
      displayName: userInfo.name || userInfo.email || `Google (${userInfo.sub})`,
      email: userInfo.email || null,
      username: null,
      avatarUrl: userInfo.picture || null,
      scopes: tokens.scope ? tokens.scope.split(' ').filter(Boolean) : ['openid', 'email', 'profile'],
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      tokenExpiresAt: expiresAt,
    });

    recordAuditLog({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      actorLabel: userInfo.email || stateRow.user_id,
      eventType: 'account_connected',
      provider: 'google',
      resourceType: 'connected_account',
      resourceId: account.id,
      action: `Connected Google account ${account.email || account.providerAccountId}`,
      result: 'success',
      metadata: { providerAccountId: account.providerAccountId },
    });

    res.send(
      renderPopupCallbackHtml({
        ok: true,
        provider: 'Google',
        accountLabel: account.email || account.displayName,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google OAuth exchange failed';
    recordAuditLog({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      actorLabel: stateRow.user_id,
      eventType: 'authorization_failed',
      provider: 'google',
      resourceType: 'oauth_callback',
      action: 'Google OAuth authorization callback failed',
      result: 'failure',
      metadata: { error: msg },
    });
    res.status(500).send(renderPopupCallbackHtml({ ok: false, provider: 'Google', error: msg }));
  }
});

oauthRouter.get('/oauth/github/url', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}/api/oauth/github/callback`;

  if (!isGitHubOAuthConfigured()) {
    res.status(503).json({
      code: 'GITHUB_OAUTH_NOT_CONFIGURED',
      error: 'GitHub OAuth credentials (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) are not configured on the server.',
      callbackUrl: redirectUri,
    });
    return;
  }

  const state = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const db = getDb();
  db.prepare(`
    INSERT INTO oauth_states (state, workspace_id, user_id, provider, code_verifier, redirect_uri, expires_at, created_at)
    VALUES (?, ?, ?, 'github', NULL, ?, ?, ?)
  `).run(state, auth.workspaceId, auth.userId, redirectUri, expiresAt, new Date().toISOString());

  const url = buildGitHubAuthUrl({ redirectUri, state });
  res.json({ url, redirectUri });
});

oauthRouter.get(['/oauth/github/callback', '/oauth/github/callback/'], async (req, res) => {
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';

  if (oauthError) {
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'GitHub', error: oauthError }));
    return;
  }
  if (!code || !state) {
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'GitHub', error: 'Missing code or state parameter.' }));
    return;
  }

  const db = getDb();
  const stateRow = db
    .prepare('SELECT * FROM oauth_states WHERE state = ? AND provider = ?')
    .get(state, 'github') as
    | { state: string; workspace_id: string; user_id: string; redirect_uri: string; expires_at: string }
    | undefined;

  if (!stateRow || new Date(stateRow.expires_at).getTime() <= Date.now()) {
    if (stateRow) db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    res.status(400).send(renderPopupCallbackHtml({ ok: false, provider: 'GitHub', error: 'OAuth state expired or invalid.' }));
    return;
  }

  db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);

  try {
    const tokenRes = await exchangeGitHubCode({ code, redirectUri: stateRow.redirect_uri });
    const gh = await fetchGitHubUser(tokenRes.access_token);

    const account = upsertOAuthConnectedAccount({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      provider: 'github',
      providerAccountId: String(gh.profile.id),
      displayName: gh.profile.name || gh.profile.login,
      email: gh.primaryEmail,
      username: gh.profile.login,
      avatarUrl: gh.profile.avatar_url,
      scopes: gh.scopes.length ? gh.scopes : ['read:user', 'user:email'],
      accessToken: tokenRes.access_token,
      tokenExpiresAt: null,
    });

    if (gh.profile.plan?.name) {
      db.prepare(`
        INSERT INTO entitlements (
          id, workspace_id, connected_account_id, provider, account_label,
          entitlement_type, available_amount, currency, expiry_date, status,
          source, verification_status, notes, last_checked_at
        ) VALUES (?, ?, ?, 'github', ?, 'GitHub Subscription Plan', ?, NULL, NULL, 'VERIFIED', 'Provider API', 'verified', ?, ?)
      `).run(
        generateId('ent'),
        stateRow.workspace_id,
        account.id,
        gh.profile.login,
        gh.profile.plan.name,
        `Private repos limit: ${gh.profile.plan.private_repos}, collaborators: ${gh.profile.plan.collaborators}`,
        new Date().toISOString()
      );
    }

    recordAuditLog({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      actorLabel: gh.primaryEmail || gh.profile.login,
      eventType: 'account_connected',
      provider: 'github',
      resourceType: 'connected_account',
      resourceId: account.id,
      action: `Connected GitHub identity @${gh.profile.login}`,
      result: 'success',
      metadata: { providerAccountId: String(gh.profile.id) },
    });

    res.send(
      renderPopupCallbackHtml({
        ok: true,
        provider: 'GitHub',
        accountLabel: `@${gh.profile.login}`,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GitHub OAuth exchange failed';
    recordAuditLog({
      workspaceId: stateRow.workspace_id,
      userId: stateRow.user_id,
      actorLabel: stateRow.user_id,
      eventType: 'authorization_failed',
      provider: 'github',
      resourceType: 'oauth_callback',
      action: 'GitHub OAuth callback failed',
      result: 'failure',
      metadata: { error: msg },
    });
    res.status(500).send(renderPopupCallbackHtml({ ok: false, provider: 'GitHub', error: msg }));
  }
});

oauthRouter.post('/providers/aws/iam-role', requireUserSession, async (req, res) => {
  const auth = req.auth!;
  const { accountId, roleArn, externalId, region, friendlyName } = req.body as {
    accountId?: string;
    roleArn?: string;
    externalId?: string;
    region?: string;
    friendlyName?: string;
  };

  if (!accountId || !validateAwsAccountId(accountId)) {
    res.status(400).json({ error: 'AWS Account ID must be a 12-digit number.' });
    return;
  }
  if (!roleArn || !validateAwsRoleArn(roleArn)) {
    res.status(400).json({ error: 'Role ARN must match arn:aws:iam::<12-digit-id>:role/<role-name>.' });
    return;
  }
  const cleanRegion = (region || 'us-east-1').trim();
  if (!validateAwsRegion(cleanRegion)) {
    res.status(400).json({ error: 'Invalid AWS region format (e.g., us-east-1).' });
    return;
  }
  if (!friendlyName || friendlyName.trim().length < 2) {
    res.status(400).json({ error: 'Please provide a friendly connection name.' });
    return;
  }

  try {
    const sts = await verifyAwsIamRole({
      roleArn,
      externalId,
      region: cleanRegion,
    });

    const db = getDb();
    const now = new Date().toISOString();
    const id = generateId('acc');
    const awsConnId = generateId('aws');
    const encExternal = externalId?.trim() ? encryptSecret(externalId.trim()) : null;
    const scopes = ['sts:AssumeRole', 'sts:GetCallerIdentity'];
    if (sts.iamSummaryAvailable) scopes.push('iam:GetAccountSummary');

    const tx = db.transaction(() => {
      db.prepare(`
        INSERT INTO connected_accounts (
          id, workspace_id, user_id, provider, provider_account_id, display_name,
          email, username, avatar_url, status, granted_scopes_json, token_expires_at,
          last_verified_at, last_refreshed_at, last_error, authorized_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'aws', ?, ?, NULL, ?, NULL, 'connected', ?, ?, ?, ?, NULL, ?, ?, ?)
      `).run(
        id,
        auth.workspaceId,
        auth.userId,
        sts.assumedAccountId || accountId.trim(),
        friendlyName.trim(),
        sts.assumedArn,
        JSON.stringify(scopes),
        sts.expiration,
        now,
        now,
        now,
        now,
        now
      );

      db.prepare(`
        INSERT INTO aws_connections (
          id, connected_account_id, connection_mode, aws_account_id, role_arn,
          external_id_encrypted, external_id_iv, external_id_tag, region,
          access_portal_url, role_name, friendly_name, created_at, updated_at
        ) VALUES (?, ?, 'iam_role', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?)
      `).run(
        awsConnId,
        id,
        sts.assumedAccountId || accountId.trim(),
        roleArn.trim(),
        encExternal?.ciphertext ?? null,
        encExternal?.iv ?? null,
        encExternal?.authTag ?? null,
        cleanRegion,
        friendlyName.trim(),
        now,
        now
      );
    });

    tx();

    recordAuditLog({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      actorLabel: auth.email,
      eventType: 'account_connected',
      provider: 'aws',
      resourceType: 'connected_account',
      resourceId: id,
      action: `Verified & connected AWS IAM Role (${friendlyName.trim()})`,
      result: 'success',
      metadata: { awsAccountId: sts.assumedAccountId || accountId.trim(), region: cleanRegion },
    });

    res.status(201).json({ account: getWorkspaceAccountById(auth.workspaceId, id) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AWS IAM Role validation failed';
    recordAuditLog({
      workspaceId: auth.workspaceId,
      userId: auth.userId,
      actorLabel: auth.email,
      eventType: 'authorization_failed',
      provider: 'aws',
      resourceType: 'aws_iam_role',
      action: `Failed AWS STS AssumeRole verification for ${accountId.trim()}`,
      result: 'failure',
      metadata: { error: msg },
    });
    createNotification({
      workspaceId: auth.workspaceId,
      category: 'aws_access_denied',
      severity: 'error',
      title: 'AWS Role Verification Failed',
      message: msg,
      actionRoute: 'accounts',
      actionLabel: 'Review AWS Configuration',
    });
    const statusCode = msg.includes('AWS_CREDENTIALS_NOT_CONFIGURED') ? 503 : 400;
    res.status(statusCode).json({
      error: msg,
      code: msg.includes('AWS_CREDENTIALS_NOT_CONFIGURED') ? 'AWS_CREDENTIALS_NOT_CONFIGURED' : 'AWS_STS_ERROR',
    });
  }
});

oauthRouter.post('/providers/aws/identity-center', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { accessPortalUrl, region, accountId, roleName, friendlyName } = req.body as {
    accessPortalUrl?: string;
    region?: string;
    accountId?: string;
    roleName?: string;
    friendlyName?: string;
  };

  if (!accessPortalUrl || !validateIdentityCenterPortalUrl(accessPortalUrl)) {
    res.status(400).json({
      error: 'Access Portal URL must be a valid HTTPS AWS Identity Center URL (e.g., https://d-xxxxxxxxxx.awsapps.com/start).',
    });
    return;
  }
  const cleanRegion = (region || 'us-east-1').trim();
  if (!validateAwsRegion(cleanRegion)) {
    res.status(400).json({ error: 'Invalid AWS region format (e.g., us-east-1).' });
    return;
  }
  if (!accountId || !validateAwsAccountId(accountId)) {
    res.status(400).json({ error: 'AWS Account ID must be a 12-digit number.' });
    return;
  }
  if (!roleName || roleName.trim().length < 2) {
    res.status(400).json({ error: 'Permission Set / Role Name is required.' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const id = generateId('acc');
  const awsConnId = generateId('aws');
  const display = (friendlyName || `Identity Center (${accountId.trim()})`).trim();

  // Identity Center interactive SSO device flow requires user authorization in AWS portal;
  // record with reauth_required status honestly until SSO OIDC device token is obtained.
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO connected_accounts (
        id, workspace_id, user_id, provider, provider_account_id, display_name,
        email, username, avatar_url, status, granted_scopes_json, token_expires_at,
        last_verified_at, last_refreshed_at, last_error, authorized_at, created_at, updated_at
      ) VALUES (?, ?, ?, 'aws_identity_center', ?, ?, NULL, ?, NULL, 'reauth_required', ?, NULL, NULL, NULL, ?, ?, ?, ?)
    `).run(
      id,
      auth.workspaceId,
      auth.userId,
      `${accountId.trim()}:${roleName.trim()}`,
      display,
      roleName.trim(),
      JSON.stringify(['sso:AccountAccess', `role:${roleName.trim()}`]),
      'Pending AWS IAM Identity Center SSO device authorization in portal.',
      now,
      now,
      now
    );

    db.prepare(`
      INSERT INTO aws_connections (
        id, connected_account_id, connection_mode, aws_account_id, role_arn,
        external_id_encrypted, external_id_iv, external_id_tag, region,
        access_portal_url, role_name, friendly_name, created_at, updated_at
      ) VALUES (?, ?, 'identity_center', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?, ?)
    `).run(
      awsConnId,
      id,
      accountId.trim(),
      cleanRegion,
      accessPortalUrl.trim(),
      roleName.trim(),
      display,
      now,
      now
    );
  });

  tx();

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'account_connected',
    provider: 'aws_identity_center',
    resourceType: 'connected_account',
    resourceId: id,
    action: `Registered AWS IAM Identity Center profile (${display}) — awaiting SSO authorization`,
    result: 'warning',
    metadata: { awsAccountId: accountId.trim(), region: cleanRegion, roleName: roleName.trim() },
  });

  res.status(201).json({ account: getWorkspaceAccountById(auth.workspaceId, id) });
});

oauthRouter.post('/providers/aws/builder-id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { email, friendlyName, region } = req.body as {
    email?: string;
    friendlyName?: string;
    region?: string;
  };

  const cleanEmail = email?.trim().toLowerCase() || '';
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    res.status(400).json({ error: 'A valid AWS Builder ID email address is required.' });
    return;
  }
  const cleanRegion = (region || 'us-east-1').trim();
  if (!validateAwsRegion(cleanRegion)) {
    res.status(400).json({ error: 'Invalid AWS region format (e.g., us-east-1).' });
    return;
  }

  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id FROM connected_accounts WHERE workspace_id = ? AND provider = 'aws_builder_id' AND provider_account_id = ?`
    )
    .get(auth.workspaceId, cleanEmail) as { id: string } | undefined;

  if (existing) {
    res.status(409).json({ error: 'This AWS Builder ID email is already registered in this workspace.' });
    return;
  }

  const now = new Date().toISOString();
  const id = generateId('acc');
  const display = (friendlyName || `Builder ID (${cleanEmail})`).trim();

  // AWS Builder ID uses Amazon SSO OIDC device authorization; register honestly until interactive device flow completes.
  db.prepare(`
    INSERT INTO connected_accounts (
      id, workspace_id, user_id, provider, provider_account_id, display_name,
      email, username, avatar_url, status, granted_scopes_json, token_expires_at,
      last_verified_at, last_refreshed_at, last_error, authorized_at, created_at, updated_at
    ) VALUES (?, ?, ?, 'aws_builder_id', ?, ?, ?, ?, NULL, 'reauth_required', ?, NULL, NULL, NULL, ?, ?, ?, ?)
  `).run(
    id,
    auth.workspaceId,
    auth.userId,
    cleanEmail,
    display,
    cleanEmail,
    cleanEmail.split('@')[0],
    JSON.stringify(['builder_id:profile', `region:${cleanRegion}`]),
    'AWS Builder ID registered for tracking; interactive Amazon SSO OIDC device login is required for automated token checks.',
    now,
    now,
    now
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'account_connected',
    provider: 'aws_builder_id',
    resourceType: 'connected_account',
    resourceId: id,
    action: `Registered AWS Builder ID (${cleanEmail})`,
    result: 'warning',
    metadata: { region: cleanRegion },
  });

  res.status(201).json({ account: getWorkspaceAccountById(auth.workspaceId, id) });
});

oauthRouter.get('/accounts', requireUserSession, (req, res) => {
  const accounts = listWorkspaceAccounts(req.auth!.workspaceId);
  res.json({ accounts });
});

oauthRouter.get('/accounts/:id', requireUserSession, (req, res) => {
  const account = getWorkspaceAccountById(req.auth!.workspaceId, req.params.id);
  if (!account) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  const db = getDb();
  const events = db
    .prepare(`
      SELECT id, workspace_id, user_id, actor_label, event_type, provider,
             resource_type, resource_id, action, result, metadata_json, created_at
      FROM audit_logs
      WHERE workspace_id = ? AND resource_id = ?
      ORDER BY created_at DESC
      LIMIT 20
    `)
    .all(req.auth!.workspaceId, account.id) as Array<{
    id: string;
    workspace_id: string;
    user_id: string | null;
    actor_label: string;
    event_type: string;
    provider: string;
    resource_type: string;
    resource_id: string | null;
    action: string;
    result: 'success' | 'failure' | 'warning';
    metadata_json: string;
    created_at: string;
  }>;

  const entitlementRows = db
    .prepare(
      `SELECT * FROM entitlements WHERE workspace_id = ? AND connected_account_id = ? ORDER BY last_checked_at DESC`
    )
    .all(req.auth!.workspaceId, account.id) as Array<Record<string, unknown>>;

  res.json({
    account,
    entitlements: entitlementRows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      connectedAccountId: r.connected_account_id,
      provider: r.provider,
      accountLabel: r.account_label,
      entitlementType: r.entitlement_type,
      category: r.category || 'entitlement',
      availableAmount: r.available_amount,
      limitValue: r.limit_value ?? null,
      usedValue: r.used_value ?? null,
      unit: r.unit ?? null,
      resetPeriod: r.reset_period ?? null,
      currency: r.currency,
      expiryDate: r.expiry_date,
      status: r.status,
      source: r.source,
      verificationStatus: r.verification_status,
      notes: r.notes,
      lastCheckedAt: r.last_checked_at,
    })),
    events: events.map((e) => ({
      id: e.id,
      workspaceId: e.workspace_id,
      userId: e.user_id,
      actorLabel: e.actor_label,
      eventType: e.event_type,
      provider: e.provider,
      resourceType: e.resource_type,
      resourceId: e.resource_id,
      action: e.action,
      result: e.result,
      metadata: JSON.parse(e.metadata_json || '{}'),
      createdAt: e.created_at,
    })),
  });
});

oauthRouter.post('/accounts/:id/verify', requireUserSession, async (req, res) => {
  try {
    const account = await verifyConnectedAccount(req.auth!.workspaceId, req.params.id, req.auth!.email);
    res.json({ account });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Verification failed' });
  }
});

oauthRouter.post('/accounts/verify-all', requireUserSession, async (req, res) => {
  const accounts = listWorkspaceAccounts(req.auth!.workspaceId);
  const results = [];
  for (const acc of accounts) {
    if (acc.status === 'disconnected') continue;
    try {
      results.push(await verifyConnectedAccount(req.auth!.workspaceId, acc.id, req.auth!.email));
    } catch {
      results.push(getWorkspaceAccountById(req.auth!.workspaceId, acc.id));
    }
  }
  res.json({ accounts: listWorkspaceAccounts(req.auth!.workspaceId) });
});

oauthRouter.post('/accounts/:id/disconnect', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const account = getWorkspaceAccountById(auth.workspaceId, req.params.id);
  if (!account) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`UPDATE connected_accounts SET status = 'disconnected', updated_at = ? WHERE id = ? AND workspace_id = ?`).run(
    now,
    account.id,
    auth.workspaceId
  );
  db.prepare('DELETE FROM provider_credentials WHERE connected_account_id = ?').run(account.id);

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'account_disconnected',
    provider: account.provider,
    resourceType: 'connected_account',
    resourceId: account.id,
    action: `Disconnected ${account.provider} identity (${account.displayName}) and purged stored tokens`,
    result: 'success',
  });

  res.json({ account: getWorkspaceAccountById(auth.workspaceId, account.id) });
});

oauthRouter.delete('/accounts/:id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const account = getWorkspaceAccountById(auth.workspaceId, req.params.id);
  if (!account) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  const db = getDb();
  db.prepare('DELETE FROM connected_accounts WHERE id = ? AND workspace_id = ?').run(
    account.id,
    auth.workspaceId
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'account_disconnected',
    provider: account.provider,
    resourceType: 'connected_account',
    resourceId: account.id,
    action: `Removed ${account.provider} account (${account.displayName}) from workspace`,
    result: 'success',
  });

  res.json({ ok: true });
});

oauthRouter.delete('/accounts', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const info = db.prepare('DELETE FROM connected_accounts WHERE workspace_id = ?').run(auth.workspaceId);

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'account_disconnected',
    provider: 'system',
    resourceType: 'workspace',
    resourceId: auth.workspaceId,
    action: `Disconnected and removed all (${info.changes}) connected accounts`,
    result: 'warning',
  });

  res.json({ ok: true, removedCount: info.changes });
});
