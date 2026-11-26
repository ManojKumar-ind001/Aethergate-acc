import { useState } from 'react';
import { CopyButton } from '../../components/UiPrimitives';

const DOC_SECTIONS = [
  { id: 'introduction', label: 'Introduction' },
  { id: 'external-tools', label: 'External AI Tools' },
  { id: 'authentication', label: 'Authentication' },
  { id: 'base-url', label: 'Base URL' },
  { id: 'openai-compat', label: 'OpenAI & Credits API' },
  { id: 'api-keys', label: 'API Keys' },
  { id: 'accounts', label: 'Accounts' },
  { id: 'google', label: 'Google' },
  { id: 'github', label: 'GitHub' },
  { id: 'aws', label: 'AWS' },
  { id: 'entitlements', label: 'Entitlements' },
  { id: 'errors', label: 'Error Codes' },
  { id: 'rate-limits', label: 'Rate Limits' },
  { id: 'examples', label: 'SDK Examples' },
] as const;

export function DocumentationPage() {
  const [activeId, setActiveId] = useState<string>('introduction');
  const [lang, setLang] = useState<'openai' | 'js' | 'python' | 'curl'>('openai');
  const host = typeof window !== 'undefined' ? window.location.origin : 'https://YOUR-AETHERGATE-HOST';

  const openaiExample = `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${host}/api/v1",
  apiKey: process.env.AETHERGATE_API_KEY
});

const completion = await client.chat.completions.create({
  model: "gemini-2.5-flash",
  messages: [{ role: "user", content: "Summarize my workspace limits." }]
});`;

  const jsExample = `const response = await fetch(
  "${host}/api/v1/credits/consume",
  {
    method: "POST",
    headers: {
      "Authorization": \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ provider: "kiro", amount: 1, toolName: "cursor" })
  }
);

const data = await response.json();`;

  const pythonExample = `from openai import OpenAI

client = OpenAI(
    base_url="${host}/api/v1",
    api_key="YOUR_MASTER_API_KEY"
)

resp = client.chat.completions.create(
    model="gemini-2.5-flash",
    messages=[{"role": "user", "content": "Hello AetherGate!"}]
)
print(resp.choices[0].message.content)`;

  const curlExample = `curl "${host}/api/v1/chat/completions" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"gemini-2.5-flash","messages":[{"role":"user","content":"Hello!"}],"consumeCredit":true}'`;

  const scrollTo = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(`doc-${id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const activeSnippet =
    lang === 'openai'
      ? openaiExample
      : lang === 'js'
      ? jsExample
      : lang === 'python'
      ? pythonExample
      : curlExample;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
          API Documentation
        </h1>
        <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
          Use AetherGate from Cursor, Cline, Continue, OpenAI SDKs, scripts, and internal tools via one Master API Key.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Left Navigation */}
        <aside className="lg:col-span-3">
          <nav className="sticky top-20 rounded-2xl glass-surface p-3 space-y-1">
            {DOC_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`block w-full text-left rounded-xl px-3 py-1.5 text-xs transition-colors ${
                  activeId === s.id
                    ? 'bg-[#0A84FF]/15 font-semibold text-[#0A84FF]'
                    : 'text-[var(--ab-text-secondary)] hover:bg-white/[0.04]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Center Content */}
        <div className="lg:col-span-7 space-y-6">
          <section id="doc-introduction" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">Introduction</h2>
            <p className="text-sm text-[var(--ab-text-secondary)] leading-relaxed">
              The AetherGate Unified API Gateway exposes your authorized Google, GitHub, and AWS identities alongside an OpenAI-compatible AI completion &amp; credit-pooling endpoint. Provider OAuth tokens remain encrypted at rest with AES-256-GCM and are never leaked to clients.
            </p>
          </section>

          <section id="doc-external-tools" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">External AI Tools (Cursor, Cline, Continue, OpenAI SDK)</h2>
            <p className="text-sm text-[var(--ab-text-secondary)] leading-relaxed">
              Point any OpenAI-compatible IDE extension or CLI agent to AetherGate by setting the Custom Base URL and pasting a Master API key generated in your workspace. CORS is enabled for browser and desktop clients.
            </p>
            <div className="grid gap-2.5 sm:grid-cols-2 text-xs">
              <div className="rounded-xl glass-subtle p-3.5 space-y-1">
                <div className="font-semibold text-[var(--ab-text-primary)]">Cursor / Cline / Continue</div>
                <div className="font-mono text-[11px] text-[#0A84FF] break-all">Base URL: {host}/api/v1</div>
                <div className="text-[var(--ab-text-muted)]">Provider: OpenAI Compatible · Model: gemini-2.5-flash</div>
              </div>
              <div className="rounded-xl glass-subtle p-3.5 space-y-1">
                <div className="font-semibold text-[var(--ab-text-primary)]">Auth Header</div>
                <div className="font-mono text-[11px] text-[#30D158]">Authorization: Bearer YOUR_KEY</div>
                <div className="text-[var(--ab-text-muted)]">Tracks rate limits &amp; optional credit deduction</div>
              </div>
            </div>
          </section>

          <section id="doc-authentication" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">Authentication</h2>
            <p className="text-sm text-[var(--ab-text-secondary)] leading-relaxed">
              All protected endpoints require a Master API Key passed in the HTTP <code className="font-mono text-[var(--ab-text-primary)]">Authorization</code> header using the Bearer scheme.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3.5 py-2.5">
              <code className="text-xs font-mono text-[#0A84FF]">Authorization: Bearer YOUR_MASTER_API_KEY</code>
              <CopyButton value="Authorization: Bearer YOUR_MASTER_API_KEY" label="Copy" />
            </div>
          </section>

          <section id="doc-base-url" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">Base URL</h2>
            <div className="flex items-center justify-between rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] px-3.5 py-2.5">
              <code className="text-xs font-mono text-[var(--ab-text-primary)]">{host}/api/v1</code>
              <CopyButton value={`${host}/api/v1`} label="Copy" />
            </div>
          </section>

          <section id="doc-openai-compat" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">OpenAI-Compatible &amp; Credit Pool Endpoints</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Execute completions backed server-side or deduct tracked credits atomically across Kiro, Gemini, Copilot, and login-tier tools.
            </p>
            <ul className="space-y-2 text-xs font-mono text-[var(--ab-text-secondary)]">
              <li><span className="text-[#30D158]">GET</span> /api/v1/models — List OpenAI-compatible gateway model IDs</li>
              <li><span className="text-[#0A84FF]">POST</span> /api/v1/chat/completions — OpenAI-compatible chat completion + optional credit deduction</li>
              <li><span className="text-[#0A84FF]">POST</span> /api/v1/credits/consume — Deduct 1+ credits from workspace AI credit pool</li>
            </ul>
          </section>

          <section id="doc-api-keys" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">API Keys &amp; Lifecycle</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">
              Read access requires <code className="font-mono">keys:read</code>; mutations require <code className="font-mono">keys:manage</code>.
            </p>
            <ul className="space-y-2 text-xs font-mono text-[var(--ab-text-secondary)]">
              <li><span className="text-[#30D158]">GET</span> /api/v1/keys — List workspace API key metadata</li>
              <li><span className="text-[#0A84FF]">POST</span> /api/v1/keys — Create a new scoped API key</li>
              <li><span className="text-[#0A84FF]">POST</span> /api/v1/keys/:id/rotate — Rotate and immediately revoke prior key</li>
              <li><span className="text-[#FF453A]">DELETE</span> /api/v1/keys/:id — Revoke key immediately</li>
            </ul>
          </section>

          <section id="doc-accounts" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">Accounts</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">Requires <code className="font-mono">accounts:read</code> or <code className="font-mono">accounts:verify</code>.</p>
            <ul className="space-y-2 text-xs font-mono text-[var(--ab-text-secondary)]">
              <li><span className="text-[#30D158]">GET</span> /api/v1/accounts — List permitted connected accounts</li>
              <li><span className="text-[#30D158]">GET</span> /api/v1/accounts/:id — Retrieve single account metadata</li>
              <li><span className="text-[#30D158]">GET</span> /api/v1/accounts/:id/status?verify=true — Live connection verification</li>
            </ul>
          </section>

          <section id="doc-google" className="rounded-2xl glass-surface p-6 space-y-2">
            <h2 className="text-lg font-semibold">Google</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">Requires <code className="font-mono">google:profile:read</code>.</p>
            <code className="block rounded-xl bg-[var(--ab-bg-base)] border border-[var(--ab-border)] p-3 text-xs font-mono">
              GET /api/v1/google/:accountId/profile
            </code>
          </section>

          <section id="doc-github" className="rounded-2xl glass-surface p-6 space-y-2">
            <h2 className="text-lg font-semibold">GitHub</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">Requires <code className="font-mono">github:profile:read</code>.</p>
            <code className="block rounded-xl bg-[var(--ab-bg-base)] border border-[var(--ab-border)] p-3 text-xs font-mono">
              GET /api/v1/github/:accountId/profile
            </code>
          </section>

          <section id="doc-aws" className="rounded-2xl glass-surface p-6 space-y-2">
            <h2 className="text-lg font-semibold">AWS</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">Requires <code className="font-mono">aws:identity:read</code>.</p>
            <code className="block rounded-xl bg-[var(--ab-bg-base)] border border-[var(--ab-border)] p-3 text-xs font-mono">
              GET /api/v1/aws/:accountId/identity
            </code>
          </section>

          <section id="doc-entitlements" className="rounded-2xl glass-surface p-6 space-y-2.5">
            <h2 className="text-lg font-semibold">AI Limits &amp; Entitlements</h2>
            <p className="text-xs text-[var(--ab-text-secondary)]">Requires <code className="font-mono">entitlements:read</code>.</p>
            <ul className="space-y-2 text-xs font-mono text-[var(--ab-text-secondary)]">
              <li><span className="text-[#30D158]">GET</span> /api/v1/limits — Live API key sliding-window rate limits + unified AI credit pool</li>
              <li><span className="text-[#30D158]">GET</span> /api/v1/entitlements — Raw provider entitlements &amp; manual records</li>
            </ul>
          </section>

          <section id="doc-errors" className="rounded-2xl glass-surface p-6 space-y-3">
            <h2 className="text-lg font-semibold">Error Codes</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--ab-border)] text-[var(--ab-text-muted)]">
                    <th className="py-2 pr-4">HTTP</th>
                    <th className="py-2 pr-4">Code</th>
                    <th className="py-2">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--ab-border)] font-mono">
                  <tr><td className="py-2 pr-4">401</td><td className="py-2 pr-4">API_KEY_REVOKED</td><td className="py-2 font-sans text-[var(--ab-text-secondary)]">Master key has been revoked.</td></tr>
                  <tr><td className="py-2 pr-4">403</td><td className="py-2 pr-4">INSUFFICIENT_PERMISSIONS</td><td className="py-2 font-sans text-[var(--ab-text-secondary)]">Missing required permission scope.</td></tr>
                  <tr><td className="py-2 pr-4">403</td><td className="py-2 pr-4">ACCOUNT_OUT_OF_SCOPE</td><td className="py-2 font-sans text-[var(--ab-text-secondary)]">Key is restricted to other accounts.</td></tr>
                  <tr><td className="py-2 pr-4">429</td><td className="py-2 pr-4">RATE_LIMIT_EXCEEDED</td><td className="py-2 font-sans text-[var(--ab-text-secondary)]">Per-minute request limit exceeded.</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="doc-rate-limits" className="rounded-2xl glass-surface p-6 space-y-2">
            <h2 className="text-lg font-semibold">Rate Limits</h2>
            <p className="text-sm text-[var(--ab-text-secondary)] leading-relaxed">
              Every response includes <code className="font-mono">X-RateLimit-Limit</code>, <code className="font-mono">X-RateLimit-Remaining</code>, and <code className="font-mono">X-RateLimit-Reset</code> headers enforced per Master API key.
            </p>
          </section>

          <section id="doc-examples" className="rounded-2xl glass-surface p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">SDK &amp; CLI Examples</h2>
              <div className="inline-flex rounded-xl glass-subtle p-0.5 text-xs">
                {(['openai', 'js', 'python', 'curl'] as const).map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    className={`rounded-lg px-2.5 py-1 font-medium ${
                      lang === l ? 'bg-[#0A84FF] text-white' : 'text-[var(--ab-text-secondary)]'
                    }`}
                  >
                    {l === 'openai' ? 'OpenAI SDK' : l === 'js' ? 'Fetch' : l === 'python' ? 'Python' : 'cURL'}
                  </button>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute right-3 top-3">
                <CopyButton value={activeSnippet} label="Copy" />
              </div>
              <pre className="overflow-x-auto rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-base)] p-4 text-xs font-mono text-[var(--ab-text-primary)] leading-relaxed">
                {activeSnippet}
              </pre>
            </div>
          </section>
        </div>

        {/* Right Table of Contents */}
        <aside className="hidden lg:block lg:col-span-2">
          <div className="sticky top-20 text-xs space-y-2 border-l border-[var(--ab-border)] pl-4">
            <div className="font-semibold text-[var(--ab-text-muted)] uppercase tracking-wider text-[11px]">
              On this page
            </div>
            {DOC_SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={`block text-left transition-colors ${
                  activeId === s.id
                    ? 'text-[#0A84FF] font-medium'
                    : 'text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
