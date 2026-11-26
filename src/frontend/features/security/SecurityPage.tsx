import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, KeyRound, Lock, LogOut, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '../../services/api';

export function SecurityPage({
  onNavigate,
  pushToast,
}: {
  onNavigate: (page: string) => void;
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [data, setData] = useState<{
    activeSessions: Array<{
      id: string;
      userAgent: string;
      ipAddress: string;
      expiresAt: string;
      lastSeenAt: string;
      createdAt: string;
      current: boolean;
    }>;
    credentialEncryption: {
      algorithm: string;
      persistentKeyConfigured: boolean;
      totalEncryptedCredentials: number;
      accountsNeedingReauth: number;
    };
    apiSecurity: {
      activeKeys: number;
      revokedKeys: number;
      expiringSoonKeys: number;
    };
    failedAuthEvents: Array<{
      id: string;
      actor_label: string;
      event_type: string;
      provider: string;
      action: string;
      created_at: string;
    }>;
    recommendations: Array<{
      id: string;
      severity: 'warning' | 'info' | 'error';
      title: string;
      description: string;
      actionRoute: string;
      actionLabel: string;
    }>;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const loadSecurity = async () => {
    try {
      const res = await api.getSecurityOverview();
      setData(res);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    void loadSecurity();
  }, []);

  const handleRevokeOtherSessions = async () => {
    try {
      const res = await api.revokeOtherSessions();
      await loadSecurity();
      pushToast({
        tone: 'success',
        title: `Revoked ${res.revokedCount} other session(s)`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Failed to revoke sessions',
        description: err instanceof ApiError ? err.message : undefined,
      });
    }
  };

  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setUpdatingPassword(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      pushToast({ tone: 'success', title: 'Password updated cleanly' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Password change failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setUpdatingPassword(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
          Security Center
        </h1>
        <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
          Audit active sessions, credential encryption status, API key posture, and security recommendations.
        </p>
      </div>

      {/* Recommendations */}
      {data && data.recommendations.length > 0 && (
        <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
          <div className="border-b border-[var(--ab-border)] px-5 py-3.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-[#D4A65C]" />
            <h2 className="text-sm font-semibold">Security Recommendations</h2>
          </div>
          <div className="divide-y divide-[var(--ab-border)]">
            {data.recommendations.map((rec) => (
              <div key={rec.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-xs font-semibold text-[var(--ab-text-primary)]">{rec.title}</p>
                  <p className="mt-0.5 text-xs text-[var(--ab-text-secondary)]">{rec.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigate(rec.actionRoute)}
                  className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] whitespace-nowrap self-start sm:self-auto"
                >
                  {rec.actionLabel}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Credential & API Security */}
        <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-[#64B58D]" />
            <h2 className="text-sm font-semibold">Credential &amp; API Security</h2>
          </div>
          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] divide-y divide-[var(--ab-border)] text-xs">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[var(--ab-text-secondary)]">Encryption Algorithm</span>
              <span className="font-mono font-semibold text-[#64B58D]">
                {data?.credentialEncryption.algorithm || 'AES-256-GCM'}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[var(--ab-text-secondary)]">Persistent Master Key Secret</span>
              <span className="font-mono">
                {data?.credentialEncryption.persistentKeyConfigured ? 'Configured' : 'Ephemeral Dev Key'}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[var(--ab-text-secondary)]">Encrypted Credential Vaults</span>
              <span className="font-mono tabular-nums">
                {data?.credentialEncryption.totalEncryptedCredentials ?? 0}
              </span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-[var(--ab-text-secondary)]">Active / Expiring / Revoked Keys</span>
              <span className="font-mono tabular-nums">
                {data?.apiSecurity.activeKeys ?? 0} / {data?.apiSecurity.expiringSoonKeys ?? 0} /{' '}
                {data?.apiSecurity.revokedKeys ?? 0}
              </span>
            </div>
          </div>
        </section>

        {/* Password Management */}
        <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-[#769AE8]" />
            <h2 className="text-sm font-semibold">Change AccountBridge Password</h2>
          </div>
          <form onSubmit={handlePasswordSubmit} className="space-y-3">
            <div>
              <label htmlFor="sec-cur-pw" className="block text-xs text-[var(--ab-text-secondary)] mb-1">
                Current password
              </label>
              <input
                id="sec-cur-pw"
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="sec-new-pw" className="block text-xs text-[var(--ab-text-secondary)] mb-1">
                New password (min 8 characters)
              </label>
              <input
                id="sec-new-pw"
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={updatingPassword}
              className="rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-50"
            >
              {updatingPassword ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </section>
      </div>

      {/* Active Sessions */}
      <section className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#769AE8]" />
            <h2 className="text-sm font-semibold">Active Sessions</h2>
          </div>
          <button
            type="button"
            onClick={handleRevokeOtherSessions}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)]"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out other sessions</span>
          </button>
        </div>
        <div className="divide-y divide-[var(--ab-border)] text-xs">
          {(data?.activeSessions ?? []).map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <div className="font-medium text-[var(--ab-text-primary)]">
                  {s.userAgent}{' '}
                  {s.current && <span className="ml-2 font-mono text-[11px] text-[#64B58D]">(Current)</span>}
                </div>
                <div className="mt-0.5 text-[11px] font-mono text-[var(--ab-text-muted)]">
                  IP: {s.ipAddress} · Last seen: {new Date(s.lastSeenAt).toLocaleString()}
                </div>
              </div>
              <div className="text-[11px] text-[var(--ab-text-muted)] tabular-nums">
                Expires {new Date(s.expiresAt).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
