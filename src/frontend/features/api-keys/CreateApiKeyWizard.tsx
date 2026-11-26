import { useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Download, KeyRound, ShieldAlert, X } from 'lucide-react';
import { CopyButton } from '../../components/UiPrimitives';
import { api, ApiError } from '../../services/api';
import {
  ALL_API_PERMISSIONS,
  type ApiEnvironment,
  type ApiKeySummary,
  type ApiPermission,
  type ConnectedAccount,
  type ProviderType,
} from '../../../shared/types';

export function CreateApiKeyWizard({
  open,
  accounts,
  onClose,
  onCreated,
}: {
  open: boolean;
  accounts: ConnectedAccount[];
  onClose: () => void;
  onCreated: (key: ApiKeySummary) => void;
}) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState<ApiEnvironment>('development');
  const [providers, setProviders] = useState<ProviderType[]>(['google', 'github', 'aws']);
  const [accountScope, setAccountScope] = useState<'all' | 'selected'>('all');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<ApiPermission[]>(['accounts:read', 'entitlements:read']);
  const [expiresInDays, setExpiresInDays] = useState<string>('90');
  const [rateLimit, setRateLimit] = useState<number>(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ apiKey: ApiKeySummary; rawKey: string } | null>(null);

  if (!open) return null;

  const resetAndClose = () => {
    setStep(1);
    setName('');
    setDescription('');
    setEnvironment('development');
    setProviders(['google', 'github', 'aws']);
    setAccountScope('all');
    setSelectedAccountIds([]);
    setPermissions(['accounts:read', 'entitlements:read']);
    setExpiresInDays('90');
    setRateLimit(60);
    setError(null);
    setGenerated(null);
    onClose();
  };

  const toggleProvider = (p: ProviderType) => {
    setProviders((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const togglePermission = (perm: ApiPermission) => {
    setPermissions((prev) => (prev.includes(perm) ? prev.filter((x) => x !== perm) : [...prev, perm]));
  };

  const toggleAccount = (id: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const days = expiresInDays === 'never' ? null : Number(expiresInDays);
      const res = await api.createApiKey({
        name: name.trim(),
        description: description.trim() || undefined,
        environment,
        allowedProviders: providers,
        accountScope,
        allowedAccountIds: accountScope === 'selected' ? selectedAccountIds : [],
        permissions,
        rateLimitPerMinute: rateLimit,
        expiresInDays: days,
      });
      setGenerated(res);
      setStep(7);
      onCreated(res.apiKey);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to generate API key.');
    } finally {
      setSubmitting(false);
    }
  };

  const downloadConfig = () => {
    if (!generated) return;
    const configPayload = {
      name: generated.apiKey.name,
      environment: generated.apiKey.environment,
      keyPrefix: generated.apiKey.keyPrefix,
      apiKey: generated.rawKey,
      baseUrl: `${window.location.origin}/api/v1`,
      allowedProviders: generated.apiKey.allowedProviders,
      permissions: generated.apiKey.permissions,
      createdAt: generated.apiKey.createdAt,
    };
    const blob = new Blob([JSON.stringify(configPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aethergate-key-${generated.apiKey.keyPrefix}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const stepTitles = [
    'Basic Info',
    'Providers',
    'Account Scope',
    'Permissions',
    'Security',
    'Review',
    'Secret Key',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="apikey-wizard-title"
    >
      <div className="w-full max-w-2xl rounded-2xl glass-elevated my-auto overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-6 py-4">
          <div className="flex items-center gap-2.5">
            <KeyRound className="w-4 h-4 text-[#0A84FF]" />
            <h2 id="apikey-wizard-title" className="text-base font-semibold text-[var(--ab-text-primary)]">
              {generated ? 'Your API key is ready.' : 'Generate Master API Key'}
            </h2>
          </div>
          <button
            type="button"
            onClick={resetAndClose}
            aria-label="Close modal"
            className="rounded-md p-1 text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step Bar */}
        <div className="border-b border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-6 py-3">
          <div className="grid grid-cols-7 gap-1.5">
            {stepTitles.map((title, idx) => {
              const sNum = idx + 1;
              return (
                <div key={title} className="space-y-1">
                  <div
                    className={`h-1 rounded-full ${
                      sNum < step
                        ? 'bg-[#64B58D]'
                        : sNum === step
                        ? 'bg-[#769AE8]'
                        : 'bg-[var(--ab-border)]'
                    }`}
                  />
                  <div
                    className={`text-[10px] truncate ${
                      sNum === step ? 'font-semibold text-[var(--ab-text-primary)]' : 'text-[var(--ab-text-muted)]'
                    }`}
                  >
                    {sNum}. {title}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label htmlFor="key-name" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Key name
                </label>
                <input
                  id="key-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="CI/CD Identity Sync"
                  className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="key-desc" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Description (optional)
                </label>
                <input
                  id="key-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Read-only access for internal developer portal"
                  className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                />
              </div>
              <div>
                <span className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                  Environment
                </span>
                <div className="grid grid-cols-2 gap-3">
                  {(['development', 'production'] as const).map((env) => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEnvironment(env)}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        environment === env
                          ? 'border-[#769AE8] bg-[#769AE8]/10'
                          : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                      }`}
                    >
                      <div className="text-xs font-semibold capitalize text-[var(--ab-text-primary)]">{env}</div>
                      <div className="mt-0.5 text-[11px] font-mono text-[var(--ab-text-muted)]">
                        Prefix: {env === 'production' ? 'ab_live_' : 'ab_test_'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--ab-text-secondary)]">
                Select which identity providers this Master API key is authorized to access.
              </p>
              <div className="grid sm:grid-cols-3 gap-3">
                {(
                  [
                    { id: 'google', label: 'Google', desc: 'Google OAuth identities & profiles' },
                    { id: 'github', label: 'GitHub', desc: 'GitHub accounts & repositories' },
                    { id: 'aws', label: 'AWS', desc: 'IAM Roles & Identity Center' },
                  ] as const
                ).map((p) => {
                  const active = providers.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProvider(p.id)}
                      className={`rounded-lg border p-4 text-left transition-colors ${
                        active
                          ? 'border-[#769AE8] bg-[#769AE8]/10'
                          : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                      }`}
                    >
                      <div className="text-sm font-semibold text-[var(--ab-text-primary)]">{p.label}</div>
                      <p className="mt-1 text-xs text-[var(--ab-text-secondary)]">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAccountScope('all')}
                  className={`rounded-lg border p-3.5 text-left ${
                    accountScope === 'all'
                      ? 'border-[#769AE8] bg-[#769AE8]/10'
                      : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                  }`}
                >
                  <div className="text-xs font-semibold">All permitted connected accounts</div>
                  <p className="mt-1 text-[11px] text-[var(--ab-text-secondary)]">
                    Includes current and future accounts matching the selected providers.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setAccountScope('selected')}
                  className={`rounded-lg border p-3.5 text-left ${
                    accountScope === 'selected'
                      ? 'border-[#769AE8] bg-[#769AE8]/10'
                      : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                  }`}
                >
                  <div className="text-xs font-semibold">Selected individual accounts</div>
                  <p className="mt-1 text-[11px] text-[var(--ab-text-secondary)]">
                    Explicitly bind this key to specific account IDs.
                  </p>
                </button>
              </div>

              {accountScope === 'selected' && (
                <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--ab-border)] divide-y divide-[var(--ab-border)]">
                  {accounts.length === 0 ? (
                    <div className="p-4 text-xs text-[var(--ab-text-muted)]">
                      No connected accounts in this workspace yet. Switch to &ldquo;All permitted&rdquo; or connect accounts first.
                    </div>
                  ) : (
                    accounts.map((acc) => (
                      <label
                        key={acc.id}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs cursor-pointer hover:bg-[var(--ab-bg-secondary)]"
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={selectedAccountIds.includes(acc.id)}
                            onChange={() => toggleAccount(acc.id)}
                            className="rounded border-[var(--ab-border)]"
                          />
                          <span className="font-medium text-[var(--ab-text-primary)]">{acc.displayName}</span>
                          <span className="font-mono text-[var(--ab-text-muted)]">
                            ({acc.email || acc.providerAccountId})
                          </span>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--ab-text-muted)]">{acc.provider}</span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--ab-text-secondary)]">
                Grant least-privilege permissions enforced by the Unified API Gateway.
              </p>
              <div className="grid sm:grid-cols-2 gap-2.5">
                {ALL_API_PERMISSIONS.map((perm) => {
                  const checked = permissions.includes(perm);
                  return (
                    <label
                      key={perm}
                      className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs cursor-pointer ${
                        checked
                          ? 'border-[#769AE8] bg-[#769AE8]/10'
                          : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePermission(perm)}
                      />
                      <code className="font-mono text-[var(--ab-text-primary)]">{perm}</code>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="key-exp" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Expiration
                  </label>
                  <select
                    id="key-exp"
                    value={expiresInDays}
                    onChange={(e) => setExpiresInDays(e.target.value)}
                    className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)]"
                  >
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                    <option value="90">90 days (Recommended)</option>
                    <option value="365">1 year</option>
                    <option value="never">No expiration</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="key-rate" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                    Rate Limit (requests / minute)
                  </label>
                  <input
                    id="key-rate"
                    type="number"
                    min={5}
                    max={10000}
                    value={rateLimit}
                    onChange={(e) => setRateLimit(Number(e.target.value))}
                    className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)]"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)] text-xs">
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Name</span>
                  <span className="font-semibold">{name}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Environment</span>
                  <span className="font-mono capitalize">{environment}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Allowed Providers</span>
                  <span className="font-mono">{providers.join(', ')}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Account Scope</span>
                  <span>
                    {accountScope === 'all'
                      ? 'All permitted connected accounts'
                      : `${selectedAccountIds.length} selected account(s)`}
                  </span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Permissions</span>
                  <span className="font-mono text-right">{permissions.join(', ')}</span>
                </div>
                <div className="flex justify-between px-4 py-2.5">
                  <span className="text-[var(--ab-text-secondary)]">Rate Limit &amp; Expiry</span>
                  <span className="font-mono tabular-nums">
                    {rateLimit}/min · {expiresInDays === 'never' ? 'No expiry' : `${expiresInDays}d`}
                  </span>
                </div>
              </div>
              {error && (
                <div className="rounded border border-[#D47777]/35 bg-[#D47777]/10 p-3 text-xs text-[#D47777]">
                  {error}
                </div>
              )}
            </div>
          )}

          {step === 7 && generated && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#D4A65C]/40 bg-[#D4A65C]/10 p-3.5 flex items-start gap-2.5 text-xs text-[#D4A65C]">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                  Copy and securely store this key. It cannot be displayed again once you close this dialog.
                </span>
              </div>

              <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-4 flex items-center justify-between gap-3">
                <code className="font-mono text-xs text-[#64B58D] break-all select-all">
                  {generated.rawKey}
                </code>
                <CopyButton value={generated.rawKey} label="Copy Key" />
              </div>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={downloadConfig}
                  className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3.5 py-2 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Configuration</span>
                </button>
                <button
                  type="button"
                  onClick={resetAndClose}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[#64B58D] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#75c49e]"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Done</span>
                </button>
              </div>
            </div>
          )}

          {step < 7 && (
            <div className="mt-6 pt-4 border-t border-[var(--ab-border)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => (step === 1 ? resetAndClose() : setStep((s) => s - 1))}
                className="inline-flex items-center gap-1.5 text-xs text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{step === 1 ? 'Cancel' : 'Back'}</span>
              </button>

              {step < 6 ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    if (step === 1 && name.trim().length < 2) {
                      setError('Key name must be at least 2 characters.');
                      return;
                    }
                    if (step === 2 && providers.length === 0) {
                      setError('Select at least one provider.');
                      return;
                    }
                    if (step === 4 && permissions.length === 0) {
                      setError('Select at least one permission.');
                      return;
                    }
                    setStep((s) => s + 1);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff]"
                >
                  <span>Next</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] disabled:opacity-50"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Generating...' : 'Generate API Key'}</span>
                </button>
              )}
            </div>
          )}
          {step < 6 && error && (
            <p className="mt-3 text-xs text-[#D47777]">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
