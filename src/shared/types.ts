export type ProviderType = 'google' | 'github' | 'aws' | 'aws_builder_id' | 'aws_identity_center';

export type CreditProviderType =
  | ProviderType
  | 'kiro'
  | 'cursor'
  | 'windsurf'
  | 'openrouter'
  | 'groq'
  | 'huggingface';

export type AccountStatus =
  | 'connected'
  | 'reauth_required'
  | 'expired'
  | 'revoked'
  | 'verification_failed'
  | 'disconnected';

export type EntitlementCategory =
  | 'ai_limit'
  | 'rate_limit'
  | 'credits'
  | 'subscription'
  | 'token_ttl';

export type EntitlementStatus =
  | 'VERIFIED'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'EXPIRED'
  | 'UNAVAILABLE'
  | 'UNSUPPORTED'
  | 'MANUALLY ENTERED';

export type EntitlementSource =
  | 'Provider API'
  | 'Gateway Enforced'
  | 'Manual Entry'
  | 'Unsupported Registry';

export type ApiPermission =
  | 'accounts:read'
  | 'accounts:verify'
  | 'entitlements:read'
  | 'google:profile:read'
  | 'github:profile:read'
  | 'aws:identity:read'
  | 'keys:read'
  | 'keys:manage';

export const ALL_API_PERMISSIONS: ApiPermission[] = [
  'accounts:read',
  'accounts:verify',
  'entitlements:read',
  'google:profile:read',
  'github:profile:read',
  'aws:identity:read',
  'keys:read',
  'keys:manage',
];

export type ApiEnvironment = 'development' | 'production';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  emailVerified: boolean;
  onboardingStep: number;
  onboardingCompleted: boolean;
  timezone: string;
  dateFormat: string;
  themePreference: 'dark' | 'light';
  defaultPage: string;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: string;
}

export interface ConnectedAccount {
  id: string;
  workspaceId: string;
  provider: ProviderType;
  providerAccountId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  avatarUrl: string | null;
  status: AccountStatus;
  grantedScopes: string[];
  tokenExpiresAt: string | null;
  lastVerifiedAt: string | null;
  lastRefreshedAt: string | null;
  lastError: string | null;
  authorizedAt: string;
  createdAt: string;
  awsMeta?: {
    connectionMode: 'iam_role' | 'identity_center' | 'builder_id';
    awsAccountId: string | null;
    roleArn: string | null;
    externalIdPresent: boolean;
    region: string;
    accessPortalUrl: string | null;
    roleName: string | null;
    friendlyName: string | null;
  } | null;
  credentialSecurity?: {
    encryptedAtRest: boolean;
    algorithm: string;
    hasRefreshToken: boolean;
    keyConfigured: boolean;
  };
}

export interface EntitlementRecord {
  id: string;
  workspaceId: string;
  connectedAccountId: string | null;
  provider: CreditProviderType;
  accountLabel: string;
  entitlementType: string;
  category?: EntitlementCategory;
  availableAmount: string | null;
  limitValue?: number | null;
  usedValue?: number | null;
  unit?: string | null;
  resetPeriod?: 'minute' | 'hourly' | 'daily' | 'monthly' | 'one-time' | 'none' | null;
  currency: string | null;
  expiryDate: string | null;
  status: EntitlementStatus;
  source: EntitlementSource;
  verificationStatus: 'verified' | 'unverified' | 'unsupported';
  notes: string | null;
  lastCheckedAt: string;
}

export interface CreditPoolProviderBreakdown {
  provider: CreditProviderType;
  limit: number;
  used: number;
  remaining: number;
  entries: number;
}

export interface CreditPoolSummary {
  totalLimit: number;
  totalUsed: number;
  totalRemaining: number;
  percentUsed: number;
  activePoolCount: number;
  byProvider: CreditPoolProviderBreakdown[];
}

export interface GatewayKeyLimitStatus {
  id: string;
  name: string;
  keyPrefix: string;
  environment: ApiEnvironment;
  status: 'active' | 'revoked' | 'expired';
  limitPerMinute: number;
  usedInWindow: number;
  remainingInWindow: number;
  resetAt: string;
  totalRequests: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  allowedProviders: ProviderType[];
}

export interface ProviderLimitCapability {
  id: CreditProviderType;
  name: string;
  connectedAccounts: number;
  activeAccounts: number;
  autoSyncSupport: 'live_api' | 'partial_ttl' | 'manual_only' | 'unsupported';
  summary: string;
  verifiedMetrics: string[];
  manualTrackingHint: string;
}

export interface AiLimitsOverviewResponse {
  gatewayKeys: GatewayKeyLimitStatus[];
  providerCapabilities: ProviderLimitCapability[];
  entitlements: EntitlementRecord[];
  creditPool: CreditPoolSummary;
  summary: {
    activeGatewayKeys: number;
    totalGatewayCapacityPerMin: number;
    usedGatewayWindowRequests: number;
    verifiedCount: number;
    manualCount: number;
    expiringCount: number;
    unsupportedCount: number;
  };
}

export interface ApiKeySummary {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  environment: ApiEnvironment;
  keyPrefix: string;
  maskedKey: string;
  allowedProviders: ProviderType[];
  accountScope: 'all' | 'selected';
  allowedAccountIds: string[];
  permissions: ApiPermission[];
  rateLimitPerMinute: number;
  status: 'active' | 'revoked' | 'expired';
  expiresAt: string | null;
  lastUsedAt: string | null;
  requestCount: number;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  workspaceId: string;
  userId: string | null;
  actorLabel: string;
  eventType:
    | 'login'
    | 'logout'
    | 'account_connected'
    | 'account_disconnected'
    | 'account_verified'
    | 'token_refreshed'
    | 'authorization_failed'
    | 'api_key_created'
    | 'api_key_revoked'
    | 'api_key_rotated'
    | 'permission_changed'
    | 'entitlement_synced'
    | 'security_event';
  provider: ProviderType | 'system';
  resourceType: string;
  resourceId: string | null;
  action: string;
  result: 'success' | 'failure' | 'warning';
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  workspaceId: string;
  category:
    | 'auth_expired'
    | 'token_refresh_failed'
    | 'aws_access_denied'
    | 'entitlement_unavailable'
    | 'key_expiring'
    | 'api_error_rate'
    | 'security';
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  actionRoute: string | null;
  actionLabel: string | null;
  read: boolean;
  createdAt: string;
}

export interface UsageAnalyticsSummary {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageLatencyMs: number;
  byProvider: Array<{ provider: string; count: number; errors: number }>;
  byEndpoint: Array<{ endpoint: string; method: string; count: number; avgLatencyMs: number }>;
  byApiKey: Array<{ apiKeyId: string; keyName: string; count: number; lastUsedAt: string | null }>;
  timeline: Array<{ bucket: string; total: number; success: number; failed: number }>;
}

export interface ProviderConfigStatus {
  google: {
    configured: boolean;
    callbackUrls: string[];
  };
  github: {
    configured: boolean;
    callbackUrls: string[];
  };
  aws: {
    serverCredentialsConfigured: boolean;
    defaultRegion: string;
  };
  gemini: {
    serverKeyConfigured: boolean;
  };
  encryption: {
    persistentKeyConfigured: boolean;
  };
}
