import { Router, type NextFunction, type Request, type Response } from 'express';
import { GoogleGenAI } from '@google/genai';
import { getDb } from '../database/db.ts';
import {
  generateId,
  generateMasterApiKey,
  hashApiKey,
} from '../security/crypto.ts';
import {
  evaluateApiKeyPolicy,
  gatewayRateLimiter,
  normalizeProviderCategory,
  type ApiKeyPolicySubject,
} from '../security/gatewayPolicy.ts';
import { aggregateCreditPool, computeQuotaMetrics } from '../../shared/limitUtils.ts';
import { consumeCreditRecord, mapEntitlementRow } from '../services/creditSeedService.ts';
import { recordApiUsageLog, recordAuditLog } from '../logging/audit.ts';
import {
  getDecryptedCredentials,
  getWorkspaceAccountById,
  listWorkspaceAccounts,
  verifyConnectedAccount,
} from '../services/accountService.ts';
import { fetchGoogleUserInfo } from '../providers/google/googleAdapter.ts';
import { fetchGitHubUser } from '../providers/github/githubAdapter.ts';
import { verifyAwsIamRole } from '../providers/aws/awsAdapter.ts';
import {
  ALL_API_PERMISSIONS,
  type ApiEnvironment,
  type ApiPermission,
  type ProviderType,
} from '../../shared/types.ts';

export const gatewayV1Router = Router();

// Allow external developer tools (Cursor, Cline, Continue, custom web/CLI clients) to call /api/v1/*
gatewayV1Router.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-AetherGate-Credit-Id, X-AetherGate-Tool, X-Requested-With'
  );
  res.setHeader(
    'Access-Control-Expose-Headers',
    'X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset'
  );
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

const rateLimiter = gatewayRateLimiter;

interface GatewayAuthContext {
  workspaceId: string;
  key: ApiKeyPolicySubject;
  keyName: string;
  createdByUserId: string;
}

declare global {
  namespace Express {
    interface Request {
      gatewayAuth?: GatewayAuthContext;
      gatewayStartMs?: number;
    }
  }
}

function resolveGatewayKey(req: Request, res: Response, next: NextFunction): void {
  req.gatewayStartMs = Date.now();
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: {
        code: 'MISSING_API_KEY',
        message: 'Provide your Master API key in the Authorization: Bearer <key> header.',
      },
    });
    return;
  }

  const rawKey = authHeader.slice('Bearer '.length).trim();
  if (!rawKey) {
    res.status(401).json({
      error: { code: 'INVALID_API_KEY', message: 'Authorization Bearer token is empty.' },
    });
    return;
  }

  const keyHash = hashApiKey(rawKey);
  const db = getDb();
  const keyRow = db
    .prepare('SELECT * FROM api_keys WHERE key_hash = ?')
    .get(keyHash) as
    | {
        id: string;
        workspace_id: string;
        created_by_user_id: string;
        name: string;
        environment: ApiEnvironment;
        allowed_providers_json: string;
        account_scope: 'all' | 'selected';
        allowed_account_ids_json: string;
        rate_limit_per_minute: number;
        status: 'active' | 'revoked' | 'expired';
        expires_at: string | null;
      }
    | undefined;

  if (!keyRow) {
    res.status(401).json({
      error: { code: 'INVALID_API_KEY', message: 'The provided Master API key is not recognized.' },
    });
    return;
  }

  const perms = (
    db.prepare('SELECT permission FROM api_key_permissions WHERE api_key_id = ?').all(keyRow.id) as Array<{
      permission: ApiPermission;
    }>
  ).map((p) => p.permission);

  const policySubject: ApiKeyPolicySubject = {
    id: keyRow.id,
    status: keyRow.status,
    expiresAt: keyRow.expires_at,
    allowedProviders: JSON.parse(keyRow.allowed_providers_json || '[]') as ProviderType[],
    accountScope: keyRow.account_scope,
    allowedAccountIds: JSON.parse(keyRow.allowed_account_ids_json || '[]') as string[],
    permissions: perms,
    rateLimitPerMinute: keyRow.rate_limit_per_minute,
  };

  const baseEval = evaluateApiKeyPolicy(policySubject, {});
  if (!baseEval.allowed) {
    recordApiUsageLog({
      workspaceId: keyRow.workspace_id,
      apiKeyId: keyRow.id,
      provider: 'gateway',
      endpoint: req.originalUrl.split('?')[0],
      method: req.method,
      statusCode: baseEval.statusCode,
      latencyMs: Date.now() - (req.gatewayStartMs || Date.now()),
      errorCode: baseEval.errorCode,
    });
    res.status(baseEval.statusCode).json({
      error: { code: baseEval.errorCode, message: baseEval.message },
    });
    return;
  }

  const rate = rateLimiter.check(keyRow.id, keyRow.rate_limit_per_minute);
  res.setHeader('X-RateLimit-Limit', String(keyRow.rate_limit_per_minute));
  res.setHeader('X-RateLimit-Remaining', String(rate.remaining));
  res.setHeader('X-RateLimit-Reset', new Date(rate.resetAtMs).toISOString());

  if (!rate.allowed) {
    recordApiUsageLog({
      workspaceId: keyRow.workspace_id,
      apiKeyId: keyRow.id,
      provider: 'gateway',
      endpoint: req.originalUrl.split('?')[0],
      method: req.method,
      statusCode: 429,
      latencyMs: Date.now() - (req.gatewayStartMs || Date.now()),
      errorCode: 'RATE_LIMIT_EXCEEDED',
    });
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded for this Master API key.',
      },
    });
    return;
  }

  db.prepare('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    keyRow.id
  );

  req.gatewayAuth = {
    workspaceId: keyRow.workspace_id,
    key: policySubject,
    keyName: keyRow.name,
    createdByUserId: keyRow.created_by_user_id,
  };

  next();
}

function finishAndLog(
  req: Request,
  res: Response,
  provider: string,
  statusCode: number,
  body: unknown,
  errorCode?: string
): void {
  const ctx = req.gatewayAuth;
  if (ctx) {
    recordApiUsageLog({
      workspaceId: ctx.workspaceId,
      apiKeyId: ctx.key.id,
      provider,
      endpoint: req.originalUrl.split('?')[0],
      method: req.method,
      statusCode,
      latencyMs: Date.now() - (req.gatewayStartMs || Date.now()),
      errorCode: errorCode || null,
    });
  }
  res.status(statusCode).json(body);
}

gatewayV1Router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'AetherGate Unified API Gateway',
    version: 'v1',
    openaiCompatible: true,
    timestamp: new Date().toISOString(),
  });
});

gatewayV1Router.use(resolveGatewayKey);

gatewayV1Router.get('/models', (req, res) => {
  const ctx = req.gatewayAuth!;
  const hasRead =
    ctx.key.permissions.includes('entitlements:read') || ctx.key.permissions.includes('accounts:read');
  if (!hasRead) {
    finishAndLog(
      req,
      res,
      'gateway',
      403,
      {
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: 'API key requires entitlements:read or accounts:read to list models.',
        },
      },
      'INSUFFICIENT_PERMISSIONS'
    );
    return;
  }

  const created = Math.floor(Date.now() / 1000);
  const models = [
    { id: 'aethergate/gemini-2.5-flash', object: 'model', created, owned_by: 'aethergate-google' },
    { id: 'gemini-2.5-flash', object: 'model', created, owned_by: 'google' },
    { id: 'gemini-2.5-pro', object: 'model', created, owned_by: 'google' },
    { id: 'aethergate/credit-router', object: 'model', created, owned_by: 'aethergate-pool' },
  ];

  finishAndLog(req, res, 'gateway', 200, { object: 'list', data: models });
});

gatewayV1Router.post('/chat/completions', async (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'entitlements:read' });
  if (!policy.allowed) {
    finishAndLog(
      req,
      res,
      'gateway',
      policy.statusCode,
      { error: { code: policy.errorCode, message: policy.message } },
      policy.errorCode
    );
    return;
  }

  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  if (!geminiKey || geminiKey === 'MY_GEMINI_API_KEY') {
    finishAndLog(
      req,
      res,
      'google',
      503,
      {
        error: {
          code: 'GEMINI_API_KEY_NOT_CONFIGURED',
          message:
            'Server GEMINI_API_KEY is not configured. Add GEMINI_API_KEY in workspace secrets to route OpenAI-compatible completions.',
        },
      },
      'GEMINI_API_KEY_NOT_CONFIGURED'
    );
    return;
  }

  const body = (req.body || {}) as {
    model?: string;
    messages?: Array<{ role?: string; content?: string }>;
    temperature?: number;
    max_tokens?: number;
    track_credits?: boolean;
    credit_provider?: string;
    credit_cost?: number;
  };

  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    finishAndLog(
      req,
      res,
      'gateway',
      400,
      {
        error: {
          code: 'INVALID_REQUEST',
          message: 'Request body must include a non-empty messages array.',
        },
      },
      'INVALID_REQUEST'
    );
    return;
  }

  const requestedModel = (body.model || 'gemini-2.5-flash').trim();
  const targetGeminiModel = requestedModel.includes('pro') ? 'gemini-2.5-pro' : 'gemini-2.5-flash';

  const systemParts = messages
    .filter((m) => m.role === 'system' && typeof m.content === 'string')
    .map((m) => m.content!.trim())
    .filter(Boolean);
  const promptText = messages
    .filter((m) => m.role !== 'system' && typeof m.content === 'string')
    .map((m) => `${m.role === 'assistant' ? 'Assistant' : 'User'}: ${m.content}`)
    .join('\n\n');

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: targetGeminiModel,
      contents: promptText || 'Hello',
      config: {
        ...(systemParts.length ? { systemInstruction: systemParts.join('\n') } : {}),
        ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}),
        ...(typeof body.max_tokens === 'number' ? { maxOutputTokens: body.max_tokens } : {}),
      },
    });

    const content = response.text ?? '';
    const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const completionTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    let creditResult = null;
    if (body.track_credits !== false) {
      const creditIdHeader = req.headers['x-aethergate-credit-id'] as string | undefined;
      const toolHeader = (req.headers['x-aethergate-tool'] as string | undefined) || 'external-api';
      creditResult = consumeCreditRecord(ctx.workspaceId, {
        entitlementId: creditIdHeader,
        provider: body.credit_provider,
        amount: typeof body.credit_cost === 'number' && body.credit_cost > 0 ? body.credit_cost : 1,
        toolName: toolHeader,
        actorLabel: `api_key:${ctx.keyName}`,
      });
    }

    finishAndLog(req, res, 'google', 200, {
      id: `chatcmpl-${generateId('ag')}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: requestedModel,
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      ...(creditResult
        ? {
            aethergate_credit_pool: {
              consumed: creditResult.consumed,
              totalRemaining: creditResult.creditPool.totalRemaining,
              usedRecordId: creditResult.updatedRecord?.id ?? null,
            },
          }
        : {}),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Upstream Gemini completion failed';
    finishAndLog(
      req,
      res,
      'google',
      502,
      { error: { code: 'UPSTREAM_AI_ERROR', message: msg } },
      'UPSTREAM_AI_ERROR'
    );
  }
});

gatewayV1Router.post('/credits/consume', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'entitlements:read' });
  if (!policy.allowed) {
    finishAndLog(
      req,
      res,
      'gateway',
      policy.statusCode,
      { error: { code: policy.errorCode, message: policy.message } },
      policy.errorCode
    );
    return;
  }

  const { entitlementId, provider, amount, toolName } = (req.body || {}) as {
    entitlementId?: string;
    provider?: string;
    amount?: number;
    toolName?: string;
  };

  const result = consumeCreditRecord(ctx.workspaceId, {
    entitlementId,
    provider,
    amount,
    toolName: toolName || (req.headers['x-aethergate-tool'] as string | undefined) || 'external-client',
    actorLabel: `api_key:${ctx.keyName}`,
  });

  if (!result.updatedRecord) {
    finishAndLog(
      req,
      res,
      'gateway',
      404,
      {
        error: {
          code: 'NO_AVAILABLE_CREDITS',
          message: 'No matching AI credit record with remaining balance was found.',
        },
        creditPool: result.creditPool,
      },
      'NO_AVAILABLE_CREDITS'
    );
    return;
  }

  finishAndLog(req, res, 'gateway', 200, {
    ok: true,
    ...result,
  });
});

gatewayV1Router.get('/accounts', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'accounts:read' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const allAccounts = listWorkspaceAccounts(ctx.workspaceId);
  const allowedCategories = new Set(ctx.key.allowedProviders.map(normalizeProviderCategory));

  const filtered = allAccounts.filter((acc) => {
    if (!allowedCategories.has(normalizeProviderCategory(acc.provider))) return false;
    if (ctx.key.accountScope === 'selected' && !ctx.key.allowedAccountIds.includes(acc.id)) {
      return false;
    }
    return true;
  });

  finishAndLog(req, res, 'gateway', 200, {
    accounts: filtered.map((a) => ({
      id: a.id,
      provider: a.provider,
      providerAccountId: a.providerAccountId,
      displayName: a.displayName,
      email: a.email,
      username: a.username,
      status: a.status,
      grantedScopes: a.grantedScopes,
      lastVerifiedAt: a.lastVerifiedAt,
      tokenExpiresAt: a.tokenExpiresAt,
      createdAt: a.createdAt,
    })),
    total: filtered.length,
  });
});

gatewayV1Router.get('/accounts/:id', (req, res) => {
  const ctx = req.gatewayAuth!;
  const account = getWorkspaceAccountById(ctx.workspaceId, req.params.id);
  if (!account) {
    finishAndLog(req, res, 'gateway', 404, { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Connected account not found.' } }, 'ACCOUNT_NOT_FOUND');
    return;
  }

  const policy = evaluateApiKeyPolicy(ctx.key, {
    requiredPermission: 'accounts:read',
    provider: account.provider,
    accountId: account.id,
  });
  if (!policy.allowed) {
    finishAndLog(req, res, account.provider, policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  finishAndLog(req, res, account.provider, 200, { account });
});

gatewayV1Router.get('/accounts/:id/status', async (req, res) => {
  const ctx = req.gatewayAuth!;
  const account = getWorkspaceAccountById(ctx.workspaceId, req.params.id);
  if (!account) {
    finishAndLog(req, res, 'gateway', 404, { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Connected account not found.' } }, 'ACCOUNT_NOT_FOUND');
    return;
  }

  const policy = evaluateApiKeyPolicy(ctx.key, {
    requiredPermission: 'accounts:verify',
    provider: account.provider,
    accountId: account.id,
  });
  if (!policy.allowed) {
    finishAndLog(req, res, account.provider, policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const refresh = req.query.verify === 'true';
  try {
    const updated = refresh
      ? await verifyConnectedAccount(ctx.workspaceId, account.id, `api_key:${ctx.keyName}`)
      : account;
    finishAndLog(req, res, account.provider, 200, {
      id: updated.id,
      provider: updated.provider,
      status: updated.status,
      lastVerifiedAt: updated.lastVerifiedAt,
      tokenExpiresAt: updated.tokenExpiresAt,
      lastError: updated.lastError,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Verification failed';
    finishAndLog(req, res, account.provider, 502, { error: { code: 'VERIFICATION_FAILED', message: msg } }, 'VERIFICATION_FAILED');
  }
});

gatewayV1Router.get('/entitlements', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'entitlements:read' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM entitlements WHERE workspace_id = ? ORDER BY last_checked_at DESC')
    .all(ctx.workspaceId) as Array<Record<string, unknown>>;

  const filtered = rows.filter((r) => {
    const accId = r.connected_account_id as string | null;
    if (ctx.key.accountScope === 'selected' && accId && !ctx.key.allowedAccountIds.includes(accId)) {
      return false;
    }
    return true;
  });

  finishAndLog(req, res, 'gateway', 200, {
    entitlements: filtered.map((r) => ({
      id: r.id,
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
      lastCheckedAt: r.last_checked_at,
    })),
  });
});

gatewayV1Router.get('/limits', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'entitlements:read' });
  if (!policy.allowed) {
    finishAndLog(
      req,
      res,
      'gateway',
      policy.statusCode,
      { error: { code: policy.errorCode, message: policy.message } },
      policy.errorCode
    );
    return;
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM entitlements WHERE workspace_id = ? ORDER BY last_checked_at DESC')
    .all(ctx.workspaceId) as Array<Record<string, unknown>>;

  const externalAiProviders = new Set(['kiro', 'cursor', 'windsurf', 'openrouter', 'groq', 'huggingface']);
  const allowedCategories = new Set(ctx.key.allowedProviders.map(normalizeProviderCategory));
  const filtered = rows.filter((r) => {
    const prov = String(r.provider || '');
    if (!externalAiProviders.has(prov) && !allowedCategories.has(normalizeProviderCategory(prov as ProviderType))) {
      return false;
    }
    const accId = r.connected_account_id as string | null;
    if (ctx.key.accountScope === 'selected' && accId && !ctx.key.allowedAccountIds.includes(accId)) {
      return false;
    }
    return true;
  });

  const windowPeek = rateLimiter.peek(ctx.key.id, ctx.key.rateLimitPerMinute);
  const mappedFiltered = filtered.map(mapEntitlementRow);

  finishAndLog(req, res, 'gateway', 200, {
    gatewayKeyRateLimit: {
      keyId: ctx.key.id,
      keyName: ctx.keyName,
      limitPerMinute: windowPeek.limit,
      usedInWindow: windowPeek.used,
      remainingInWindow: windowPeek.remaining,
      resetAt: new Date(windowPeek.resetAtMs).toISOString(),
    },
    creditPool: aggregateCreditPool(mappedFiltered),
    limits: filtered.map((r) => {
      const limitVal = typeof r.limit_value === 'number' ? r.limit_value : null;
      const usedVal = typeof r.used_value === 'number' ? r.used_value : null;
      const metrics = computeQuotaMetrics(limitVal, usedVal);
      return {
        id: r.id,
        connectedAccountId: r.connected_account_id,
        provider: r.provider,
        accountLabel: r.account_label,
        entitlementType: r.entitlement_type,
        category: r.category || 'entitlement',
        availableAmount: r.available_amount,
        limitValue: metrics.limit,
        usedValue: metrics.used,
        remainingValue: metrics.remaining,
        percentUsed: metrics.percentUsed,
        unit: r.unit ?? null,
        resetPeriod: r.reset_period ?? null,
        currency: r.currency,
        expiryDate: r.expiry_date,
        status: r.status,
        source: r.source,
        verificationStatus: r.verification_status,
        lastCheckedAt: r.last_checked_at,
      };
    }),
  });
});

gatewayV1Router.get('/google/:accountId/profile', async (req, res) => {
  const ctx = req.gatewayAuth!;
  const account = getWorkspaceAccountById(ctx.workspaceId, req.params.accountId);
  if (!account || account.provider !== 'google') {
    finishAndLog(req, res, 'google', 404, { error: { code: 'GOOGLE_ACCOUNT_NOT_FOUND', message: 'Google connected account not found.' } }, 'GOOGLE_ACCOUNT_NOT_FOUND');
    return;
  }

  const policy = evaluateApiKeyPolicy(ctx.key, {
    requiredPermission: 'google:profile:read',
    provider: 'google',
    accountId: account.id,
  });
  if (!policy.allowed) {
    finishAndLog(req, res, 'google', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const creds = getDecryptedCredentials(account.id);
  if (!creds?.accessToken) {
    finishAndLog(req, res, 'google', 401, { error: { code: 'PROVIDER_REAUTH_REQUIRED', message: 'Google account credentials must be reauthorized.' } }, 'PROVIDER_REAUTH_REQUIRED');
    return;
  }

  try {
    const profile = await fetchGoogleUserInfo(creds.accessToken);
    finishAndLog(req, res, 'google', 200, {
      accountId: account.id,
      provider: 'google',
      profile: {
        sub: profile.sub,
        name: profile.name,
        email: profile.email,
        emailVerified: profile.email_verified,
        picture: profile.picture,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Google profile request failed';
    finishAndLog(req, res, 'google', 502, { error: { code: 'UPSTREAM_GOOGLE_ERROR', message: msg } }, 'UPSTREAM_GOOGLE_ERROR');
  }
});

gatewayV1Router.get('/github/:accountId/profile', async (req, res) => {
  const ctx = req.gatewayAuth!;
  const account = getWorkspaceAccountById(ctx.workspaceId, req.params.accountId);
  if (!account || account.provider !== 'github') {
    finishAndLog(req, res, 'github', 404, { error: { code: 'GITHUB_ACCOUNT_NOT_FOUND', message: 'GitHub connected account not found.' } }, 'GITHUB_ACCOUNT_NOT_FOUND');
    return;
  }

  const policy = evaluateApiKeyPolicy(ctx.key, {
    requiredPermission: 'github:profile:read',
    provider: 'github',
    accountId: account.id,
  });
  if (!policy.allowed) {
    finishAndLog(req, res, 'github', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const creds = getDecryptedCredentials(account.id);
  if (!creds?.accessToken) {
    finishAndLog(req, res, 'github', 401, { error: { code: 'PROVIDER_REAUTH_REQUIRED', message: 'GitHub account credentials must be reauthorized.' } }, 'PROVIDER_REAUTH_REQUIRED');
    return;
  }

  try {
    const gh = await fetchGitHubUser(creds.accessToken);
    finishAndLog(req, res, 'github', 200, {
      accountId: account.id,
      provider: 'github',
      profile: {
        id: gh.profile.id,
        login: gh.profile.login,
        name: gh.profile.name,
        email: gh.primaryEmail,
        avatarUrl: gh.profile.avatar_url,
        htmlUrl: gh.profile.html_url,
        publicRepos: gh.profile.public_repos,
        followers: gh.profile.followers,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GitHub profile request failed';
    finishAndLog(req, res, 'github', 502, { error: { code: 'UPSTREAM_GITHUB_ERROR', message: msg } }, 'UPSTREAM_GITHUB_ERROR');
  }
});

gatewayV1Router.get('/aws/:accountId/identity', async (req, res) => {
  const ctx = req.gatewayAuth!;
  const account = getWorkspaceAccountById(ctx.workspaceId, req.params.accountId);
  if (!account || !account.provider.startsWith('aws')) {
    finishAndLog(req, res, 'aws', 404, { error: { code: 'AWS_ACCOUNT_NOT_FOUND', message: 'AWS connected account not found.' } }, 'AWS_ACCOUNT_NOT_FOUND');
    return;
  }

  const policy = evaluateApiKeyPolicy(ctx.key, {
    requiredPermission: 'aws:identity:read',
    provider: account.provider,
    accountId: account.id,
  });
  if (!policy.allowed) {
    finishAndLog(req, res, 'aws', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  if (account.awsMeta?.connectionMode === 'iam_role' && account.awsMeta.roleArn) {
    try {
      const sts = await verifyAwsIamRole({
        roleArn: account.awsMeta.roleArn,
        region: account.awsMeta.region,
      });
      finishAndLog(req, res, 'aws', 200, {
        accountId: account.id,
        provider: account.provider,
        identity: sts,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AWS STS error';
      finishAndLog(req, res, 'aws', 502, { error: { code: 'UPSTREAM_AWS_ERROR', message: msg } }, 'UPSTREAM_AWS_ERROR');
    }
    return;
  }

  finishAndLog(req, res, 'aws', 200, {
    accountId: account.id,
    provider: account.provider,
    status: account.status,
    awsMeta: account.awsMeta,
  });
});

gatewayV1Router.get('/keys', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'keys:read' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }

  const db = getDb();
  const rows = db
    .prepare('SELECT id, name, environment, key_prefix, masked_key, status, expires_at, last_used_at, created_at FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC')
    .all(ctx.workspaceId);
  finishAndLog(req, res, 'gateway', 200, { keys: rows });
});

gatewayV1Router.post('/keys', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'keys:manage' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }
  const { name, environment, permissions, allowedProviders, expiresInDays } = req.body as {
    name?: string;
    environment?: ApiEnvironment;
    permissions?: ApiPermission[];
    allowedProviders?: ProviderType[];
    expiresInDays?: number;
  };
  if (!name || name.trim().length < 2) {
    finishAndLog(req, res, 'gateway', 400, { error: { code: 'INVALID_INPUT', message: 'Key name is required.' } }, 'INVALID_INPUT');
    return;
  }

  const env: ApiEnvironment = environment === 'production' ? 'production' : 'development';
  const validPerms = (permissions || ['accounts:read']).filter((p): p is ApiPermission =>
    ALL_API_PERMISSIONS.includes(p)
  );
  const { rawKey, keyPrefix, maskedKey, keyHash } = generateMasterApiKey(env);
  const keyId = generateId('key');
  const now = new Date().toISOString();
  const expiresAt =
    typeof expiresInDays === 'number' && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO api_keys (
        id, workspace_id, created_by_user_id, name, description, environment,
        key_prefix, masked_key, key_hash, allowed_providers_json, account_scope,
        allowed_account_ids_json, rate_limit_per_minute, status, expires_at,
        last_used_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'all', '[]', 60, 'active', ?, NULL, ?, NULL)
    `).run(
      keyId,
      ctx.workspaceId,
      ctx.createdByUserId,
      name.trim(),
      env,
      keyPrefix,
      maskedKey,
      keyHash,
      JSON.stringify(allowedProviders?.length ? allowedProviders : ['google', 'github', 'aws']),
      expiresAt,
      now
    );
    const ins = db.prepare('INSERT INTO api_key_permissions (id, api_key_id, permission) VALUES (?, ?, ?)');
    for (const p of validPerms) ins.run(generateId('akp'), keyId, p);
  });
  tx();

  recordAuditLog({
    workspaceId: ctx.workspaceId,
    actorLabel: `api_key:${ctx.keyName}`,
    eventType: 'api_key_created',
    provider: 'system',
    resourceType: 'api_key',
    resourceId: keyId,
    action: `Created master API key "${name.trim()}" via gateway`,
    result: 'success',
  });

  finishAndLog(req, res, 'gateway', 201, { id: keyId, keyPrefix, maskedKey, rawKey });
});

gatewayV1Router.post('/keys/:id/rotate', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'keys:manage' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }
  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM api_keys WHERE id = ? AND workspace_id = ?')
    .get(req.params.id, ctx.workspaceId) as { id: string; name: string; environment: ApiEnvironment } | undefined;

  if (!existing) {
    finishAndLog(req, res, 'gateway', 404, { error: { code: 'KEY_NOT_FOUND', message: 'API key not found.' } }, 'KEY_NOT_FOUND');
    return;
  }

  const perms = (
    db.prepare('SELECT permission FROM api_key_permissions WHERE api_key_id = ?').all(existing.id) as Array<{
      permission: ApiPermission;
    }>
  ).map((p) => p.permission);
  const { rawKey, keyPrefix, maskedKey, keyHash } = generateMasterApiKey(existing.environment);
  const newId = generateId('key');
  const now = new Date().toISOString();

  const tx = db.transaction(() => {
    db.prepare(`UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ?`).run(now, existing.id);
    db.prepare(`
      INSERT INTO api_keys (
        id, workspace_id, created_by_user_id, name, description, environment,
        key_prefix, masked_key, key_hash, allowed_providers_json, account_scope,
        allowed_account_ids_json, rate_limit_per_minute, status, expires_at,
        last_used_at, created_at, revoked_at
      ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, '["google","github","aws"]', 'all', '[]', 60, 'active', NULL, NULL, ?, NULL)
    `).run(newId, ctx.workspaceId, ctx.createdByUserId, existing.name, existing.environment, keyPrefix, maskedKey, keyHash, now);
    const ins = db.prepare('INSERT INTO api_key_permissions (id, api_key_id, permission) VALUES (?, ?, ?)');
    for (const p of perms) ins.run(generateId('akp'), newId, p);
  });
  tx();

  finishAndLog(req, res, 'gateway', 200, { id: newId, keyPrefix, maskedKey, rawKey });
});

gatewayV1Router.delete('/keys/:id', (req, res) => {
  const ctx = req.gatewayAuth!;
  const policy = evaluateApiKeyPolicy(ctx.key, { requiredPermission: 'keys:manage' });
  if (!policy.allowed) {
    finishAndLog(req, res, 'gateway', policy.statusCode, { error: { code: policy.errorCode, message: policy.message } }, policy.errorCode);
    return;
  }
  const db = getDb();
  const info = db
    .prepare(`UPDATE api_keys SET status = 'revoked', revoked_at = ? WHERE id = ? AND workspace_id = ?`)
    .run(new Date().toISOString(), req.params.id, ctx.workspaceId);

  if (info.changes === 0) {
    finishAndLog(req, res, 'gateway', 404, { error: { code: 'KEY_NOT_FOUND', message: 'API key not found.' } }, 'KEY_NOT_FOUND');
    return;
  }
  finishAndLog(req, res, 'gateway', 200, { revoked: true, id: req.params.id });
});
