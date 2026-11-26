import { Router } from 'express';
import { createRequire } from 'node:module';
import type { Archiver, ArchiverOptions } from 'archiver';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { ZipArchive } = require('archiver') as {
  ZipArchive: new (options?: ArchiverOptions) => Archiver;
};
import { getDb } from '../database/db.ts';
import { requireUserSession } from '../middleware/sessionAuth.ts';
import {
  generateId,
  generateMasterApiKey,
  isPersistentEncryptionKeyConfigured,
} from '../security/crypto.ts';
import { gatewayRateLimiter } from '../security/gatewayPolicy.ts';
import { aggregateCreditPool, computeQuotaMetrics, formatCountdown } from '../../shared/limitUtils.ts';
import { createNotification, recordAuditLog, recordSyncHistory } from '../logging/audit.ts';
import { getDecryptedCredentials, listWorkspaceAccounts } from '../services/accountService.ts';
import {
  consumeCreditRecord,
  listWorkspaceEntitlements,
  mapEntitlementRow,
} from '../services/creditSeedService.ts';
import { fetchGitHubRateLimit, fetchGitHubUser } from '../providers/github/githubAdapter.ts';
import {
  ALL_API_PERMISSIONS,
  type AiLimitsOverviewResponse,
  type ApiEnvironment,
  type ApiKeySummary,
  type ApiPermission,
  type AuditLogEntry,
  type CreditProviderType,
  type EntitlementCategory,
  type EntitlementRecord,
  type EntitlementStatus,
  type GatewayKeyLimitStatus,
  type NotificationItem,
  type ProviderLimitCapability,
  type ProviderType,
  type UsageAnalyticsSummary,
} from '../../shared/types.ts';

export const consoleRouter = Router();

function listApiKeysForWorkspace(workspaceId: string): ApiKeySummary[] {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT ak.*,
             (SELECT COUNT(*) FROM api_usage_logs aul WHERE aul.api_key_id = ak.id) as request_count
      FROM api_keys ak
      WHERE ak.workspace_id = ?
      ORDER BY ak.created_at DESC
    `)
    .all(workspaceId) as Array<{
    id: string;
    workspace_id: string;
    name: string;
    description: string | null;
    environment: ApiEnvironment;
    key_prefix: string;
    masked_key: string;
    allowed_providers_json: string;
    account_scope: 'all' | 'selected';
    allowed_account_ids_json: string;
    rate_limit_per_minute: number;
    status: 'active' | 'revoked' | 'expired';
    expires_at: string | null;
    last_used_at: string | null;
    request_count: number;
    created_at: string;
  }>;

  const permStmt = db.prepare('SELECT permission FROM api_key_permissions WHERE api_key_id = ?');

  return rows.map((r) => {
    const perms = (permStmt.all(r.id) as Array<{ permission: ApiPermission }>).map((p) => p.permission);
    const isExpired =
      r.status === 'active' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now();
    return {
      id: r.id,
      workspaceId: r.workspace_id,
      name: r.name,
      description: r.description,
      environment: r.environment,
      keyPrefix: r.key_prefix,
      maskedKey: r.masked_key,
      allowedProviders: JSON.parse(r.allowed_providers_json || '[]') as ProviderType[],
      accountScope: r.account_scope,
      allowedAccountIds: JSON.parse(r.allowed_account_ids_json || '[]') as string[],
      permissions: perms,
      rateLimitPerMinute: r.rate_limit_per_minute,
      status: isExpired ? 'expired' : r.status,
      expiresAt: r.expires_at,
      lastUsedAt: r.last_used_at,
      requestCount: r.request_count,
      createdAt: r.created_at,
    };
  });
}

consoleRouter.get('/overview', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const db = getDb();
  const accounts = listWorkspaceAccounts(wsId);
  const apiKeys = listApiKeysForWorkspace(wsId);

  const entStats = db
    .prepare(`
      SELECT
        SUM(CASE WHEN status IN ('VERIFIED', 'ACTIVE') THEN 1 ELSE 0 END) as verified_count,
        SUM(CASE WHEN status = 'EXPIRING' THEN 1 ELSE 0 END) as expiring_count,
        SUM(CASE WHEN status = 'MANUALLY ENTERED' THEN 1 ELSE 0 END) as manual_count,
        SUM(CASE WHEN status IN ('UNSUPPORTED', 'UNAVAILABLE') THEN 1 ELSE 0 END) as unsupported_count,
        MAX(last_checked_at) as last_checked_at
      FROM entitlements
      WHERE workspace_id = ?
    `)
    .get(wsId) as {
    verified_count: number | null;
    expiring_count: number | null;
    manual_count: number | null;
    unsupported_count: number | null;
    last_checked_at: string | null;
  };

  const totalApiRequestsRow = db
    .prepare('SELECT COUNT(*) as total FROM api_usage_logs WHERE workspace_id = ?')
    .get(wsId) as { total: number };

  const recentActivity = db
    .prepare(`
      SELECT id, workspace_id, user_id, actor_label, event_type, provider,
             resource_type, resource_id, action, result, metadata_json, created_at
      FROM audit_logs
      WHERE workspace_id = ?
      ORDER BY created_at DESC
      LIMIT 12
    `)
    .all(wsId) as Array<{
    id: string;
    workspace_id: string;
    user_id: string | null;
    actor_label: string;
    event_type: AuditLogEntry['eventType'];
    provider: ProviderType | 'system';
    resource_type: string;
    resource_id: string | null;
    action: string;
    result: 'success' | 'failure' | 'warning';
    metadata_json: string;
    created_at: string;
  }>;

  const connectedCount = accounts.filter((a) => a.status === 'connected').length;
  const attentionCount = accounts.filter((a) =>
    ['reauth_required', 'expired', 'revoked', 'verification_failed'].includes(a.status)
  ).length;
  const activeKeys = apiKeys.filter((k) => k.status === 'active');
  const activeKeyCount = activeKeys.length;
  const gatewayCapacityPerMin = activeKeys.reduce((sum, k) => sum + k.rateLimitPerMinute, 0);
  const gatewayUsedInWindow = activeKeys.reduce(
    (sum, k) => sum + gatewayRateLimiter.peek(k.id, k.rateLimitPerMinute).used,
    0
  );

  const providerHealth = (['google', 'github', 'aws'] as const).map((category) => {
    const matching = accounts.filter((a) =>
      category === 'aws' ? a.provider.startsWith('aws') : a.provider === category
    );
    const active = matching.filter((a) => a.status === 'connected').length;
    const issues = matching.filter((a) =>
      ['reauth_required', 'expired', 'revoked', 'verification_failed'].includes(a.status)
    ).length;
    const lastVerified = matching
      .map((a) => a.lastVerifiedAt)
      .filter(Boolean)
      .sort()
      .pop() || null;

    let health: 'healthy' | 'degraded' | 'unconfigured' = 'unconfigured';
    if (matching.length > 0) {
      health = issues > 0 ? 'degraded' : 'healthy';
    }

    return {
      provider: category,
      total: matching.length,
      active,
      issues,
      lastVerified,
      health,
    };
  });

  const allEntitlements = listWorkspaceEntitlements(wsId);
  const creditPool = aggregateCreditPool(allEntitlements);

  res.json({
    metrics: {
      totalAccounts: accounts.length,
      connectedAccounts: connectedCount,
      attentionRequired: attentionCount,
      verifiedEntitlements: entStats?.verified_count || 0,
      activeApiKeys: activeKeyCount,
      apiRequests: totalApiRequestsRow.total,
    },
    providerHealth,
    recentAccounts: accounts.slice(0, 5),
    recentActivity: recentActivity.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      actorLabel: r.actor_label,
      eventType: r.event_type,
      provider: r.provider,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      action: r.action,
      result: r.result,
      metadata: JSON.parse(r.metadata_json || '{}'),
      createdAt: r.created_at,
    })),
    entitlementSummary: {
      verified: entStats?.verified_count || 0,
      manual: entStats?.manual_count || 0,
      expiring: entStats?.expiring_count || 0,
      unsupported: entStats?.unsupported_count || 0,
      lastSyncedAt: entStats?.last_checked_at || null,
    },
    creditPool,
    gatewayLimitSummary: {
      activeKeys: activeKeyCount,
      totalCapacityPerMin: gatewayCapacityPerMin,
      usedInWindow: gatewayUsedInWindow,
    },
  });
});

consoleRouter.get('/entitlements', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT * FROM entitlements
      WHERE workspace_id = ?
      ORDER BY last_checked_at DESC
    `)
    .all(wsId) as Array<Record<string, unknown>>;

  res.json({ entitlements: rows.map(mapEntitlementRow) });
});

consoleRouter.get('/limits', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const db = getDb();
  const accounts = listWorkspaceAccounts(wsId);
  const apiKeys = listApiKeysForWorkspace(wsId);
  const rows = db
    .prepare('SELECT * FROM entitlements WHERE workspace_id = ? ORDER BY last_checked_at DESC')
    .all(wsId) as Array<Record<string, unknown>>;
  const entitlements = rows.map(mapEntitlementRow);

  const gatewayKeys: GatewayKeyLimitStatus[] = apiKeys.map((k) => {
    const peek = gatewayRateLimiter.peek(k.id, k.rateLimitPerMinute);
    return {
      id: k.id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      environment: k.environment,
      status: k.status,
      limitPerMinute: k.rateLimitPerMinute,
      usedInWindow: k.status === 'active' ? peek.used : 0,
      remainingInWindow: k.status === 'active' ? peek.remaining : 0,
      resetAt: new Date(peek.resetAtMs).toISOString(),
      totalRequests: k.requestCount,
      expiresAt: k.expiresAt,
      lastUsedAt: k.lastUsedAt,
      allowedProviders: k.allowedProviders,
    };
  });

  const googleAccounts = accounts.filter((a) => a.provider === 'google');
  const githubAccounts = accounts.filter((a) => a.provider === 'github');
  const awsAccounts = accounts.filter((a) => a.provider === 'aws' || a.provider === 'aws_identity_center');
  const builderIdAccounts = accounts.filter((a) => a.provider === 'aws_builder_id');
  const kiroEntries = entitlements.filter((e) => e.provider === 'kiro');
  const cursorEntries = entitlements.filter((e) => e.provider === 'cursor');
  const windsurfEntries = entitlements.filter((e) => e.provider === 'windsurf');
  const openrouterEntries = entitlements.filter((e) => e.provider === 'openrouter');
  const groqEntries = entitlements.filter((e) => e.provider === 'groq');
  const hfEntries = entitlements.filter((e) => e.provider === 'huggingface');
  const geminiConfigured = Boolean(
    process.env.GEMINI_API_KEY?.trim() && process.env.GEMINI_API_KEY.trim() !== 'MY_GEMINI_API_KEY'
  );

  const providerCapabilities: ProviderLimitCapability[] = [
    {
      id: 'kiro',
      name: 'Kiro AI',
      connectedAccounts: kiroEntries.length,
      activeAccounts: kiroEntries.filter((e) => e.status === 'MANUALLY ENTERED').length,
      autoSyncSupport: 'unsupported',
      summary:
        'Tracks Kiro onboarding bonus & monthly credits in the unified credit pool. Kiro has no public balance API, so entries remain transparently tagged Manual Entry.',
      verifiedMetrics: ['Unified Credit Pool Target'],
      manualTrackingHint: 'Log or adjust Kiro bonus and monthly credits.',
    },
    {
      id: 'google',
      name: 'Google & Gemini AI',
      connectedAccounts: googleAccounts.length,
      activeAccounts: googleAccounts.filter((a) => a.status === 'connected').length,
      autoSyncSupport: 'partial_ttl',
      summary: geminiConfigured
        ? 'OAuth TTL verified live; GEMINI_API_KEY active on gateway (/api/v1/chat/completions). Track free login RPD alongside live gateway usage.'
        : 'OAuth token TTL & granted scopes verified via Google tokeninfo. Track Gemini AI Studio RPM/RPD or Google Cloud AI credits with provenance.',
      verifiedMetrics: ['OAuth Token Expiry TTL', 'Granted OIDC Scopes'],
      manualTrackingHint: 'Track Gemini RPM, RPD, or Google Cloud AI credits per Google identity.',
    },
    {
      id: 'github',
      name: 'GitHub & Copilot',
      connectedAccounts: githubAccounts.length,
      activeAccounts: githubAccounts.filter((a) => a.status === 'connected').length,
      autoSyncSupport: 'live_api',
      summary:
        'Live REST API Core & Search rate limits and GitHub plan tier fetched on sync, plus Copilot Free / Pro login request tracking.',
      verifiedMetrics: ['Core API Rate Limit (req/hr)', 'Search API Rate Limit', 'Account Plan Tier'],
      manualTrackingHint: 'Track GitHub Copilot monthly premium requests per GitHub account.',
    },
    {
      id: 'aws_builder_id',
      name: 'AWS Builder ID & Q',
      connectedAccounts: builderIdAccounts.length + awsAccounts.length,
      activeAccounts:
        builderIdAccounts.filter((a) => a.status === 'connected').length +
        awsAccounts.filter((a) => a.status === 'connected').length,
      autoSyncSupport: 'partial_ttl',
      summary:
        'Tracks STS session TTL, IAM roles, and distinct AWS Builder IDs tied to Amazon Q Developer & Kiro onboarding credits.',
      verifiedMetrics: ['STS Session Expiry TTL', 'Distinct Identity Registry'],
      manualTrackingHint: 'Track Amazon Q Developer or AWS promotional credits.',
    },
    {
      id: 'cursor',
      name: 'Cursor · Windsurf · OpenRouter · Groq · HF',
      connectedAccounts:
        cursorEntries.length +
        windsurfEntries.length +
        openrouterEntries.length +
        groqEntries.length +
        hfEntries.length,
      activeAccounts:
        cursorEntries.length +
        windsurfEntries.length +
        openrouterEntries.length +
        groqEntries.length +
        hfEntries.length,
      autoSyncSupport: 'manual_only',
      summary:
        'Login-tier free AI credit pool across Cursor, Windsurf, OpenRouter, Groq, and Hugging Face — tracked in one place and callable via /api/v1.',
      verifiedMetrics: ['Login Tier Baseline Pool'],
      manualTrackingHint: 'Add or consume credits across any AI coding or inference tool.',
    },
  ];

  const activeGw = gatewayKeys.filter((k) => k.status === 'active');
  const creditPool = aggregateCreditPool(entitlements);

  const payload: AiLimitsOverviewResponse = {
    gatewayKeys,
    providerCapabilities,
    entitlements,
    creditPool,
    summary: {
      activeGatewayKeys: activeGw.length,
      totalGatewayCapacityPerMin: activeGw.reduce((s, k) => s + k.limitPerMinute, 0),
      usedGatewayWindowRequests: activeGw.reduce((s, k) => s + k.usedInWindow, 0),
      verifiedCount: entitlements.filter((e) => e.status === 'VERIFIED' || e.status === 'ACTIVE').length,
      manualCount: entitlements.filter((e) => e.status === 'MANUALLY ENTERED').length,
      expiringCount: entitlements.filter((e) => e.status === 'EXPIRING').length,
      unsupportedCount: entitlements.filter(
        (e) => e.status === 'UNSUPPORTED' || e.status === 'UNAVAILABLE'
      ).length,
    },
  };

  res.json(payload);
});

consoleRouter.post('/entitlements/sync', requireUserSession, async (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const now = new Date().toISOString();
  const accounts = listWorkspaceAccounts(auth.workspaceId);

  let syncedCount = 0;

  for (const acc of accounts) {
    if (acc.status === 'disconnected') continue;

    if (acc.provider === 'github') {
      const creds = getDecryptedCredentials(acc.id);
      if (creds?.accessToken) {
        try {
          const [gh, rl] = await Promise.all([
            fetchGitHubUser(creds.accessToken),
            fetchGitHubRateLimit(creds.accessToken).catch(() => null),
          ]);
          db.prepare('DELETE FROM entitlements WHERE workspace_id = ? AND connected_account_id = ? AND source = ?')
            .run(auth.workspaceId, acc.id, 'Provider API');

          if (gh.profile.plan?.name) {
            db.prepare(`
              INSERT INTO entitlements (
                id, workspace_id, connected_account_id, provider, account_label,
                entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
                currency, expiry_date, status, source, verification_status, notes, last_checked_at
              ) VALUES (?, ?, ?, 'github', ?, 'GitHub Subscription Plan', 'subscription', ?, NULL, NULL, NULL, 'none', NULL, NULL, 'VERIFIED', 'Provider API', 'verified', ?, ?)
            `).run(
              generateId('ent'),
              auth.workspaceId,
              acc.id,
              gh.profile.login,
              gh.profile.plan.name,
              `Private repos: ${gh.profile.plan.private_repos}, collaborators: ${gh.profile.plan.collaborators}`,
              now
            );
            syncedCount++;
          } else {
            db.prepare(`
              INSERT INTO entitlements (
                id, workspace_id, connected_account_id, provider, account_label,
                entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
                currency, expiry_date, status, source, verification_status, notes, last_checked_at
              ) VALUES (?, ?, ?, 'github', ?, 'GitHub Billing / Plan API', 'subscription', NULL, NULL, NULL, NULL, 'none', NULL, NULL, 'UNAVAILABLE', 'Provider API', 'unverified', ?, ?)
            `).run(
              generateId('ent'),
              auth.workspaceId,
              acc.id,
              gh.profile.login,
              'Plan details not returned by GitHub /user endpoint for current scopes.',
              now
            );
          }

          const coreRl = rl?.core ?? gh.rateLimit;
          if (coreRl) {
            db.prepare(`
              INSERT INTO entitlements (
                id, workspace_id, connected_account_id, provider, account_label,
                entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
                currency, expiry_date, status, source, verification_status, notes, last_checked_at
              ) VALUES (?, ?, ?, 'github', ?, 'GitHub Core API Rate Limit', 'rate_limit', ?, ?, ?, 'requests/hr', 'hourly', NULL, ?, 'VERIFIED', 'Provider API', 'verified', ?, ?)
            `).run(
              generateId('ent'),
              auth.workspaceId,
              acc.id,
              gh.profile.login,
              `${coreRl.remaining} / ${coreRl.limit} remaining`,
              coreRl.limit,
              coreRl.used,
              coreRl.resetAt,
              `Live GitHub Core API quota window (resets ${new Date(coreRl.resetAt).toLocaleTimeString()}).`,
              now
            );
            syncedCount++;
          }

          if (rl?.search) {
            db.prepare(`
              INSERT INTO entitlements (
                id, workspace_id, connected_account_id, provider, account_label,
                entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
                currency, expiry_date, status, source, verification_status, notes, last_checked_at
              ) VALUES (?, ?, ?, 'github', ?, 'GitHub Search API Rate Limit', 'rate_limit', ?, ?, ?, 'requests/min', 'minute', NULL, ?, 'VERIFIED', 'Provider API', 'verified', ?, ?)
            `).run(
              generateId('ent'),
              auth.workspaceId,
              acc.id,
              gh.profile.login,
              `${rl.search.remaining} / ${rl.search.limit} remaining`,
              rl.search.limit,
              rl.search.used,
              rl.search.resetAt,
              'Live GitHub Search API quota from /rate_limit.',
              now
            );
            syncedCount++;
          }
        } catch {
          // Leave existing record untouched on transient failure
        }
      }
    } else if (acc.provider === 'google') {
      db.prepare('DELETE FROM entitlements WHERE workspace_id = ? AND connected_account_id = ? AND source = ?')
        .run(auth.workspaceId, acc.id, 'Provider API');

      if (acc.tokenExpiresAt) {
        const expMs = new Date(acc.tokenExpiresAt).getTime();
        const isExpired = expMs <= Date.now();
        const isExpiringSoon = !isExpired && expMs - Date.now() < 15 * 60 * 1000;
        const ttlStatus: EntitlementStatus = isExpired ? 'EXPIRED' : isExpiringSoon ? 'EXPIRING' : 'VERIFIED';
        db.prepare(`
          INSERT INTO entitlements (
            id, workspace_id, connected_account_id, provider, account_label,
            entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
            currency, expiry_date, status, source, verification_status, notes, last_checked_at
          ) VALUES (?, ?, ?, 'google', ?, 'Google OAuth Token TTL', 'token_ttl', ?, NULL, NULL, NULL, 'none', NULL, ?, ?, 'Provider API', 'verified', ?, ?)
        `).run(
          generateId('ent'),
          auth.workspaceId,
          acc.id,
          acc.email || acc.displayName,
          formatCountdown(acc.tokenExpiresAt),
          acc.tokenExpiresAt,
          ttlStatus,
          'Access token lifetime verified via Google OAuth token metadata.',
          now
        );
        syncedCount++;
      }

      db.prepare(`
        INSERT INTO entitlements (
          id, workspace_id, connected_account_id, provider, account_label,
          entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
          currency, expiry_date, status, source, verification_status, notes, last_checked_at
        ) VALUES (?, ?, ?, 'google', ?, 'Google Cloud / Gemini AI Quota', 'ai_limit', NULL, NULL, NULL, NULL, 'none', NULL, NULL, 'UNSUPPORTED', 'Provider API', 'unsupported', ?, ?)
      `).run(
        generateId('ent'),
        auth.workspaceId,
        acc.id,
        acc.email || acc.displayName,
        'Requires Cloud Billing / Service Usage API (cloud-billing.readonly) scope and GCP project linkage. Basic OAuth identity scopes do not expose Gemini RPM/RPD or billing credits.',
        now
      );
    } else if (acc.provider.startsWith('aws')) {
      db.prepare('DELETE FROM entitlements WHERE workspace_id = ? AND connected_account_id = ? AND source = ?')
        .run(auth.workspaceId, acc.id, 'Provider API');

      if (acc.awsMeta?.connectionMode === 'iam_role' && acc.tokenExpiresAt) {
        const expMs = new Date(acc.tokenExpiresAt).getTime();
        const ttlStatus: EntitlementStatus = expMs <= Date.now() ? 'EXPIRED' : 'VERIFIED';
        db.prepare(`
          INSERT INTO entitlements (
            id, workspace_id, connected_account_id, provider, account_label,
            entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
            currency, expiry_date, status, source, verification_status, notes, last_checked_at
          ) VALUES (?, ?, ?, ?, ?, 'AWS STS Temporary Session TTL', 'token_ttl', ?, NULL, NULL, NULL, 'none', NULL, ?, ?, 'Provider API', 'verified', ?, ?)
        `).run(
          generateId('ent'),
          auth.workspaceId,
          acc.id,
          acc.provider,
          acc.displayName,
          formatCountdown(acc.tokenExpiresAt),
          acc.tokenExpiresAt,
          ttlStatus,
          `Assumed IAM role session lifetime in ${acc.awsMeta.region}.`,
          now
        );
        syncedCount++;
      }

      db.prepare(`
        INSERT INTO entitlements (
          id, workspace_id, connected_account_id, provider, account_label,
          entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
          currency, expiry_date, status, source, verification_status, notes, last_checked_at
        ) VALUES (?, ?, ?, ?, ?, 'AWS Cost, Bedrock & Promotional Credits', 'credits', NULL, NULL, NULL, NULL, 'none', NULL, NULL, 'UNAVAILABLE', 'Provider API', 'unverified', ?, ?)
      `).run(
        generateId('ent'),
        auth.workspaceId,
        acc.id,
        acc.provider,
        acc.displayName,
        'Requires ce:GetCostAndUsage, servicequotas:ListServiceQuotas, or billing:GetBillingData permission.',
        now
      );
    }
  }

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'entitlement_synced',
    provider: 'system',
    resourceType: 'entitlements',
    action: `Synchronized AI limits & entitlement provenance across ${accounts.length} connected account(s)`,
    result: 'success',
    metadata: { verifiedUpdated: syncedCount },
  });

  recordSyncHistory({
    workspaceId: auth.workspaceId,
    syncType: 'entitlements',
    status: 'success',
    summary: `Checked ${accounts.length} account(s), updated ${syncedCount} verified provider entitlement(s).`,
  });

  const rows = db
    .prepare('SELECT * FROM entitlements WHERE workspace_id = ? ORDER BY last_checked_at DESC')
    .all(auth.workspaceId) as Array<Record<string, unknown>>;

  res.json({
    syncedCount,
    entitlements: rows.map(mapEntitlementRow),
  });
});

consoleRouter.post('/entitlements/manual', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const {
    provider,
    connectedAccountId,
    accountLabel,
    entitlementType,
    category,
    availableAmount,
    limitValue,
    usedValue,
    unit,
    resetPeriod,
    currency,
    expiryDate,
    notes,
  } = req.body as {
    provider?: CreditProviderType;
    connectedAccountId?: string;
    accountLabel?: string;
    entitlementType?: string;
    category?: EntitlementCategory;
    availableAmount?: string;
    limitValue?: number | null;
    usedValue?: number | null;
    unit?: string;
    resetPeriod?: EntitlementRecord['resetPeriod'];
    currency?: string;
    expiryDate?: string;
    notes?: string;
  };

  if (!provider || !accountLabel?.trim() || !entitlementType?.trim()) {
    res.status(400).json({ error: 'Provider, account label, and entitlement type are required.' });
    return;
  }

  const cleanLimit = typeof limitValue === 'number' && Number.isFinite(limitValue) && limitValue >= 0 ? limitValue : null;
  const cleanUsed = typeof usedValue === 'number' && Number.isFinite(usedValue) && usedValue >= 0 ? usedValue : null;
  const metrics = computeQuotaMetrics(cleanLimit, cleanUsed);
  const cleanUnit = unit?.trim() || currency?.trim() || null;

  let formattedAvailable = availableAmount?.trim() || null;
  if (!formattedAvailable && metrics.limit !== null) {
    formattedAvailable =
      metrics.used !== null
        ? `${metrics.remaining} / ${metrics.limit}${cleanUnit ? ` ${cleanUnit}` : ''} left`
        : `${metrics.limit}${cleanUnit ? ` ${cleanUnit}` : ''}`;
  }

  const db = getDb();
  const id = generateId('ent');
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO entitlements (
      id, workspace_id, connected_account_id, provider, account_label,
      entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
      currency, expiry_date, status, source, verification_status, notes, last_checked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'MANUALLY ENTERED', 'Manual Entry', 'unverified', ?, ?)
  `).run(
    id,
    auth.workspaceId,
    connectedAccountId || null,
    provider,
    accountLabel.trim(),
    entitlementType.trim(),
    category || 'ai_limit',
    formattedAvailable,
    cleanLimit,
    cleanUsed,
    cleanUnit,
    resetPeriod || 'monthly',
    currency?.trim() || null,
    expiryDate?.trim() || null,
    notes?.trim() || 'User-recorded AI limit / entitlement metadata.',
    now
  );

  const auditProv = ['google', 'github', 'aws', 'aws_builder_id', 'aws_identity_center'].includes(
    provider
  )
    ? (provider as ProviderType)
    : 'system';

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'entitlement_synced',
    provider: auditProv,
    resourceType: 'entitlement',
    resourceId: id,
    action: `Recorded manual limit/entitlement (${entitlementType.trim()}) for ${accountLabel.trim()}`,
    result: 'success',
  });

  res.status(201).json({ id });
});

consoleRouter.post('/credits/consume', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { entitlementId, provider, amount, toolName } = req.body as {
    entitlementId?: string;
    provider?: string;
    amount?: number;
    toolName?: string;
  };

  const result = consumeCreditRecord(auth.workspaceId, {
    entitlementId,
    provider,
    amount,
    toolName: toolName || 'AetherGate Console',
    actorLabel: auth.email,
  });

  if (!result.updatedRecord) {
    res.status(404).json({
      error: 'No eligible AI credit pool record with remaining balance was found.',
      creditPool: result.creditPool,
    });
    return;
  }

  res.json(result);
});

consoleRouter.patch('/entitlements/:id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM entitlements WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, auth.workspaceId) as Record<string, unknown> | undefined;

  if (!existing) {
    res.status(404).json({ error: 'Entitlement record not found.' });
    return;
  }

  const { usedValue, limitValue, availableAmount, expiryDate, notes } = req.body as {
    usedValue?: number | null;
    limitValue?: number | null;
    availableAmount?: string | null;
    expiryDate?: string | null;
    notes?: string | null;
  };

  const nextLimit =
    limitValue !== undefined
      ? typeof limitValue === 'number' && Number.isFinite(limitValue) && limitValue >= 0
        ? limitValue
        : null
      : typeof existing.limit_value === 'number'
      ? existing.limit_value
      : null;

  const nextUsed =
    usedValue !== undefined
      ? typeof usedValue === 'number' && Number.isFinite(usedValue) && usedValue >= 0
        ? usedValue
        : null
      : typeof existing.used_value === 'number'
      ? existing.used_value
      : null;

  const unit = (existing.unit as string | null) || (existing.currency as string | null) || null;
  const metrics = computeQuotaMetrics(nextLimit, nextUsed);
  let nextAvailable =
    availableAmount !== undefined
      ? availableAmount?.trim() || null
      : (existing.available_amount as string | null);
  if (availableAmount === undefined && metrics.limit !== null) {
    nextAvailable = `${metrics.remaining} / ${metrics.limit}${unit ? ` ${unit}` : ''} left`;
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE entitlements
    SET limit_value = ?, used_value = ?, available_amount = ?, expiry_date = ?, notes = ?, last_checked_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(
    nextLimit,
    nextUsed,
    nextAvailable,
    expiryDate !== undefined ? expiryDate?.trim() || null : (existing.expiry_date as string | null),
    notes !== undefined ? notes?.trim() || null : (existing.notes as string | null),
    now,
    req.params.id,
    auth.workspaceId
  );

  const updated = db
    .prepare('SELECT * FROM entitlements WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, auth.workspaceId) as Record<string, unknown>;

  res.json({ entitlement: mapEntitlementRow(updated) });
});

consoleRouter.delete('/entitlements/:id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  db.prepare('DELETE FROM entitlements WHERE id = ? AND workspace_id = ?').run(
    req.params.id,
    auth.workspaceId
  );
  res.json({ ok: true });
});

consoleRouter.get('/keys', requireUserSession, (req, res) => {
  res.json({ keys: listApiKeysForWorkspace(req.auth!.workspaceId) });
});

consoleRouter.post('/keys', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const {
    name,
    description,
    environment,
    allowedProviders,
    accountScope,
    allowedAccountIds,
    permissions,
    rateLimitPerMinute,
    expiresInDays,
  } = req.body as {
    name?: string;
    description?: string;
    environment?: ApiEnvironment;
    allowedProviders?: ProviderType[];
    accountScope?: 'all' | 'selected';
    allowedAccountIds?: string[];
    permissions?: ApiPermission[];
    rateLimitPerMinute?: number;
    expiresInDays?: number | null;
  };

  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'API key name must be at least 2 characters.' });
    return;
  }

  const env: ApiEnvironment = environment === 'production' ? 'production' : 'development';
  const providers: ProviderType[] =
    Array.isArray(allowedProviders) && allowedProviders.length > 0
      ? allowedProviders
      : ['google', 'github', 'aws'];
  const validPerms = (permissions || ['accounts:read']).filter((p): p is ApiPermission =>
    ALL_API_PERMISSIONS.includes(p)
  );
  if (validPerms.length === 0) {
    res.status(400).json({ error: 'Select at least one API permission.' });
    return;
  }

  const scope = accountScope === 'selected' ? 'selected' : 'all';
  const rateLimit = Math.max(5, Math.min(10000, Number(rateLimitPerMinute) || 60));
  const expiresAt =
    typeof expiresInDays === 'number' && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const { rawKey, keyPrefix, maskedKey, keyHash } = generateMasterApiKey(env);
  const keyId = generateId('key');
  const now = new Date().toISOString();
  const db = getDb();

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO api_keys (
        id, workspace_id, created_by_user_id, name, description, environment,
        key_prefix, masked_key, key_hash, allowed_providers_json, account_scope,
        allowed_account_ids_json, rate_limit_per_minute, status, expires_at,
        last_used_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, NULL)
    `).run(
      keyId,
      auth.workspaceId,
      auth.userId,
      name.trim(),
      description?.trim() || null,
      env,
      keyPrefix,
      maskedKey,
      keyHash,
      JSON.stringify(providers),
      scope,
      JSON.stringify(Array.isArray(allowedAccountIds) ? allowedAccountIds : []),
      rateLimit,
      expiresAt,
      now
    );

    const insertPerm = db.prepare(
      'INSERT INTO api_key_permissions (id, api_key_id, permission) VALUES (?, ?, ?)'
    );
    for (const perm of validPerms) {
      insertPerm.run(generateId('akp'), keyId, perm);
    }
  });

  tx();

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'api_key_created',
    provider: 'system',
    resourceType: 'api_key',
    resourceId: keyId,
    action: `Generated master API key "${name.trim()}" (${keyPrefix}...)`,
    result: 'success',
    metadata: { environment: env, permissions: validPerms, providers, scope },
  });

  if (!expiresAt) {
    createNotification({
      workspaceId: auth.workspaceId,
      category: 'security',
      severity: 'warning',
      title: 'API key created without expiration',
      message: `Master key "${name.trim()}" (${keyPrefix}...) has no expiry date configured.`,
      actionRoute: 'security',
      actionLabel: 'Review Security Recommendations',
    });
  }

  const created = listApiKeysForWorkspace(auth.workspaceId).find((k) => k.id === keyId)!;
  res.status(201).json({
    apiKey: created,
    rawKey,
  });
});

consoleRouter.post('/keys/:id/rotate', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, auth.workspaceId) as
    | {
        id: string;
        name: string;
        description: string | null;
        environment: ApiEnvironment;
        allowed_providers_json: string;
        account_scope: 'all' | 'selected';
        allowed_account_ids_json: string;
        rate_limit_per_minute: number;
        expires_at: string | null;
      }
    | undefined;

  if (!existing) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }

  const perms = (
    db.prepare('SELECT permission FROM api_key_permissions WHERE api_key_id = ?').all(existing.id) as Array<{
      permission: ApiPermission;
    }>
  ).map((p) => p.permission);

  const { rawKey, keyPrefix, maskedKey, keyHash } = generateMasterApiKey(existing.environment);
  const newKeyId = generateId('key');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(now, existing.id);

    db.prepare(`
      INSERT INTO api_keys (
        id, workspace_id, created_by_user_id, name, description, environment,
        key_prefix, masked_key, key_hash, allowed_providers_json, account_scope,
        allowed_account_ids_json, rate_limit_per_minute, status, expires_at,
        last_used_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, NULL)
    `).run(
      newKeyId,
      auth.workspaceId,
      auth.userId,
      existing.name,
      existing.description,
      existing.environment,
      keyPrefix,
      maskedKey,
      keyHash,
      existing.allowed_providers_json,
      existing.account_scope,
      existing.allowed_account_ids_json,
      existing.rate_limit_per_minute,
      existing.expires_at,
      now
    );

    const insertPerm = db.prepare(
      'INSERT INTO api_key_permissions (id, api_key_id, permission) VALUES (?, ?, ?)'
    );
    for (const p of perms) {
      insertPerm.run(generateId('akp'), newKeyId, p);
    }
  });

  tx();

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'api_key_rotated',
    provider: 'system',
    resourceType: 'api_key',
    resourceId: newKeyId,
    action: `Rotated master API key "${existing.name}" (old key revoked immediately)`,
    result: 'success',
    metadata: { previousKeyId: existing.id, newPrefix: keyPrefix },
  });

  const rotated = listApiKeysForWorkspace(auth.workspaceId).find((k) => k.id === newKeyId)!;
  res.json({ apiKey: rotated, rawKey });
});

consoleRouter.patch('/keys/:id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { permissions, expiresInDays, rateLimitPerMinute } = req.body as {
    permissions?: ApiPermission[];
    expiresInDays?: number | null;
    rateLimitPerMinute?: number;
  };
  const db = getDb();
  const existing = db
    .prepare('SELECT id, name FROM api_keys WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, auth.workspaceId) as { id: string; name: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }

  const tx = db.transaction(() => {
    if (typeof rateLimitPerMinute === 'number') {
      db.prepare('UPDATE api_keys SET rate_limit_per_minute = ? WHERE id = ?').run(
        Math.max(5, Math.min(10000, rateLimitPerMinute)),
        existing.id
      );
    }
    if (expiresInDays !== undefined) {
      const expiresAt =
        typeof expiresInDays === 'number' && expiresInDays > 0
          ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
          : null;
      db.prepare('UPDATE api_keys SET expires_at = ? WHERE id = ?').run(expiresAt, existing.id);
    }
    if (Array.isArray(permissions)) {
      const valid = permissions.filter((p): p is ApiPermission => ALL_API_PERMISSIONS.includes(p));
      if (valid.length > 0) {
        db.prepare('DELETE FROM api_key_permissions WHERE api_key_id = ?').run(existing.id);
        const ins = db.prepare('INSERT INTO api_key_permissions (id, api_key_id, permission) VALUES (?, ?, ?)');
        for (const p of valid) ins.run(generateId('akp'), existing.id, p);
      }
    }
  });

  tx();

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'permission_changed',
    provider: 'system',
    resourceType: 'api_key',
    resourceId: existing.id,
    action: `Updated policy/permissions on API key "${existing.name}"`,
    result: 'success',
  });

  res.json({ apiKey: listApiKeysForWorkspace(auth.workspaceId).find((k) => k.id === existing.id) });
});

consoleRouter.delete('/keys/:id', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const existing = db
    .prepare('SELECT id, name, key_prefix FROM api_keys WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, auth.workspaceId) as { id: string; name: string; key_prefix: string } | undefined;

  if (!existing) {
    res.status(404).json({ error: 'API key not found.' });
    return;
  }

  db.prepare(`UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    existing.id
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'api_key_revoked',
    provider: 'system',
    resourceType: 'api_key',
    resourceId: existing.id,
    action: `Revoked master API key "${existing.name}" (${existing.key_prefix}...)`,
    result: 'warning',
  });

  res.json({ ok: true });
});

consoleRouter.get('/analytics', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const range = (req.query.range as string | undefined) || '7d';
  const fromQuery = req.query.from as string | undefined;
  const toQuery = req.query.to as string | undefined;

  let sinceIso: string;
  let untilIso = new Date().toISOString();

  if (range === '24h') {
    sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  } else if (range === '30d') {
    sinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (range === 'custom' && fromQuery) {
    sinceIso = new Date(fromQuery).toISOString();
    if (toQuery) untilIso = new Date(toQuery).toISOString();
  } else {
    sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  const db = getDb();
  const logs = db
    .prepare(`
      SELECT aul.*, ak.name as key_name, ak.last_used_at as key_last_used
      FROM api_usage_logs aul
      LEFT JOIN api_keys ak ON ak.id = aul.api_key_id
      WHERE aul.workspace_id = ? AND aul.created_at >= ? AND aul.created_at <= ?
      ORDER BY aul.created_at ASC
    `)
    .all(wsId, sinceIso, untilIso) as Array<{
    id: string;
    api_key_id: string | null;
    key_name: string | null;
    key_last_used: string | null;
    provider: string;
    endpoint: string;
    method: string;
    status_code: number;
    latency_ms: number;
    created_at: string;
  }>;

  const totalRequests = logs.length;
  const successfulRequests = logs.filter((l) => l.status_code >= 200 && l.status_code < 400).length;
  const failedRequests = totalRequests - successfulRequests;
  const averageLatencyMs = totalRequests
    ? Math.round(logs.reduce((acc, l) => acc + l.latency_ms, 0) / totalRequests)
    : 0;

  const providerMap = new Map<string, { count: number; errors: number }>();
  const endpointMap = new Map<string, { endpoint: string; method: string; count: number; latencySum: number }>();
  const keyMap = new Map<string, { apiKeyId: string; keyName: string; count: number; lastUsedAt: string | null }>();
  const bucketMap = new Map<string, { total: number; success: number; failed: number }>();

  for (const log of logs) {
    const p = providerMap.get(log.provider) ?? { count: 0, errors: 0 };
    p.count++;
    if (log.status_code >= 400) p.errors++;
    providerMap.set(log.provider, p);

    const epKey = `${log.method} ${log.endpoint}`;
    const ep = endpointMap.get(epKey) ?? {
      endpoint: log.endpoint,
      method: log.method,
      count: 0,
      latencySum: 0,
    };
    ep.count++;
    ep.latencySum += log.latency_ms;
    endpointMap.set(epKey, ep);

    if (log.api_key_id) {
      const k = keyMap.get(log.api_key_id) ?? {
        apiKeyId: log.api_key_id,
        keyName: log.key_name || 'Revoked / Deleted Key',
        count: 0,
        lastUsedAt: log.key_last_used,
      };
      k.count++;
      keyMap.set(log.api_key_id, k);
    }

    const bucket = range === '24h' ? log.created_at.slice(0, 13) + ':00' : log.created_at.slice(0, 10);
    const b = bucketMap.get(bucket) ?? { total: 0, success: 0, failed: 0 };
    b.total++;
    if (log.status_code < 400) b.success++;
    else b.failed++;
    bucketMap.set(bucket, b);
  }

  const summary: UsageAnalyticsSummary = {
    totalRequests,
    successfulRequests,
    failedRequests,
    averageLatencyMs,
    byProvider: Array.from(providerMap.entries()).map(([provider, v]) => ({ provider, ...v })),
    byEndpoint: Array.from(endpointMap.values())
      .map((e) => ({
        endpoint: e.endpoint,
        method: e.method,
        count: e.count,
        avgLatencyMs: Math.round(e.latencySum / e.count),
      }))
      .sort((a, b) => b.count - a.count),
    byApiKey: Array.from(keyMap.values()).sort((a, b) => b.count - a.count),
    timeline: Array.from(bucketMap.entries()).map(([bucket, v]) => ({ bucket, ...v })),
  };

  res.json(summary);
});

consoleRouter.get('/audit-logs', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const eventType = req.query.eventType as string | undefined;
  const provider = req.query.provider as string | undefined;
  const result = req.query.result as string | undefined;
  const q = (req.query.q as string | undefined)?.trim().toLowerCase();

  const db = getDb();
  const conditions = ['workspace_id = ?'];
  const params: unknown[] = [wsId];

  if (eventType && eventType !== 'all') {
    conditions.push('event_type = ?');
    params.push(eventType);
  }
  if (provider && provider !== 'all') {
    conditions.push('provider = ?');
    params.push(provider);
  }
  if (result && result !== 'all') {
    conditions.push('result = ?');
    params.push(result);
  }

  const rows = db
    .prepare(`
      SELECT * FROM audit_logs
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 250
    `)
    .all(...params) as Array<{
    id: string;
    workspace_id: string;
    user_id: string | null;
    actor_label: string;
    event_type: AuditLogEntry['eventType'];
    provider: ProviderType | 'system';
    resource_type: string;
    resource_id: string | null;
    action: string;
    result: 'success' | 'failure' | 'warning';
    metadata_json: string;
    created_at: string;
  }>;

  const logs: AuditLogEntry[] = rows
    .map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      userId: r.user_id,
      actorLabel: r.actor_label,
      eventType: r.event_type,
      provider: r.provider,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      action: r.action,
      result: r.result,
      metadata: JSON.parse(r.metadata_json || '{}'),
      createdAt: r.created_at,
    }))
    .filter((log) => {
      if (!q) return true;
      return (
        log.action.toLowerCase().includes(q) ||
        log.actorLabel.toLowerCase().includes(q) ||
        log.eventType.toLowerCase().includes(q) ||
        log.provider.toLowerCase().includes(q)
      );
    });

  res.json({ logs });
});

consoleRouter.get('/security', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const accounts = listWorkspaceAccounts(auth.workspaceId);
  const keys = listApiKeysForWorkspace(auth.workspaceId);

  const sessions = db
    .prepare(`
      SELECT id, user_agent, ip_address, expires_at, last_seen_at, created_at
      FROM sessions
      WHERE user_id = ? AND expires_at > ?
      ORDER BY last_seen_at DESC
    `)
    .all(auth.userId, new Date().toISOString()) as Array<Record<string, unknown>>;

  const failedAuthEvents = db
    .prepare(`
      SELECT id, actor_label, event_type, provider, action, created_at
      FROM audit_logs
      WHERE workspace_id = ? AND result = 'failure'
      ORDER BY created_at DESC
      LIMIT 10
    `)
    .all(auth.workspaceId);

  const recommendations: Array<{
    id: string;
    severity: 'warning' | 'info' | 'error';
    title: string;
    description: string;
    actionRoute: string;
    actionLabel: string;
  }> = [];

  const keysWithoutExpiry = keys.filter((k) => k.status === 'active' && !k.expiresAt);
  if (keysWithoutExpiry.length > 0) {
    recommendations.push({
      id: 'rec-no-expiry',
      severity: 'warning',
      title: `${keysWithoutExpiry.length} active API key(s) have no expiration`,
      description: 'Configure an automatic expiration window for master API keys to limit credential lifetime.',
      actionRoute: 'api-keys',
      actionLabel: 'Review API Keys',
    });
  }

  const broadKeys = keys.filter(
    (k) => k.status === 'active' && k.accountScope === 'all' && k.permissions.length >= 5
  );
  if (broadKeys.length > 0) {
    recommendations.push({
      id: 'rec-broad-scope',
      severity: 'info',
      title: `${broadKeys.length} key(s) grant broad multi-provider access`,
      description: 'Restrict master keys to specific connected accounts and least-privilege permissions.',
      actionRoute: 'api-keys',
      actionLabel: 'Tighten Scope',
    });
  }

  const reauthAccounts = accounts.filter((a) =>
    ['reauth_required', 'expired', 'verification_failed'].includes(a.status)
  );
  if (reauthAccounts.length > 0) {
    recommendations.push({
      id: 'rec-reauth',
      severity: 'error',
      title: `${reauthAccounts.length} connected account(s) require reauthentication`,
      description: 'Expired or failing provider authorizations should be verified or reconnected.',
      actionRoute: 'accounts',
      actionLabel: 'Fix Accounts',
    });
  }

  if (!isPersistentEncryptionKeyConfigured()) {
    recommendations.push({
      id: 'rec-enc-key',
      severity: 'warning',
      title: 'Persistent ENCRYPTION_MASTER_KEY secret not set',
      description:
        'An ephemeral AES-256-GCM key is active in memory. Configure ENCRYPTION_MASTER_KEY in environment secrets so encrypted tokens persist across server restarts.',
      actionRoute: 'settings',
      actionLabel: 'View Environment Setup',
    });
  }

  res.json({
    activeSessions: sessions.map((s) => ({
      id: s.id,
      userAgent: s.user_agent,
      ipAddress: s.ip_address,
      expiresAt: s.expires_at,
      lastSeenAt: s.last_seen_at,
      createdAt: s.created_at,
      current: s.id === auth.sessionId,
    })),
    credentialEncryption: {
      algorithm: 'AES-256-GCM',
      persistentKeyConfigured: isPersistentEncryptionKeyConfigured(),
      totalEncryptedCredentials: accounts.filter((a) => a.credentialSecurity?.encryptedAtRest).length,
      accountsNeedingReauth: reauthAccounts.length,
    },
    apiSecurity: {
      activeKeys: keys.filter((k) => k.status === 'active').length,
      revokedKeys: keys.filter((k) => k.status === 'revoked').length,
      expiringSoonKeys: keys.filter((k) => {
        if (k.status !== 'active' || !k.expiresAt) return false;
        const diff = new Date(k.expiresAt).getTime() - Date.now();
        return diff > 0 && diff < 7 * 24 * 60 * 60 * 1000;
      }).length,
    },
    failedAuthEvents,
    recommendations,
  });
});

consoleRouter.get('/notifications', requireUserSession, (req, res) => {
  const wsId = req.auth!.workspaceId;
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM notifications WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(wsId) as Array<{
    id: string;
    workspace_id: string;
    category: NotificationItem['category'];
    severity: NotificationItem['severity'];
    title: string;
    message: string;
    action_route: string | null;
    action_label: string | null;
    read: number;
    created_at: string;
  }>;

  res.json({
    notifications: rows.map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      category: r.category,
      severity: r.severity,
      title: r.title,
      message: r.message,
      actionRoute: r.action_route,
      actionLabel: r.action_label,
      read: Boolean(r.read),
      createdAt: r.created_at,
    })),
  });
});

consoleRouter.post('/notifications/:id/read', requireUserSession, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND workspace_id = ?').run(
    req.params.id,
    req.auth!.workspaceId
  );
  res.json({ ok: true });
});

consoleRouter.post('/notifications/read-all', requireUserSession, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE notifications SET read = 1 WHERE workspace_id = ?').run(req.auth!.workspaceId);
  res.json({ ok: true });
});

consoleRouter.patch('/settings', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { workspaceName, fullName, timezone, dateFormat, themePreference, defaultPage } = req.body as {
    workspaceName?: string;
    fullName?: string;
    timezone?: string;
    dateFormat?: string;
    themePreference?: 'dark' | 'light';
    defaultPage?: string;
  };

  const db = getDb();
  const now = new Date().toISOString();

  if (workspaceName && workspaceName.trim().length >= 2) {
    db.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(
      workspaceName.trim().slice(0, 64),
      now,
      auth.workspaceId
    );
  }
  if (fullName && fullName.trim().length >= 2) {
    db.prepare('UPDATE users SET full_name = ?, updated_at = ? WHERE id = ?').run(
      fullName.trim().slice(0, 80),
      now,
      auth.userId
    );
  }
  if (timezone) {
    db.prepare('UPDATE users SET timezone = ?, updated_at = ? WHERE id = ?').run(
      timezone.slice(0, 64),
      now,
      auth.userId
    );
  }
  if (dateFormat) {
    db.prepare('UPDATE users SET date_format = ?, updated_at = ? WHERE id = ?').run(
      dateFormat.slice(0, 32),
      now,
      auth.userId
    );
  }
  if (themePreference === 'dark' || themePreference === 'light') {
    db.prepare('UPDATE users SET theme_preference = ?, updated_at = ? WHERE id = ?').run(
      themePreference,
      now,
      auth.userId
    );
  }
  if (defaultPage) {
    db.prepare('UPDATE users SET default_page = ?, updated_at = ? WHERE id = ?').run(
      defaultPage.slice(0, 32),
      now,
      auth.userId
    );
  }

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'security_event',
    provider: 'system',
    resourceType: 'settings',
    action: 'Updated workspace and user preferences',
    result: 'success',
  });

  res.json({ ok: true });
});

consoleRouter.get('/export/zip', requireUserSession, (req, res) => {
  const rootDir = process.cwd();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="aethergate-source.zip"');

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err: Error) => {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  });
  archive.pipe(res);

  const excludeDirs = new Set(['node_modules', '.data', 'dist', '.git', '.playwright-cli', 'coverage']);
  const excludeFilePrefixes = ['.env'];

  function addDirectory(dirPath: string, zipRelPath: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeDirs.has(entry.name)) continue;
      if (excludeFilePrefixes.some((p) => entry.name.startsWith(p) && entry.name !== '.env.example')) {
        continue;
      }
      if (entry.name.endsWith('.db') || entry.name.endsWith('.db-wal') || entry.name.endsWith('.db-shm')) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      const relPath = zipRelPath ? path.posix.join(zipRelPath, entry.name) : entry.name;
      if (entry.isDirectory()) {
        addDirectory(fullPath, relPath);
      } else if (entry.isFile()) {
        archive.file(fullPath, { name: relPath });
      }
    }
  }

  addDirectory(rootDir, '');
  void archive.finalize();
});
