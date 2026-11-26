import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import { formatProviderName } from '../../components/BrandMark';
import {
  ConfirmDialog,
  CopyButton,
  formatRelativeTime,
  SkeletonRows,
  StatusBadge,
} from '../../components/UiPrimitives';
import { CreateApiKeyWizard } from './CreateApiKeyWizard';
import { api, ApiError } from '../../services/api';
import type { ApiKeySummary, ConnectedAccount } from '../../../shared/types';

export function ApiKeysPage({
  accounts,
  pushToast,
}: {
  accounts: ConnectedAccount[];
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [keys, setKeys] = useState<ApiKeySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeySummary | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<{ apiKey: ApiKeySummary; rawKey: string } | null>(null);

  const loadKeys = async () => {
    try {
      const res = await api.getApiKeys();
      setKeys(res.keys);
    } catch {
      // Keep current
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadKeys();
  }, []);

  const handleRotate = async (key: ApiKeySummary) => {
    try {
      const res = await api.rotateApiKey(key.id);
      setRotatedSecret(res);
      await loadKeys();
      pushToast({
        tone: 'success',
        title: `Rotated "${key.name}"`,
        description: 'Previous key has been revoked immediately.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Rotation failed',
        description: err instanceof ApiError ? err.message : 'Unable to rotate key.',
      });
    }
  };

  const confirmRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await api.revokeApiKey(revokeTarget.id);
      setRevokeTarget(null);
      await loadKeys();
      pushToast({
        tone: 'warning',
        title: 'API key revoked',
        description: 'Requests using this key will now fail immediately with 401.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Revocation failed',
        description: err instanceof ApiError ? err.message : 'Could not revoke API key.',
      });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
            API Keys
          </h1>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Create and manage scoped Master API keys for AetherGate and external AI tools (Cursor, Cline, OpenAI SDKs).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setWizardOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] whitespace-nowrap shrink-0 self-start sm:self-auto shadow-[0_6px_18px_rgba(10,132,255,0.28)]"
        >
          <Plus className="w-4 h-4" />
          <span>Generate API Key</span>
        </button>
      </div>

      <div className="rounded-2xl glass-surface overflow-hidden">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : keys.length === 0 ? (
          <div className="p-10 text-center">
            <KeyRound className="w-8 h-8 text-[var(--ab-text-muted)] mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--ab-text-primary)]">No Master API keys yet</h3>
            <p className="mt-1 text-xs text-[var(--ab-text-secondary)] max-w-md mx-auto">
              Generate a scoped Master API key with 256-bit entropy to authenticate requests against the AetherGate Unified API Gateway.
            </p>
            <button
              type="button"
              onClick={() => setWizardOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff]"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Generate First API Key</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--ab-border)] bg-black/15 dark:bg-white/[0.03] text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                  <th className="py-3 px-2.5">Key Name</th>
                  <th className="py-3 px-2.5">Key Prefix</th>
                  <th className="py-3 px-2.5">Permissions</th>
                  <th className="py-3 px-2.5">Providers</th>
                  <th className="py-3 px-2.5">Scope</th>
                  <th className="py-3 px-2.5">Activity</th>
                  <th className="py-3 px-2.5">Expires</th>
                  <th className="py-3 px-2.5">Status</th>
                  <th className="py-3 px-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ab-border)] text-xs">
                {keys.map((k) => (
                  <tr key={k.id} className="hover:bg-white/[0.03]">
                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <div className="font-medium text-[var(--ab-text-primary)]">{k.name}</div>
                      <div className="text-[11px] text-[var(--ab-text-muted)] capitalize">{k.environment}</div>
                    </td>
                    <td className="py-3 px-2.5 font-mono text-[var(--ab-text-secondary)] whitespace-nowrap">
                      {`${k.keyPrefix}••••••`}
                    </td>
                    <td className="py-3 px-2.5">
                      <div className="flex flex-wrap gap-1 max-w-[165px]">
                        {k.permissions.map((p) => (
                          <code
                            key={p}
                            className="rounded-lg border border-[var(--ab-border)] bg-black/15 dark:bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ab-text-secondary)]"
                          >
                            {p}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 text-[var(--ab-text-secondary)] whitespace-nowrap">
                      {k.allowedProviders
                        .map((p) => (p === 'aws' ? 'AWS' : formatProviderName(p)))
                        .join(', ')}
                    </td>
                    <td className="py-3 px-2.5 whitespace-nowrap text-[var(--ab-text-secondary)]">
                      {k.accountScope === 'all' ? 'All permitted' : `${k.allowedAccountIds.length} account(s)`}
                    </td>
                    <td className="py-3 px-2.5 tabular-nums whitespace-nowrap">
                      <div className="text-[var(--ab-text-primary)]">{formatRelativeTime(k.lastUsedAt)}</div>
                      <div className="text-[11px] text-[var(--ab-text-muted)]">
                        {new Date(k.createdAt).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="py-3 px-2.5 tabular-nums text-[var(--ab-text-secondary)] whitespace-nowrap">
                      {k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-3 px-2.5 whitespace-nowrap">
                      <StatusBadge status={k.status} />
                    </td>
                    <td className="py-3 px-2.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        {k.status === 'active' && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRotate(k)}
                              title="Rotate key"
                              aria-label={`Rotate ${k.name}`}
                              className="rounded-lg glass-subtle px-2 py-1 text-[11px] font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] inline-flex items-center gap-1"
                            >
                              <RefreshCw className="w-3 h-3" />
                              <span>Rotate</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setRevokeTarget(k)}
                              title="Revoke key"
                              aria-label={`Revoke ${k.name}`}
                              className="rounded-lg border border-[#FF453A]/35 px-2 py-1 text-[11px] font-medium text-[#FF453A] hover:bg-[#FF453A]/10 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Revoke</span>
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <CreateApiKeyWizard
        open={wizardOpen}
        accounts={accounts}
        onClose={() => setWizardOpen(false)}
        onCreated={() => {
          void loadKeys();
        }}
      />

      {rotatedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl glass-elevated p-6 space-y-4">
            <h3 className="text-base font-semibold">Rotated API Key Ready</h3>
            <div className="rounded-xl border border-[#FF9F0A]/40 bg-[#FF9F0A]/10 p-3 flex items-start gap-2 text-xs text-[#FF9F0A]">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Copy your new Master API key now. The previous key has been immediately revoked.</span>
            </div>
            <div className="rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-3 flex items-center justify-between gap-2">
              <code className="font-mono text-xs text-[#30D158] break-all">{rotatedSecret.rawKey}</code>
              <CopyButton value={rotatedSecret.rawKey} label="Copy" />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setRotatedSecret(null)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#30D158] px-4 py-2 text-xs font-semibold text-[#06080C]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revoke Master API key?"
        description={`Revoking "${revokeTarget?.name || ''}" (${revokeTarget?.maskedKey || ''}) takes effect immediately. All gateway requests using this key will fail with 401 Unauthorized.`}
        confirmLabel="Revoke Key"
        danger
        loading={revoking}
        onConfirm={confirmRevoke}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
