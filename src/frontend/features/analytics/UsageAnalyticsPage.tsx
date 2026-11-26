import { useEffect, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { formatProviderName } from '../../components/BrandMark';
import { SkeletonRows } from '../../components/UiPrimitives';
import { api } from '../../services/api';
import type { ProviderType, UsageAnalyticsSummary } from '../../../shared/types';

export function UsageAnalyticsPage() {
  const [range, setRange] = useState<'24h' | '7d' | '30d' | 'custom'>('7d');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<UsageAnalyticsSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    api
      .getAnalytics({
        range,
        from: range === 'custom' && fromDate ? fromDate : undefined,
        to: range === 'custom' && toDate ? toDate : undefined,
      })
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [range, fromDate, toDate]);

  const maxBucket = Math.max(1, ...(data?.timeline.map((t) => t.total) ?? [1]));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
            Usage Analytics
          </h1>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Real-time gateway request volume, error rates, and latency telemetry from API logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-1 text-xs">
            {(
              [
                { id: '24h', label: 'Last 24 hours' },
                { id: '7d', label: 'Last 7 days' },
                { id: '30d', label: 'Last 30 days' },
                { id: 'custom', label: 'Custom' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={`rounded-md px-3 py-1.5 font-medium transition-colors whitespace-nowrap ${
                  range === opt.id
                    ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                    : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="flex items-center gap-2 text-xs">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                aria-label="From date"
                className="rounded border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-2.5 py-1.5 font-mono"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                aria-label="To date"
                className="rounded border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-2.5 py-1.5 font-mono"
              />
            </div>
          )}
        </div>
      </div>

      {/* 4 Summary Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-4">
          <div className="text-xs text-[var(--ab-text-secondary)]">Total API Requests</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums">
            {loading ? '—' : data?.totalRequests ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-4">
          <div className="text-xs text-[var(--ab-text-secondary)]">Successful Requests</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#64B58D]">
            {loading ? '—' : data?.successfulRequests ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-4">
          <div className="text-xs text-[var(--ab-text-secondary)]">Failed Requests</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums text-[#D47777]">
            {loading ? '—' : data?.failedRequests ?? 0}
          </div>
        </div>
        <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-4">
          <div className="text-xs text-[var(--ab-text-secondary)]">Average Latency</div>
          <div className="mt-2 text-2xl font-semibold font-mono tabular-nums">
            {loading ? '—' : `${data?.averageLatencyMs ?? 0} ms`}
          </div>
        </div>
      </div>

      {/* Empty State vs Charts */}
      {!loading && (!data || data.totalRequests === 0) ? (
        <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-10 text-center">
          <BarChart3 className="w-8 h-8 text-[var(--ab-text-muted)] mx-auto mb-3" />
          <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">No API traffic recorded in this window</h2>
          <p className="mt-1 text-xs text-[var(--ab-text-secondary)] max-w-md mx-auto">
            Generate a Master API key and execute requests via the API Playground or external client to inspect real request telemetry.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Request Timeline */}
          <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5">
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)] mb-4">Request Volume Timeline</h2>
            {loading ? (
              <SkeletonRows rows={3} />
            ) : (
              <div className="flex items-end justify-start gap-3 h-52 pt-6 overflow-x-auto">
                {data?.timeline.map((t) => {
                  const totalH = Math.max(8, Math.round((t.total / maxBucket) * 140));
                  const failH = t.total > 0 ? Math.round((t.failed / t.total) * totalH) : 0;
                  const okH = totalH - failH;
                  return (
                    <div key={t.bucket} className="w-12 shrink-0 flex flex-col items-center gap-1.5">
                      <span className="text-[10px] font-mono tabular-nums text-[var(--ab-text-secondary)]">
                        {t.total}
                      </span>
                      <div className="w-8 flex flex-col justify-end rounded overflow-hidden">
                        {failH > 0 && <div className="bg-[#D47777]" style={{ height: `${failH}px` }} />}
                        {okH > 0 && <div className="bg-[#769AE8]" style={{ height: `${okH}px` }} />}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--ab-text-muted)] truncate max-w-full">
                        {t.bucket.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* By Provider */}
            <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
              <div className="border-b border-[var(--ab-border)] px-4 py-3 text-sm font-semibold">
                Requests by Provider
              </div>
              <div className="divide-y divide-[var(--ab-border)] text-xs">
                {data?.byProvider.map((p) => (
                  <div key={p.provider} className="flex items-center justify-between px-4 py-2.5">
                    <span className="font-medium">
                      {p.provider === 'gateway'
                        ? 'Gateway'
                        : formatProviderName(p.provider as ProviderType | 'system' | 'kiro')}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--ab-text-secondary)]">
                      {p.count} req ({p.errors} err)
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* By Endpoint */}
            <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
              <div className="border-b border-[var(--ab-border)] px-4 py-3 text-sm font-semibold">
                Requests by Endpoint
              </div>
              <div className="divide-y divide-[var(--ab-border)] text-xs">
                {data?.byEndpoint.map((ep) => (
                  <div key={`${ep.method}-${ep.endpoint}`} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-mono truncate">
                      <span className="text-[#769AE8] mr-1.5">{ep.method}</span>
                      {ep.endpoint}
                    </span>
                    <span className="font-mono tabular-nums text-[var(--ab-text-secondary)] shrink-0">
                      {ep.count} · {ep.avgLatencyMs}ms
                    </span>
                  </div>
                ))}
              </div>
            </section>

            {/* By API Key */}
            <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
              <div className="border-b border-[var(--ab-border)] px-4 py-3 text-sm font-semibold">
                Requests by API Key
              </div>
              <div className="divide-y divide-[var(--ab-border)] text-xs">
                {data?.byApiKey.map((k) => (
                  <div key={k.apiKeyId} className="flex items-center justify-between gap-2 px-4 py-2.5">
                    <span className="font-medium truncate">{k.keyName}</span>
                    <span className="font-mono tabular-nums text-[var(--ab-text-secondary)] shrink-0">
                      {k.count} req
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
