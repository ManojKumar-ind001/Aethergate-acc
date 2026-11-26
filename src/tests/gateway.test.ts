import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateApiKeyPolicy,
  redactSensitiveFields,
  SlidingWindowRateLimiter,
  type ApiKeyPolicySubject,
} from '../backend/security/gatewayPolicy.ts';

const baseKey: ApiKeyPolicySubject = {
  id: 'key_1',
  status: 'active',
  expiresAt: null,
  allowedProviders: ['google', 'github'],
  accountScope: 'selected',
  allowedAccountIds: ['acc_g1', 'acc_gh1'],
  permissions: ['accounts:read', 'google:profile:read'],
  rateLimitPerMinute: 3,
};

test('revoked key is rejected immediately with 401', () => {
  const res = evaluateApiKeyPolicy({ ...baseKey, status: 'revoked' }, { requiredPermission: 'accounts:read' });
  assert.equal(res.allowed, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.errorCode, 'API_KEY_REVOKED');
});

test('expired key is rejected with 401', () => {
  const res = evaluateApiKeyPolicy(
    { ...baseKey, expiresAt: '2020-01-01T00:00:00.000Z' },
    { requiredPermission: 'accounts:read', now: new Date('2026-01-01T00:00:00.000Z') }
  );
  assert.equal(res.allowed, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.errorCode, 'API_KEY_EXPIRED');
});

test('permission, provider, and account scope restrictions are enforced', () => {
  const missingPerm = evaluateApiKeyPolicy(baseKey, { requiredPermission: 'entitlements:read' });
  assert.equal(missingPerm.allowed, false);
  assert.equal(missingPerm.statusCode, 403);

  const disallowedProvider = evaluateApiKeyPolicy(baseKey, {
    requiredPermission: 'accounts:read',
    provider: 'aws',
  });
  assert.equal(disallowedProvider.allowed, false);
  assert.equal(disallowedProvider.errorCode, 'PROVIDER_NOT_PERMITTED');

  const outOfScopeAccount = evaluateApiKeyPolicy(baseKey, {
    requiredPermission: 'google:profile:read',
    provider: 'google',
    accountId: 'acc_g999',
  });
  assert.equal(outOfScopeAccount.allowed, false);
  assert.equal(outOfScopeAccount.errorCode, 'ACCOUNT_OUT_OF_SCOPE');

  const valid = evaluateApiKeyPolicy(baseKey, {
    requiredPermission: 'google:profile:read',
    provider: 'google',
    accountId: 'acc_g1',
  });
  assert.equal(valid.allowed, true);
  assert.equal(valid.statusCode, 200);
});

test('sliding window rate limiter enforces per-minute limit and resets after window', () => {
  const limiter = new SlidingWindowRateLimiter();
  const t0 = 1_700_000_000_000;
  assert.equal(limiter.check('key_1', 2, t0).allowed, true);
  assert.equal(limiter.check('key_1', 2, t0 + 1000).allowed, true);
  assert.equal(limiter.check('key_1', 2, t0 + 2000).allowed, false);
  assert.equal(limiter.check('key_1', 2, t0 + 61_000).allowed, true);
});

test('sliding window rate limiter peek inspects usage without consuming quota', () => {
  const limiter = new SlidingWindowRateLimiter();
  const t0 = 1_700_000_000_000;

  assert.deepEqual(limiter.peek('key_peek', 5, t0), {
    limit: 5,
    used: 0,
    remaining: 5,
    resetAtMs: t0 + 60_000,
  });

  limiter.check('key_peek', 5, t0 + 500);
  limiter.check('key_peek', 5, t0 + 1500);

  const midPeek = limiter.peek('key_peek', 5, t0 + 2000);
  assert.equal(midPeek.used, 2);
  assert.equal(midPeek.remaining, 3);
  assert.equal(midPeek.resetAtMs, t0 + 500 + 60_000);

  // Calling peek again must not consume quota
  const repeatPeek = limiter.peek('key_peek', 5, t0 + 3000);
  assert.equal(repeatPeek.used, 2);
  assert.equal(repeatPeek.remaining, 3);

  // After 60s window passes, expired entries clear
  const afterWindow = limiter.peek('key_peek', 5, t0 + 62_000);
  assert.equal(afterWindow.used, 0);
  assert.equal(afterWindow.remaining, 5);
});

test('redactSensitiveFields masks nested secrets cleanly', () => {
  const sanitized = redactSensitiveFields({
    actor: 'dev@example.com',
    access_token: 'secret-token',
    nested: { refresh_token: 'rt-123', region: 'us-east-1' },
  });
  assert.equal(sanitized.access_token, '[REDACTED]');
  assert.equal((sanitized.nested as Record<string, unknown>).refresh_token, '[REDACTED]');
  assert.equal((sanitized.nested as Record<string, unknown>).region, 'us-east-1');
});

test('keys:read and keys:manage permission scoping is enforced strictly', () => {
  const deniedRead = evaluateApiKeyPolicy(baseKey, { requiredPermission: 'keys:read' });
  assert.equal(deniedRead.allowed, false);
  assert.equal(deniedRead.statusCode, 403);

  const keyManager: ApiKeyPolicySubject = {
    ...baseKey,
    permissions: ['keys:manage'],
  };
  assert.equal(evaluateApiKeyPolicy(keyManager, { requiredPermission: 'keys:read' }).allowed, true);
  assert.equal(evaluateApiKeyPolicy(keyManager, { requiredPermission: 'keys:manage' }).allowed, true);
});

