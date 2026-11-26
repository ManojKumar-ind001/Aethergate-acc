import type { ApiPermission, ProviderType } from '../../shared/types.ts';

export interface ApiKeyPolicySubject {
  id: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt: string | null;
  allowedProviders: ProviderType[];
  accountScope: 'all' | 'selected';
  allowedAccountIds: string[];
  permissions: ApiPermission[];
  rateLimitPerMinute: number;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  statusCode: number;
  errorCode?: string;
  message?: string;
}

export function evaluateApiKeyPolicy(
  key: ApiKeyPolicySubject,
  options: {
    requiredPermission?: ApiPermission;
    provider?: ProviderType;
    accountId?: string;
    now?: Date;
  }
): PolicyEvaluationResult {
  const now = options.now ?? new Date();

  if (key.status === 'revoked') {
    return {
      allowed: false,
      statusCode: 401,
      errorCode: 'API_KEY_REVOKED',
      message: 'This API key has been revoked and is no longer valid.',
    };
  }

  if (key.status === 'expired' || (key.expiresAt && new Date(key.expiresAt).getTime() <= now.getTime())) {
    return {
      allowed: false,
      statusCode: 401,
      errorCode: 'API_KEY_EXPIRED',
      message: 'This API key has expired.',
    };
  }

  if (options.requiredPermission) {
    const hasPerm =
      key.permissions.includes(options.requiredPermission) ||
      (options.requiredPermission === 'keys:read' && key.permissions.includes('keys:manage'));
    if (!hasPerm) {
      return {
        allowed: false,
        statusCode: 403,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        message: `API key lacks required permission: ${options.requiredPermission}`,
      };
    }
  }

  if (options.provider) {
    const normalizedProvider = normalizeProviderCategory(options.provider);
    const allowedNormalized = key.allowedProviders.map(normalizeProviderCategory);
    if (!allowedNormalized.includes(normalizedProvider)) {
      return {
        allowed: false,
        statusCode: 403,
        errorCode: 'PROVIDER_NOT_PERMITTED',
        message: `API key is not authorized for provider: ${options.provider}`,
      };
    }
  }

  if (options.accountId && key.accountScope === 'selected') {
    if (!key.allowedAccountIds.includes(options.accountId)) {
      return {
        allowed: false,
        statusCode: 403,
        errorCode: 'ACCOUNT_OUT_OF_SCOPE',
        message: 'API key does not have access to the requested account identifier.',
      };
    }
  }

  return { allowed: true, statusCode: 200 };
}

export function normalizeProviderCategory(provider: ProviderType): 'google' | 'github' | 'aws' {
  if (provider === 'google') return 'google';
  if (provider === 'github') return 'github';
  return 'aws';
}

export class SlidingWindowRateLimiter {
  private readonly windows = new Map<string, number[]>();

  check(keyId: string, limitPerMinute: number, nowMs = Date.now()): {
    allowed: boolean;
    remaining: number;
    resetAtMs: number;
  } {
    const windowMs = 60_000;
    const cutoff = nowMs - windowMs;
    const timestamps = (this.windows.get(keyId) ?? []).filter((t) => t > cutoff);

    if (timestamps.length >= limitPerMinute) {
      const oldest = timestamps[0] ?? nowMs;
      this.windows.set(keyId, timestamps);
      return {
        allowed: false,
        remaining: 0,
        resetAtMs: oldest + windowMs,
      };
    }

    timestamps.push(nowMs);
    this.windows.set(keyId, timestamps);
    return {
      allowed: true,
      remaining: Math.max(0, limitPerMinute - timestamps.length),
      resetAtMs: nowMs + windowMs,
    };
  }

  peek(keyId: string, limitPerMinute: number, nowMs = Date.now()): {
    limit: number;
    used: number;
    remaining: number;
    resetAtMs: number;
  } {
    const windowMs = 60_000;
    const cutoff = nowMs - windowMs;
    const timestamps = (this.windows.get(keyId) ?? []).filter((t) => t > cutoff);
    if (timestamps.length > 0) {
      this.windows.set(keyId, timestamps);
    } else {
      this.windows.delete(keyId);
    }
    const oldest = timestamps[0] ?? nowMs;
    return {
      limit: limitPerMinute,
      used: timestamps.length,
      remaining: Math.max(0, limitPerMinute - timestamps.length),
      resetAtMs: timestamps.length > 0 ? oldest + windowMs : nowMs + windowMs,
    };
  }
}

export const gatewayRateLimiter = new SlidingWindowRateLimiter();

export function redactSensitiveFields<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const sensitiveKeys = new Set([
    'access_token',
    'refresh_token',
    'id_token',
    'password',
    'passwordHash',
    'secret',
    'client_secret',
    'externalId',
    'rawKey',
    'keyHash',
    'authorization',
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (sensitiveKeys.has(k)) {
      out[k] = '[REDACTED]';
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redactSensitiveFields(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
