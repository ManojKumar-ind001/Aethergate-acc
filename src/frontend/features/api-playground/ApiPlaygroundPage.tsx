import { useState } from 'react';
import { Play, Send } from 'lucide-react';
import { CopyButton } from '../../components/UiPrimitives';
import type { ConnectedAccount } from '../../../shared/types';

interface EndpointPreset {
  group: string;
  label: string;
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: string;
}

export function ApiPlaygroundPage({ accounts }: { accounts: ConnectedAccount[] }) {
  const firstGoogle = accounts.find((a) => a.provider === 'google')?.id || '{accountId}';
  const firstGithub = accounts.find((a) => a.provider === 'github')?.id || '{accountId}';
  const firstAws = accounts.find((a) => a.provider.startsWith('aws'))?.id || '{accountId}';
  const firstAny = accounts[0]?.id || '{accountId}';

  const presets: EndpointPreset[] = [
    { group: 'Gateway', label: 'Health Check', method: 'GET', path: '/api/v1/health' },
    { group: 'AI Tools', label: 'OpenAI Models List', method: 'GET', path: '/api/v1/models' },
    {
      group: 'AI Tools',
      label: 'Chat Completions (OpenAI)',
      method: 'POST',
      path: '/api/v1/chat/completions',
      body: JSON.stringify(
        {
          model: 'gemini-2.5-flash',
          messages: [{ role: 'user', content: 'Say hello from AetherGate gateway!' }],
          consumeCredit: true,
          creditProvider: 'kiro',
          toolName: 'cursor',
        },
        null,
        2
      ),
    },
    {
      group: 'Credits',
      label: 'Consume AI Credit',
      method: 'POST',
      path: '/api/v1/credits/consume',
      body: JSON.stringify(
        {
          provider: 'kiro',
          amount: 1,
          toolName: 'cursor',
        },
        null,
        2
      ),
    },
    { group: 'Limits', label: 'AI Pool & Rate Limits', method: 'GET', path: '/api/v1/limits' },
    { group: 'Entitlements', label: 'List Entitlements', method: 'GET', path: '/api/v1/entitlements' },
    { group: 'Accounts', label: 'List Accounts', method: 'GET', path: '/api/v1/accounts' },
    { group: 'Accounts', label: 'Get Account', method: 'GET', path: `/api/v1/accounts/${firstAny}` },
    { group: 'Accounts', label: 'Account Status', method: 'GET', path: `/api/v1/accounts/${firstAny}/status` },
    { group: 'Google', label: 'Google Profile', method: 'GET', path: `/api/v1/google/${firstGoogle}/profile` },
    { group: 'GitHub', label: 'GitHub Profile', method: 'GET', path: `/api/v1/github/${firstGithub}/profile` },
    { group: 'AWS', label: 'AWS Identity', method: 'GET', path: `/api/v1/aws/${firstAws}/identity` },
    { group: 'Keys', label: 'List Gateway Keys', method: 'GET', path: '/api/v1/keys' },
  ];

  const [method, setMethod] = useState<'GET' | 'POST' | 'DELETE'>('GET');
  const [endpoint, setEndpoint] = useState('/api/v1/models');
  const [bearerKey, setBearerKey] = useState('');
  const [headersJson, setHeadersJson] = useState('{\n  "Accept": "application/json"\n}');
  const [bodyJson, setBodyJson] = useState('{\n  \n}');
  const [sending, setSending] = useState(false);
  const [rawView, setRawView] = useState(false);
  const [responseState, setResponseState] = useState<{
    status: number;
    durationMs: number;
    headers: Record<string, string>;
    bodyText: string;
    prettyJson: string;
  } | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  const sendRequest = async () => {
    setSending(true);
    setRequestError(null);
    const t0 = performance.now();
    try {
      let extraHeaders: Record<string, string> = {};
      if (headersJson.trim()) {
        extraHeaders = JSON.parse(headersJson) as Record<string, string>;
      }
      const headers = new Headers(extraHeaders);
      if (bearerKey.trim()) {
        headers.set('Authorization', `Bearer ${bearerKey.trim()}`);
      }
      if (method === 'POST' && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      const res = await fetch(endpoint, {
        method,
        headers,
        body: method === 'POST' ? bodyJson : undefined,
      });
      const durationMs = Math.round(performance.now() - t0);
      const bodyText = await res.text();
      let prettyJson = bodyText;
      try {
        prettyJson = JSON.stringify(JSON.parse(bodyText), null, 2);
      } catch {
        // Not JSON
      }
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        respHeaders[k] = v;
      });
      setResponseState({
        status: res.status,
        durationMs,
        headers: respHeaders,
        bodyText,
        prettyJson,
      });
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
          API Playground
        </h1>
        <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
          Test live OpenAI-compatible AI calls, credit pool consumption, and identity lookups against the AetherGate Gateway.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        {/* Left Collections */}
        <aside className="lg:col-span-3 rounded-2xl glass-surface p-3 space-y-3">
          <div className="px-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--ab-text-muted)]">
            Endpoint Collections
          </div>
          <div className="space-y-1">
            {presets.map((p) => (
              <button
                key={`${p.method}-${p.label}`}
                type="button"
                onClick={() => {
                  setMethod(p.method);
                  setEndpoint(p.path);
                  if (p.body) setBodyJson(p.body);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors ${
                  endpoint === p.path && method === p.method
                    ? 'bg-[#0A84FF]/15 text-[var(--ab-text-primary)] font-medium'
                    : 'text-[var(--ab-text-secondary)] hover:bg-white/[0.04]'
                }`}
              >
                <span className="truncate">{p.label}</span>
                <span className="font-mono text-[10px] text-[#0A84FF] shrink-0">{p.method}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* Center Request Builder + Right Response */}
        <div className="lg:col-span-9 space-y-4">
          <div className="rounded-2xl glass-surface p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as 'GET' | 'POST' | 'DELETE')}
                aria-label="HTTP Method"
                className="rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono font-semibold text-[#0A84FF]"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                aria-label="Endpoint Path"
                className="flex-1 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#0A84FF] focus:outline-none"
              />
              <button
                type="button"
                onClick={sendRequest}
                disabled={sending}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0A84FF] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3397ff] disabled:opacity-50 whitespace-nowrap"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{sending ? 'Sending...' : 'Send Request'}</span>
              </button>
            </div>

            <div>
              <label htmlFor="pg-bearer" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                Authorization: Bearer Master API Key
              </label>
              <input
                id="pg-bearer"
                type="password"
                value={bearerKey}
                onChange={(e) => setBearerKey(e.target.value)}
                placeholder="Paste your ab_live_... or ab_test_... Master API key"
                className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3 py-2 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#0A84FF] focus:outline-none"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label htmlFor="pg-headers" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  Request Headers (JSON)
                </label>
                <textarea
                  id="pg-headers"
                  rows={4}
                  value={headersJson}
                  onChange={(e) => setHeadersJson(e.target.value)}
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-2.5 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#0A84FF] focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="pg-body" className="block text-xs font-medium text-[var(--ab-text-secondary)] mb-1">
                  JSON Request Body
                </label>
                <textarea
                  id="pg-body"
                  rows={4}
                  value={bodyJson}
                  onChange={(e) => setBodyJson(e.target.value)}
                  disabled={method === 'GET'}
                  className="w-full rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-2.5 text-xs font-mono text-[var(--ab-text-primary)] focus:border-[#0A84FF] focus:outline-none disabled:opacity-45"
                />
              </div>
            </div>
          </div>

          {/* Response Viewer */}
          <div className="rounded-2xl glass-surface overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ab-border)] bg-black/15 dark:bg-white/[0.03] px-4 py-2.5">
              <div className="flex items-center gap-3 text-xs tabular-nums">
                <span className="font-semibold text-[var(--ab-text-primary)]">Response</span>
                {responseState && (
                  <>
                    <span
                      className={`font-mono font-semibold ${
                        responseState.status < 400 ? 'text-[#30D158]' : 'text-[#FF453A]'
                      }`}
                    >
                      Status: {responseState.status}
                    </span>
                    <span className="font-mono text-[var(--ab-text-muted)]">
                      {responseState.durationMs} ms
                    </span>
                  </>
                )}
              </div>
              {responseState && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setRawView((v) => !v)}
                    className="rounded-lg glass-subtle px-2.5 py-1 text-[11px] text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]"
                  >
                    {rawView ? 'Pretty JSON' : 'Raw'}
                  </button>
                  <CopyButton value={rawView ? responseState.bodyText : responseState.prettyJson} label="Copy" />
                </div>
              )}
            </div>

            {requestError && (
              <div className="p-4 text-xs text-[#FF453A]">{requestError}</div>
            )}

            {!responseState && !requestError ? (
              <div className="p-8 text-center text-xs text-[var(--ab-text-muted)]">
                <Play className="w-6 h-6 mx-auto mb-2 opacity-60" />
                Select an endpoint preset and click &ldquo;Send Request&rdquo; to execute a live gateway call.
              </div>
            ) : responseState ? (
              <div className="p-4 space-y-4">
                <pre className="max-h-80 overflow-auto rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-3.5 text-xs font-mono text-[var(--ab-text-primary)] leading-relaxed">
                  {rawView ? responseState.bodyText : responseState.prettyJson}
                </pre>
                <details className="text-xs">
                  <summary className="cursor-pointer text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)]">
                    Response Headers ({Object.keys(responseState.headers).length})
                  </summary>
                  <pre className="mt-2 rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-3 text-[11px] font-mono text-[var(--ab-text-secondary)] overflow-auto">
                    {JSON.stringify(responseState.headers, null, 2)}
                  </pre>
                </details>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
