import { useEffect, useState, type FormEvent } from 'react';
import { Download, ExternalLink, Moon, Sun, Trash2 } from 'lucide-react';
import { ConfirmDialog, CopyButton } from '../../components/UiPrimitives';
import { api, ApiError } from '../../services/api';
import type { ProviderConfigStatus, UserProfile, Workspace } from '../../../shared/types';

type SettingsTab = 'general' | 'preferences' | 'integrations' | 'security' | 'developer' | 'danger';

export function SettingsPage({
  user,
  workspace,
  theme,
  onToggleTheme,
  onUserUpdated,
  onAccountsCleared,
  onAccountDeleted,
  pushToast,
}: {
  user: UserProfile;
  workspace: Workspace;
  theme: 'dark' | 'light';
  onToggleTheme: (next: 'dark' | 'light') => void;
  onUserUpdated: () => Promise<void>;
  onAccountsCleared: () => Promise<void>;
  onAccountDeleted: () => void;
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [tab, setTab] = useState<SettingsTab>('general');
  const [workspaceName, setWorkspaceName] = useState(workspace.name);
  const [fullName, setFullName] = useState(user.fullName);
  const [timezone, setTimezone] = useState(user.timezone);
  const [dateFormat, setDateFormat] = useState(user.dateFormat);
  const [defaultPage, setDefaultPage] = useState(user.defaultPage);
  const [saving, setSaving] = useState(false);
  const [providerConfig, setProviderConfig] = useState<ProviderConfigStatus | null>(null);
  const [exporting, setExporting] = useState(false);
  const [confirmDisconnectAll, setConfirmDisconnectAll] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingUser, setDeletingUser] = useState(false);

  useEffect(() => {
    api.getProviderConfig().then(setProviderConfig).catch(() => {});
  }, []);

  const handleSaveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateSettings({ workspaceName, fullName, timezone, dateFormat, defaultPage });
      await onUserUpdated();
      pushToast({ tone: 'success', title: 'Settings saved' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Save failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadZip = async () => {
    setExporting(true);
    try {
      await api.downloadSourceZip();
      pushToast({
        tone: 'success',
        title: 'Source ZIP downloaded',
        description: 'Secrets, .env files, and node_modules were excluded automatically.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Export failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
    } finally {
      setExporting(false);
    }
  };

  const handleDisconnectAll = async () => {
    try {
      const res = await api.disconnectAllAccounts();
      setConfirmDisconnectAll(false);
      await onAccountsCleared();
      pushToast({ tone: 'warning', title: `Removed ${res.removedCount} connected account(s)` });
    } catch {
      pushToast({ tone: 'error', title: 'Failed to disconnect all accounts' });
    }
  };

  const handleDeleteUser = async (e: FormEvent) => {
    e.preventDefault();
    setDeletingUser(true);
    try {
      await api.deleteAccount(deletePassword);
      onAccountDeleted();
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Account deletion failed',
        description: err instanceof ApiError ? err.message : undefined,
      });
      setDeletingUser(false);
    }
  };

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'general', label: 'General' },
    { id: 'preferences', label: 'Preferences' },
    { id: 'integrations', label: 'Integrations' },
    { id: 'security', label: 'Security' },
    { id: 'developer', label: 'Developer' },
    { id: 'danger', label: 'Danger Zone' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
          Configure workspace metadata, appearance, OAuth provider callbacks, and source code export.
        </p>
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.id
                ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'general' && (
        <form
          onSubmit={handleSaveGeneral}
          className="max-w-2xl rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-6 space-y-4"
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="set-ws" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                Workspace Name
              </label>
              <input
                id="set-ws"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label htmlFor="set-name" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                User Full Name
              </label>
              <input
                id="set-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="set-tz" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                Time Zone
              </label>
              <select
                id="set-tz"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              >
                <option value="UTC">UTC</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Tokyo">Asia/Tokyo</option>
              </select>
            </div>
            <div>
              <label htmlFor="set-df" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                Date Format
              </label>
              <select
                id="set-df"
                value={dateFormat}
                onChange={(e) => setDateFormat(e.target.value)}
                className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono"
              >
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
              </select>
            </div>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      )}

      {tab === 'preferences' && (
        <div className="max-w-2xl rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-6 space-y-5">
          <div>
            <h2 className="text-sm font-semibold">Appearance Theme</h2>
            <p className="text-xs text-[var(--ab-text-secondary)] mt-0.5">
              Switch between dark developer console mode and crisp light mode.
            </p>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={() => onToggleTheme('dark')}
                className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium ${
                  theme === 'dark'
                    ? 'border-[#769AE8] bg-[#769AE8]/15 text-[var(--ab-text-primary)]'
                    : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
                <span>Dark Console</span>
              </button>
              <button
                type="button"
                onClick={() => onToggleTheme('light')}
                className={`inline-flex items-center gap-2 rounded-md border px-4 py-2 text-xs font-medium ${
                  theme === 'light'
                    ? 'border-[#769AE8] bg-[#769AE8]/15 text-[var(--ab-text-primary)]'
                    : 'border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
                <span>Light Surface</span>
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="set-def-page" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
              Default Landing Page
            </label>
            <select
              id="set-def-page"
              value={defaultPage}
              onChange={(e) => {
                setDefaultPage(e.target.value);
                void api.updateSettings({ defaultPage: e.target.value });
                pushToast({ tone: 'success', title: 'Default landing page updated' });
              }}
              className="w-full max-w-xs rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
            >
              <option value="overview">Overview</option>
              <option value="accounts">Accounts</option>
              <option value="api-keys">API Keys</option>
              <option value="api-playground">API Playground</option>
            </select>
          </div>
        </div>
      )}

      {tab === 'integrations' && (
        <div className="max-w-3xl space-y-4">
          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Google OAuth 2.0 Setup</h2>
              <span className="font-mono text-xs text-[var(--ab-text-secondary)]">
                {providerConfig?.google.configured ? 'Configured' : 'Requires GOOGLE_CLIENT_ID & SECRET'}
              </span>
            </div>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Add this Authorized Redirect URI in Google Cloud Console &rarr; APIs &amp; Services &rarr; Credentials:
            </p>
            <div className="flex items-center justify-between gap-2 rounded bg-[var(--ab-bg-base)] border border-[var(--ab-border)] px-3 py-2">
              <code className="text-[11px] font-mono truncate">
                {providerConfig?.google.callbackUrls[0] || `${window.location.origin}/api/oauth/google/callback`}
              </code>
              <CopyButton
                value={providerConfig?.google.callbackUrls[0] || `${window.location.origin}/api/oauth/google/callback`}
                label="Copy"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">GitHub OAuth App Setup</h2>
              <span className="font-mono text-xs text-[var(--ab-text-secondary)]">
                {providerConfig?.github.configured ? 'Configured' : 'Requires GITHUB_CLIENT_ID & SECRET'}
              </span>
            </div>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Add this Authorization Callback URL in GitHub Developer Settings &rarr; OAuth Apps:
            </p>
            <div className="flex items-center justify-between gap-2 rounded bg-[var(--ab-bg-base)] border border-[var(--ab-border)] px-3 py-2">
              <code className="text-[11px] font-mono truncate">
                {providerConfig?.github.callbackUrls[0] || `${window.location.origin}/api/oauth/github/callback`}
              </code>
              <CopyButton
                value={providerConfig?.github.callbackUrls[0] || `${window.location.origin}/api/oauth/github/callback`}
                label="Copy"
              />
            </div>
          </div>

          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">AWS STS &amp; IAM Configuration</h2>
              <span className="font-mono text-xs text-[var(--ab-text-secondary)]">
                {providerConfig?.aws.serverCredentialsConfigured ? 'Server IAM Ready' : 'Requires AWS_ACCESS_KEY_ID & SECRET'}
              </span>
            </div>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Set <code className="font-mono">AWS_ACCESS_KEY_ID</code>, <code className="font-mono">AWS_SECRET_ACCESS_KEY</code>, and <code className="font-mono">AWS_DEFAULT_REGION</code> in environment secrets to enable live STS AssumeRole verification.
            </p>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="max-w-2xl rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-6 space-y-3 text-xs">
          <h2 className="text-sm font-semibold">Workspace Security Defaults</h2>
          <p className="text-[var(--ab-text-secondary)]">
            Encryption at rest: <strong className="font-mono text-[var(--ab-text-primary)]">AES-256-GCM</strong> (
            {providerConfig?.encryption.persistentKeyConfigured
              ? 'Persistent ENCRYPTION_MASTER_KEY configured'
              : 'Ephemeral memory key active — set ENCRYPTION_MASTER_KEY in production'}
            ).
          </p>
          <p className="text-[var(--ab-text-secondary)]">
            Email verification status:{' '}
            <strong className="text-[var(--ab-text-primary)]">
              {user.emailVerified ? 'Verified' : 'Unverified'}
            </strong>
            {!user.emailVerified && (
              <button
                type="button"
                onClick={async () => {
                  await api.verifyEmail();
                  await onUserUpdated();
                  pushToast({ tone: 'success', title: 'Email marked verified' });
                }}
                className="ml-2 text-[#769AE8] hover:underline"
              >
                Verify now
              </button>
            )}
          </p>
        </div>
      )}

      {tab === 'developer' && (
        <div className="max-w-2xl space-y-4">
          <div className="glass-surface rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">Unified API Base URL (OpenAI-Compatible)</h2>
              <div className="mt-2 flex items-center justify-between gap-2 rounded-xl bg-[var(--ab-bg-base)]/80 border border-[var(--ab-border)] px-3 py-2">
                <code className="text-xs font-mono">{window.location.origin}/api/v1</code>
                <CopyButton value={`${window.location.origin}/api/v1`} label="Copy" />
              </div>
            </div>

            <div className="pt-4 border-t border-[var(--ab-border)]">
              <h2 className="text-sm font-semibold">Download Complete Source Code (ZIP)</h2>
              <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                Exports the complete React frontend, TypeScript backend, PostgreSQL migrations, Dockerfile, docker-compose.yml, tests, and documentation—automatically excluding secrets, `.env` files, databases, and `node_modules`.
              </p>
              <button
                type="button"
                onClick={handleDownloadZip}
                disabled={exporting}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0071e3] disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{exporting ? 'Generating ZIP...' : 'Download Project Source (.zip)'}</span>
              </button>
            </div>
          </div>

          <div className="glass-surface rounded-2xl p-6 space-y-3">
            <h2 className="text-sm font-semibold">Developer &amp; Platform Owner</h2>
            <p className="text-xs text-[var(--ab-text-secondary)] leading-relaxed">
              AetherGate is built and maintained by <strong className="text-[var(--ab-text-primary)]">Manoj</strong>. Connect on the developer portfolio or Instagram below.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
              <a
                href="https://www.manojinfo.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3.5 py-2 font-medium text-[var(--ab-text-primary)] hover:border-[#0A84FF]/60 transition-colors"
              >
                <span>www.manojinfo.in</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#0A84FF]" />
              </a>
              <a
                href="https://instagram.com/ma9oj.ae"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3.5 py-2 font-mono font-medium text-[var(--ab-text-primary)] hover:border-[#0A84FF]/60 transition-colors"
              >
                <span>Instagram @ma9oj.ae</span>
                <ExternalLink className="w-3.5 h-3.5 text-[#0A84FF]" />
              </a>
            </div>
          </div>
        </div>
      )}

      {tab === 'danger' && (
        <div className="max-w-2xl space-y-4">
          <div className="glass-surface rounded-2xl border-[#FF453A]/35 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-[#FF453A]">Disconnect All Connected Accounts</h2>
              <p className="mt-1 text-xs text-[var(--ab-text-secondary)]">
                Removes all connected Google, GitHub, and AWS identities and purges encrypted credentials.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDisconnectAll(true)}
              className="rounded-xl border border-[#FF453A]/50 px-3.5 py-2 text-xs font-semibold text-[#FF453A] hover:bg-[#FF453A]/10 whitespace-nowrap"
            >
              Disconnect All
            </button>
          </div>

          <form
            onSubmit={handleDeleteUser}
            className="glass-surface rounded-2xl border-[#FF453A]/35 p-5 space-y-3"
          >
            <h2 className="text-sm font-semibold text-[#FF453A]">Delete AetherGate Account</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Permanently deletes your user profile, owned workspace, API keys, audit logs, and encrypted provider vaults.
            </p>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="password"
                required
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder="Confirm your password"
                aria-label="Confirm password to delete account"
                className="flex-1 rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs"
              />
              <button
                type="submit"
                disabled={deletingUser}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-[#D47777] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#c56565] disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deletingUser ? 'Deleting...' : 'Delete Account'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnectAll}
        title="Disconnect and remove all provider accounts?"
        description="This immediately removes all connected Google, GitHub, and AWS accounts and deletes their encrypted tokens from this workspace."
        confirmLabel="Disconnect All"
        danger
        onConfirm={handleDisconnectAll}
        onCancel={() => setConfirmDisconnectAll(false)}
      />
    </div>
  );
}
