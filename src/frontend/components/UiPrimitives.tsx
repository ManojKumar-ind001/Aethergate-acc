import { useCallback, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Info,
  X,
  XCircle,
} from 'lucide-react';
import type { AccountStatus, EntitlementStatus } from '../../shared/types';

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<ToastMessage, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast]
  );

  return { toasts, pushToast, dismissToast };
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 flex w-full max-w-sm flex-col gap-2 pointer-events-none"
      aria-live="polite"
    >
      <AnimatePresence initial={false}>
        {toasts.map((toast) => {
          const icon =
            toast.tone === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-[#30D158] shrink-0" />
            ) : toast.tone === 'error' ? (
              <XCircle className="w-4 h-4 text-[#FF453A] shrink-0" />
            ) : toast.tone === 'warning' ? (
              <AlertTriangle className="w-4 h-4 text-[#FF9F0A] shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-[#0A84FF] shrink-0" />
            );

          return (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              role="status"
              className="pointer-events-auto glass-elevated flex items-start gap-3 rounded-xl px-4 py-3"
            >
              <div className="mt-0.5">{icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--ab-text-primary)]">{toast.title}</p>
                {toast.description && (
                  <p className="mt-0.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Dismiss notification"
                className="text-[var(--ab-text-muted)] hover:text-[var(--ab-text-primary)] p-0.5 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function StatusBadge({
  status,
}: {
  status:
    | AccountStatus
    | EntitlementStatus
    | 'active'
    | 'revoked'
    | 'expired'
    | 'healthy'
    | 'degraded'
    | 'unconfigured'
    | 'success'
    | 'failure'
    | 'warning';
}) {
  const map: Record<string, { label: string; colorClass: string; icon: ReactNode }> = {
    connected: {
      label: 'Connected',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    VERIFIED: {
      label: 'Verified',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    ACTIVE: {
      label: 'Active',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    active: {
      label: 'Active',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    healthy: {
      label: 'Healthy',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    success: {
      label: 'Success',
      colorClass: 'text-[#30D158]',
      icon: <CheckCircle2 className="w-3.5 h-3.5" />,
    },
    reauth_required: {
      label: 'Reauth required',
      colorClass: 'text-[#FF9F0A]',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    EXPIRING: {
      label: 'Expiring',
      colorClass: 'text-[#FF9F0A]',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    degraded: {
      label: 'Attention',
      colorClass: 'text-[#FF9F0A]',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    warning: {
      label: 'Warning',
      colorClass: 'text-[#FF9F0A]',
      icon: <AlertTriangle className="w-3.5 h-3.5" />,
    },
    'MANUALLY ENTERED': {
      label: 'Manual entry',
      colorClass: 'text-[#0A84FF]',
      icon: <Info className="w-3.5 h-3.5" />,
    },
    expired: {
      label: 'Expired',
      colorClass: 'text-[#FF453A]',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    EXPIRED: {
      label: 'Expired',
      colorClass: 'text-[#FF453A]',
      icon: <AlertCircle className="w-3.5 h-3.5" />,
    },
    revoked: {
      label: 'Revoked',
      colorClass: 'text-[#FF453A]',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    verification_failed: {
      label: 'Verification failed',
      colorClass: 'text-[#FF453A]',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    failure: {
      label: 'Failed',
      colorClass: 'text-[#FF453A]',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    disconnected: {
      label: 'Disconnected',
      colorClass: 'text-[var(--ab-text-muted)]',
      icon: <XCircle className="w-3.5 h-3.5" />,
    },
    UNAVAILABLE: {
      label: 'Unavailable',
      colorClass: 'text-[var(--ab-text-secondary)]',
      icon: <Info className="w-3.5 h-3.5" />,
    },
    UNSUPPORTED: {
      label: 'Unsupported',
      colorClass: 'text-[var(--ab-text-muted)]',
      icon: <Info className="w-3.5 h-3.5" />,
    },
    unconfigured: {
      label: 'No accounts',
      colorClass: 'text-[var(--ab-text-muted)]',
      icon: <Info className="w-3.5 h-3.5" />,
    },
  };

  const entry = map[status] ?? {
    label: String(status),
    colorClass: 'text-[var(--ab-text-secondary)]',
    icon: <Info className="w-3.5 h-3.5" />,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${entry.colorClass}`}
    >
      {entry.icon}
      <span>{entry.label}</span>
    </span>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-2.5 py-1.5 text-xs font-medium text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)] hover:bg-[var(--ab-bg-elevated)] active:scale-[0.98] transition-all whitespace-nowrap shrink-0 ${className}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-[#30D158]" /> : <Copy className="w-3.5 h-3.5" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="glass-elevated w-full max-w-md rounded-2xl p-6"
          >
            <h3 id="confirm-dialog-title" className="text-base font-semibold text-[var(--ab-text-primary)]">
              {title}
            </h3>
            <p className="mt-2 text-sm text-[var(--ab-text-secondary)] leading-relaxed">{description}</p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] px-4 py-2 text-sm font-medium text-[var(--ab-text-secondary)] hover:text-[var(--ab-text-primary)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 active:scale-[0.98] transition-transform ${
                  danger ? 'bg-[#FF453A] hover:bg-[#e33b31]' : 'bg-[#0A84FF] hover:bg-[#0071e3]'
                }`}
              >
                {loading ? 'Processing...' : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="divide-y divide-[var(--ab-border)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-[var(--ab-bg-elevated)]" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-36 rounded bg-[var(--ab-bg-elevated)]" />
              <div className="h-3 w-48 rounded bg-[var(--ab-bg-secondary)]" />
            </div>
          </div>
          <div className="h-6 w-24 rounded bg-[var(--ab-bg-elevated)]" />
        </div>
      ))}
    </div>
  );
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return 'Unknown';
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}
