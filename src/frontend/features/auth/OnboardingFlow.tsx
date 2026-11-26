import { useState } from 'react';
import { ArrowRight, Check, KeyRound, Layers, Lock, Shield, SkipForward } from 'lucide-react';
import { AetherGateLogo, formatProviderName, ProviderIcon } from '../../components/BrandMark';
import { api, ApiError } from '../../services/api';
import type { ProviderType, UserProfile, Workspace } from '../../../shared/types';

export function OnboardingFlow({
  user,
  workspace,
  onComplete,
  onOpenConnectModal,
}: {
  user: UserProfile;
  workspace: Workspace;
  onComplete: (updated: { user: UserProfile; workspace: Workspace }) => void;
  onOpenConnectModal: (provider?: ProviderType) => void;
}) {
  const [step, setStep] = useState<number>(Math.max(1, Math.min(5, user.onboardingStep || 1)));
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistStep = async (nextStep: number, completed = false) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.updateOnboarding({
        step: nextStep,
        completed,
        workspaceName: workspaceName.trim() || workspace.name,
      });
      if (completed) {
        onComplete(res);
      } else {
        setStep(nextStep);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save onboarding progress.');
    } finally {
      setSaving(false);
    }
  };

  const steps = ['Welcome', 'Workspace', 'Connect Provider', 'Security', 'Ready'];

  return (
    <div className="min-h-screen text-[var(--ab-text-primary)] flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2.5">
            <AetherGateLogo size={28} />
            <span className="text-base font-semibold">AetherGate Setup</span>
          </div>
          <button
            type="button"
            onClick={() => persistStep(5, true)}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
          >
            <SkipForward className="w-3.5 h-3.5" />
            <span>Skip setup</span>
          </button>
        </div>

        {/* Progress indicator */}
        <div className="grid grid-cols-5 gap-2 mb-6">
          {steps.map((label, idx) => {
            const num = idx + 1;
            const active = num === step;
            const done = num < step;
            return (
              <div key={label} className="space-y-1.5">
                <div
                  className={`h-1 rounded-full transition-colors ${
                    done ? 'bg-[#30D158]' : active ? 'bg-[#0A84FF]' : 'bg-[var(--ab-border)]'
                  }`}
                />
                <div
                  className={`text-[11px] font-medium truncate ${
                    active ? 'text-[var(--ab-text-primary)]' : done ? 'text-[#30D158]' : 'text-[var(--ab-text-muted)]'
                  }`}
                >
                  {num}. {label}
                </div>
              </div>
            );
          })}
        </div>

        <div className="glass-surface rounded-2xl p-7">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold text-[var(--ab-text-primary)]">
                  Welcome to AetherGate, {user.fullName.split(' ')[0]}
                </h1>
                <p className="mt-2 text-sm text-[var(--ab-text-secondary)] leading-relaxed">
                  One Liquid Glass hub. Pooled login AI credits across Kiro, Gemini, Copilot &amp; more. One external-tool API gateway.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div className="glass-subtle rounded-xl p-4">
                  <Layers className="w-4 h-4 text-[#0A84FF] mb-2" />
                  <h2 className="text-sm font-medium">Multi-Identity + Pool</h2>
                  <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Track Google, GitHub, AWS, Kiro, Cursor, Windsurf, OpenRouter &amp; Groq login credits together.
                  </p>
                </div>
                <div className="glass-subtle rounded-xl p-4">
                  <Shield className="w-4 h-4 text-[#30D158] mb-2" />
                  <h2 className="text-sm font-medium">Encrypted Vault</h2>
                  <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Provider OAuth tokens and AWS external IDs are encrypted with AES-256-GCM on the server.
                  </p>
                </div>
                <div className="glass-subtle rounded-xl p-4">
                  <KeyRound className="w-4 h-4 text-[#FF9F0A] mb-2" />
                  <h2 className="text-sm font-medium">Universal Gateway</h2>
                  <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    Use one Master API key in Cursor, Cline, Continue, or your own scripts via OpenAI-compatible REST.
                  </p>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => persistStep(2)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0071e3]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Name your workspace</h1>
                <p className="mt-1.5 text-sm text-[#9AA5B2]">
                  Workspaces isolate your connected provider identities, API keys, and audit trails.
                </p>
              </div>
              <div>
                <label htmlFor="onb-ws" className="block text-xs font-medium text-[#9AA5B2] mb-1.5">
                  Workspace name
                </label>
                <input
                  id="onb-ws"
                  type="text"
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="w-full rounded-md border border-[#252D37] bg-[#0B0D10] px-3 py-2 text-sm text-[#F1F4F8] focus:border-[#769AE8] focus:outline-none"
                />
              </div>
              {error && <p className="text-xs text-[#D47777]">{error}</p>}
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm text-[#9AA5B2] hover:text-[#F1F4F8]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => persistStep(3)}
                  disabled={saving || workspaceName.trim().length < 2}
                  className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-sm font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-50"
                >
                  <span>Save &amp; Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Connect your first provider</h1>
                <p className="mt-1.5 text-sm text-[#9AA5B2]">
                  Authorize a Google, GitHub, or AWS account now, or skip and connect providers later from the dashboard.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-3">
                {(['google', 'github', 'aws'] as const).map((provider) => (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => onOpenConnectModal(provider)}
                    className="flex flex-col items-start rounded-lg border border-[#252D37] bg-[#151A20] p-4 text-left hover:border-[#769AE8]/60 hover:bg-[#1A2027] transition-colors"
                  >
                    <ProviderIcon provider={provider} size={22} />
                    <span className="mt-3 text-sm font-semibold">{formatProviderName(provider)}</span>
                    <span className="mt-1 text-xs text-[#9AA5B2]">
                      {provider === 'google' && 'OAuth 2.0 + PKCE'}
                      {provider === 'github' && 'OAuth App Flow'}
                      {provider === 'aws' && 'STS Role / SSO'}
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="text-sm text-[#9AA5B2] hover:text-[#F1F4F8]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => persistStep(4)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-sm font-semibold text-[#0B0D10] hover:bg-[#8aaaf0]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-xl font-semibold">Security architecture</h1>
                <p className="mt-1.5 text-sm text-[#9AA5B2]">
                  Review how AccountBridge protects connected identities and API gateway access.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border border-[#252D37] bg-[#151A20] p-3.5">
                  <Lock className="w-4 h-4 text-[#64B58D] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">AES-256-GCM Credential Encryption</p>
                    <p className="text-xs text-[#9AA5B2] mt-0.5">
                      OAuth access tokens, refresh tokens, and AWS External IDs are encrypted on the server and never sent to the browser.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-[#252D37] bg-[#151A20] p-3.5">
                  <KeyRound className="w-4 h-4 text-[#769AE8] mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">One-Time Hashed Master API Keys</p>
                    <p className="text-xs text-[#9AA5B2] mt-0.5">
                      Keys are generated with 256-bit entropy, displayed once at creation, and stored solely as SHA-256 digests.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="text-sm text-[#9AA5B2] hover:text-[#F1F4F8]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => persistStep(5)}
                  className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-sm font-semibold text-[#0B0D10] hover:bg-[#8aaaf0]"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#64B58D]/15 text-[#64B58D]">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">Workspace ready</h1>
                  <p className="text-sm text-[#9AA5B2]">
                    {workspaceName || workspace.name} is initialized and ready for identity connections.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="text-sm text-[#9AA5B2] hover:text-[#F1F4F8]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => persistStep(5, true)}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-5 py-2.5 text-sm font-semibold text-[#0B0D10] hover:bg-[#8aaaf0]"
                >
                  <span>Open Dashboard</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
