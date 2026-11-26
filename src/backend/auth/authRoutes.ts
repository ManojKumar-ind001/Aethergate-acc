import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb } from '../database/db.ts';
import {
  generateId,
  generateSessionToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../security/crypto.ts';
import {
  clearSessionCookie,
  requireUserSession,
  resolveOptionalSession,
  setSessionCookie,
} from '../middleware/sessionAuth.ts';
import { recordAuditLog } from '../logging/audit.ts';
import type { UserProfile, Workspace } from '../../shared/types.ts';

export const authRouter = Router();

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  email_verified: number;
  onboarding_step: number;
  onboarding_completed: number;
  timezone: string;
  date_format: string;
  theme_preference: 'dark' | 'light';
  default_page: string;
  last_login_at: string | null;
  created_at: string;
}

function mapUser(row: UserRow): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    emailVerified: Boolean(row.email_verified),
    onboardingStep: row.onboarding_step,
    onboardingCompleted: Boolean(row.onboarding_completed),
    timezone: row.timezone,
    dateFormat: row.date_format,
    themePreference: row.theme_preference,
    defaultPage: row.default_page,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
  };
}

function getWorkspaceForUser(userId: string, workspaceId?: string): Workspace | null {
  const db = getDb();
  const row = db
    .prepare(`
      SELECT w.id, w.name, w.slug, w.owner_id, wm.role, w.created_at
      FROM workspaces w
      JOIN workspace_members wm ON wm.workspace_id = w.id
      WHERE wm.user_id = ? ${workspaceId ? 'AND w.id = ?' : ''}
      ORDER BY w.created_at ASC
      LIMIT 1
    `)
    .get(...(workspaceId ? [userId, workspaceId] : [userId])) as
    | { id: string; name: string; slug: string; owner_id: string; role: 'owner' | 'admin' | 'member'; created_at: string }
    | undefined;

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    ownerId: row.owner_id,
    role: row.role,
    createdAt: row.created_at,
  };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

authRouter.post('/register', (req, res) => {
  const { email, password, fullName } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
  };

  const normalizedEmail = (email || '').trim().toLowerCase();
  const trimmedName = (fullName || '').trim();

  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!trimmedName || trimmedName.length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    res.status(409).json({ error: 'An AetherGate account with this email already exists.' });
    return;
  }

  const userId = generateId('usr');
  const workspaceId = generateId('ws');
  const memberId = generateId('wm');
  const sessionId = generateId('ses');
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const passwordHash = hashPassword(password);
  const { rawToken, tokenHash } = generateSessionToken();
  const verificationToken = crypto.randomBytes(24).toString('base64url');
  const verificationHash = hashToken(verificationToken);

  const defaultWsName = `${trimmedName.split(' ')[0]}'s Infrastructure`;
  const slugBase = defaultWsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'workspace';

  const tx = db.transaction(() => {
    db.prepare(`
      INSERT INTO users (
        id, email, password_hash, full_name, email_verified, verification_token_hash,
        onboarding_step, onboarding_completed, timezone, date_format, theme_preference,
        default_page, last_login_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 0, ?, 1, 0, 'UTC', 'YYYY-MM-DD', 'dark', 'overview', ?, ?, ?)
    `).run(userId, normalizedEmail, passwordHash, trimmedName, verificationHash, nowIso, nowIso, nowIso);

    db.prepare(`
      INSERT INTO workspaces (id, name, slug, owner_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(workspaceId, defaultWsName, `${slugBase}-${workspaceId.slice(-4)}`, userId, nowIso, nowIso);

    db.prepare(`
      INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
      VALUES (?, ?, ?, 'owner', ?)
    `).run(memberId, workspaceId, userId, nowIso);

    db.prepare(`
      INSERT INTO sessions (id, user_id, workspace_id, token_hash, user_agent, ip_address, expires_at, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      userId,
      workspaceId,
      tokenHash,
      req.headers['user-agent'] || 'Unknown',
      req.ip || 'unknown',
      expiresAt.toISOString(),
      nowIso,
      nowIso
    );
  });

  tx();

  recordAuditLog({
    workspaceId,
    userId,
    actorLabel: normalizedEmail,
    eventType: 'login',
    provider: 'system',
    resourceType: 'user',
    resourceId: userId,
    action: 'Registered new AetherGate account and workspace',
    result: 'success',
  });

  setSessionCookie(req, res, rawToken, expiresAt);

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow;
  const workspace = getWorkspaceForUser(userId, workspaceId)!;

  res.status(201).json({
    token: rawToken,
    user: mapUser(userRow),
    workspace,
    verificationNotice: 'Account created. You can verify your email address in Settings or Onboarding.',
  });
});

authRouter.post('/login', (req, res) => {
  const { email, password } = req.body as { email?: string; password?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();

  if (!normalizedEmail || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const db = getDb();
  const userRow = db.prepare('SELECT * FROM users WHERE email = ?').get(normalizedEmail) as UserRow | undefined;

  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    if (userRow) {
      const ws = getWorkspaceForUser(userRow.id);
      if (ws) {
        recordAuditLog({
          workspaceId: ws.id,
          userId: userRow.id,
          actorLabel: normalizedEmail,
          eventType: 'security_event',
          provider: 'system',
          resourceType: 'session',
          action: 'Failed login attempt (invalid password)',
          result: 'failure',
        });
      }
    }
    res.status(401).json({ error: 'Invalid email address or password.' });
    return;
  }

  const workspace = getWorkspaceForUser(userRow.id);
  if (!workspace) {
    res.status(500).json({ error: 'User workspace not found.' });
    return;
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { rawToken, tokenHash } = generateSessionToken();
  const sessionId = generateId('ses');

  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(nowIso, nowIso, userRow.id);
  db.prepare(`
    INSERT INTO sessions (id, user_id, workspace_id, token_hash, user_agent, ip_address, expires_at, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    userRow.id,
    workspace.id,
    tokenHash,
    req.headers['user-agent'] || 'Unknown',
    req.ip || 'unknown',
    expiresAt.toISOString(),
    nowIso,
    nowIso
  );

  recordAuditLog({
    workspaceId: workspace.id,
    userId: userRow.id,
    actorLabel: userRow.email,
    eventType: 'login',
    provider: 'system',
    resourceType: 'session',
    resourceId: sessionId,
    action: 'Signed in to AetherGate console',
    result: 'success',
  });

  setSessionCookie(req, res, rawToken, expiresAt);
  const refreshedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userRow.id) as UserRow;
  res.json({
    token: rawToken,
    user: mapUser(refreshedUser),
    workspace,
  });
});

authRouter.post('/logout', requireUserSession, (req, res) => {
  const db = getDb();
  const auth = req.auth!;
  db.prepare('DELETE FROM sessions WHERE id = ?').run(auth.sessionId);

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'logout',
    provider: 'system',
    resourceType: 'session',
    resourceId: auth.sessionId,
    action: 'Signed out of AetherGate session',
    result: 'success',
  });

  clearSessionCookie(req, res);
  res.json({ ok: true });
});

authRouter.get('/session', (req, res) => {
  const auth = resolveOptionalSession(req);
  if (!auth) {
    res.json({ authenticated: false, user: null, workspace: null });
    return;
  }
  const db = getDb();
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.userId) as UserRow | undefined;
  const workspace = getWorkspaceForUser(auth.userId, auth.workspaceId);
  if (!userRow || !workspace) {
    res.json({ authenticated: false, user: null, workspace: null });
    return;
  }
  res.json({ authenticated: true, user: mapUser(userRow), workspace });
});

authRouter.get('/me', requireUserSession, (req, res) => {
  const db = getDb();
  const auth = req.auth!;
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.userId) as UserRow | undefined;
  const workspace = getWorkspaceForUser(auth.userId, auth.workspaceId);
  if (!userRow || !workspace) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }
  res.json({ user: mapUser(userRow), workspace });
});

authRouter.post('/onboarding', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { step, completed, workspaceName } = req.body as {
    step?: number;
    completed?: boolean;
    workspaceName?: string;
  };
  const db = getDb();
  const now = new Date().toISOString();

  if (typeof workspaceName === 'string' && workspaceName.trim().length >= 2) {
    const cleanName = workspaceName.trim().slice(0, 64);
    db.prepare('UPDATE workspaces SET name = ?, updated_at = ? WHERE id = ?').run(
      cleanName,
      now,
      auth.workspaceId
    );
  }

  const nextStep = typeof step === 'number' ? Math.max(1, Math.min(5, step)) : undefined;
  if (nextStep !== undefined && typeof completed === 'boolean') {
    db.prepare('UPDATE users SET onboarding_step = ?, onboarding_completed = ?, updated_at = ? WHERE id = ?').run(
      nextStep,
      completed ? 1 : 0,
      now,
      auth.userId
    );
  } else if (nextStep !== undefined) {
    db.prepare('UPDATE users SET onboarding_step = ?, updated_at = ? WHERE id = ?').run(
      nextStep,
      now,
      auth.userId
    );
  } else if (typeof completed === 'boolean') {
    db.prepare('UPDATE users SET onboarding_completed = ?, updated_at = ? WHERE id = ?').run(
      completed ? 1 : 0,
      now,
      auth.userId
    );
  }

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.userId) as UserRow;
  const workspace = getWorkspaceForUser(auth.userId, auth.workspaceId)!;
  res.json({ user: mapUser(userRow), workspace });
});

authRouter.post('/verify-email', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET email_verified = 1, verification_token_hash = NULL, updated_at = ? WHERE id = ?').run(
    now,
    auth.userId
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'security_event',
    provider: 'system',
    resourceType: 'user',
    resourceId: auth.userId,
    action: 'Confirmed AetherGate email verification',
    result: 'success',
  });

  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.userId) as UserRow;
  res.json({ user: mapUser(userRow) });
});

authRouter.post('/password-reset-request', (req, res) => {
  const { email } = req.body as { email?: string };
  const normalizedEmail = (email || '').trim().toLowerCase();
  if (!isValidEmail(normalizedEmail)) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }

  const db = getDb();
  const userRow = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail) as { id: string } | undefined;
  if (userRow) {
    const rawReset = crypto.randomBytes(24).toString('base64url');
    const resetHash = hashToken(rawReset);
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?').run(
      resetHash,
      expiresAt,
      userRow.id
    );
  }

  res.json({
    ok: true,
    message:
      'If an account exists for that email, a password reset token has been generated. Configure SMTP in production to deliver recovery links automatically.',
  });
});

authRouter.post('/change-password', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'Current password and a new password of at least 8 characters are required.' });
    return;
  }

  const db = getDb();
  const userRow = db.prepare('SELECT * FROM users WHERE id = ?').get(auth.userId) as UserRow | undefined;
  if (!userRow || !verifyPassword(currentPassword, userRow.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect.' });
    return;
  }

  const newHash = hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    newHash,
    new Date().toISOString(),
    auth.userId
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'security_event',
    provider: 'system',
    resourceType: 'user',
    resourceId: auth.userId,
    action: 'Updated AetherGate account password',
    result: 'success',
  });

  res.json({ ok: true });
});

authRouter.get('/sessions', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT id, user_agent, ip_address, expires_at, last_seen_at, created_at
      FROM sessions
      WHERE user_id = ? AND expires_at > ?
      ORDER BY last_seen_at DESC
    `)
    .all(auth.userId, new Date().toISOString()) as Array<{
    id: string;
    user_agent: string;
    ip_address: string;
    expires_at: string;
    last_seen_at: string;
    created_at: string;
  }>;

  res.json({
    sessions: rows.map((r) => ({
      id: r.id,
      userAgent: r.user_agent,
      ipAddress: r.ip_address,
      expiresAt: r.expires_at,
      lastSeenAt: r.last_seen_at,
      createdAt: r.created_at,
      current: r.id === auth.sessionId,
    })),
  });
});

authRouter.delete('/sessions/others', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const db = getDb();
  const info = db.prepare('DELETE FROM sessions WHERE user_id = ? AND id != ?').run(
    auth.userId,
    auth.sessionId
  );

  recordAuditLog({
    workspaceId: auth.workspaceId,
    userId: auth.userId,
    actorLabel: auth.email,
    eventType: 'security_event',
    provider: 'system',
    resourceType: 'session',
    action: `Revoked ${info.changes} other active session(s)`,
    result: 'success',
  });

  res.json({ ok: true, revokedCount: info.changes });
});

authRouter.delete('/account', requireUserSession, (req, res) => {
  const auth = req.auth!;
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: 'Password confirmation is required to delete your account.' });
    return;
  }

  const db = getDb();
  const userRow = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(auth.userId) as
    | { password_hash: string }
    | undefined;
  if (!userRow || !verifyPassword(password, userRow.password_hash)) {
    res.status(401).json({ error: 'Password verification failed.' });
    return;
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(auth.userId);
  clearSessionCookie(req, res);
  res.json({ ok: true });
});
