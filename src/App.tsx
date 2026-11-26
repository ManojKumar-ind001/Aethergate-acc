import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AppShell, type ConsolePageId } from './frontend/layouts/AppShell';
import { CommandMenu } from './frontend/components/CommandMenu';
import { ToastContainer, useToasts } from './frontend/components/UiPrimitives';
import { AuthScreen } from './frontend/features/auth/AuthScreen';
import { OnboardingFlow } from './frontend/features/auth/OnboardingFlow';
import { OverviewPage } from './frontend/features/overview/OverviewPage';
import { AccountsPage } from './frontend/features/accounts/AccountsPage';
import { ConnectAccountModal } from './frontend/features/accounts/ConnectAccountModal';
import { EntitlementsPage } from './frontend/features/entitlements/EntitlementsPage';
import { ApiKeysPage } from './frontend/features/api-keys/ApiKeysPage';
import { ApiPlaygroundPage } from './frontend/features/api-playground/ApiPlaygroundPage';
import { DocumentationPage } from './frontend/features/documentation/DocumentationPage';
import { UsageAnalyticsPage } from './frontend/features/analytics/UsageAnalyticsPage';
import { ActivityLogsPage } from './frontend/features/logs/ActivityLogsPage';
import { SecurityPage } from './frontend/features/security/SecurityPage';
import { SettingsPage } from './frontend/features/settings/SettingsPage';
import { OrganizationsPage } from './frontend/features/organizations/OrganizationsPage';
import { api, setSessionToken } from './frontend/services/api';
import type {
  ConnectedAccount,
  NotificationItem,
  ProviderType,
  UserProfile,
  Workspace,
} from './shared/types';

export default function App() {
  const { toasts, pushToast, dismissToast } = useToasts();
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [activePage, setActivePage] = useState<ConsolePageId>('overview');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState<ProviderType | undefined>(undefined);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);

  const applyTheme = useCallback((next: 'dark' | 'light') => {
    setTheme(next);
    const root = document.documentElement;
    if (next === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const loadWorkspaceData = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const [accRes, notifRes] = await Promise.all([api.getAccounts(), api.getNotifications()]);
      setAccounts(accRes.accounts);
      setNotifications(notifRes.notifications);
      setRefreshTrigger((n) => n + 1);
    } catch {
      // ignore
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const res = await api.me();
    setUser(res.user);
    setWorkspace(res.workspace);
    applyTheme(res.user.themePreference);
  }, [applyTheme]);

  useEffect(() => {
    api
      .session()
      .then((res) => {
        if (!res.authenticated || !res.user || !res.workspace) {
          setUser(null);
          return;
        }
        setUser(res.user);
        setWorkspace(res.workspace);
        applyTheme(res.user.themePreference);
        const validPages: ConsolePageId[] = [
          'overview',
          'accounts',
          'entitlements',
          'organizations',
          'api-keys',
          'api-playground',
          'documentation',
          'analytics',
          'logs',
          'security',
          'settings',
        ];
        if (validPages.includes(res.user.defaultPage as ConsolePageId)) {
          setActivePage(res.user.defaultPage as ConsolePageId);
        }
        return loadWorkspaceData();
      })
      .catch(() => {
        setUser(null);
      })
      .finally(() => setBooting(false));
  }, [applyTheme, loadWorkspaceData]);

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (user) setCommandMenuOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [user]);

  const handleOpenConnect = (provider?: ProviderType) => {
    setConnectProvider(provider);
    setConnectModalOpen(true);
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    setSessionToken(null);
    setUser(null);
    setWorkspace(null);
    setAccounts([]);
    setNotifications([]);
  };

  const handleToggleTheme = async (next: 'dark' | 'light') => {
    applyTheme(next);
    try {
      await api.updateSettings({ themePreference: next });
      pushToast({ tone: 'info', title: `Switched to ${next} theme` });
    } catch {
      // ignore
    }
  };

  if (booting) {
    return (
      <div className="min-h-screen bg-[#06080C] text-[#A1ACB8] flex items-center justify-center text-xs font-mono">
        Initializing AetherGate workspace...
      </div>
    );
  }

  if (!user || !workspace) {
    return (
      <MotionConfig reducedMotion="user">
        <AuthScreen
          onAuthenticated={({ user: u, workspace: w }) => {
            setUser(u);
            setWorkspace(w);
            applyTheme(u.themePreference);
            void loadWorkspaceData();
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </MotionConfig>
    );
  }

  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  if (!user.onboardingCompleted && !autostart) {
    return (
      <MotionConfig reducedMotion="user">
        <OnboardingFlow
          user={user}
          workspace={workspace}
          onComplete={({ user: u, workspace: w }) => {
            setUser(u);
            setWorkspace(w);
            void loadWorkspaceData();
          }}
          onOpenConnectModal={(provider) => handleOpenConnect(provider)}
        />
        <ConnectAccountModal
          open={connectModalOpen}
          initialProvider={connectProvider}
          onClose={() => setConnectModalOpen(false)}
          onConnected={(msg) => {
            pushToast({ tone: 'success', title: 'Account Connected', description: msg });
            void loadWorkspaceData();
          }}
        />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </MotionConfig>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <AppShell
        activePage={activePage}
        onNavigate={(p) => setActivePage(p)}
        user={user}
        workspace={workspace}
        accounts={accounts}
        notifications={notifications}
        onMarkNotificationRead={(id) => {
          void api.markNotificationRead(id).then(() => {
            setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
          });
        }}
        onMarkAllNotificationsRead={() => {
          void api.markAllNotificationsRead().then(() => {
            setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
          });
        }}
        onRefreshSync={async () => {
          await api.verifyAllAccounts();
          await loadWorkspaceData();
          pushToast({ tone: 'success', title: 'Synchronized workspace status' });
        }}
        onOpenCommandMenu={() => setCommandMenuOpen(true)}
        onSignOut={handleSignOut}
      >
        {activePage === 'overview' && (
          <OverviewPage
            onNavigate={(p) => setActivePage(p as ConsolePageId)}
            onOpenConnect={handleOpenConnect}
            refreshTrigger={refreshTrigger}
            pushToast={pushToast}
          />
        )}
        {activePage === 'accounts' && (
          <AccountsPage
            accounts={accounts}
            loading={accountsLoading}
            onOpenConnect={handleOpenConnect}
            onRefreshAccounts={loadWorkspaceData}
            pushToast={pushToast}
          />
        )}
        {activePage === 'entitlements' && (
          <EntitlementsPage accounts={accounts} pushToast={pushToast} />
        )}
        {activePage === 'organizations' && (
          <OrganizationsPage user={user} workspace={workspace} />
        )}
        {activePage === 'api-keys' && (
          <ApiKeysPage accounts={accounts} pushToast={pushToast} />
        )}
        {activePage === 'api-playground' && <ApiPlaygroundPage accounts={accounts} />}
        {activePage === 'documentation' && <DocumentationPage />}
        {activePage === 'analytics' && <UsageAnalyticsPage />}
        {activePage === 'logs' && <ActivityLogsPage />}
        {activePage === 'security' && (
          <SecurityPage onNavigate={(p) => setActivePage(p as ConsolePageId)} pushToast={pushToast} />
        )}
        {activePage === 'settings' && (
          <SettingsPage
            user={user}
            workspace={workspace}
            theme={theme}
            onToggleTheme={handleToggleTheme}
            onUserUpdated={refreshProfile}
            onAccountsCleared={loadWorkspaceData}
            onAccountDeleted={() => {
              setSessionToken(null);
              setUser(null);
              setWorkspace(null);
              pushToast({ tone: 'info', title: 'Account deleted' });
            }}
            pushToast={pushToast}
          />
        )}
      </AppShell>

      <ConnectAccountModal
        open={connectModalOpen}
        initialProvider={connectProvider}
        onClose={() => setConnectModalOpen(false)}
        onConnected={(msg) => {
          pushToast({ tone: 'success', title: 'Account Connected', description: msg });
          void loadWorkspaceData();
        }}
      />

      <CommandMenu
        open={commandMenuOpen}
        onClose={() => setCommandMenuOpen(false)}
        onNavigate={(p) => setActivePage(p as ConsolePageId)}
        onOpenConnect={handleOpenConnect}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </MotionConfig>
  );
}
