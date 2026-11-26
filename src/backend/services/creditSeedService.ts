import { getDb } from '../database/db.ts';
import { generateId } from '../security/crypto.ts';
import {
  aggregateCreditPool,
  computeQuotaMetrics,
  selectCreditPoolTarget,
} from '../../shared/limitUtils.ts';
import { recordAuditLog } from '../logging/audit.ts';
import type {
  CreditPoolSummary,
  CreditProviderType,
  EntitlementCategory,
  EntitlementRecord,
  EntitlementStatus,
} from '../../shared/types.ts';

export interface LoginCreditBaseline {
  provider: CreditProviderType;
  entitlementType: string;
  category: EntitlementCategory;
  limitValue: number;
  unit: string;
  resetPeriod: NonNullable<EntitlementRecord['resetPeriod']>;
  notes: string;
}

export const LOGIN_CREDIT_BASELINES: LoginCreditBaseline[] = [
  {
    provider: 'kiro',
    entitlementType: 'Kiro AI Bonus Sign-Up Credits',
    category: 'ai_limit',
    limitValue: 500,
    unit: 'credits',
    resetPeriod: 'one-time',
    notes: 'Estimated Kiro onboarding bonus baseline (Manual Entry — update with your exact Kiro balance).',
  },
  {
    provider: 'kiro',
    entitlementType: 'Kiro AI Free Monthly Tier',
    category: 'ai_limit',
    limitValue: 50,
    unit: 'credits',
    resetPeriod: 'monthly',
    notes: 'Estimated Kiro monthly free tier baseline (Manual Entry — no public Kiro balance API).',
  },
  {
    provider: 'google',
    entitlementType: 'Google AI Studio / Gemini Free Tier',
    category: 'ai_limit',
    limitValue: 1500,
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'Estimated Gemini API free login tier baseline (Manual Entry — verify in Google AI Studio).',
  },
  {
    provider: 'github',
    entitlementType: 'GitHub Copilot Free Login Tier',
    category: 'ai_limit',
    limitValue: 50,
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Estimated GitHub Copilot Free monthly premium requests baseline (Manual Entry).',
  },
  {
    provider: 'aws_builder_id',
    entitlementType: 'Amazon Q Developer / Builder ID Free Tier',
    category: 'ai_limit',
    limitValue: 50,
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Estimated AWS Builder ID free tier baseline (Manual Entry — update from AWS portal).',
  },
  {
    provider: 'cursor',
    entitlementType: 'Cursor Hobby Login Tier',
    category: 'ai_limit',
    limitValue: 50,
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Estimated Cursor free login tier baseline (Manual Entry — no public balance API).',
  },
  {
    provider: 'windsurf',
    entitlementType: 'Windsurf Free Prompt Credits',
    category: 'ai_limit',
    limitValue: 25,
    unit: 'credits',
    resetPeriod: 'monthly',
    notes: 'Estimated Windsurf free login credit baseline (Manual Entry).',
  },
  {
    provider: 'openrouter',
    entitlementType: 'OpenRouter Free Models Daily Tier',
    category: 'ai_limit',
    limitValue: 50,
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'Estimated OpenRouter free daily baseline (Manual Entry).',
  },
  {
    provider: 'groq',
    entitlementType: 'Groq Developer Free Tier',
    category: 'ai_limit',
    limitValue: 14400,
    unit: 'requests/day',
    resetPeriod: 'daily',
    notes: 'Estimated Groq free tier daily request ceiling baseline (Manual Entry).',
  },
  {
    provider: 'huggingface',
    entitlementType: 'Hugging Face Free Inference Credits',
    category: 'ai_limit',
    limitValue: 100,
    unit: 'requests',
    resetPeriod: 'monthly',
    notes: 'Estimated Hugging Face free login inference baseline (Manual Entry).',
  },
];

export function mapEntitlementRow(r: Record<string, unknown>): EntitlementRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    connectedAccountId: (r.connected_account_id as string | null) ?? null,
    provider: r.provider as CreditProviderType,
    accountLabel: String(r.account_label),
    entitlementType: String(r.entitlement_type),
    category: (r.category as EntitlementCategory | undefined) || 'ai_limit',
    availableAmount: (r.available_amount as string | null) ?? null,
    limitValue: typeof r.limit_value === 'number' ? r.limit_value : null,
    usedValue: typeof r.used_value === 'number' ? r.used_value : null,
    unit: (r.unit as string | null) ?? null,
    resetPeriod: (r.reset_period as EntitlementRecord['resetPeriod']) ?? null,
    currency: (r.currency as string | null) ?? null,
    expiryDate: (r.expiry_date as string | null) ?? null,
    status: r.status as EntitlementStatus,
    source: r.source as EntitlementRecord['source'],
    verificationStatus: r.verification_status as EntitlementRecord['verificationStatus'],
    notes: (r.notes as string | null) ?? null,
    lastCheckedAt: String(r.last_checked_at),
  };
}

export function listWorkspaceEntitlements(workspaceId: string): EntitlementRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM entitlements WHERE workspace_id = ? ORDER BY last_checked_at DESC')
    .all(workspaceId) as Array<Record<string, unknown>>;
  return rows.map(mapEntitlementRow);
}

export function seedDefaultLoginAiCredits(
  workspaceId: string,
  accountLabel: string,
  options: { providerFilter?: CreditProviderType; connectedAccountId?: string | null } = {}
): number {
  const db = getDb();
  const now = new Date().toISOString();
  const cleanLabel = accountLabel.trim() || 'workspace@aethergate';
  const targets = options.providerFilter
    ? LOGIN_CREDIT_BASELINES.filter((b) => b.provider === options.providerFilter)
    : LOGIN_CREDIT_BASELINES;

  let added = 0;

  const existsStmt = db.prepare(
    `SELECT id FROM entitlements WHERE workspace_id = ? AND provider = ? AND entitlement_type = ? AND account_label = ?`
  );
  const insertStmt = db.prepare(`
    INSERT INTO entitlements (
      id, workspace_id, connected_account_id, provider, account_label,
      entitlement_type, category, available_amount, limit_value, used_value, unit, reset_period,
      currency, expiry_date, status, source, verification_status, notes, last_checked_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL, NULL, 'MANUALLY ENTERED', 'Manual Entry', 'unverified', ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const item of targets) {
      const existing = existsStmt.get(workspaceId, item.provider, item.entitlementType, cleanLabel);
      if (existing) continue;

      const availableText = `${item.limitValue} / ${item.limitValue} ${item.unit} left`;
      insertStmt.run(
        generateId('ent'),
        workspaceId,
        options.connectedAccountId ?? null,
        item.provider,
        cleanLabel,
        item.entitlementType,
        item.category,
        availableText,
        item.limitValue,
        item.unit,
        item.resetPeriod,
        item.notes,
        now
      );
      added++;
    }
  });

  tx();
  return added;
}

export function consumeCreditRecord(
  workspaceId: string,
  options: {
    entitlementId?: string;
    provider?: string;
    amount?: number;
    toolName?: string;
    actorLabel: string;
  }
): {
  consumed: number;
  updatedRecord: EntitlementRecord | null;
  creditPool: CreditPoolSummary;
} {
  const db = getDb();
  const all = listWorkspaceEntitlements(workspaceId);
  const target = selectCreditPoolTarget(all, {
    entitlementId: options.entitlementId,
    provider: options.provider,
  });

  const amount =
    typeof options.amount === 'number' && Number.isFinite(options.amount) && options.amount > 0
      ? Number(options.amount.toFixed(4))
      : 1;

  if (!target || typeof target.limitValue !== 'number') {
    return {
      consumed: 0,
      updatedRecord: null,
      creditPool: aggregateCreditPool(all),
    };
  }

  const currentUsed = target.usedValue ?? 0;
  const remaining = Math.max(0, Number((target.limitValue - currentUsed).toFixed(4)));
  const applied = Math.min(amount, remaining);
  const nextUsed = Number((currentUsed + applied).toFixed(4));
  const metrics = computeQuotaMetrics(target.limitValue, nextUsed);
  const unitLabel = target.unit || target.currency || '';
  const nextAvailable = `${metrics.remaining} / ${metrics.limit}${unitLabel ? ` ${unitLabel}` : ''} left`;
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE entitlements
    SET used_value = ?, available_amount = ?, last_checked_at = ?
    WHERE id = ? AND workspace_id = ?
  `).run(nextUsed, nextAvailable, now, target.id, workspaceId);

  const auditProv = ['google', 'github', 'aws', 'aws_builder_id', 'aws_identity_center'].includes(
    target.provider
  )
    ? (target.provider as 'google' | 'github' | 'aws' | 'aws_builder_id' | 'aws_identity_center')
    : 'system';

  recordAuditLog({
    workspaceId,
    actorLabel: options.actorLabel,
    eventType: 'entitlement_synced',
    provider: auditProv,
    resourceType: 'credit_pool',
    resourceId: target.id,
    action: `Consumed ${applied} ${unitLabel || 'credits'} from ${target.entitlementType}${
      options.toolName ? ` via ${options.toolName}` : ''
    }`,
    result: 'success',
    metadata: {
      entitlementId: target.id,
      provider: target.provider,
      consumed: applied,
      remaining: metrics.remaining,
      toolName: options.toolName || null,
    },
  });

  const refreshedList = listWorkspaceEntitlements(workspaceId);
  const updatedRecord = refreshedList.find((e) => e.id === target.id) ?? null;

  return {
    consumed: applied,
    updatedRecord,
    creditPool: aggregateCreditPool(refreshedList),
  };
}
