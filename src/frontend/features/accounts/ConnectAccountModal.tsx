import { useEffect, useState, type FormEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ProviderIcon } from '../../components/BrandMark';
import { CopyButton } from '../../components/UiPrimitives';
import { api, ApiError } from '../../services/api';
import { AI_KEY_PROVIDERS, type AiKeyProviderOption, type ProviderConfigStatus, type ProviderType } from '../../../shared/types';

type ConnectStep =
  | 'idle'
  | 'initializing'
  | 'waiting_auth'
  | 'validating'
  | 'retrieving'
  | 'saving'
  | 'connected'
  | 'failed';

export function ConnectAccountModal({
  open,
  initialProvider,
  onClose,
  onConnected,
}: {
  open: boolean;
  initialProvider?: ProviderType;
  onClose: () => void;
  onConnected: (message: string) => void;
}) {
  const [selected, setSelected] = useState<'select' | 'google' | 'github' | 'aws' | 'ai'>('select');
  const [aiProvider, setAiProvider] = useState<AiKeyProviderOption['id']>('huggingface');
  const [aiEmail, setAiEmail] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('http://localhost:3001');
  const [awsMode, setAwsMode] = useState<'iam_role' | 'identity_center' | 'builder_id'>('iam_role');
  const [config, setConfig] = useState<ProviderConfigStatus | null>(null);
  const [step, setStep] = useState<ConnectStep>('idle');
  const [stepError, setStepError] = useState<string | null>(null);

  // AWS IAM Role fields
  const [awsAccountId, setAwsAccountId] = useState('');
  const [roleArn, setRoleArn] = useState('');
  const [externalId, setExternalId] = useState('');
  const [region, setRegion] = useState('us-east-1');
  const [friendlyName, setFriendlyName] = useState('');

  // AWS Identity Center fields
  const [portalUrl, setPortalUrl] = useState('');
  const [ssoAccountId, setSsoAccountId] = useState('');
  const [ssoRoleName, setSsoRoleName] = useState('');
  const [ssoFriendlyName, setSsoFriendlyName] = useState('');

  // AWS Builder ID fields
  const [builderEmail, setBuilderEmail] = useState('');
  const [builderFriendlyName, setBuilderFriendlyName] = useState('');

  useEffect(() => {
    if (!open) return;
    setStep('idle');
    setStepError(null);
    if (initialProvider === 'google' || initialProvider === 'github') {
      setSelected(initialProvider);
    } else if (initialProvider && AI_KEY_PROVIDERS.some((item) => item.id === initialProvider)) {
      setSelected('ai');
      setAiProvider(initialProvider as AiKeyProviderOption['id']);
    } else if (initialProvider && initialProvider.startsWith('aws')) {
      setSelected('aws');
      setAwsMode(
        initialProvider === 'aws_identity_center'
          ? 'identity_center'
          : initialProvider === 'aws_builder_id'
          ? 'builder_id'
          : 'iam_role'
      );
    } else {
      setSelected('select');
    }
    api.getProviderConfig().then(setConfig).catch(() => {});
  }, [open, initialProvider]);

  useEffect(() => {
    if (!open) return;
    const handleMessage = (event: MessageEvent) => {
      if (
        !event.origin.endsWith('.run.app') &&
        !event.origin.includes('localhost') &&
        event.origin !== window.location.origin
      ) {
        return;
      }
      const data = event.data as {
        type?: string;
        ok?: boolean;
        provider?: string;
        accountLabel?: string;
        error?: string;
      };
      if (data?.type !== 'ACCOUNTBRIDGE_OAUTH_RESULT') return;
      if (data.ok) {
        setStep('connected');
        onConnected(`${data.provider} identity (${data.accountLabel || 'authorized'}) connected.`);
      } else {
        setStep('failed');
        setStepError(data.error || 'OAuth authorization did not complete.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [open, onConnected]);

  if (!open) return null;

  const startOAuth = async (provider: 'google' | 'github') => {
    setStep('initializing');
    setStepError(null);
    try {
      const res =
        provider === 'google' ? await api.getGoogleAuthUrl() : await api.getGitHubAuthUrl();
      setStep('waiting_auth');
      const popup = window.open(res.url, 'accountbridge_oauth', 'width=600,height=720');
      if (!popup) {
        setStep('failed');
        setStepError('Popup was blocked by your browser. Allow popups for this site and retry.');
      }
    } catch (err) {
      setStep('failed');
      setStepError(
        err instanceof ApiError
          ? err.message
          : `Failed to initialize ${provider} authorization.`
      );
    }
  };

  const handleAiSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStep('validating');
    setStepError(null);
    const option = AI_KEY_PROVIDERS.find((item) => item.id === aiProvider);
    try {
      const res = await api.connectAiKey({
        provider: aiProvider,
        apiKey: aiKey.trim(),
        email: aiEmail.trim() || undefined,
        baseUrl: option?.needsBaseUrl ? aiBaseUrl.trim() : undefined,
      });
      setStep('connected');
      setAiKey('');
      onConnected(
        res.balanceReported
          ? `${res.account.displayName} connected. Provider reported a live balance.`
          : `${res.account.displayName} connected. ${res.note}`
      );
    } catch (err) {
      setStep('failed');
      setStepError(err instanceof ApiError ? err.message : 'Could not verify this API key.');
    }
  };

  const handleAwsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStep('validating');
    setStepError(null);
    try {
      if (awsMode === 'iam_role') {
        const res = await api.connectAwsIamRole({
          accountId: awsAccountId,
          roleArn,
          externalId: externalId || undefined,
          region,
          friendlyName,
        });
        setStep('connected');
        onConnected(`AWS IAM Role "${res.account.displayName}" verified and connected.`);
      } else if (awsMode === 'builder_id') {
        const res = await api.connectAwsBuilderId({
          email: builderEmail,
          friendlyName: builderFriendlyName || undefined,
          region,
        });
        setStep('connected');
        onConnected(`AWS Builder ID "${res.account.displayName}" registered.`);
      } else {
        const res = await api.connectAwsIdentityCenter({
          accessPortalUrl: portalUrl,
          region,
          accountId: ssoAccountId,
          roleName: ssoRoleName,
          friendlyName: ssoFriendlyName || undefined,
        });
        setStep('connected');
        onConnected(`AWS IAM Identity Center profile "${res.account.displayName}" registered.`);
      }
    } catch (err) {
      setStep('failed');
      setStepError(err instanceof ApiError ? err.message : 'AWS connection validation failed.');
    }
  };

  const stepLabels: Array<{ id: ConnectStep; label: string }> = [
    { id: 'initializing', label: 'Initializing' },
    { id: 'waiting_auth', label: 'Waiting for Authorization' },
    { id: 'validating', label: 'Validating Identity' },
    { id: 'retrieving', label: 'Retrieving Account Information' },
    { id: 'saving', label: 'Saving Securely' },
    { id: 'connected', label: 'Connected' },
  ];

  const activeIndex = stepLabels.findIndex((s) => s.id === step);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="connect-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] shadow-2xl my-auto">
        <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-6 py-4">
          <div className="flex items-center gap-3">
            {selected !== 'select' && (
              <button
                type="button"
                onClick={() => {
                  setSelected('select');
                  setStep('idle');
                  setStepError(null);
                }}
                aria-label="Back to providers"
                className="rounded-md p-1 text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)]"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 id="connect-modal-title" className="text-base font-semibold text-[var(--ab-text-primary)]">
                {selected === 'select' && 'Connect Provider Account'}
                {selected === 'google' && 'Connect Google Identity'}
                {selected === 'github' && 'Connect GitHub Account'}
                {selected === 'aws' && 'Connect AWS Account'}
                {selected === 'ai' && 'Connect a free AI key'}
              </h2>
              <p className="text-xs text-[var(--ab-text-secondary)]">
                Authorize an external identity to manage and expose through your gateway.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-md p-1.5 text-[var(--ab-text-muted)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6">
          {selected === 'select' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col justify-between rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <ProviderIcon provider="google" size={22} />
                    <span className="text-[11px] font-mono text-[var(--ab-text-muted)]">OAuth 2.0</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--ab-text-primary)]">Google</h3>
                  <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Connect multiple Google accounts separately via OpenID Connect and PKCE.
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--ab-text-muted)]">
                    Scopes: openid, email, profile
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected('google')}
                  className="mt-4 w-full rounded-md bg-[#769AE8] px-3 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] transition-colors"
                >
                  Connect Google
                </button>
              </div>

              <div className="flex flex-col justify-between rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <ProviderIcon provider="github" size={22} />
                    <span className="text-[11px] font-mono text-[var(--ab-text-muted)]">OAuth App</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--ab-text-primary)]">GitHub</h3>
                  <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Authorize distinct GitHub personal or work accounts and inspect plan metadata.
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--ab-text-muted)]">
                    Scopes: read:user, user:email
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected('github')}
                  className="mt-4 w-full rounded-md bg-[#769AE8] px-3 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] transition-colors"
                >
                  Connect GitHub
                </button>
              </div>

              <div className="flex flex-col justify-between rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
                <div>
                  <div className="flex items-center justify-between">
                    <ProviderIcon provider="aws" size={22} />
                    <span className="text-[11px] font-mono text-[var(--ab-text-muted)]">STS / SSO / ID</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--ab-text-primary)]">AWS &amp; Builder ID</h3>
                  <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Verify IAM Role AssumeRole trust, IAM Identity Center portals, or AWS Builder IDs.
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--ab-text-muted)]">
                    APIs: sts:AssumeRole, IAM, Builder ID
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected('aws')}
                  className="mt-4 w-full rounded-md bg-[#769AE8] px-3 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] transition-colors"
                >
                  Connect AWS
                </button>
              </div>

              <div className="flex flex-col justify-between rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4 sm:col-span-2">
                <div>
                  <div className="flex items-center justify-between">
                    <ProviderIcon provider="huggingface" size={22} />
                    <span className="text-[11px] font-mono text-[var(--ab-text-muted)]">Your API key</span>
                  </div>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--ab-text-primary)]">Free AI keys</h3>
                  <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Add each Hugging Face, OpenRouter, Groq, Cerebras, Mistral, Cohere, NVIDIA, or local FreeLLMAPI key. Use a different email for every account. AetherGate checks the key and only stores a balance when the provider actually returns one.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected('ai')}
                  className="mt-4 w-full rounded-md bg-[#769AE8] px-3 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] transition-colors"
                >
                  Add AI key
                </button>
              </div>
            </div>
          )}

          {selected === 'ai' && (
            <form onSubmit={handleAiSubmit} className="space-y-4">
              <p className="text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                FreeLLMAPI does not hand out 10 billion tokens. It routes the provider keys you already have. Paste each key here, or point this form at a FreeLLMAPI server you are running.
              </p>
              <div>
                <label htmlFor="ai-provider" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                  Provider
                </label>
                <select
                  id="ai-provider"
                  value={aiProvider}
                  onChange={(e) => {
                    const next = e.target.value as AiKeyProviderOption['id'];
                    setAiProvider(next);
                    const option = AI_KEY_PROVIDERS.find((item) => item.id === next);
                    if (option?.defaultBaseUrl) setAiBaseUrl(option.defaultBaseUrl);
                  }}
                  className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm"
                >
                  {AI_KEY_PROVIDERS.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ai-email" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                  Account email
                </label>
                <input
                  id="ai-email"
                  type="email"
                  value={aiEmail}
                  onChange={(e) => setAiEmail(e.target.value)}
                  placeholder="the email this key belongs to"
                  className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="ai-key" className="block text-xs font-medium text-[var(--ab-text-secondary)]">
                    API key
                  </label>
                  <a
                    href={AI_KEY_PROVIDERS.find((item) => item.id === aiProvider)?.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-[#769AE8] hover:underline"
                  >
                    Get a key
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <input
                  id="ai-key"
                  type="password"
                  autoComplete="off"
                  value={aiKey}
                  onChange={(e) => setAiKey(e.target.value)}
                  placeholder={AI_KEY_PROVIDERS.find((item) => item.id === aiProvider)?.placeholder}
                  className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm"
                />
              </div>
              {AI_KEY_PROVIDERS.find((item) => item.id === aiProvider)?.needsBaseUrl && (
                <div>
                  <label htmlFor="ai-base" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                    FreeLLMAPI base URL
                  </label>
                  <input
                    id="ai-base"
                    type="url"
                    value={aiBaseUrl}
                    onChange={(e) => setAiBaseUrl(e.target.value)}
                    placeholder="http://localhost:3001"
                    className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-sm"
                  />
                </div>
              )}
              {stepError && (
                <div className="rounded-md border border-[#D47777]/35 bg-[#D47777]/10 p-3 text-xs text-[#D47777]">
                  {stepError}
                </div>
              )}
              {step === 'connected' && (
                <div className="rounded-md border border-[#64B58D]/35 bg-[#64B58D]/10 p-3 text-xs text-[#64B58D]">
                  Key verified. Add another email with a new key, or close this window.
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--ab-text-secondary)]"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={step === 'validating' || aiKey.trim().length < 8}
                  className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] disabled:opacity-60"
                >
                  {step === 'validating' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{step === 'validating' ? 'Checking key...' : 'Verify and save'}</span>
                </button>
              </div>
            </form>
          )}

          {(selected === 'google' || selected === 'github') && (
            <div className="space-y-5">
              <div className="flex items-start gap-3.5 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
                <ProviderIcon provider={selected} size={24} />
                <div className="flex-1">
                  <h3 className="text-sm font-semibold">
                    {selected === 'google' ? 'Google OAuth 2.0 Authorization' : 'GitHub OAuth Authorization'}
                  </h3>
                  <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Opens the official {selected === 'google' ? 'Google' : 'GitHub'} sign-in window so you can authorize another identity. Matching emails across providers remain completely separate accounts.
                  </p>
                </div>
              </div>

              {config && !(selected === 'google' ? config.google.configured : config.github.configured) && (
                <div className="rounded-lg border border-[#D4A65C]/35 bg-[#D4A65C]/10 p-4 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#D4A65C]">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>
                      {selected === 'google'
                        ? 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured yet'
                        : 'GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET are not configured yet'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Configure these environment secrets in your deployment settings and register this exact OAuth Callback URI:
                  </p>
                  <div className="flex items-center justify-between gap-2 rounded bg-[var(--ab-bg-base)] border border-[var(--ab-border)] px-3 py-2">
                    <code className="text-[11px] font-mono text-[var(--ab-text-primary)] truncate">
                      {(selected === 'google'
                        ? config.google.callbackUrls[0]
                        : config.github.callbackUrls[0]) || ''}
                    </code>
                    <CopyButton
                      value={
                        (selected === 'google'
                          ? config.google.callbackUrls[0]
                          : config.github.callbackUrls[0]) || ''
                      }
                      label="Copy URI"
                    />
                  </div>
                </div>
              )}

              {step !== 'idle' && (
                <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-4 space-y-3">
                  <div className="flex items-center justify-between text-xs font-medium text-[var(--ab-text-secondary)]">
                    <span>Authorization Progress</span>
                    <span className="font-mono">{step.replace('_', ' ')}</span>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {stepLabels.map((s, idx) => {
                      const isCurrent = s.id === step;
                      const isDone = step === 'connected' || (activeIndex > idx && step !== 'failed');
                      return (
                        <div key={s.id} className="space-y-1">
                          <div
                            className={`h-1 rounded-full ${
                              step === 'failed' && isCurrent
                                ? 'bg-[#D47777]'
                                : isDone
                                ? 'bg-[#64B58D]'
                                : isCurrent
                                ? 'bg-[#769AE8]'
                                : 'bg-[var(--ab-border)]'
                            }`}
                          />
                          <p className="text-[10px] text-[var(--ab-text-muted)] leading-tight">{s.label}</p>
                        </div>
                      );
                    })}
                  </div>
                  {stepError && (
                    <div className="rounded-md border border-[#D47777]/35 bg-[#D47777]/10 p-3 text-xs text-[#D47777]">
                      {stepError}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
                >
                  {step === 'connected' ? 'Done' : 'Cancel'}
                </button>
                {step !== 'connected' && (
                  <button
                    type="button"
                    onClick={() => startOAuth(selected)}
                    disabled={step === 'initializing' || step === 'waiting_auth'}
                    className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-60"
                  >
                    {step === 'initializing' || step === 'waiting_auth' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : step === 'failed' ? (
                      <RefreshCw className="w-3.5 h-3.5" />
                    ) : (
                      <ExternalLink className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {step === 'failed'
                        ? 'Retry Authorization'
                        : `Authorize ${selected === 'google' ? 'Google' : 'GitHub'} Account`}
                    </span>
                  </button>
                )}
              </div>
            </div>
          )}

          {selected === 'aws' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-1 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAwsMode('iam_role');
                    setStep('idle');
                    setStepError(null);
                  }}
                  className={`rounded-md py-1.5 px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    awsMode === 'iam_role'
                      ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                      : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                  }`}
                >
                  IAM Role (STS)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAwsMode('identity_center');
                    setStep('idle');
                    setStepError(null);
                  }}
                  className={`rounded-md py-1.5 px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    awsMode === 'identity_center'
                      ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                      : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                  }`}
                >
                  Identity Center
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAwsMode('builder_id');
                    setStep('idle');
                    setStepError(null);
                  }}
                  className={`rounded-md py-1.5 px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    awsMode === 'builder_id'
                      ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                      : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                  }`}
                >
                  AWS Builder ID
                </button>
              </div>

              {awsMode === 'iam_role' && config && !config.aws.serverCredentialsConfigured && (
                <div className="rounded-lg border border-[#D4A65C]/35 bg-[#D4A65C]/10 p-3 text-xs text-[#D4A65C] flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Server-side <code className="font-mono">AWS_ACCESS_KEY_ID</code> and{' '}
                    <code className="font-mono">AWS_SECRET_ACCESS_KEY</code> must be configured to execute live{' '}
                    <code className="font-mono">sts:AssumeRole</code> verification.
                  </span>
                </div>
              )}

              <form onSubmit={handleAwsSubmit} className="space-y-3.5">
                {awsMode === 'iam_role' ? (
                  <>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="aws-acc-id" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          AWS Account ID (12 digits)
                        </label>
                        <input
                          id="aws-acc-id"
                          required
                          value={awsAccountId}
                          onChange={(e) => setAwsAccountId(e.target.value)}
                          placeholder="123456789012"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="aws-region" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          AWS Region
                        </label>
                        <input
                          id="aws-region"
                          required
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="aws-role-arn" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                        IAM Role ARN
                      </label>
                      <input
                        id="aws-role-arn"
                        required
                        value={roleArn}
                        onChange={(e) => setRoleArn(e.target.value)}
                        placeholder="arn:aws:iam::123456789012:role/AccountBridgeReadOnly"
                        className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="aws-ext-id" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          External ID (recommended)
                        </label>
                        <input
                          id="aws-ext-id"
                          value={externalId}
                          onChange={(e) => setExternalId(e.target.value)}
                          placeholder="ab-ext-9f81c2"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="aws-friendly" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Friendly Connection Name
                        </label>
                        <input
                          id="aws-friendly"
                          required
                          value={friendlyName}
                          onChange={(e) => setFriendlyName(e.target.value)}
                          placeholder="AWS Production Core"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                ) : awsMode === 'builder_id' ? (
                  <>
                    <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-3 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                      Register your personal AWS Builder ID separately from IAM or Google accounts to track Amazon Q Developer and Kiro AI limits per Builder ID.
                    </div>
                    <div>
                      <label htmlFor="bid-email" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                        AWS Builder ID Email
                      </label>
                      <input
                        id="bid-email"
                        type="email"
                        required
                        value={builderEmail}
                        onChange={(e) => setBuilderEmail(e.target.value)}
                        placeholder="dev@company.com"
                        className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="bid-friendly" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Friendly Label (optional)
                        </label>
                        <input
                          id="bid-friendly"
                          value={builderFriendlyName}
                          onChange={(e) => setBuilderFriendlyName(e.target.value)}
                          placeholder="Builder ID Primary (Kiro)"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="bid-region" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Primary Region
                        </label>
                        <input
                          id="bid-region"
                          required
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label htmlFor="sso-portal" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                        Access Portal URL
                      </label>
                      <input
                        id="sso-portal"
                        required
                        value={portalUrl}
                        onChange={(e) => setPortalUrl(e.target.value)}
                        placeholder="https://d-9067abcdef.awsapps.com/start"
                        className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sso-region" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          SSO Region
                        </label>
                        <input
                          id="sso-region"
                          required
                          value={region}
                          onChange={(e) => setRegion(e.target.value)}
                          placeholder="us-east-1"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="sso-acc" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Target AWS Account ID
                        </label>
                        <input
                          id="sso-acc"
                          required
                          value={ssoAccountId}
                          onChange={(e) => setSsoAccountId(e.target.value)}
                          placeholder="123456789012"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="sso-role" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Permission Set / Role Name
                        </label>
                        <input
                          id="sso-role"
                          required
                          value={ssoRoleName}
                          onChange={(e) => setSsoRoleName(e.target.value)}
                          placeholder="ReadOnlyAccess"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="sso-friendly" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                          Friendly Name (optional)
                        </label>
                        <input
                          id="sso-friendly"
                          value={ssoFriendlyName}
                          onChange={(e) => setSsoFriendlyName(e.target.value)}
                          placeholder="Identity Center Staging"
                          className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
                        />
                      </div>
                    </div>
                  </>
                )}

                {stepError && (
                  <div className="rounded-md border border-[#D47777]/35 bg-[#D47777]/10 p-3 text-xs text-[#D47777]">
                    {stepError}
                  </div>
                )}

                {step === 'connected' && (
                  <div className="rounded-md border border-[#64B58D]/35 bg-[#64B58D]/10 p-3 text-xs text-[#64B58D] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>AWS connection saved cleanly.</span>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--ab-text-muted)]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#64B58D]" />
                    <span>Credentials &amp; External IDs AES-256-GCM protected</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-4 py-2 text-xs font-medium text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={step === 'validating'}
                      className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-60"
                    >
                      {step === 'validating' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>
                        {awsMode === 'iam_role'
                          ? 'Verify & Connect Role'
                          : awsMode === 'builder_id'
                          ? 'Register Builder ID'
                          : 'Register Identity Center'}
                      </span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
