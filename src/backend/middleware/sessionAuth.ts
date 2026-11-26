import type { NextFunction, Request, Response } from 'express';
import { getDb } from '../database/db.ts';
import { hashToken } from '../security/crypto.ts';

export const SESSION_COOKIE_NAME = 'ab_session';

export interface AuthenticatedSession {
  sessionId: string;
  userId: string;
  workspaceId: string;
  email: string;
  fullName: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedSession;
    }
  }
}

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        result[k] = decodeURIComponent(v);
      } catch {
        result[k] = v;
      }
    }
  }
  return result;
}

export function setSessionCookie(req: Request, res: Response, rawToken: string, expiresAt: Date): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL?.startsWith('https://') ?? false);

  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', parts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    (process.env.APP_URL?.startsWith('https://') ?? false);

  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];
  if (isHttps) {
    parts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    parts.push('SameSite=Lax');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function isSameOriginMutationAllowed(req: Request): boolean {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return true;
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'AetherGate' || requestedWith === 'AccountBridge') return true;

  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string | undefined) || req.headers.host;
  if (!origin || !host) return false;
  try {
    const parsedOrigin = new URL(origin);
    return parsedOrigin.host === host;
  } catch {
    return false;
  }
}

export function resolveOptionalSession(req: Request): AuthenticatedSession | null {
  const authHeader = req.headers.authorization;
  let rawToken: string | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice('Bearer '.length).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    rawToken = cookies[SESSION_COOKIE_NAME];
  }

  if (!rawToken) return null;

  const db = getDb();
  const tokenHash = hashToken(rawToken);
  const row = db
    .prepare(`
      SELECT s.id as session_id, s.user_id, s.workspace_id, s.expires_at,
             u.email, u.full_name
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?
    `)
    .get(tokenHash) as
    | {
        session_id: string;
        user_id: string;
        workspace_id: string;
        expires_at: string;
        email: string;
        full_name: string;
      }
    | undefined;

  if (!row || new Date(row.expires_at).getTime() <= Date.now()) {
    if (row) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    }
    return null;
  }

  db.prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.session_id
  );

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    email: row.email,
    fullName: row.full_name,
  };
}

export function requireUserSession(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let rawToken: string | undefined;
  let viaCookie = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    rawToken = authHeader.slice('Bearer '.length).trim();
  } else {
    const cookies = parseCookies(req.headers.cookie);
    rawToken = cookies[SESSION_COOKIE_NAME];
    viaCookie = Boolean(rawToken);
  }

  if (!rawToken) {
    res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
    return;
  }

  if (viaCookie && !isSameOriginMutationAllowed(req)) {
    res.status(403).json({ error: 'CSRF validation failed', code: 'CSRF_FORBIDDEN' });
    return;
  }

  const session = resolveOptionalSession(req);
  if (!session) {
    res.status(401).json({ error: 'Session expired or invalid', code: 'SESSION_INVALID' });
    return;
  }

  req.auth = session;
  next();
}
