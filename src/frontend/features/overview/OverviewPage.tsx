import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { formatProviderName, ProviderIcon } from '../../components/BrandMark';
import { formatRelativeTime, SkeletonRows, StatusBadge } from '../../components/UiPrimitives';
import { api } from '../../services/api';
import type {
  AuditLogEntry,
  ConnectedAccount,
  CreditPoolSummary,
  ProviderType,
} from '../../../shared/types';

export function OverviewPage({
  onNavigate,
  onOpenConnect,
  refreshTrigger,
  pushToast,
}: {
  onNavigate: (page: string) => void;
  onOpenConnect: (provider?: ProviderType) => void;
  refreshTrigger: number;
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<{
    metrics: {
      totalAccounts: number;
      connectedAccounts: number;
      attentionRequired: number;
      verifiedEntitlements: number;
      activeApiKeys: number;
      apiRequests: number;
    };
    providerHealth: Array<{
      provider: 'google' | 'github' | 'aws';
      total: number;
      active: number;
      issues: number;
      lastVerified: string | null;
      health: 'healthy' | 'degraded' | 'unconfigured';
    }>;
    recentAccounts: ConnectedAccount[];
    recentActivity: AuditLogEntry[];
    entitlementSummary: {
      verified: number;
      manual?: number;
      expiring: number;
      unsupported: number;
      lastSyncedAt: string | null;
    };
    creditPool?: CreditPoolSummary;
    gatewayLimitSummary?: {
      activeKeys: number;
      totalCapacityPerMin: number;
      usedInWindow: number;
    };
  } | null>(null);

  const loadOverview = async () => {
    try {
      const res = await api.getOverview();
      setData(res);
    } catch {
      // Keep previous state
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [refreshTrigger]);

  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await api.verifyAllAccounts();
      await loadOverview();
      pushToast({ tone: 'success', title: 'Connection status refreshed' });
    } catch {
      pushToast({ tone: 'error', title: 'Could not refresh all connections' });
    } finally {
      setRefreshing(false);
    }
  };

  const metrics = data?.metrics ?? {
    totalAccounts: 0,
    connectedAccounts: 0,
    attentionRequired: 0,
    verifiedEntitlements: 0,
    activeApiKeys: 0,
    apiRequests: 0,
  };

  const creditPool = data?.creditPool ?? {
    totalLimit: 0,
    totalUsed: 0,
    totalRemaining: 0,
    percentUsed: 0,
    activePoolCount: 0,
    byProvider: [],
  };

  const metricCards = [
    {
      label: 'Total Accounts',
      value: metrics.totalAccounts,
      hint: 'Authorized identities',
      icon: Users,
      route: 'accounts',
    },
    {
      label: 'Connected Accounts',
      value: metrics.connectedAccounts,
      hint: 'Verified active links',
      icon: CheckCircle2,
      route: 'accounts',
    },
    {
      label: 'Attention Required',
      value: metrics.attentionRequired,
      hint: 'Reauth or failed checks',
      icon: AlertTriangle,
      route: 'accounts',
    },
    {
      label: 'Verified Entitlements',
      value: metrics.verifiedEntitlements,
      hint: 'Confirmed plans',
      icon: ShieldCheck,
      route: 'entitlements',
    },
    {
      label: 'Active API Keys',
      value: metrics.activeApiKeys,
      hint: 'Gateway credentials',
      icon: KeyRound,
      route: 'api-keys',
    },
    {
      label: 'API Requests',
      value: metrics.apiRequests,
      hint: 'Logged gateway calls',
      icon: Activity,
      route: 'analytics',
    },
  ];

  const totalDist = Math.max(1, metrics.totalAccounts);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
            Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Unified identity telemetry, pooled AI login credits, and external gateway status.
          </p>
        </div>
        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl glass-subtle px-3.5 py-2 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] disabled:opacity-50 whitespace-nowrap transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Status</span>
          </button>
          <button
            type="button"
            onClick={() => onOpenConnect()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] whitespace-nowrap transition-colors shadow-[0_6px_18px_rgba(10,132,255,0.28)]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Connect Account</span>
          </button>
        </div>
      </div>

      {/* 6 Summary Metrics */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {metricCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <motion.button
              key={card.label}
              type="button"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: idx * 0.03 }}
              whileHover={{ y: -2 }}
              onClick={() => onNavigate(card.route)}
              className="group rounded-2xl glass-surface p-4 text-left hover:border-[#0A84FF]/60 transition-colors"
            >
              <div className="flex items-center justify-between text-[var(--ab-text-muted)]">
                <span className="text-xs font-medium text-[var(--ab-text-secondary)]">{card.label}</span>
                <Icon className="w-4 h-4 text-[var(--ab-text-muted)] group-hover:text-[#0A84FF] transition-colors" />
              </div>
              <div className="mt-2.5 text-2xl font-semibold tabular-nums font-mono text-[var(--ab-text-primary)]">
                {loading ? '—' : card.value}
              </div>
              <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--ab-text-muted)]">
                <span>{card.hint}</span>
                <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </motion.button>
          );
        })}
      </div>

      {/* Unified AI Credit Pool Bento Card */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.24, delay: 0.12 }}
        className="rounded-2xl glass-surface p-5 sm:p-6 space-y-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#0A84FF]/15 text-[#0A84FF] shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--ab-text-primary)]">
                  Unified AI Credit Pool
                </h2>
                <span className="text-[11px] text-[var(--ab-text-muted)]">
                  Kiro · Gemini · Copilot · Amazon Q · Login Tools
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[var(--ab-text-secondary)]">
                Aggregated credits you actually recorded or synced — not estimated starter quotas.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onNavigate('entitlements')}
              className="inline-flex items-center gap-1 rounded-xl glass-subtle px-3.5 py-2 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] whitespace-nowrap"
            >
              <span>Manage AI Pool</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-12 lg:items-center">
          <div className="lg:col-span-5 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <div>
                <div className="text-xs text-[var(--ab-text-muted)]">Total Remaining Pool</div>
                <div className="mt-1 text-3xl font-semibold font-mono tabular-nums text-[var(--ab-text-primary)]">
                  {loading ? '—' : creditPool.totalRemaining.toLocaleString()}
                  <span className="ml-1.5 text-xs font-normal text-[var(--ab-text-muted)]">
                    / {creditPool.totalLimit.toLocaleString()} units
                  </span>
                </div>
              </div>
              <div className="text-right font-mono tabular-nums text-xs">
                <div className="text-[#30D158] font-semibold">
                  {Math.max(0, 100 - creditPool.percentUsed)}% available
                </div>
                <div className="text-[var(--ab-text-muted)]">{creditPool.totalUsed.toLocaleString()} used</div>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-black/25 dark:bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(0, 100 - creditPool.percentUsed))}%` }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full bg-gradient-to-r from-[#0A84FF] to-[#30D158]"
              />
            </div>
          </div>

          <div className="lg:col-span-7 grid gap-2.5 sm:grid-cols-3">
            {creditPool.byProvider.slice(0, 6).map((item) => (
              <button
                key={item.provider}
                type="button"
                onClick={() => onNavigate('entitlements')}
                className="rounded-xl glass-subtle p-3 text-left hover:border-[#0A84FF]/50 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <ProviderIcon provider={item.provider} size={14} />
                    <span className="text-xs font-medium text-[var(--ab-text-primary)] truncate">
                      {formatProviderName(item.provider)}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-[var(--ab-text-muted)]">
                    {item.entries}x
                  </span>
                </div>
                <div className="mt-1.5 font-mono text-xs tabular-nums text-[#30D158]">
                  {item.remaining.toLocaleString()}
                  <span className="text-[10px] text-[var(--ab-text-muted)]">
                    {' '}/ {item.limit.toLocaleString()}
                  </span>
                </div>
              </button>
            ))}
            {!loading && creditPool.byProvider.length === 0 && (
              <div className="sm:col-span-3 rounded-xl glass-subtle p-4 text-xs text-[var(--ab-text-secondary)]">
                No AI credit pools yet. Track a real limit from Credits &amp; Limits, or connect a provider and sync.
              </div>
            )}
          </div>
        </div>
      </motion.section>

      {/* Empty State when no accounts exist */}
      {!loading && metrics.totalAccounts === 0 && (
        <section className="rounded-2xl glass-surface p-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl glass-subtle text-[#0A84FF] mb-4">
            <Layers className="w-5 h-5" />
          </div>
          <h2 className="text-lg font-semibold text-[var(--ab-text-primary)]">
            Your infrastructure starts here.
          </h2>
          <p className="mt-1.5 text-sm text-[var(--ab-text-secondary)] max-w-lg mx-auto">
            Connect your Google, GitHub or AWS identities to unify account verification, login AI credit pools, and gateway access.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => onOpenConnect('google')}
              className="inline-flex items-center gap-2 rounded-xl glass-subtle px-4 py-2 text-xs font-semibold text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
            >
              <ProviderIcon provider="google" size={15} />
              <span>Connect Google</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenConnect('github')}
              className="inline-flex items-center gap-2 rounded-xl glass-subtle px-4 py-2 text-xs font-semibold text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
            >
              <ProviderIcon provider="github" size={15} />
              <span>Connect GitHub</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenConnect('aws')}
              className="inline-flex items-center gap-2 rounded-xl glass-subtle px-4 py-2 text-xs font-semibold text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
            >
              <ProviderIcon provider="aws" size={15} />
              <span>Connect AWS</span>
            </button>
          </div>
        </section>
      )}

      {/* Connection Health + Distribution */}
      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 rounded-2xl glass-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">Provider Connection Health</h2>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs text-[#0A84FF] hover:underline"
            >
              Manage accounts
            </button>
          </div>
          <div className="divide-y divide-[var(--ab-border)]">
            {(data?.providerHealth ?? [
              { provider: 'google', total: 0, active: 0, issues: 0, lastVerified: null, health: 'unconfigured' as const },
              { provider: 'github', total: 0, active: 0, issues: 0, lastVerified: null, health: 'unconfigured' as const },
              { provider: 'aws', total: 0, active: 0, issues: 0, lastVerified: null, health: 'unconfigured' as const },
            ]).map((item) => (
              <div key={item.provider} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl glass-subtle">
                    <ProviderIcon provider={item.provider} size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--ab-text-primary)]">
                      {item.provider === 'aws'
                        ? 'AWS (IAM, Builder ID & SSO)'
                        : formatProviderName(item.provider)}
                    </p>
                    <p className="text-xs text-[var(--ab-text-muted)] tabular-nums">
                      {item.total} connected · {item.active} active · {item.issues} issues
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-[var(--ab-text-muted)] tabular-nums hidden sm:inline">
                    Verified: {formatRelativeTime(item.lastVerified)}
                  </span>
                  <StatusBadge status={item.health} />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Account Distribution + Entitlement Summary */}
        <section className="rounded-2xl glass-surface p-5 flex flex-col justify-between space-y-5">
          <div>
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">Account Distribution</h2>
            <p className="mt-0.5 text-xs text-[var(--ab-text-muted)]">Connected identities by provider</p>

            <div className="mt-4 space-y-3">
              {(data?.providerHealth ?? []).map((p) => {
                const pct = metrics.totalAccounts > 0 ? Math.round((p.total / totalDist) * 100) : 0;
                const barColor =
                  p.provider === 'google'
                    ? 'bg-[#0A84FF]'
                    : p.provider === 'github'
                    ? 'bg-[#30D158]'
                    : 'bg-[#FF9F0A]';
                return (
                  <div key={p.provider} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--ab-text-secondary)]">
                        {formatProviderName(p.provider)}
                      </span>
                      <span className="font-mono tabular-nums text-[var(--ab-text-primary)]">
                        {p.total} ({pct}%)
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--ab-border)] space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                AI Limits &amp; Quotas
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('entitlements')}
                className="text-xs text-[#0A84FF] hover:underline"
              >
                Inspect all
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
              <div className="rounded-xl glass-subtle p-2.5">
                <div className="text-[var(--ab-text-muted)] text-[11px]">Verified</div>
                <div className="mt-0.5 font-mono font-semibold text-[#30D158]">
                  {data?.entitlementSummary.verified ?? 0}
                </div>
              </div>
              <div className="rounded-xl glass-subtle p-2.5">
                <div className="text-[var(--ab-text-muted)] text-[11px]">Tracked</div>
                <div className="mt-0.5 font-mono font-semibold text-[#0A84FF]">
                  {data?.entitlementSummary.manual ?? 0}
                </div>
              </div>
              <div className="rounded-xl glass-subtle p-2.5">
                <div className="text-[var(--ab-text-muted)] text-[11px]">Expiring</div>
                <div className="mt-0.5 font-mono font-semibold text-[#FF9F0A]">
                  {data?.entitlementSummary.expiring ?? 0}
                </div>
              </div>
              <div className="rounded-xl glass-subtle p-2.5">
                <div className="text-[var(--ab-text-muted)] text-[11px]">Unsupported</div>
                <div className="mt-0.5 font-mono font-semibold text-[var(--ab-text-primary)]">
                  {data?.entitlementSummary.unsupported ?? 0}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-[11px] text-[var(--ab-text-muted)] font-mono tabular-nums">
              <span>
                Gateway: {data?.gatewayLimitSummary?.usedInWindow ?? 0}/
                {data?.gatewayLimitSummary?.totalCapacityPerMin ?? 0} req/min
              </span>
              <span>Sync: {formatRelativeTime(data?.entitlementSummary.lastSyncedAt ?? null)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Recent Connected Accounts & Recent Activity */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl glass-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">Recent Connected Accounts</h2>
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="text-xs text-[#0A84FF] hover:underline"
            >
              View all
            </button>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : (data?.recentAccounts.length ?? 0) === 0 ? (
            <div className="p-6 text-xs text-[var(--ab-text-muted)]">
              No provider identities have been connected to this workspace yet.
            </div>
          ) : (
            <div className="divide-y divide-[var(--ab-border)]">
              {data!.recentAccounts.map((acc) => (
                <div key={acc.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ProviderIcon provider={acc.provider} size={16} />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--ab-text-primary)] truncate">
                        {acc.displayName}
                      </p>
                      <p className="text-[11px] font-mono text-[var(--ab-text-muted)] truncate">
                        {formatProviderName(acc.provider)} · {acc.email || acc.providerAccountId}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={acc.status} />
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl glass-surface overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-5 py-3.5">
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">Recent Activity</h2>
            <button
              type="button"
              onClick={() => onNavigate('logs')}
              className="text-xs text-[#0A84FF] hover:underline"
            >
              Audit log
            </button>
          </div>
          {loading ? (
            <SkeletonRows rows={3} />
          ) : (data?.recentActivity.length ?? 0) === 0 ? (
            <div className="p-6 text-xs text-[var(--ab-text-muted)]">No activity events recorded yet.</div>
          ) : (
            <div className="divide-y divide-[var(--ab-border)]">
              {data!.recentActivity.slice(0, 6).map((ev) => (
                <div key={ev.id} className="flex items-start justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-[var(--ab-text-primary)] truncate">{ev.action}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--ab-text-muted)] tabular-nums">
                      {ev.actorLabel} · {formatRelativeTime(ev.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={ev.result} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
