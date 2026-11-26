-- AccountBridge PostgreSQL Production Schema Migration (001_initial.sql)
-- Supports multi-tenant workspaces, AES-256-GCM encrypted provider credentials,
-- hashed master API keys, granular permissions, usage analytics, and audit logs.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token_hash TEXT,
  reset_token_hash TEXT,
  reset_token_expires_at TIMESTAMPTZ,
  onboarding_step INTEGER NOT NULL DEFAULT 1,
  onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  theme_preference TEXT NOT NULL DEFAULT 'dark',
  default_page TEXT NOT NULL DEFAULT 'overview',
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('google', 'github', 'aws', 'aws_builder_id', 'aws_identity_center')),
  provider_account_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  username TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('connected', 'reauth_required', 'expired', 'revoked', 'verification_failed', 'disconnected')),
  granted_scopes_json TEXT NOT NULL DEFAULT '[]',
  token_expires_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  last_error TEXT,
  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, provider, provider_account_id)
);

CREATE TABLE IF NOT EXISTS provider_credentials (
  id TEXT PRIMARY KEY,
  connected_account_id TEXT NOT NULL UNIQUE REFERENCES connected_accounts(id) ON DELETE CASCADE,
  encrypted_payload TEXT NOT NULL,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  algorithm TEXT NOT NULL DEFAULT 'aes-256-gcm',
  has_refresh_token BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS aws_connections (
  id TEXT PRIMARY KEY,
  connected_account_id TEXT NOT NULL UNIQUE REFERENCES connected_accounts(id) ON DELETE CASCADE,
  connection_mode TEXT NOT NULL CHECK (connection_mode IN ('iam_role', 'identity_center')),
  aws_account_id TEXT,
  role_arn TEXT,
  external_id_encrypted TEXT,
  external_id_iv TEXT,
  external_id_tag TEXT,
  region TEXT NOT NULL DEFAULT 'us-east-1',
  access_portal_url TEXT,
  role_name TEXT,
  friendly_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS entitlements (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connected_account_id TEXT REFERENCES connected_accounts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  account_label TEXT NOT NULL,
  entitlement_type TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'entitlement',
  available_amount TEXT,
  limit_value DOUBLE PRECISION,
  used_value DOUBLE PRECISION,
  unit TEXT,
  reset_period TEXT,
  currency TEXT,
  expiry_date TIMESTAMPTZ,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  notes TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  environment TEXT NOT NULL CHECK (environment IN ('development', 'production')),
  key_prefix TEXT NOT NULL,
  masked_key TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  allowed_providers_json TEXT NOT NULL DEFAULT '[]',
  account_scope TEXT NOT NULL CHECK (account_scope IN ('all', 'selected')),
  allowed_account_ids_json TEXT NOT NULL DEFAULT '[]',
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 60,
  status TEXT NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS api_key_permissions (
  id TEXT PRIMARY KEY,
  api_key_id TEXT NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  UNIQUE (api_key_id, permission)
);

CREATE TABLE IF NOT EXISTS api_usage_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  api_key_id TEXT REFERENCES api_keys(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure', 'warning')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  code_verifier TEXT,
  redirect_uri TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_route TEXT,
  action_label TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sync_history (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  connected_account_id TEXT REFERENCES connected_accounts(id) ON DELETE SET NULL,
  sync_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'partial')),
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_ws ON connected_accounts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_ws ON api_keys(workspace_id);
CREATE INDEX IF NOT EXISTS idx_api_usage_logs_ws_time ON api_usage_logs(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ws_time ON audit_logs(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_ws_read ON notifications(workspace_id, read);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
