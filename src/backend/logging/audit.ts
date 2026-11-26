import { getDb } from '../database/db.ts';
import { generateId } from '../security/crypto.ts';
import { redactSensitiveFields } from '../security/gatewayPolicy.ts';
import type { AuditLogEntry, NotificationItem, ProviderType } from '../../shared/types.ts';

export function recordAuditLog(params: {
  workspaceId: string;
  userId?: string | null;
  actorLabel: string;
  eventType: AuditLogEntry['eventType'];
  provider?: ProviderType | 'system';
  resourceType: string;
  resourceId?: string | null;
  action: string;
  result: 'success' | 'failure' | 'warning';
  metadata?: Record<string, unknown>;
}): void {
  const db = getDb();
  const safeMeta = params.metadata ? redactSensitiveFields(params.metadata) : {};
  db.prepare(`
    INSERT INTO audit_logs (
      id, workspace_id, user_id, actor_label, event_type, provider,
      resource_type, resource_id, action, result, metadata_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('aud'),
    params.workspaceId,
    params.userId ?? null,
    params.actorLabel,
    params.eventType,
    params.provider ?? 'system',
    params.resourceType,
    params.resourceId ?? null,
    params.action,
    params.result,
    JSON.stringify(safeMeta),
    new Date().toISOString()
  );
}

export function createNotification(params: {
  workspaceId: string;
  category: NotificationItem['category'];
  severity: NotificationItem['severity'];
  title: string;
  message: string;
  actionRoute?: string | null;
  actionLabel?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO notifications (
      id, workspace_id, category, severity, title, message,
      action_route, action_label, read, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    generateId('ntf'),
    params.workspaceId,
    params.category,
    params.severity,
    params.title,
    params.message,
    params.actionRoute ?? null,
    params.actionLabel ?? null,
    new Date().toISOString()
  );
}

export function recordSyncHistory(params: {
  workspaceId: string;
  connectedAccountId?: string | null;
  syncType: string;
  status: 'success' | 'failed' | 'partial';
  summary: string;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO sync_history (
      id, workspace_id, connected_account_id, sync_type, status, summary, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('syn'),
    params.workspaceId,
    params.connectedAccountId ?? null,
    params.syncType,
    params.status,
    params.summary,
    new Date().toISOString()
  );
}

export function recordApiUsageLog(params: {
  workspaceId: string;
  apiKeyId: string | null;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number;
  latencyMs: number;
  errorCode?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO api_usage_logs (
      id, workspace_id, api_key_id, provider, endpoint, method,
      status_code, latency_ms, error_code, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    generateId('usg'),
    params.workspaceId,
    params.apiKeyId,
    params.provider,
    params.endpoint,
    params.method,
    params.statusCode,
    Math.max(0, Math.round(params.latencyMs)),
    params.errorCode ?? null,
    new Date().toISOString()
  );
}
