import { useMemo, useState } from 'react';
import { MoreVertical, Plus, RefreshCw, Search, ShieldAlert, Trash2, Unplug, Eye } from 'lucide-react';
import { formatProviderName, ProviderIcon } from '../../components/BrandMark';
import {
  ConfirmDialog,
  formatRelativeTime,
  SkeletonRows,
  StatusBadge,
} from '../../components/UiPrimitives';
import { AccountDetailDrawer } from './AccountDetailDrawer';
import { api, ApiError } from '../../services/api';
import type { AccountStatus, ConnectedAccount, ProviderType } from '../../../shared/types';

export function AccountsPage({
  accounts,
  loading,
  onOpenConnect,
  onRefreshAccounts,
  pushToast,
}: {
  accounts: ConnectedAccount[];
  loading: boolean;
  onOpenConnect: (provider?: ProviderType) => void;
  onRefreshAccounts: () => Promise<void>;
  pushToast: (t: { tone: 'success' | 'error' | 'warning' | 'info'; title: string; description?: string }) => void;
}) {
  const [providerTab, setProviderTab] = useState<'all' | 'google' | 'github' | 'aws'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [search, setSearch] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ConnectedAccount | null>(null);
  const [removing, setRemoving] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return accounts.filter((acc) => {
      if (providerTab === 'google' && acc.provider !== 'google') return false;
      if (providerTab === 'github' && acc.provider !== 'github') return false;
      if (providerTab === 'aws' && !acc.provider.startsWith('aws')) return false;
      if (statusFilter !== 'all' && acc.status !== statusFilter) return false;
      if (!q) return true;
      return (
        acc.displayName.toLowerCase().includes(q) ||
        (acc.email && acc.email.toLowerCase().includes(q)) ||
        (acc.username && acc.username.toLowerCase().includes(q)) ||
        acc.providerAccountId.toLowerCase().includes(q) ||
        acc.provider.toLowerCase().includes(q)
      );
    });
  }, [accounts, providerTab, statusFilter, search]);

  const summaryFor = (category: 'google' | 'github' | 'aws') => {
    const group = accounts.filter((a) =>
      category === 'aws' ? a.provider.startsWith('aws') : a.provider === category
    );
    const active = group.filter((a) => a.status === 'connected').length;
    const issues = group.filter((a) =>
      ['reauth_required', 'expired', 'revoked', 'verification_failed'].includes(a.status)
    ).length;
    return { total: group.length, active, issues };
  };

  const handleVerify = async (account: ConnectedAccount) => {
    try {
      const res = await api.verifyAccount(account.id);
      await onRefreshAccounts();
      setSelectedAccount(res.account);
      pushToast({
        tone: res.account.status === 'connected' ? 'success' : 'warning',
        title: `Verified ${account.displayName}`,
        description: `Current status: ${res.account.status}`,
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Verification failed',
        description: err instanceof ApiError ? err.message : 'Unable to verify account.',
      });
    }
  };

  const handleDisconnect = async (account: ConnectedAccount) => {
    try {
      const res = await api.disconnectAccount(account.id);
      await onRefreshAccounts();
      setSelectedAccount(res.account);
      pushToast({
        tone: 'info',
        title: `Disconnected ${account.displayName}`,
        description: 'Encrypted credentials have been removed.',
      });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Disconnect failed',
        description: err instanceof ApiError ? err.message : 'Unable to disconnect.',
      });
    }
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    try {
      await api.removeAccount(removeTarget.id);
      if (selectedAccount?.id === removeTarget.id) setSelectedAccount(null);
      setRemoveTarget(null);
      await onRefreshAccounts();
      pushToast({ tone: 'success', title: 'Account removed from workspace' });
    } catch (err) {
      pushToast({
        tone: 'error',
        title: 'Removal failed',
        description: err instanceof ApiError ? err.message : 'Could not remove account.',
      });
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
            Connected Accounts
          </h1>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Manage your authorized Google, GitHub and AWS identities.
          </p>
        </div>
        <button
          type="button"
          onClick={() => onOpenConnect()}
          className="inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-sm font-semibold text-[#0B0D10] hover:bg-[#8aaaf0] transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Connect Account</span>
        </button>
      </div>

      {/* Three Provider Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {(
          [
            { id: 'google', title: 'Google', action: 'Add Google account' },
            { id: 'github', title: 'GitHub', action: 'Add GitHub account' },
            { id: 'aws', title: 'AWS', action: 'Connect AWS' },
          ] as const
        ).map((card) => {
          const stats = summaryFor(card.id);
          return (
            <div
              key={card.id}
              className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-5 flex flex-col justify-between"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)]">
                    <ProviderIcon provider={card.id} size={18} />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">{card.title}</h2>
                    <p className="text-xs text-[var(--ab-text-muted)] tabular-nums">
                      {stats.total} connected
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenConnect(card.id)}
                  className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-2.5 py-1.5 text-xs font-medium text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] whitespace-nowrap"
                >
                  {card.action}
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-[var(--ab-border)] flex items-center justify-between text-xs tabular-nums">
                <span className="text-[var(--ab-text-secondary)]">
                  Active: <strong className="text-[#64B58D]">{stats.active}</strong>
                </span>
                <span className="text-[var(--ab-text-secondary)]">
                  Issues: <strong className={stats.issues > 0 ? 'text-[#D4A65C]' : 'text-[var(--ab-text-primary)]'}>{stats.issues}</strong>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-1 self-start">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'google', label: 'Google' },
              { id: 'github', label: 'GitHub' },
              { id: 'aws', label: 'AWS' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setProviderTab(tab.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                providerTab === tab.id
                  ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                  : 'text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative">
            <Search className="w-4 h-4 text-[var(--ab-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email, username, ID..."
              aria-label="Search connected accounts"
              className="w-full sm:w-64 rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] pl-9 pr-3 py-1.5 text-xs text-[var(--ab-text-primary)] placeholder-[var(--ab-text-muted)] focus:border-[#769AE8] focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AccountStatus)}
            aria-label="Filter by connection status"
            className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-3 py-1.5 text-xs text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="connected">Connected</option>
            <option value="reauth_required">Reauthentication required</option>
            <option value="expired">Expired</option>
            <option value="revoked">Revoked</option>
            <option value="verification_failed">Verification failed</option>
            <option value="disconnected">Disconnected</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldAlert className="w-8 h-8 text-[var(--ab-text-muted)] mx-auto mb-3" />
            <h3 className="text-sm font-semibold text-[var(--ab-text-primary)]">
              {accounts.length === 0 ? 'No connected identities yet' : 'No matching accounts found'}
            </h3>
            <p className="mt-1 text-xs text-[var(--ab-text-secondary)] max-w-md mx-auto">
              {accounts.length === 0
                ? 'Connect Google, GitHub, or AWS accounts to monitor authorization health and route requests through the API gateway.'
                : 'Adjust your provider filter, status filter, or search query.'}
            </p>
            {accounts.length === 0 && (
              <button
                type="button"
                onClick={() => onOpenConnect()}
                className="mt-4 inline-flex items-center gap-2 rounded-md bg-[#769AE8] px-4 py-2 text-xs font-semibold text-[#0B0D10] hover:bg-[#8aaaf0]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Connect First Account</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                  <th className="py-3 px-4">Provider</th>
                  <th className="py-3 px-4">Identity</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Account Identifier</th>
                  <th className="py-3 px-4">Connection Status</th>
                  <th className="py-3 px-4">Last Verified</th>
                  <th className="py-3 px-4">Date Added</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ab-border)] text-xs">
                {filtered.map((acc) => {
                  const initials = acc.displayName
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={acc.id}
                      onClick={() => setSelectedAccount(acc)}
                      className="hover:bg-[var(--ab-bg-secondary)]/70 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <ProviderIcon provider={acc.provider} size={16} />
                          <span className="font-medium text-[var(--ab-text-primary)]">
                            {formatProviderName(acc.provider)}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          {acc.avatarUrl ? (
                            <img
                              src={acc.avatarUrl}
                              alt={acc.displayName}
                              referrerPolicy="no-referrer"
                              className="h-7 w-7 rounded-full object-cover border border-[var(--ab-border)]"
                            />
                          ) : (
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--ab-border)] bg-[var(--ab-bg-elevated)] text-[10px] font-semibold text-[var(--ab-text-primary)]">
                              {initials || 'AB'}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-[var(--ab-text-primary)]">{acc.displayName}</div>
                            {acc.username && (
                              <div className="text-[11px] font-mono text-[var(--ab-text-muted)]">@{acc.username}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--ab-text-secondary)] whitespace-nowrap">
                        {acc.email || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-[var(--ab-text-secondary)] whitespace-nowrap">
                        {acc.providerAccountId}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={acc.status} />
                      </td>
                      <td className="py-3 px-4 tabular-nums text-[var(--ab-text-secondary)] whitespace-nowrap">
                        {formatRelativeTime(acc.lastVerifiedAt)}
                      </td>
                      <td className="py-3 px-4 tabular-nums text-[var(--ab-text-secondary)] whitespace-nowrap">
                        {new Date(acc.createdAt).toLocaleDateString()}
                      </td>
                      <td
                        className="py-3 px-4 text-right relative whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setOpenMenuId(openMenuId === acc.id ? null : acc.id)}
                          aria-label={`Actions for ${acc.displayName}`}
                          className="rounded-md p-1.5 text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)]"
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenuId === acc.id && (
                          <div className="absolute right-4 top-10 z-20 w-44 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-elevated)] py-1 shadow-xl text-left">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedAccount(acc);
                                setOpenMenuId(null);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-secondary)]"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>View Details</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                void handleVerify(acc);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-secondary)]"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Verify Connection</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                onOpenConnect(acc.provider);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-secondary)]"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Reconnect</span>
                            </button>
                            {acc.status !== 'disconnected' && (
                              <button
                                type="button"
                                onClick={() => {
                                  setOpenMenuId(null);
                                  void handleDisconnect(acc);
                                }}
                                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#D4A65C] hover:bg-[var(--ab-bg-secondary)]"
                              >
                                <Unplug className="w-3.5 h-3.5" />
                                <span>Disconnect</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setOpenMenuId(null);
                                setRemoveTarget(acc);
                              }}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[#D47777] hover:bg-[var(--ab-bg-secondary)]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove Account</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AccountDetailDrawer
        account={selectedAccount}
        onClose={() => setSelectedAccount(null)}
        onVerify={handleVerify}
        onReconnect={(acc) => onOpenConnect(acc.provider)}
        onDisconnect={handleDisconnect}
        onRemove={(acc) => setRemoveTarget(acc)}
      />

      <ConfirmDialog
        open={Boolean(removeTarget)}
        title="Remove connected account?"
        description={`Removing "${removeTarget?.displayName || ''}" will delete its encrypted credentials and remove it from your workspace. Existing API keys scoped exclusively to this account will no longer resolve it.`}
        confirmLabel="Remove Account"
        danger
        loading={removing}
        onConfirm={confirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}
