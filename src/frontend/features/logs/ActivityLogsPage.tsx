import { useEffect, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { SkeletonRows, StatusBadge } from '../../components/UiPrimitives';
import { api } from '../../services/api';
import type { AuditLogEntry } from '../../../shared/types';

export function ActivityLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventType, setEventType] = useState('all');
  const [provider, setProvider] = useState('all');
  const [result, setResult] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    api
      .getAuditLogs({ eventType, provider, result, q: search })
      .then((res) => setLogs(res.logs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [eventType, provider, result, search]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
          Activity Logs
        </h1>
        <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
          Immutable workspace audit log with automatic secret redaction.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-[var(--ab-text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, event..."
            aria-label="Search audit logs"
            className="w-full rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] pl-9 pr-3 py-1.5 text-xs text-[var(--ab-text-primary)] focus:border-[#769AE8] focus:outline-none"
          />
        </div>

        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          aria-label="Filter by event type"
          className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-3 py-1.5 text-xs text-[var(--ab-text-primary)]"
        >
          <option value="all">All event types</option>
          <option value="login">Login</option>
          <option value="logout">Logout</option>
          <option value="account_connected">Account connected</option>
          <option value="account_disconnected">Account disconnected</option>
          <option value="account_verified">Account verified</option>
          <option value="token_refreshed">Token refreshed</option>
          <option value="authorization_failed">Authorization failed</option>
          <option value="api_key_created">API key created</option>
          <option value="api_key_revoked">API key revoked</option>
          <option value="api_key_rotated">API key rotated</option>
          <option value="permission_changed">Permission changed</option>
          <option value="entitlement_synced">Entitlement synced</option>
          <option value="security_event">Security event</option>
        </select>

        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          aria-label="Filter by provider"
          className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-3 py-1.5 text-xs text-[var(--ab-text-primary)]"
        >
          <option value="all">All providers</option>
          <option value="system">System</option>
          <option value="google">Google</option>
          <option value="github">GitHub</option>
          <option value="aws">AWS</option>
        </select>

        <select
          value={result}
          onChange={(e) => setResult(e.target.value)}
          aria-label="Filter by result"
          className="rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] px-3 py-1.5 text-xs text-[var(--ab-text-primary)]"
        >
          <option value="all">All results</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="failure">Failure</option>
        </select>
      </div>

      <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] overflow-hidden">
        {loading ? (
          <SkeletonRows rows={6} />
        ) : logs.length === 0 ? (
          <div className="p-10 text-center">
            <FileText className="w-8 h-8 text-[var(--ab-text-muted)] mx-auto mb-3" />
            <p className="text-sm font-semibold">No matching audit records</p>
            <p className="mt-1 text-xs text-[var(--ab-text-secondary)]">
              Try clearing your filters or perform actions in the console.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Event</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ab-border)] text-xs">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--ab-bg-secondary)]/60">
                    <td className="py-3 px-4 font-mono tabular-nums text-[var(--ab-text-secondary)] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--ab-text-primary)] whitespace-nowrap">
                      {log.actorLabel}
                    </td>
                    <td className="py-3 px-4 font-mono text-[var(--ab-text-secondary)] whitespace-nowrap">
                      {log.eventType}
                    </td>
                    <td className="py-3 px-4 text-[var(--ab-text-primary)] max-w-md">{log.action}</td>
                    <td className="py-3 px-4 font-mono text-[var(--ab-text-muted)] whitespace-nowrap">
                      {log.resourceType}
                      {log.resourceId ? `:${log.resourceId.slice(0, 12)}` : ''}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <StatusBadge status={log.result} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
