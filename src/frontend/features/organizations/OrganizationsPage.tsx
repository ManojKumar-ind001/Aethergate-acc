import { Building2, Shield, Users } from 'lucide-react';
import type { UserProfile, Workspace } from '../../../shared/types';

export function OrganizationsPage({
  user,
  workspace,
}: {
  user: UserProfile;
  workspace: Workspace;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--ab-text-primary)]">
              Organizations
            </h1>
            <span className="rounded border border-[#769AE8]/35 bg-[#769AE8]/10 px-2 py-0.5 text-[11px] font-medium text-[#769AE8]">
              Preview Roadmap
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--ab-text-secondary)]">
            Multi-team workspace hierarchy and role-based access control architecture.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-primary)] p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] text-[#769AE8] shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[var(--ab-text-primary)]">
              Current Active Workspace: {workspace.name}
            </h2>
            <p className="mt-1 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
              Your workspace is schema-isolated via <code className="font-mono">workspace_members</code> with owner role assigned to{' '}
              <span className="font-mono text-[var(--ab-text-primary)]">{user.email}</span>.
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 pt-2">
          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ab-text-primary)]">
              <Users className="w-4 h-4 text-[#769AE8]" />
              <span>Team Invitations (Planned)</span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
              Invite engineering members to share workspace provider vaults with scoped read/verify permissions.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--ab-border)] bg-[var(--ab-bg-secondary)] p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--ab-text-primary)]">
              <Shield className="w-4 h-4 text-[#64B58D]" />
              <span>SSO &amp; Policy Enforcement (Planned)</span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--ab-text-secondary)] leading-relaxed">
              Enforce organization-wide API key expiration policies and mandatory credential rotation intervals.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
