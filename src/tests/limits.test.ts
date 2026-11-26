import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCreditPool,
  computeQuotaMetrics,
  formatCountdown,
  selectCreditPoolTarget,
} from '../shared/limitUtils.ts';
import type { EntitlementRecord } from '../shared/types.ts';

test('computeQuotaMetrics handles null, normal, near-limit, exhausted, and fractional precision', () => {
  assert.deepEqual(computeQuotaMetrics(null, 10), {
    limit: null,
    used: 10,
    remaining: null,
    percentUsed: null,
    isNearLimit: false,
    isExhausted: false,
  });

  assert.deepEqual(computeQuotaMetrics(500, null), {
    limit: 500,
    used: 0,
    remaining: 500,
    percentUsed: 0,
    isNearLimit: false,
    isExhausted: false,
  });

  assert.deepEqual(computeQuotaMetrics(500, 400), {
    limit: 500,
    used: 400,
    remaining: 100,
    percentUsed: 80,
    isNearLimit: true,
    isExhausted: false,
  });

  assert.deepEqual(computeQuotaMetrics(500, 525), {
    limit: 500,
    used: 525,
    remaining: 0,
    percentUsed: 100,
    isNearLimit: false,
    isExhausted: true,
  });

  const fractional = computeQuotaMetrics(10, 0.3);
  assert.equal(fractional.remaining, 9.7);
  assert.equal(fractional.percentUsed, 3);
});

test('formatCountdown formats future and expired timestamps cleanly', () => {
  const now = new Date('2026-11-24T12:00:00.000Z').getTime();

  assert.equal(formatCountdown(null, now), 'No expiry');
  assert.equal(formatCountdown('invalid-date', now), 'Unknown');
  assert.equal(formatCountdown('2026-11-24T12:00:30.000Z', now), 'Expires in <1m');
  assert.equal(formatCountdown('2026-11-24T12:45:00.000Z', now), 'Expires in 45m');
  assert.equal(formatCountdown('2026-11-24T17:00:00.000Z', now), 'Expires in 5h');
  assert.equal(formatCountdown('2026-11-28T12:00:00.000Z', now), 'Expires in 4d');
  assert.equal(formatCountdown('2026-11-24T11:45:00.000Z', now), 'Expired 15m ago');
  assert.equal(formatCountdown('2026-11-24T09:00:00.000Z', now), 'Expired 3h ago');
  assert.equal(formatCountdown('2026-11-21T12:00:00.000Z', now), 'Expired 3d ago');
});

test('aggregateCreditPool sums AI & credit pools while ignoring rate_limit and null-limit rows', () => {
  const pool = aggregateCreditPool([
    { provider: 'kiro', category: 'ai_limit', limitValue: 500, usedValue: 100 },
    { provider: 'kiro', category: 'ai_limit', limitValue: 50, usedValue: 10 },
    { provider: 'cursor', category: 'ai_limit', limitValue: 50, usedValue: 0 },
    { provider: 'github', category: 'rate_limit', limitValue: 5000, usedValue: 12 },
    { provider: 'google', category: 'token_ttl', limitValue: null, usedValue: null },
  ]);

  assert.equal(pool.totalLimit, 600);
  assert.equal(pool.totalUsed, 110);
  assert.equal(pool.totalRemaining, 490);
  assert.equal(pool.percentUsed, 18);
  assert.equal(pool.activePoolCount, 3);
  assert.equal(pool.byProvider[0].provider, 'kiro');
  assert.equal(pool.byProvider[0].remaining, 440);
});

test('selectCreditPoolTarget prioritizes Kiro by default and respects explicit provider or ID', () => {
  const base: Omit<EntitlementRecord, 'id' | 'provider' | 'limitValue' | 'usedValue'> = {
    workspaceId: 'ws_1',
    connectedAccountId: null,
    accountLabel: 'manoj@example.com',
    entitlementType: 'Credits',
    category: 'ai_limit',
    availableAmount: null,
    unit: 'credits',
    resetPeriod: 'monthly',
    currency: null,
    expiryDate: null,
    status: 'MANUALLY ENTERED',
    source: 'Manual Entry',
    verificationStatus: 'unverified',
    notes: null,
    lastCheckedAt: '2026-11-24T12:00:00.000Z',
  };

  const rows: EntitlementRecord[] = [
    { ...base, id: 'ent_cursor', provider: 'cursor', limitValue: 200, usedValue: 10 },
    { ...base, id: 'ent_kiro', provider: 'kiro', limitValue: 500, usedValue: 50 },
    { ...base, id: 'ent_empty', provider: 'windsurf', limitValue: 25, usedValue: 25 },
  ];

  assert.equal(selectCreditPoolTarget(rows)?.id, 'ent_kiro');
  assert.equal(selectCreditPoolTarget(rows, { provider: 'cursor' })?.id, 'ent_cursor');
  assert.equal(selectCreditPoolTarget(rows, { entitlementId: 'ent_cursor' })?.id, 'ent_cursor');
  assert.equal(selectCreditPoolTarget(rows, { provider: 'windsurf' }), null);
});

