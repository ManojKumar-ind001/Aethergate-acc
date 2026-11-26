import { useState, type FormEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, Lock, Mail, User, ArrowRight, ShieldCheck, X, ExternalLink } from 'lucide-react';
import { AetherGateLogo } from '../../components/BrandMark';
import { api, ApiError, setSessionToken } from '../../services/api';
import type { UserProfile, Workspace } from '../../../shared/types';

type AuthMode = 'login' | 'register' | 'recovery';

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (payload: { user: UserProfile; workspace: Workspace }) => void;
}) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legalDialog, setLegalDialog] = useState<'privacy' | 'terms' | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    if (mode === 'recovery') {
      setLoading(true);
      try {
        const res = await api.requestPasswordReset(trimmedEmail);
        setNotice(res.message);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Unable to process recovery request.');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (mode === 'register' && fullName.trim().length < 2) {
      setError('Enter your full name (at least 2 characters).');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'register') {
        const res = await api.register({ email: trimmedEmail, password, fullName: fullName.trim() });
        setSessionToken(res.token);
        onAuthenticated({ user: res.user, workspace: res.workspace });
      } else {
        const res = await api.login({ email: trimmedEmail, password });
        setSessionToken(res.token);
        onAuthenticated({ user: res.user, workspace: res.workspace });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen text-[var(--ab-text-primary)] flex flex-col justify-between p-6">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-2">
        <div className="flex items-center gap-2.5">
          <AetherGateLogo size={32} />
          <div>
            <span className="text-base font-semibold tracking-tight text-[var(--ab-text-primary)]">
              AetherGate
            </span>
            <span className="ml-2 hidden sm:inline text-xs text-[var(--ab-text-muted)] font-mono">
              AI Credit &amp; Identity Hub
            </span>
          </div>
        </div>
        <div className="text-xs text-[var(--ab-text-secondary)]">
          Kiro · Gemini · Copilot · Unified API
        </div>
      </header>

      <main className="mx-auto my-auto w-full max-w-[432px] py-8">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="glass-surface rounded-2xl p-7"
        >
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
              {mode === 'login' && 'Sign in to AetherGate'}
              {mode === 'register' && 'Create your AetherGate workspace'}
              {mode === 'recovery' && 'Reset your password'}
            </h1>
            <p className="mt-1.5 text-sm text-[var(--ab-text-secondary)] leading-relaxed">
              {mode === 'login' &&
                'Manage your connected identities, unified AI credit pool, and Master API keys.'}
              {mode === 'register' &&
                'Register once to initialize Kiro & login-tier AI credit tracking plus one unified API gateway.'}
              {mode === 'recovery' &&
                'Enter your AetherGate email address to generate a recovery token.'}
            </p>
          </div>

          {mode !== 'recovery' && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[var(--ab-bg-secondary)] p-1 border border-[var(--ab-border)]">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                  mode === 'login'
                    ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)] shadow-sm'
                    : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                  setNotice(null);
                }}
                className={`rounded-lg py-1.5 text-xs font-medium transition-all ${
                  mode === 'register'
                    ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)] shadow-sm'
                    : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
                }`}
              >
                Create account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <AnimatePresence initial={false}>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label htmlFor="auth-fullname" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                    Full name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[var(--ab-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-fullname"
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)]/75 pl-9 pr-3 py-2.5 text-sm text-[var(--ab-text-primary)] placeholder-[var(--ab-text-muted)] focus:border-[#0A84FF] focus:outline-none transition-colors"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div>
              <label htmlFor="auth-email" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-[var(--ab-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)]/75 pl-9 pr-3 py-2.5 text-sm text-[var(--ab-text-primary)] placeholder-[var(--ab-text-muted)] focus:border-[#0A84FF] focus:outline-none transition-colors"
                />
              </div>
            </div>

            {mode !== 'recovery' && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-medium text-[var(--ab-text-secondary)]">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('recovery');
                        setError(null);
                        setNotice(null);
                      }}
                      className="text-xs text-[#0A84FF] hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[var(--ab-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    id="auth-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'register' ? 'Minimum 8 characters' : 'Enter your password'}
                    className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)]/75 pl-9 pr-10 py-2.5 text-sm text-[var(--ab-text-primary)] placeholder-[var(--ab-text-muted)] focus:border-[#0A84FF] focus:outline-none transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)] p-1"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-xl border border-[#FF453A]/35 bg-[#FF453A]/10 px-3.5 py-2.5 text-xs text-[#FF453A]">
                {error}
              </div>
            )}

            {notice && (
              <div role="status" className="rounded-xl border border-[#30D158]/35 bg-[#30D158]/10 px-3.5 py-2.5 text-xs text-[#30D158]">
                {notice}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#0071e3] active:scale-[0.99] disabled:opacity-60 transition-all shadow-sm"
            >
              <span>
                {loading
                  ? 'Authenticating...'
                  : mode === 'login'
                  ? 'Sign in'
                  : mode === 'register'
                  ? 'Create workspace'
                  : 'Send recovery instructions'}
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>

            {mode === 'recovery' && (
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                  setNotice(null);
                }}
                className="w-full text-center text-xs text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)] py-1"
              >
                Back to sign in
              </button>
            )}
          </form>

          <div className="mt-6 pt-4 border-t border-[var(--ab-border)] flex items-start gap-2.5 text-xs text-[var(--ab-text-muted)]">
            <ShieldCheck className="w-4 h-4 text-[#30D158] shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Encrypted AES-256-GCM credential vault · Master API keys work directly in external AI tools.
            </p>
          </div>
        </motion.div>
      </main>

      <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 text-xs text-[var(--ab-text-muted)] py-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[var(--ab-text-secondary)] font-medium">AetherGate</span>
          <span aria-hidden="true">·</span>
          <span>Developer: Manoj</span>
          <span aria-hidden="true">·</span>
          <a
            href="https://www.manojinfo.in/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-[#0A84FF] transition-colors"
          >
            <span>manojinfo.in</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="https://instagram.com/ma9oj.ae"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-[#0A84FF] transition-colors"
          >
            IG @ma9oj.ae
          </a>
        </div>
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setLegalDialog('privacy')} className="hover:text-[var(--ab-text-primary)]">
            Privacy
          </button>
          <button type="button" onClick={() => setLegalDialog('terms')} className="hover:text-[var(--ab-text-primary)]">
            Terms
          </button>
        </div>
      </footer>

      <AnimatePresence>
        {legalDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
            role="dialog"
            aria-modal="true"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              className="glass-elevated w-full max-w-lg rounded-2xl p-6"
            >
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-semibold text-[var(--ab-text-primary)]">
                  {legalDialog === 'privacy' ? 'Privacy & Credential Handling' : 'Terms of Use'}
                </h2>
                <button
                  type="button"
                  onClick={() => setLegalDialog(null)}
                  aria-label="Close modal"
                  className="text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-sm text-[var(--ab-text-secondary)] leading-relaxed">
                {legalDialog === 'privacy'
                  ? 'AetherGate encrypts connected provider tokens at rest using AES-256-GCM, stores Master API keys strictly as one-way SHA-256 hashes, and never exposes raw OAuth credentials to browser JavaScript or external API consumers.'
                  : 'You are responsible for authorizing only provider accounts you own or administer, configuring least-privilege API key scopes, and adhering to upstream Google, GitHub, AWS, and AI provider terms of service.'}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
