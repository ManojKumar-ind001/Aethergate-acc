import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  Edit3,
  Gauge,
  Info,
  KeyRound,
  MinusCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { formatProviderName, ProviderIcon } from '../../components/BrandMark';
import { formatRelativeTime, StatusBadge } from '../../components/UiPrimitives';
import { computeQuotaMetrics, formatCountdown } from '../../../shared/limitUtils';
import { api, ApiError } from '../../services/api';
import type {
  AiLimitsOverviewResponse,
  ConnectedAccount,
  CreditProviderType,
  EntitlementCategory,
  EntitlementRecord,
} from '../../../shared/types';

interface LimitPreset {
  id: string;
  label: string;
  provider: CreditProviderType;
  entitlementType: string;
  category: EntitlementCategory;
  limitValue: string;
  usedValue: string;
  unit: string;
  resetPeriod: NonNullable<EntitlementRecord['resetPeriod']>;
  notes: string;
}

const AI_LIMIT_PRESETS: LimitPreset[] = [
  {
    id: 'kiro-bonus',
    label: 'Kiro AI Signup Bonus (500)',
    provider: 'kiro',
    entitlementType: 'Kiro AI Signup Bonus Credits',
    category: 'credits',
    limitValue: '500',
    usedValue: '0',
    unit: 'credits',
    resetPeriod: 'one-time',
    notes: 'Login-tier baseline bonus for Kiro AI developer accounts (Manual Entry).',
  },
  {
    id: 'kiro-pro',
    label: 'Kiro Pro Monthly (500)',
    provider: 'kiro',
    entitlementType: 'Kiro Pro Monthly Credits',
    category: 'ai_limit',
    limitValue: '500',
    usedValue: '0',
    unit: 'credits',
    resetPeriod: 'monthly',
    notes: 'Monthly Kiro Pro vibe & spec interaction credits.',
  },
  {
    id: 'gemini-rpd',
    label: 'Gemini AI Studio (1500/day)',
    provider: 'google',
    entitlementType: 'Gemini AI Studio Free Tier RPD',
    category: 'ai_limit',
    limitValue: '1500',
    usedValue: '0',
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'Google AI Studio / Gemini login tier daily request quota.',
  },
  {
    id: 'gh-copilot',
    label: 'GitHub Copilot Free (50/mo)',
    provider: 'github',
    entitlementType: 'GitHub Copilot Free Monthly Requests',
    category: 'ai_limit',
    limitValue: '50',
    usedValue: '0',
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Monthly Copilot free-tier model requests.',
  },
  {
    id: 'aws-q',
    label: 'Amazon Q / Builder ID (50/mo)',
    provider: 'aws_builder_id',
    entitlementType: 'Amazon Q Developer Free Tier',
    category: 'ai_limit',
    limitValue: '50',
    usedValue: '0',
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'AWS Builder ID login baseline for Amazon Q Developer.',
  },
  {
    id: 'cursor-free',
    label: 'Cursor Free Hobby (50/mo)',
    provider: 'cursor',
    entitlementType: 'Cursor Free Hobby Monthly Requests',
    category: 'ai_limit',
    limitValue: '50',
    usedValue: '0',
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Cursor IDE login-tier monthly baseline.',
  },
  {
    id: 'windsurf-free',
    label: 'Windsurf Free Credits (25/mo)',
    provider: 'windsurf',
    entitlementType: 'Windsurf Free Prompt Credits',
    category: 'credits',
    limitValue: '25',
    usedValue: '0',
    unit: 'credits',
    resetPeriod: 'monthly',
    notes: 'Windsurf login-tier prompt credit baseline.',
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter Free Tier (50/day)',
    provider: 'openrouter',
    entitlementType: 'OpenRouter Free Models Daily Limit',
    category: 'ai_limit',
    limitValue: '50',
    usedValue: '0',
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'OpenRouter free-model daily request allowance.',
  },
  {
    id: 'groq-free',
    label: 'Groq LPU Free Tier (14400/day)',
    provider: 'groq',
    entitlementType: 'Groq Free Tier Daily Requests',
    category: 'ai_limit',
    limitValue: '14400',
    usedValue: '0',
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'GroqCloud free developer login quota.',
  },
  {
    id: 'hf-free',
    label: 'Hugging Face Free Inference',
    provider: 'huggingface',
    entitlementType: 'Hugging Face Monthly Inference Credits',
    category: 'credits',
    limitValue: '100',
    usedValue: '0',
    unit: 'credits',
    resetPeriod: 'monthly',
    notes: 'Hugging Face free login inference quota.',
  },
];

const LOGIN_TOOL_PROVIDERS = new Set<CreditProviderType>([
  'cursor',
  'windsurf',
  'openrouter',
  'groq',
  'huggingface',
]);

export function EntitlementsPage({
  accounts,
  pushToast,
}: {
  accounts: ConnectedAccount[];
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [tab, setTab] = useState<'all' | 'ai_limit' | 'kiro' | 'login_tools' | 'google' | 'github' | 'aws'>('all');
  const [limitsData, setLimitsData] = useState<AiLimitsOverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [consumingId, setConsumingId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  // Manual entry form
  const [mProvider, setMProvider] = useState<CreditProviderType>('kiro');
  const [mAccountId, setMAccountId] = useState('');
  const [mAccountLabel, setMAccountLabel] = useState('');
  const [mType, setMType] = useState('');
  const [mCategory, setMCategory] = useState<EntitlementCategory>('ai_limit');
  const [mLimitValue, setMLimitValue] = useState('');
  const [mUsedValue, setMUsedValue] = useState('');
  const [mUnit, setMUnit] = useState('credits');
  const [mResetPeriod, setMResetPeriod] = useState<NonNullable<EntitlementRecord['resetPeriod']>>('monthly');
  const [mExpiry, setMExpiry] = useState('');
  const [mNotes, setMNotes] = useState('');
  const [savingManual, setSavingManual] = useState(false);

  // Quick update usage modal
  const [editingItem, setEditingItem] = useState<EntitlementRecord | null>(null);
  const [editUsed, setEditUsed] = useState('');
  const [editLimit, setEditLimit] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadLimits = async () => {
    try {
      const res = await api.getLimits();
      setLimitsData(res);
    } catch {
      // Keep current
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadLimits();
  }, [accounts.length]);

  const entitlements = limitsData?.entitlements ?? [];
  const creditPool = limitsData?.creditPool ?? {
    totalLimit: 0,
    totalUsed: 0,
    totalRemaining: 0,
    percentUsed: 0,
    activePoolCount: 0,
    byProvider: [],
  };

  const filtered = useMemo(() => {
    return entitlements.filter((item) => {
      if (tab === 'all') return true;
      if (tab === 'ai_limit') {
        return item.category === 'ai_limit' || item.category === 'credits' || item.category === 'rate_limit';
      }
      if (tab === 'login_tools') return LOGIN_TOOL_PROVIDERS.has(item.provider);
      if (tab === 'aws') return item.provider.startsWith('aws');
      return item.provider === tab;
    });
  }, [entitlements, tab]);

  const applyPreset = (preset: LimitPreset, setProviderToo = true) => {
    if (setProviderToo) setMProvider(preset.provider);
    setMType(preset.entitlementType);
    setMCategory(preset.category);
    setMLimitValue(preset.limitValue);
    setMUsedValue(preset.usedValue);
    setMUnit(preset.unit);
    setMResetPeriod(preset.resetPeriod);
    setMNotes(preset.notes);
  };

  const openModalForProvider = (provider: CreditProviderType) => {
    setMProvider(provider);
    setMAccountId('');
    const matchingAcc = accounts.find((a) =>
      provider === 'aws' ? a.provider.startsWith('aws') : a.provider === provider
    );
    setMAccountLabel(
      matchingAcc ? matchingAcc.email || matchingAcc.username || matchingAcc.displayName : 'Workspace Default'
    );
    if (matchingAcc) setMAccountId(matchingAcc.id);
    const matchingPreset = AI_LIMIT_PRESETS.find((p) => p.provider === provider);
    if (matchingPreset) {
      applyPreset(matchingPreset, false);
    }
    setManualOpen(true);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await api.syncEntitlements();
      await loadLimits();
      pushToast({
        tone: 'success',
        title: 'Provider limits & entitlements synced',
        description: `${res.syncedCount} verified provider metric(s) refreshed.`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Sync failed',
        description: err instanceof ApiError ? err.message : 'Unable to sync provider limits.',
      });
    } finally {
      setSyncing(false);
    }
  };

  const handleConsumeOne = async (row: EntitlementRecord) => {
    setConsumingId(row.id);
    try {
      const res = await api.consumeCredit({
        entitlementId: row.id,
        amount: 1,
        toolName: 'console',
      });
      await loadLimits();
      pushToast({
        tone: 'info',
        title: `Used 1 credit from ${row.entitlementType}`,
        description: `Remaining pool: ${res.creditPool.totalRemaining.toLocaleString()} units`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not consume credit',
        description: err instanceof ApiError ? err.message : 'No remaining credits in this pool.',
      });
    } finally {
      setConsumingId(null);
    }
  };

  const handleManualSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!mAccountLabel.trim() || !mType.trim()) return;
    setSavingManual(true);
    try {
      const parsedLimit = mLimitValue.trim() !== '' ? Number(mLimitValue) : null;
      const parsedUsed = mUsedValue.trim() !== '' ? Number(mUsedValue) : null;
      await api.createManualEntitlement({
        provider: mProvider,
        connectedAccountId: mAccountId || undefined,
        accountLabel: mAccountLabel,
        entitlementType: mType,
        category: mCategory,
        limitValue: parsedLimit !== null && Number.isFinite(parsedLimit) ? parsedLimit : null,
        usedValue: parsedUsed !== null && Number.isFinite(parsedUsed) ? parsedUsed : null,
        unit: mUnit || undefined,
        resetPeriod: mResetPeriod,
        currency: mUnit === 'USD' || mUnit === 'EUR' ? mUnit : undefined,
        expiryDate: mExpiry || undefined,
        notes: mNotes || undefined,
      });
      setManualOpen(false);
      setMAccountLabel('');
      setMType('');
      setMLimitValue('');
      setMUsedValue('');
      setMExpiry('');
      setMNotes('');
      await loadLimits();
      pushToast({ tone: 'success', title: 'AI limit / credit pool saved' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Could not save entry',
        description: err instanceof ApiError ? err.message : 'Validation failed.',
      });
    } finally {
      setSavingManual(false);
    }
  };

  const handleUpdateUsageSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setSavingEdit(true);
    try {
      const nextUsed = editUsed.trim() !== '' ? Number(editUsed) : null;
      const nextLimit = editLimit.trim() !== '' ? Number(editLimit) : null;
      await api.updateEntitlement(editingItem.id, {
        usedValue: nextUsed !== null && Number.isFinite(nextUsed) ? nextUsed : null,
        limitValue: nextLimit !== null && Number.isFinite(nextLimit) ? nextLimit : null,
        notes: editNotes || null,
      });
      setEditingItem(null);
      await loadLimits();
      pushToast({ tone: 'success', title: 'Usage updated' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Update failed',
        description: err instanceof ApiError ? err.message : 'Unable to update limit.',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteEntitlement(id);
      await loadLimits();
      pushToast({ tone: 'info', title: 'Limit record removed' });
    } catch {
      pushToast({ tone: 'error', title: 'Failed to remove record' });
    }
  };

  const summary = limitsData?.summary ?? {
    activeGatewayKeys: 0,
    totalGatewayCapacityPerMin: 0,
    usedGatewayWindowRequests: 0,
    verifiedCount: 0,
    manualCount: 0,
    expiringCount: 0,
    unsupportedCount: 0,
  };

  const supportBadge = (mode: 'live_api' | 'partial_ttl' | 'manual_only' | 'unsupported') => {
    if (mode === 'live_api') {
      return <span className="text-[11px] font-medium text-[#30D158] whitespace-nowrap">Live API Sync</span>;
    }
    if (mode === 'partial_ttl') {
      return <span className="text-[11px] font-medium text-[#0A84FF] whitespace-nowrap">Token TTL + Manual</span>;
    }
    if (mode === 'manual_only') {
      return <span className="text-[11px] font-medium text-[#FF9F0A] whitespace-nowrap">Manual / Login Tier</span>;
    }
    return <span className="text-[11px] font-medium text-[var(--ab-text-muted)] whitespace-nowrap">No Public API</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
            AI Credits &amp; Limits
          </h1>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Pool Kiro AI, Gemini, GitHub Copilot, Amazon Q, Cursor, Windsurf, OpenRouter &amp; Groq credits with honest provenance.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setManualOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl glass-subtle px-3.5 py-2 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Track AI Limit</span>
          </button>
          <button
            type="button"
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] disabled:opacity-60 whitespace-nowrap shadow-[0_6px_18px_rgba(10,132,255,0.28)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span>Sync Providers</span>
          </button>
        </div>
      </div>

      {/* Unified AI Credit Pool Summary Strip */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        className="rounded-2xl glass-surface p-5 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              Unified AI Credit Pool
            </div>
            <div className="mt-1 flex items-baseline gap-3">
              <span className="text-3xl font-semibold font-mono tabular-nums text-[var(--ab-text-primary)]">
                {loading ? '—' : creditPool.totalRemaining.toLocaleString()}
              </span>
              <span className="text-xs font-mono text-[var(--ab-text-secondary)]">
                remaining of {creditPool.totalLimit.toLocaleString()} total · {creditPool.totalUsed.toLocaleString()} used across {creditPool.activePoolCount} pool(s)
              </span>
            </div>
          </div>
          <div className="text-xs font-mono text-[#30D158]">
            {Math.max(0, 100 - creditPool.percentUsed)}% pool capacity free
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-black/25 dark:bg-white/10 overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, 100 - creditPool.percentUsed))}%` }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full bg-gradient-to-r from-[#0A84FF] to-[#30D158]"
          />
        </div>
        {creditPool.byProvider.length > 0 && (
          <div className="flex flex-wrap gap-3 pt-1 text-xs">
            {creditPool.byProvider.map((p) => (
              <div key={p.provider} className="inline-flex items-center gap-1.5 rounded-xl glass-subtle px-3 py-1.5">
                <ProviderIcon provider={p.provider} size={13} />
                <span className="font-medium text-[var(--ab-text-primary)]">
                  {formatProviderName(p.provider)}
                </span>
                <span className="font-mono text-[#30D158] tabular-nums">
                  {p.remaining.toLocaleString()}/{p.limit.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      {/* 4 Summary Cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl glass-surface p-4">
          <div className="flex items-center justify-between text-xs text-[var(--ab-text-secondary)]">
            <span>Gateway Capacity</span>
            <Gauge className="w-4 h-4 text-[#0A84FF]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums">
            {loading ? '—' : `${summary.usedGatewayWindowRequests} / ${summary.totalGatewayCapacityPerMin}`}
          </div>
          <div className="mt-1 text-[11px] text-[var(--ab-text-muted)]">
            req/min used across {summary.activeGatewayKeys} active key(s)
          </div>
        </div>

        <div className="rounded-2xl glass-surface p-4">
          <div className="flex items-center justify-between text-xs text-[var(--ab-text-secondary)]">
            <span>Verified Provider Limits</span>
            <ShieldCheck className="w-4 h-4 text-[#30D158]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#30D158]">
            {loading ? '—' : summary.verifiedCount}
          </div>
          <div className="mt-1 text-[11px] text-[var(--ab-text-muted)]">
            Live rate limits, plans &amp; token TTLs
          </div>
        </div>

        <div className="rounded-2xl glass-surface p-4">
          <div className="flex items-center justify-between text-xs text-[var(--ab-text-secondary)]">
            <span>Tracked AI Quotas</span>
            <Activity className="w-4 h-4 text-[#0A84FF]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#0A84FF]">
            {loading ? '—' : summary.manualCount}
          </div>
          <div className="mt-1 text-[11px] text-[var(--ab-text-muted)]">
            Kiro, Gemini, Copilot &amp; login baselines
          </div>
        </div>

        <div className="rounded-2xl glass-surface p-4">
          <div className="flex items-center justify-between text-xs text-[var(--ab-text-secondary)]">
            <span>Expiring / Unsupported</span>
            <Info className="w-4 h-4 text-[#FF9F0A]" />
          </div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#FF9F0A]">
            {loading ? '—' : summary.expiringCount + summary.unsupportedCount}
          </div>
          <div className="mt-1 text-[11px] text-[var(--ab-text-muted)]">
            {summary.expiringCount} expiring · {summary.unsupportedCount} unavailable APIs
          </div>
        </div>
      </div>

      {/* Live Gateway API Key Rate Limits */}
      <section className="rounded-2xl glass-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ab-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#0A84FF]" />
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">
              Live Gateway API Key Rate Limits (60s Sliding Window)
            </h2>
          </div>
          <span className="text-[11px] font-mono text-[var(--ab-text-muted)]">
            Enforced via X-RateLimit-* headers
          </span>
        </div>

        {!limitsData || limitsData.gatewayKeys.length === 0 ? (
          <div className="p-6 text-xs text-[var(--ab-text-muted)]">
            No Master API keys created yet. Generate an API key in &ldquo;API Keys&rdquo; to inspect real-time per-minute gateway quota utilization here.
          </div>
        ) : (
          <div className="divide-y divide-[var(--ab-border)]">
            {limitsData.gatewayKeys.map((gk) => {
              const metrics = computeQuotaMetrics(gk.limitPerMinute, gk.usedInWindow);
              return (
                <div
                  key={gk.id}
                  className="grid gap-3 px-5 py-3.5 sm:grid-cols-12 sm:items-center text-xs"
                >
                  <div className="sm:col-span-4 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[var(--ab-text-primary)] truncate">{gk.name}</span>
                      <StatusBadge status={gk.status} />
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[var(--ab-text-muted)]">
                      {gk.keyPrefix}•••• · {gk.environment} · {gk.totalRequests} total req
                    </div>
                  </div>

                  <div className="sm:col-span-5 space-y-1.5">
                    <div className="flex items-center justify-between font-mono text-[11px] tabular-nums">
                      <span className="text-[var(--ab-text-secondary)]">
                        {gk.usedInWindow} / {gk.limitPerMinute} req/min used
                      </span>
                      <span className="text-[#30D158]">{gk.remainingInWindow} left</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          metrics.isExhausted
                            ? 'bg-[#FF453A]'
                            : metrics.isNearLimit
                            ? 'bg-[#FF9F0A]'
                            : 'bg-[#0A84FF]'
                        }`}
                        style={{ width: `${metrics.percentUsed ?? 0}%` }}
                      />
                    </div>
                  </div>

                  <div className="sm:col-span-3 sm:text-right font-mono text-[11px] text-[var(--ab-text-muted)] tabular-nums">
                    <div>{gk.expiresAt ? formatCountdown(gk.expiresAt) : 'No key expiry'}</div>
                    <div>Reset: {new Date(gk.resetAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* All Providers AI Limit Coverage */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">
            Provider &amp; AI Tool Coverage
          </h2>
          <span className="text-xs text-[var(--ab-text-muted)]">
            Zero fabricated live balances — real APIs + transparent login-tier manual tracking
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {(limitsData?.providerCapabilities ?? []).map((cap) => (
            <div
              key={cap.id}
              className="rounded-2xl glass-surface p-4 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <ProviderIcon provider={cap.id} size={16} />
                    <span className="text-xs font-semibold text-[var(--ab-text-primary)] truncate">
                      {cap.name}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  {supportBadge(cap.autoSyncSupport)}
                  <span className="text-[11px] font-mono text-[var(--ab-text-muted)] tabular-nums">
                    {cap.connectedAccounts} {cap.autoSyncSupport === 'manual_only' ? 'pools' : 'acct'}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--ab-text-secondary)] leading-relaxed">
                  {cap.summary}
                </p>
              </div>

              <button
                type="button"
                onClick={() => openModalForProvider(cap.id)}
                className="w-full rounded-xl glass-subtle px-3 py-1.5 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] transition-colors"
              >
                Track {formatProviderName(cap.id)}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Tabs + Records Table */}
      <div className="space-y-3">
        <div className="inline-flex flex-wrap items-center gap-1 rounded-2xl glass-surface p-1">
          {(
            [
              { id: 'all', label: 'All Records' },
              { id: 'ai_limit', label: 'AI Credits Pool' },
              { id: 'kiro', label: 'Kiro AI' },
              { id: 'login_tools', label: 'Login Tools' },
              { id: 'google', label: 'Google' },
              { id: 'github', label: 'GitHub' },
              { id: 'aws', label: 'AWS & Builder ID' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                tab === t.id
                  ? 'bg-[#0A84FF] text-white'
                  : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="rounded-2xl glass-surface overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-xs text-[var(--ab-text-muted)]">Loading limits...</div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <h3 className="text-sm font-semibold text-[var(--ab-text-primary)]">
                No limit or entitlement records for this filter
              </h3>
              <p className="mt-1 text-xs text-[var(--ab-text-secondary)] max-w-md mx-auto">
                Click &ldquo;Track AI Limit&rdquo; to record your real balances, or sync connected Google / GitHub / AWS accounts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[var(--ab-border)] bg-black/15 dark:bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                    <th className="py-3 px-2.5">Provider</th>
                    <th className="py-3 px-2.5">Account</th>
                    <th className="py-3 px-2.5">Limit / Entitlement</th>
                    <th className="py-3 px-2.5">Usage</th>
                    <th className="py-3 px-2.5">Reset</th>
                    <th className="py-3 px-2.5">Status</th>
                    <th className="py-3 px-2.5">Source</th>
                    <th className="py-3 px-2.5">Checked</th>
                    <th className="py-3 px-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ab-border)] text-xs">
                  {filtered.map((row) => {
                    const metrics = computeQuotaMetrics(row.limitValue, row.usedValue);
                    const canConsume =
                      row.source === 'Manual Entry' &&
                      row.limitValue !== null &&
                      row.limitValue !== undefined &&
                      row.limitValue > 0 &&
                      (metrics.remaining ?? 0) > 0;
                    return (
                      <tr key={row.id} className="hover:bg-white/[0.03]">
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <ProviderIcon provider={row.provider} size={14} />
                            <span className="font-medium">{formatProviderName(row.provider)}</span>
                          </div>
                        </td>
                        <td className="py-3 px-2.5 font-mono text-[11px] text-[var(--ab-text-secondary)] max-w-[160px] truncate" title={row.accountLabel}>
                          {row.accountLabel}
                        </td>
                        <td className="py-3 px-2.5 max-w-[220px]">
                          <div className="font-medium text-[var(--ab-text-primary)] truncate" title={row.entitlementType}>
                            {row.entitlementType}
                          </div>
                          {row.notes && (
                            <div className="text-[11px] text-[var(--ab-text-muted)] truncate" title={row.notes}>
                              {row.notes}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 min-w-[155px]">
                          {metrics.limit !== null ? (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 font-mono text-[11px] tabular-nums">
                                <span className="text-[var(--ab-text-primary)] whitespace-nowrap">
                                  {metrics.used ?? 0} / {metrics.limit} {row.unit || row.currency || ''}
                                </span>
                                <span className="text-[#30D158] whitespace-nowrap">{metrics.remaining} left</span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-black/20 dark:bg-white/10 overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    metrics.isExhausted
                                      ? 'bg-[#FF453A]'
                                      : metrics.isNearLimit
                                      ? 'bg-[#FF9F0A]'
                                      : 'bg-[#0A84FF]'
                                  }`}
                                  style={{ width: `${metrics.percentUsed ?? 0}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="font-mono tabular-nums text-[var(--ab-text-primary)]">
                              {row.availableAmount || '—'}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-2.5 tabular-nums text-[var(--ab-text-secondary)] whitespace-nowrap">
                          <div className="capitalize text-[11px]">{row.resetPeriod || 'none'}</div>
                          {row.expiryDate && (
                            <div className="text-[11px] font-mono text-[var(--ab-text-muted)]">
                              {formatCountdown(row.expiryDate)}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-2.5 whitespace-nowrap">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="py-3 px-2.5 text-[11px] text-[var(--ab-text-secondary)] whitespace-nowrap">
                          {row.source}
                        </td>
                        <td className="py-3 px-2.5 tabular-nums text-[11px] text-[var(--ab-text-secondary)] whitespace-nowrap">
                          {formatRelativeTime(row.lastCheckedAt)}
                        </td>
                        <td className="py-3 px-2.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {canConsume && (
                              <button
                                type="button"
                                onClick={() => handleConsumeOne(row)}
                                disabled={consumingId === row.id}
                                title="Use 1 credit"
                                aria-label={`Use 1 credit from ${row.entitlementType}`}
                                className="inline-flex items-center gap-1 rounded-lg glass-subtle px-2 py-1 text-[11px] font-mono font-medium text-[#0A84FF] hover:bg-[#0A84FF]/15 disabled:opacity-50"
                              >
                                <MinusCircle className="w-3 h-3" />
                                <span>-1</span>
                              </button>
                            )}
                            {row.source === 'Manual Entry' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingItem(row);
                                  setEditUsed(row.usedValue !== null && row.usedValue !== undefined ? String(row.usedValue) : '0');
                                  setEditLimit(row.limitValue !== null && row.limitValue !== undefined ? String(row.limitValue) : '');
                                  setEditNotes(row.notes || '');
                                }}
                                aria-label={`Update usage for ${row.entitlementType}`}
                                title="Update usage"
                                className="rounded-lg p-1 text-[var(--ab-text-muted)] hover:text-[#0A84FF]"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDelete(row.id)}
                              aria-label={`Remove ${row.entitlementType}`}
                              className="rounded-lg p-1 text-[var(--ab-text-muted)] hover:text-[#FF453A]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Track AI Limit / Manual Entry Modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="w-full max-w-xl rounded-2xl glass-elevated p-6 my-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Track AI Limit or Credit Pool</h2>
                <p className="text-xs text-[var(--ab-text-secondary)]">
                  Explicitly tagged as <code className="font-mono">MANUALLY ENTERED</code> with full provenance.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                aria-label="Close modal"
                className="text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1-Click Presets */}
            <div className="mb-4 space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                Quick Login-Tier Templates
              </div>
              <div className="flex flex-wrap gap-1.5">
                {AI_LIMIT_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="rounded-xl glass-subtle px-2.5 py-1 text-[11px] text-[var(--ab-text-secondary)] hover:border-[#0A84FF]/60 hover:text-[var(--ab-text-primary)]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ent-prov" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Provider / Tool
                  </label>
                  <select
                    id="ent-prov"
                    value={mProvider}
                    onChange={(e) => setMProvider(e.target.value as CreditProviderType)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  >
                    <option value="kiro">Kiro AI</option>
                    <option value="google">Google / Gemini</option>
                    <option value="github">GitHub / Copilot</option>
                    <option value="aws_builder_id">AWS Builder ID / Amazon Q</option>
                    <option value="aws">AWS</option>
                    <option value="aws_identity_center">AWS IAM Identity Center</option>
                    <option value="cursor">Cursor</option>
                    <option value="windsurf">Windsurf</option>
                    <option value="openrouter">OpenRouter</option>
                    <option value="groq">Groq</option>
                    <option value="huggingface">Hugging Face</option>
                    <option value="cerebras">Cerebras</option>
                    <option value="mistral">Mistral</option>
                    <option value="cohere">Cohere</option>
                    <option value="nvidia">NVIDIA</option>
                    <option value="freellmapi">FreeLLMAPI</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ent-linked" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Linked Account (optional)
                  </label>
                  <select
                    id="ent-linked"
                    value={mAccountId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setMAccountId(id);
                      const found = accounts.find((a) => a.id === id);
                      if (found) {
                        setMAccountLabel(found.email || found.username || found.displayName);
                      }
                    }}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  >
                    <option value="">None</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.displayName} ({formatProviderName(a.provider)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ent-label" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Account Label / Identifier
                  </label>
                  <input
                    id="ent-label"
                    required
                    value={mAccountLabel}
                    onChange={(e) => setMAccountLabel(e.target.value)}
                    placeholder="you@example.com or Kiro Workspace"
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="ent-cat" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Category
                  </label>
                  <select
                    id="ent-cat"
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value as EntitlementCategory)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  >
                    <option value="ai_limit">AI Quota / Limit</option>
                    <option value="credits">Login / Promotional Credits</option>
                    <option value="rate_limit">API Rate Limit</option>
                    <option value="subscription">Subscription Plan</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="ent-type" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Limit / Entitlement Name
                </label>
                <input
                  id="ent-type"
                  required
                  value={mType}
                  onChange={(e) => setMType(e.target.value)}
                  placeholder="Kiro AI Signup Bonus Credits"
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="ent-limit" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Total Limit
                  </label>
                  <input
                    id="ent-limit"
                    type="number"
                    min="0"
                    step="any"
                    value={mLimitValue}
                    onChange={(e) => setMLimitValue(e.target.value)}
                    placeholder="500"
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="ent-used" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Used So Far
                  </label>
                  <input
                    id="ent-used"
                    type="number"
                    min="0"
                    step="any"
                    value={mUsedValue}
                    onChange={(e) => setMUsedValue(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="ent-unit" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Unit
                  </label>
                  <input
                    id="ent-unit"
                    value={mUnit}
                    onChange={(e) => setMUnit(e.target.value)}
                    placeholder="credits / req / USD"
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="ent-reset" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Reset Cycle
                  </label>
                  <select
                    id="ent-reset"
                    value={mResetPeriod}
                    onChange={(e) => setMResetPeriod(e.target.value as NonNullable<EntitlementRecord['resetPeriod']>)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  >
                    <option value="minute">Per Minute</option>
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="monthly">Monthly</option>
                    <option value="one-time">One-Time Grant</option>
                    <option value="none">No Reset</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="ent-exp" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Expiry / Reset Date
                  </label>
                  <input
                    id="ent-exp"
                    type="date"
                    value={mExpiry}
                    onChange={(e) => setMExpiry(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="ent-notes" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Provenance Notes
                </label>
                <input
                  id="ent-notes"
                  value={mNotes}
                  onChange={(e) => setMNotes(e.target.value)}
                  placeholder="Verified in provider dashboard..."
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setManualOpen(false)}
                  className="rounded-xl glass-subtle px-4 py-2 text-xs font-medium text-[var(--ab-text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingManual}
                  className="rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] disabled:opacity-50"
                >
                  {savingManual ? 'Saving...' : 'Save Limit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Usage Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl glass-elevated p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold">Update Tracked Usage</h2>
                <p className="text-xs text-[var(--ab-text-secondary)]">{editingItem.entitlementType}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                aria-label="Close update modal"
                className="text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUpdateUsageSubmit} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="edit-used" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Used ({editingItem.unit || 'units'})
                  </label>
                  <input
                    id="edit-used"
                    type="number"
                    min="0"
                    step="any"
                    value={editUsed}
                    onChange={(e) => setEditUsed(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
                <div>
                  <label htmlFor="edit-limit" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Total Limit
                  </label>
                  <input
                    id="edit-limit"
                    type="number"
                    min="0"
                    step="any"
                    value={editLimit}
                    onChange={(e) => setEditLimit(e.target.value)}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="edit-notes" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Notes
                </label>
                <input
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-xl glass-subtle px-4 py-2 text-xs font-medium text-[var(--ab-text-secondary)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] disabled:opacity-50"
                >
                  {savingEdit ? 'Saving...' : 'Update Usage'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
