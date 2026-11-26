import { useEffect, useMemo, useState } from 'react';
import { BookOpen, KeyRound, Plus, Search, Settings, Users, X } from 'lucide-react';
import { ProviderIcon } from './BrandMark';
import type { ProviderType } from '../../shared/types';

export function CommandMenu({
  open,
  onClose,
  onNavigate,
  onOpenConnect,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (page: string) => void;
  onOpenConnect: (provider?: ProviderType) => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const actions = useMemo(
    () => [
      {
        id: 'accounts',
        label: 'Open Accounts',
        hint: 'Manage Google, GitHub, AWS & Builder ID identities',
        icon: <Users className="w-4 h-4 text-[#769AE8]" />,
        run: () => onNavigate('accounts'),
      },
      {
        id: 'entitlements',
        label: 'Open AI Limits & Quotas',
        hint: 'Inspect gateway rate limits, provider quotas, Kiro & credits',
        icon: <Plus className="w-4 h-4 text-[#64B58D]" />,
        run: () => onNavigate('entitlements'),
      },
      {
        id: 'api-keys',
        label: 'Open API Keys',
        hint: 'Generate, rotate, or revoke Master API keys',
        icon: <KeyRound className="w-4 h-4 text-[#769AE8]" />,
        run: () => onNavigate('api-keys'),
      },
      {
        id: 'connect-google',
        label: 'Connect Google',
        hint: 'Start Google OAuth 2.0 + PKCE connection',
        icon: <ProviderIcon provider="google" size={16} />,
        run: () => onOpenConnect('google'),
      },
      {
        id: 'connect-github',
        label: 'Connect GitHub',
        hint: 'Start GitHub OAuth identity connection',
        icon: <ProviderIcon provider="github" size={16} />,
        run: () => onOpenConnect('github'),
      },
      {
        id: 'connect-aws',
        label: 'Connect AWS / Builder ID',
        hint: 'Configure AWS IAM Role, Identity Center, or Builder ID',
        icon: <ProviderIcon provider="aws" size={16} />,
        run: () => onOpenConnect('aws'),
      },
      {
        id: 'documentation',
        label: 'Open Documentation',
        hint: 'Unified API Gateway endpoints & SDKs',
        icon: <BookOpen className="w-4 h-4 text-[#64B58D]" />,
        run: () => onNavigate('documentation'),
      },
      {
        id: 'settings',
        label: 'Open Settings',
        hint: 'Workspace, integrations, theme & ZIP export',
        icon: <Settings className="w-4 h-4 text-[var(--ab-text-secondary)]" />,
        run: () => onNavigate('settings'),
      },
      {
        id: 'playground',
        label: 'Open API Playground',
        hint: 'Run live gateway requests',
        icon: <Plus className="w-4 h-4 text-[#D4A65C]" />,
        run: () => onNavigate('api-playground'),
      },
    ],
    [onNavigate, onOpenConnect]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions.filter(
      (a) => a.label.toLowerCase().includes(q) || a.hint.toLowerCase().includes(q)
    );
  }, [actions, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        e.preventDefault();
        filtered[selectedIndex].run();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, selectedIndex, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 pt-20 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Command menu"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-[var(--ab-border)] px-4 py-3">
          <Search className="w-4 h-4 text-[var(--ab-text-muted)]" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex-1 bg-transparent text-sm text-[var(--ab-text-primary)] placeholder-[var(--ab-text-muted)] focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command menu"
            className="text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2 space-y-0.5">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--ab-text-muted)]">
              No matching commands found.
            </div>
          ) : (
            filtered.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  item.run();
                  onClose();
                }}
                className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  idx === selectedIndex
                    ? 'bg-[var(--ab-bg-elevated)] text-[var(--ab-text-primary)]'
                    : 'text-[var(--ab-text-secondary)] hover:bg-[var(--ab-bg-secondary)]'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--ab-text-primary)]">{item.label}</div>
                    <div className="text-[11px] text-[var(--ab-text-muted)] truncate">{item.hint}</div>
                  </div>
                </div>
                <span className="font-mono text-[10px] text-[var(--ab-text-muted)]">Enter</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
