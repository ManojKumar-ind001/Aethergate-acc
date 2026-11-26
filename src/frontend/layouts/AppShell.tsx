import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Terminal,
  Users,
  X,
} from 'lucide-react';
import { AetherGateLogo } from '../components/BrandMark';
import { formatRelativeTime } from '../components/UiPrimitives';
import type { ConnectedAccount, NotificationItem, UserProfile, Workspace } from '../../shared/types';

export type ConsolePageId =
  | 'overview'
  | 'accounts'
  | 'entitlements'
  | 'organizations'
  | 'api-keys'
  | 'api-playground'
  | 'documentation'
  | 'analytics'
  | 'logs'
  | 'security'
  | 'settings';

const NAV_GROUPS: Array<{
  title: string;
  items: Array<{ id: ConsolePageId; label: string; icon: typeof LayoutDashboard; tag?: string }>;
}> = [
  {
    title: 'Overview',
    items: [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }],
  },
  {
    title: 'Management',
    items: [
      { id: 'accounts', label: 'Accounts', icon: Users },
      { id: 'entitlements', label: 'AI Credits & Limits', icon: Award },
      { id: 'organizations', label: 'Organizations', icon: Building2, tag: 'Preview' },
    ],
  },
  {
    title: 'Developer Gateway',
    items: [
      { id: 'api-keys', label: 'API Keys', icon: KeyRound },
      { id: 'api-playground', label: 'API Playground', icon: Terminal },
      { id: 'documentation', label: 'API Docs & Tools', icon: BookOpen },
      { id: 'analytics', label: 'Usage Analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'System',
    items: [
      { id: 'logs', label: 'Activity Logs', icon: FileText },
      { id: 'security', label: 'Security', icon: Shield },
      { id: 'settings', label: 'Settings', icon: Settings },
    ],
  },
];

export function AppShell({
  activePage,
  onNavigate,
  user,
  workspace,
  accounts,
  notifications,
  onMarkNotificationRead,
  onMarkAllNotificationsRead,
  onRefreshSync,
  onOpenCommandMenu,
  onSignOut,
  children,
}: {
  activePage: ConsolePageId;
  onNavigate: (page: ConsolePageId) => void;
  user: UserProfile;
  workspace: Workspace;
  accounts: ConnectedAccount[];
  notifications: NotificationItem[];
  onMarkNotificationRead: (id: string) => void;
  onMarkAllNotificationsRead: () => void;
  onRefreshSync: () => Promise<void>;
  onOpenCommandMenu: () => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activePage]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const visibleNotifs =
    notifFilter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  const issueCount = accounts.filter((a) =>
    ['reauth_required', 'expired', 'revoked', 'verification_failed'].includes(a.status)
  ).length;

  const healthLabel =
    accounts.length === 0
      ? 'No accounts'
      : issueCount > 0
      ? `${issueCount} issue${issueCount > 1 ? 's' : ''}`
      : 'All connected';

  const healthColor =
    accounts.length === 0
      ? 'text-[var(--ab-text-muted)]'
      : issueCount > 0
      ? 'text-[#FF9F0A]'
      : 'text-[#30D158]';

  const activeTitle =
    NAV_GROUPS.flatMap((g) => g.items).find((i) => i.id === activePage)?.label ?? 'Overview';

  const initials = user.fullName
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleSyncClick = async () => {
    setSyncing(true);
    try {
      await onRefreshSync();
    } finally {
      setSyncing(false);
    }
  };

  const renderSidebarBody = (isMobile: boolean) => {
    const isNarrow = !isMobile && collapsed;
    return (
      <div className="flex h-full flex-col justify-between">
        <div>
          {/* Top Brand */}
          <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-4 h-[60px]">
            <div className="flex items-center gap-2.5 min-w-0">
              <AetherGateLogo size={28} className="shrink-0" />
              {!isNarrow && (
                <div className="min-w-0">
                  <div className="text-sm font-semibold tracking-tight text-[var(--ab-text-primary)] truncate">
                    AetherGate
                  </div>
                  <div className="text-[10px] font-mono text-[var(--ab-text-muted)]">
                    v2.0 · AI Credit Hub
                  </div>
                </div>
              )}
            </div>
            {isMobile && (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Close navigation menu"
                className="rounded-lg p-1 text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Nav Groups */}
          <nav className="p-3 space-y-5 overflow-y-auto" aria-label="Primary sidebar navigation">
            {NAV_GROUPS.map((group) => (
              <div key={group.title} className="space-y-1">
                {!isNarrow && (
                  <div className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                    {group.title}
                  </div>
                )}
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = activePage === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      title={isNarrow ? item.label : undefined}
                      onClick={() => {
                        onNavigate(item.id);
                        if (isMobile) setMobileOpen(false);
                      }}
                      className={`group relative flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-xs font-medium transition-all ${
                        active
                          ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)] shadow-sm'
                          : 'text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-secondary)] hover:text-[var(--ab-text-primary)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            active
                              ? 'text-[#0A84FF]'
                              : 'text-[var(--ab-text-muted)] group-hover:text-[var(--ab-text-primary)]'
                          }`}
                        />
                        {!isNarrow && <span className="truncate">{item.label}</span>}
                      </div>
                      {!isNarrow && item.tag && (
                        <span className="text-[10px] font-mono text-[var(--ab-text-muted)]">{item.tag}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        {/* Bottom User + Manoj Attribution + Collapse */}
        <div className="border-t border-[var(--ab-border)] p-3 space-y-2">
          {!isNarrow && (
            <div className="glass-subtle rounded-xl px-3 py-2.5 space-y-1">
              <div className="text-xs font-medium text-[var(--ab-text-primary)] truncate">
                {user.fullName}
              </div>
              <div className="text-[11px] text-[var(--ab-text-muted)] truncate">{workspace.name}</div>
              <div className="pt-1 border-t border-[var(--ab-border)] flex items-center gap-1.5 text-[10px] text-[var(--ab-text-muted)]">
                <a
                  href="https://www.manojinfo.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[#0A84FF] transition-colors truncate"
                >
                  manojinfo.in
                </a>
                <span aria-hidden="true">·</span>
                <a
                  href="https://instagram.com/ma9oj.ae"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:text-[#0A84FF] transition-colors shrink-0"
                >
                  @ma9oj.ae
                </a>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-1">
            {!isMobile && (
              <button
                type="button"
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-secondary)] hover:text-[var(--ab-text-primary)]"
              >
                {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                {!isNarrow && <span>Collapse</span>}
              </button>
            )}
            <button
              type="button"
              onClick={onSignOut}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-secondary)] hover:text-[#FF453A]"
            >
              <LogOut className="w-4 h-4" />
              {!isNarrow && <span>Sign out</span>}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen text-[var(--ab-text-primary)] flex">
      {/* Desktop Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-[var(--ab-border)] glass-chrome transition-[width] duration-200 ${
          collapsed ? 'w-[74px]' : 'w-[252px]'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarBody(false)}</div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex lg:hidden bg-black/65 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          >
            <motion.aside
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="w-[260px] h-full border-r border-[var(--ab-border)] glass-chrome"
              onClick={(e) => e.stopPropagation()}
            >
              {renderSidebarBody(true)}
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Column */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 h-[60px] border-b border-[var(--ab-border)] glass-chrome px-4 sm:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden rounded-lg p-1.5 text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-elevated)]"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-xs text-[var(--ab-text-muted)] min-w-0">
              <span className="hidden sm:inline truncate max-w-[160px]">{workspace.name}</span>
              <span className="hidden sm:inline" aria-hidden="true">
                /
              </span>
              <span className="font-semibold text-sm text-[var(--ab-text-primary)] truncate">
                {activeTitle}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenCommandMenu}
            className="hidden md:flex items-center justify-between gap-3 w-80 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-3 py-1.5 text-xs text-[var(--ab-text-muted)] hover:border-[#0A84FF]/60 transition-colors whitespace-nowrap"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Search className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Search commands, AI credits, tools...</span>
            </span>
            <kbd className="font-mono text-[10px] rounded-md border border-[var(--ab-border)] px-1.5 py-0.5 shrink-0">
              Ctrl+K
            </kbd>
          </button>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('accounts')}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-2.5 py-1 text-xs whitespace-nowrap hover:bg-[var(--ab-bg-elevated)] transition-colors"
            >
              <Activity className={`w-3.5 h-3.5 ${healthColor}`} />
              <span className="text-[var(--ab-text-secondary)]">{healthLabel}</span>
            </button>

            <button
              type="button"
              onClick={handleSyncClick}
              aria-label="Refresh and sync status"
              title="Refresh & sync status"
              className="rounded-lg p-2 text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)] transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setNotifOpen((o) => !o);
                  setUserMenuOpen(false);
                }}
                aria-label="Open notifications"
                className="relative rounded-lg p-2 text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-elevated)] hover:text-[var(--ab-text-primary)] transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#FF453A] px-1 text-[9px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {notifOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="glass-elevated absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl z-40 overflow-hidden"
                  >
                    <div className="flex items-center justify-between border-b border-[var(--ab-border)] px-4 py-3">
                      <span className="text-xs font-semibold">Notifications</span>
                      <div className="flex items-center gap-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setNotifFilter(notifFilter === 'all' ? 'unread' : 'all')}
                          className="text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
                        >
                          {notifFilter === 'all' ? 'Unread only' : 'Show all'}
                        </button>
                        {unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={onMarkAllNotificationsRead}
                            className="text-[#0A84FF] hover:underline"
                          >
                            Mark all read
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-[var(--ab-border)]">
                      {visibleNotifs.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[var(--ab-text-muted)]">
                          No notifications to display.
                        </div>
                      ) : (
                        visibleNotifs.map((n) => (
                          <div
                            key={n.id}
                            className={`p-3.5 text-xs ${n.read ? 'opacity-70' : 'bg-[var(--ab-bg-secondary)]/50'}`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="font-semibold text-[var(--ab-text-primary)]">{n.title}</span>
                              <span className="text-[10px] text-[var(--ab-text-muted)] shrink-0 tabular-nums">
                                {formatRelativeTime(n.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 text-[var(--ab-text-secondary)] leading-relaxed">{n.message}</p>
                            <div className="mt-2 flex items-center gap-3">
                              {n.actionRoute && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    onMarkNotificationRead(n.id);
                                    onNavigate(n.actionRoute as ConsolePageId);
                                    setNotifOpen(false);
                                  }}
                                  className="text-[11px] font-medium text-[#0A84FF] hover:underline"
                                >
                                  {n.actionLabel || 'Inspect'}
                                </button>
                              )}
                              {!n.read && (
                                <button
                                  type="button"
                                  onClick={() => onMarkNotificationRead(n.id)}
                                  className="text-[11px] text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
                                >
                                  Mark read
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Avatar Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setUserMenuOpen((o) => !o);
                  setNotifOpen(false);
                }}
                aria-label="User account menu"
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] text-xs font-semibold text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] transition-colors"
              >
                {initials || 'AG'}
              </button>

              <AnimatePresence>
                {userMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 6, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 4, scale: 0.98 }}
                    transition={{ duration: 0.16 }}
                    className="glass-elevated absolute right-0 mt-2 w-56 rounded-2xl z-40 py-1 text-xs"
                  >
                    <div className="border-b border-[var(--ab-border)] px-3.5 py-2.5">
                      <div className="font-semibold truncate">{user.fullName}</div>
                      <div className="text-[11px] text-[var(--ab-text-muted)] truncate">{user.email}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('security');
                      }}
                      className="block w-full text-left px-3.5 py-2 hover:bg-[var(--ab-bg-secondary)]"
                    >
                      Security Center
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onNavigate('settings');
                      }}
                      className="block w-full text-left px-3.5 py-2 hover:bg-[var(--ab-bg-secondary)]"
                    >
                      Workspace Settings
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        onSignOut();
                      }}
                      className="block w-full text-left px-3.5 py-2 text-[#FF453A] hover:bg-[var(--ab-bg-secondary)]"
                    >
                      Sign out
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 flex flex-col justify-between gap-8">
          <div className="mx-auto w-full max-w-[1280px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="mx-auto w-full max-w-[1280px] border-t border-[var(--ab-border)] pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--ab-text-muted)]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-[var(--ab-text-secondary)]">AetherGate</span>
              <span aria-hidden="true">·</span>
              <span>Developed by Manoj</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
          </footer>
        </main>
      </div>
    </div>
  );
}
