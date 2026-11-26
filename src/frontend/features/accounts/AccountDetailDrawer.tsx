import { useEffect, useState } from 'react';
import { RefreshCw, Shield, Trash2, Unplug, X } from 'lucide-react';
import { formatProviderName, ProviderIcon } from '../../components/BrandMark';
import { formatRelativeTime, StatusBadge } from '../../components/UiPrimitives';
import { computeQuotaMetrics, formatCountdown } from '../../../shared/limitUtils';
import { api } from '../../services/api';
import type { AuditLogEntry, ConnectedAccount, EntitlementRecord } from '../../../shared/types';

export function AccountDetailDrawer({
  account,
  onClose,
  onVerify,
  onReconnect,
  onDisconnect,
  onRemove,
}: {
  account: ConnectedAccount | null;
  onClose: () => void;
  onVerify: (account: ConnectedAccount) => Promise<void>;
  onReconnect: (account: ConnectedAccount) => void;
  onDisconnect: (account: ConnectedAccount) => Promise<void>;
  onRemove: (account: ConnectedAccount) => void;
}) {
  const [events, setEvents] = useState<AuditLogEntry[]>([]);
  const [entitlements, setEntitlements] = useState<EntitlementRecord[]>([]);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!account) return;
    api
      .getAccountDetail(account.id)
      .then((res) => {
        setEvents(res.events);
        setEntitlements(res.entitlements ?? []);
      })
      .catch(() => {
        setEvents([]);
        setEntitlements([]);
      });
  }, [account]);

  if (!account) return null;

  const handleVerify = async () => {
    setVerifying(true);
    try {
      await onVerify(account);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/55" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-lg border-l border-[var(--ab-border)] bg-[var(--ab-bg-primary)] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-6 py-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] shrink-0">
              <ProviderIcon provider={account.provider} size={18} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-[var(--ab-text-primary)] truncate">
                {account.displayName}
              </h2>
              <p className="text-xs text-[var(--ab-text-secondary)] truncate">
                {formatProviderName(account.provider)} · <span className="font-mono">{account.providerAccountId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drawer"
            className="rounded-md p-1.5 text-[var(--ab-text-muted)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Identity Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              Identity
            </h3>
            <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)] text-xs">
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Provider</span>
                <span className="font-medium text-[var(--ab-text-primary)]">{formatProviderName(account.provider)}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Display Name</span>
                <span className="font-medium text-[var(--ab-text-primary)]">{account.displayName}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Email</span>
                <span className="font-mono text-[var(--ab-text-primary)]">{account.email || '—'}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Username</span>
                <span className="font-mono text-[var(--ab-text-primary)]">{account.username || '—'}</span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Account ID</span>
                <span className="font-mono text-[var(--ab-text-primary)]">{account.providerAccountId}</span>
              </div>
            </div>
          </section>

          {/* Authorization Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              Authorization
            </h3>
            <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)] text-xs">
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Status</span>
                <StatusBadge status={account.status} />
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Authorized</span>
                <span className="tabular-nums text-[var(--ab-text-primary)]">
                  {new Date(account.authorizedAt).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Last Verified</span>
                <span className="tabular-nums text-[var(--ab-text-primary)]">
                  {formatRelativeTime(account.lastVerifiedAt)}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-[var(--ab-text-secondary)]">Token Expiry</span>
                <span className="tabular-nums font-mono text-[var(--ab-text-primary)]">
                  {account.tokenExpiresAt
                    ? `${formatCountdown(account.tokenExpiresAt)} (${new Date(account.tokenExpiresAt).toLocaleString()})`
                    : 'N/A'}
                </span>
              </div>
              <div className="px-4 py-2.5 space-y-1.5">
                <span className="text-[var(--ab-text-secondary)] block">Granted Scopes</span>
                <div className="flex flex-wrap gap-1.5">
                  {account.grantedScopes.length > 0 ? (
                    account.grantedScopes.map((scope) => (
                      <code
                        key={scope}
                        className="rounded border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-2 py-0.5 font-mono text-[11px] text-[var(--ab-text-secondary)]"
                      >
                        {scope}
                      </code>
                    ))
                  ) : (
                    <span className="text-[var(--ab-text-muted)]">None recorded</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* Security Section */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              Credential Security
            </h3>
            <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[var(--ab-text-secondary)] flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-[#64B58D]" />
                  Storage Encryption
                </span>
                <span className="font-mono text-[var(--ab-text-primary)]">
                  {account.credentialSecurity?.encryptedAtRest ? 'AES-256-GCM' : 'None stored'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[var(--ab-text-secondary)]">Last Refresh</span>
                <span className="tabular-nums text-[var(--ab-text-primary)]">
                  {formatRelativeTime(account.lastRefreshedAt)}
                </span>
              </div>
              {account.lastError && (
                <div className="mt-2 rounded border border-[#D47777]/35 bg-[#D47777]/10 p-2.5 text-[#D47777]">
                  {account.lastError}
                </div>
              )}
              <p className="text-[11px] text-[var(--ab-text-muted)] pt-1">
                Raw access and refresh tokens remain server-side only and are never exposed to the console.
              </p>
            </div>
          </section>

          {/* Account AI Limits & Entitlements */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              AI Limits &amp; Entitlements
            </h3>
            {entitlements.length === 0 ? (
              <p className="text-xs text-[var(--ab-text-muted)]">
                No synced or manually tracked limits linked to this identity yet.
              </p>
            ) : (
              <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)]">
                {entitlements.map((item) => {
                  const metrics = computeQuotaMetrics(item.limitValue, item.usedValue);
                  return (
                    <div key={item.id} className="px-4 py-3 text-xs space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[var(--ab-text-primary)]">{item.entitlementType}</span>
                        <StatusBadge status={item.status} />
                      </div>
                      <div className="flex items-center justify-between text-[11px] font-mono text-[var(--ab-text-secondary)]">
                        <span>{item.availableAmount || '—'}</span>
                        <span>{item.source}</span>
                      </div>
                      {metrics.percentUsed !== null && (
                        <div className="h-1.5 w-full rounded-full bg-[var(--ab-bg-base)] overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              metrics.isExhausted
                                ? 'bg-[#D47777]'
                                : metrics.isNearLimit
                                ? 'bg-[#D4A65C]'
                                : 'bg-[#769AE8]'
                            }`}
                            style={{ width: `${metrics.percentUsed}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Account Events */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
              Recent Account Activity
            </h3>
            {events.length === 0 ? (
              <p className="text-xs text-[var(--ab-text-muted)]">No events logged for this account yet.</p>
            ) : (
              <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)]">
                {events.map((ev) => (
                  <div key={ev.id} className="px-4 py-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-[var(--ab-text-primary)]">{ev.action}</span>
                      <StatusBadge status={ev.result} />
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--ab-text-muted)] tabular-nums">
                      {new Date(ev.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-[var(--ab-border)] px-6 py-4 flex flex-wrap items-center justify-between gap-2 bg-[var(--ab-bg-secondary)]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleVerify}
              disabled={verifying || account.status === 'disconnected'}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#769AE8] px-3 py-1.5 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
              <span>Verify Now</span>
            </button>
            <button
              type="button"
              onClick={() => onReconnect(account)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-3 py-1.5 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
            >
              Reauthenticate
            </button>
          </div>
          <div className="flex items-center gap-2">
            {account.status !== 'disconnected' && (
              <button
                type="button"
                onClick={() => onDisconnect(account)}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ab-border)] px-3 py-1.5 text-xs font-medium text-[#D4A65C] hover:bg-[#D4A65C]/10"
              >
                <Unplug className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(account)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D47777]/40 px-3 py-1.5 text-xs font-medium text-[#D47777] hover:bg-[#D47777]/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
