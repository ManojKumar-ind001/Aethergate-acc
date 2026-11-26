import type {
  AiLimitsOverviewResponse,
  ApiEnvironment,
  ApiKeySummary,
  ApiPermission,
  AuditLogEntry,
  ConnectedAccount,
  CreditPoolSummary,
  CreditProviderType,
  EntitlementCategory,
  EntitlementRecord,
  NotificationItem,
  ProviderConfigStatus,
  ProviderType,
  UsageAnalyticsSummary,
  UserProfile,
  Workspace,
} from '../../shared/types';

let inMemorySessionToken: string | null = null;

export function setSessionToken(token: string | null): void {
  inMemorySessionToken = token;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('X-Requested-With', 'AetherGate');
  if (inMemorySessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
  }

  const res = await fetch(path, {
    ...init,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch {
      data = { raw: text };
    }
  }

  if (!res.ok) {
    const errObj = data.error as { message?: string; code?: string } | string | undefined;
    const message =
      typeof errObj === 'string'
        ? errObj
        : errObj?.message || (data.message as string | undefined) || `Request failed (${res.status})`;
    const code =
      (typeof errObj === 'object' ? errObj?.code : undefined) || (data.code as string | undefined);
    throw new ApiError(message, res.status, code, data);
  }

  return data as T;
}

export const api = {
  // Auth
  register(payload: { email: string; password: string; fullName: string }) {
    return request<{ token: string; user: UserProfile; workspace: Workspace }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  login(payload: { email: string; password: string }) {
    return request<{ token: string; user: UserProfile; workspace: Workspace }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  },
  session() {
    return request<{ authenticated: boolean; user: UserProfile | null; workspace: Workspace | null }>(
      '/api/auth/session'
    );
  },
  me() {
    return request<{ user: UserProfile; workspace: Workspace }>('/api/auth/me');
  },
  updateOnboarding(payload: { step?: number; completed?: boolean; workspaceName?: string }) {
    return request<{ user: UserProfile; workspace: Workspace }>('/api/auth/onboarding', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  verifyEmail() {
    return request<{ user: UserProfile }>('/api/auth/verify-email', { method: 'POST' });
  },
  requestPasswordReset(email: string) {
    return request<{ ok: boolean; message: string }>('/api/auth/password-reset-request', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },
  changePassword(payload: { currentPassword: string; newPassword: string }) {
    return request<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getSessions() {
    return request<{
      sessions: Array<{
        id: string;
        userAgent: string;
        ipAddress: string;
        expiresAt: string;
        lastSeenAt: string;
        createdAt: string;
        current: boolean;
      }>;
    }>('/api/auth/sessions');
  },
  revokeOtherSessions() {
    return request<{ ok: boolean; revokedCount: number }>('/api/auth/sessions/others', {
      method: 'DELETE',
    });
  },
  deleteAccount(password: string) {
    return request<{ ok: boolean }>('/api/auth/account', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
    });
  },

  // Providers & Accounts
  getProviderConfig() {
    return request<ProviderConfigStatus>('/api/providers/config');
  },
  getGoogleAuthUrl() {
    return request<{ url: string; redirectUri: string }>('/api/oauth/google/url');
  },
  getGitHubAuthUrl() {
    return request<{ url: string; redirectUri: string }>('/api/oauth/github/url');
  },
  connectAwsIamRole(payload: {
    accountId: string;
    roleArn: string;
    externalId?: string;
    region: string;
    friendlyName: string;
  }) {
    return request<{ account: ConnectedAccount }>('/api/providers/aws/iam-role', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectAwsIdentityCenter(payload: {
    accessPortalUrl: string;
    region: string;
    accountId: string;
    roleName: string;
    friendlyName?: string;
  }) {
    return request<{ account: ConnectedAccount }>('/api/providers/aws/identity-center', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  connectAwsBuilderId(payload: { email: string; friendlyName?: string; region?: string }) {
    return request<{ account: ConnectedAccount }>('/api/providers/aws/builder-id', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  getAccounts() {
    return request<{ accounts: ConnectedAccount[] }>('/api/accounts');
  },
  getAccountDetail(id: string) {
    return request<{
      account: ConnectedAccount;
      entitlements?: EntitlementRecord[];
      events: AuditLogEntry[];
    }>(`/api/accounts/${id}`);
  },
  verifyAccount(id: string) {
    return request<{ account: ConnectedAccount }>(`/api/accounts/${id}/verify`, { method: 'POST' });
  },
  verifyAllAccounts() {
    return request<{ accounts: ConnectedAccount[] }>('/api/accounts/verify-all', { method: 'POST' });
  },
  disconnectAccount(id: string) {
    return request<{ account: ConnectedAccount }>(`/api/accounts/${id}/disconnect`, { method: 'POST' });
  },
  removeAccount(id: string) {
    return request<{ ok: boolean }>(`/api/accounts/${id}`, { method: 'DELETE' });
  },
  disconnectAllAccounts() {
    return request<{ ok: boolean; removedCount: number }>('/api/accounts', { method: 'DELETE' });
  },

  // Console
  getOverview() {
    return request<{
      metrics: {
        totalAccounts: number;
        connectedAccounts: number;
        attentionRequired: number;
        verifiedEntitlements: number;
        activeApiKeys: number;
        apiRequests: number;
      };
      providerHealth: Array<{
        provider: 'google' | 'github' | 'aws';
        total: number;
        active: number;
        issues: number;
        lastVerified: string | null;
        health: 'healthy' | 'degraded' | 'unconfigured';
      }>;
      recentAccounts: ConnectedAccount[];
      recentActivity: AuditLogEntry[];
      entitlementSummary: {
        verified: number;
        manual?: number;
        expiring: number;
        unsupported: number;
        lastSyncedAt: string | null;
      };
      creditPool?: CreditPoolSummary;
      gatewayLimitSummary?: {
        activeKeys: number;
        totalCapacityPerMin: number;
        usedInWindow: number;
      };
    }>('/api/console/overview');
  },
  getLimits() {
    return request<AiLimitsOverviewResponse>('/api/console/limits');
  },
  getEntitlements() {
    return request<{ entitlements: EntitlementRecord[] }>('/api/console/entitlements');
  },
  syncEntitlements() {
    return request<{ syncedCount: number; entitlements: EntitlementRecord[] }>(
      '/api/console/entitlements/sync',
      { method: 'POST' }
    );
  },
  initDefaultLoginCredits() {
    return request<{
      addedCount: number;
      entitlements: EntitlementRecord[];
      creditPool: CreditPoolSummary;
    }>('/api/console/credits/init-defaults', { method: 'POST' });
  },
  consumeCredit(payload: {
    entitlementId?: string;
    provider?: string;
    amount?: number;
    toolName?: string;
  }) {
    return request<{
      consumed: number;
      updatedRecord: EntitlementRecord | null;
      creditPool: CreditPoolSummary;
    }>('/api/console/credits/consume', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  createManualEntitlement(payload: {
    provider: CreditProviderType;
    connectedAccountId?: string;
    accountLabel: string;
    entitlementType: string;
    category?: EntitlementCategory;
    availableAmount?: string;
    limitValue?: number | null;
    usedValue?: number | null;
    unit?: string;
    resetPeriod?: EntitlementRecord['resetPeriod'];
    currency?: string;
    expiryDate?: string;
    notes?: string;
  }) {
    return request<{ id: string }>('/api/console/entitlements/manual', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  updateEntitlement(
    id: string,
    payload: {
      usedValue?: number | null;
      limitValue?: number | null;
      availableAmount?: string | null;
      expiryDate?: string | null;
      notes?: string | null;
    }
  ) {
    return request<{ entitlement: EntitlementRecord }>(`/api/console/entitlements/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  deleteEntitlement(id: string) {
    return request<{ ok: boolean }>(`/api/console/entitlements/${id}`, { method: 'DELETE' });
  },

  // API Keys
  getApiKeys() {
    return request<{ keys: ApiKeySummary[] }>('/api/console/keys');
  },
  createApiKey(payload: {
    name: string;
    description?: string;
    environment: ApiEnvironment;
    allowedProviders: ProviderType[];
    accountScope: 'all' | 'selected';
    allowedAccountIds: string[];
    permissions: ApiPermission[];
    rateLimitPerMinute: number;
    expiresInDays: number | null;
  }) {
    return request<{ apiKey: ApiKeySummary; rawKey: string }>('/api/console/keys', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  rotateApiKey(id: string) {
    return request<{ apiKey: ApiKeySummary; rawKey: string }>(`/api/console/keys/${id}/rotate`, {
      method: 'POST',
    });
  },
  updateApiKey(
    id: string,
    payload: { permissions?: ApiPermission[]; expiresInDays?: number | null; rateLimitPerMinute?: number }
  ) {
    return request<{ apiKey: ApiKeySummary }>(`/api/console/keys/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  revokeApiKey(id: string) {
    return request<{ ok: boolean }>(`/api/console/keys/${id}`, { method: 'DELETE' });
  },

  // Analytics, Logs, Security, Notifications, Settings
  getAnalytics(params: { range: string; from?: string; to?: string }) {
    const q = new URLSearchParams({ range: params.range });
    if (params.from) q.set('from', params.from);
    if (params.to) q.set('to', params.to);
    return request<UsageAnalyticsSummary>(`/api/console/analytics?${q.toString()}`);
  },
  getAuditLogs(params: { eventType?: string; provider?: string; result?: string; q?: string }) {
    const query = new URLSearchParams();
    if (params.eventType) query.set('eventType', params.eventType);
    if (params.provider) query.set('provider', params.provider);
    if (params.result) query.set('result', params.result);
    if (params.q) query.set('q', params.q);
    return request<{ logs: AuditLogEntry[] }>(`/api/console/audit-logs?${query.toString()}`);
  },
  getSecurityOverview() {
    return request<{
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
    }>('/api/console/security');
  },
  getNotifications() {
    return request<{ notifications: NotificationItem[] }>('/api/console/notifications');
  },
  markNotificationRead(id: string) {
    return request<{ ok: boolean }>(`/api/console/notifications/${id}/read`, { method: 'POST' });
  },
  markAllNotificationsRead() {
    return request<{ ok: boolean }>('/api/console/notifications/read-all', { method: 'POST' });
  },
  updateSettings(payload: {
    workspaceName?: string;
    fullName?: string;
    timezone?: string;
    dateFormat?: string;
    themePreference?: 'dark' | 'light';
    defaultPage?: string;
  }) {
    return request<{ ok: boolean }>('/api/console/settings', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  async downloadSourceZip(): Promise<void> {
    const headers = new Headers();
    headers.set('X-Requested-With', 'AetherGate');
    if (inMemorySessionToken) {
      headers.set('Authorization', `Bearer ${inMemorySessionToken}`);
    }
    const res = await fetch('/api/console/export/zip', {
      headers,
      credentials: 'include',
    });
    if (!res.ok) {
      throw new ApiError('Failed to generate source ZIP archive.', res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'aethergate-source.zip';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },
};
