import type {
  CreditPoolProviderBreakdown,
  CreditPoolSummary,
  CreditProviderType,
  EntitlementRecord,
} from './types.ts';

export interface QuotaMetrics {
  limit: number | null;
  used: number | null;
  remaining: number | null;
  percentUsed: number | null;
  isNearLimit: boolean;
  isExhausted: boolean;
}

export function computeQuotaMetrics(
  limitValue?: number | null,
  usedValue?: number | null
): QuotaMetrics {
  const limit =
    typeof limitValue === 'number' && Number.isFinite(limitValue) && limitValue >= 0
      ? limitValue
      : null;
  const used =
    typeof usedValue === 'number' && Number.isFinite(usedValue) && usedValue >= 0
      ? usedValue
      : null;

  if (limit === null) {
    return {
      limit: null,
      used,
      remaining: null,
      percentUsed: null,
      isNearLimit: false,
      isExhausted: false,
    };
  }

  const safeUsed = used ?? 0;
  const remaining = Math.max(0, Number((limit - safeUsed).toFixed(4)));
  const percentUsed =
    limit > 0 ? Math.min(100, Math.round((safeUsed / limit) * 100)) : safeUsed > 0 ? 100 : 0;

  return {
    limit,
    used: safeUsed,
    remaining,
    percentUsed,
    isNearLimit: percentUsed >= 80 && percentUsed < 100,
    isExhausted: limit > 0 ? safeUsed >= limit : false,
  };
}

export function formatCountdown(isoDate: string | null | undefined, nowMs = Date.now()): string {
  if (!isoDate) return 'No expiry';
  const targetMs = new Date(isoDate).getTime();
  if (Number.isNaN(targetMs)) return 'Unknown';

  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    const agoMin = Math.max(1, Math.floor(Math.abs(diffMs) / 60_000));
    if (agoMin < 60) return `Expired ${agoMin}m ago`;
    const agoHrs = Math.floor(agoMin / 60);
    if (agoHrs < 48) return `Expired ${agoHrs}h ago`;
    return `Expired ${Math.floor(agoHrs / 24)}d ago`;
  }

  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'Expires in <1m';
  if (mins < 60) return `Expires in ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `Expires in ${hrs}h`;
  return `Expires in ${Math.floor(hrs / 24)}d`;
}

export function aggregateCreditPool(
  entitlements: Array<
    Pick<EntitlementRecord, 'provider' | 'category' | 'limitValue' | 'usedValue'>
  >
): CreditPoolSummary {
  const byProviderMap = new Map<CreditProviderType, CreditPoolProviderBreakdown>();
  let totalLimit = 0;
  let totalUsed = 0;
  let totalRemaining = 0;
  let activePoolCount = 0;

  for (const item of entitlements) {
    const isCreditOrAi = !item.category || item.category === 'ai_limit' || item.category === 'credits';
    if (!isCreditOrAi) continue;
    const metrics = computeQuotaMetrics(item.limitValue, item.usedValue);
    if (metrics.limit === null || metrics.limit <= 0) continue;

    activePoolCount++;
    const used = Math.min(metrics.limit, metrics.used ?? 0);
    const remaining = metrics.remaining ?? 0;

    totalLimit += metrics.limit;
    totalUsed += used;
    totalRemaining += remaining;

    const existing = byProviderMap.get(item.provider) ?? {
      provider: item.provider,
      limit: 0,
      used: 0,
      remaining: 0,
      entries: 0,
    };
    existing.limit = Number((existing.limit + metrics.limit).toFixed(4));
    existing.used = Number((existing.used + used).toFixed(4));
    existing.remaining = Number((existing.remaining + remaining).toFixed(4));
    existing.entries += 1;
    byProviderMap.set(item.provider, existing);
  }

  const cleanLimit = Number(totalLimit.toFixed(4));
  const cleanUsed = Number(totalUsed.toFixed(4));
  const cleanRemaining = Number(totalRemaining.toFixed(4));
  const percentUsed =
    cleanLimit > 0 ? Math.min(100, Math.round((cleanUsed / cleanLimit) * 100)) : 0;

  return {
    totalLimit: cleanLimit,
    totalUsed: cleanUsed,
    totalRemaining: cleanRemaining,
    percentUsed,
    activePoolCount,
    byProvider: Array.from(byProviderMap.values()).sort((a, b) => b.remaining - a.remaining),
  };
}

export function selectCreditPoolTarget(
  entitlements: EntitlementRecord[],
  options: { entitlementId?: string; provider?: string } = {}
): EntitlementRecord | null {
  if (options.entitlementId) {
    const exact = entitlements.find((e) => e.id === options.entitlementId);
    if (exact && typeof exact.limitValue === 'number' && exact.limitValue > 0) {
      return exact;
    }
    return null;
  }

  const eligible = entitlements.filter((e) => {
    const isCreditOrAi = !e.category || e.category === 'ai_limit' || e.category === 'credits';
    if (!isCreditOrAi) return false;
    const metrics = computeQuotaMetrics(e.limitValue, e.usedValue);
    if (metrics.limit === null || (metrics.remaining ?? 0) <= 0) return false;
    if (options.provider && e.provider !== options.provider) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  // Prefer Kiro credits first when no provider is specified, otherwise highest remaining
  return eligible.sort((a, b) => {
    if (!options.provider) {
      if (a.provider === 'kiro' && b.provider !== 'kiro') return -1;
      if (b.provider === 'kiro' && a.provider !== 'kiro') return 1;
    }
    const remA = computeQuotaMetrics(a.limitValue, a.usedValue).remaining ?? 0;
    const remB = computeQuotaMetrics(b.limitValue, b.usedValue).remaining ?? 0;
    return remB - remA;
  })[0];
}

