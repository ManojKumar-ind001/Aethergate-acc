export interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

export interface GitHubUserProfile {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  public_repos: number;
  followers: number;
  plan?: {
    name: string;
    space: number;
    private_repos: number;
    collaborators: number;
  };
}

export interface GitHubEmailEntry {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim());
}

export function buildGitHubAuthUrl(params: { redirectUri: string; state: string }): string {
  const query = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID!.trim(),
    redirect_uri: params.redirectUri,
    scope: 'read:user user:email',
    state: params.state,
    allow_signup: 'true',
  });
  return `https://github.com/login/oauth/authorize?${query.toString()}`;
}

export async function exchangeGitHubCode(params: {
  code: string;
  redirectUri: string;
}): Promise<GitHubTokenResponse> {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID!.trim(),
      client_secret: process.env.GITHUB_CLIENT_SECRET!.trim(),
      code: params.code,
      redirect_uri: params.redirectUri,
    }),
  });

  const json = (await resp.json()) as GitHubTokenResponse & {
    error?: string;
    error_description?: string;
  };
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `GitHub token exchange failed (${resp.status})`);
  }
  return json;
}

export interface GitHubRateLimitBucket {
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
}

export async function fetchGitHubUser(accessToken: string): Promise<{
  profile: GitHubUserProfile;
  primaryEmail: string | null;
  scopes: string[];
  rateLimit: GitHubRateLimitBucket | null;
}> {
  const userResp = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AccountBridge-Gateway/1.0',
    },
  });

  if (!userResp.ok) {
    throw new Error(`GitHub profile lookup failed (${userResp.status})`);
  }

  const scopeHeader = userResp.headers.get('x-oauth-scopes') || '';
  const scopes = scopeHeader
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const rlLimit = Number(userResp.headers.get('x-ratelimit-limit'));
  const rlRemaining = Number(userResp.headers.get('x-ratelimit-remaining'));
  const rlResetSec = Number(userResp.headers.get('x-ratelimit-reset'));
  const rateLimit: GitHubRateLimitBucket | null =
    Number.isFinite(rlLimit) && rlLimit > 0 && Number.isFinite(rlRemaining)
      ? {
          limit: rlLimit,
          used: Math.max(0, rlLimit - rlRemaining),
          remaining: rlRemaining,
          resetAt: Number.isFinite(rlResetSec) && rlResetSec > 0
            ? new Date(rlResetSec * 1000).toISOString()
            : new Date(Date.now() + 3600_000).toISOString(),
        }
      : null;

  const profile = (await userResp.json()) as GitHubUserProfile;

  let primaryEmail = profile.email;
  try {
    const emailResp = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AccountBridge-Gateway/1.0',
      },
    });
    if (emailResp.ok) {
      const emails = (await emailResp.json()) as GitHubEmailEntry[];
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      if (primary) primaryEmail = primary.email;
    }
  } catch {
    // Email scope may be absent; keep profile.email fallback
  }

  return { profile, primaryEmail, scopes, rateLimit };
}

export async function fetchGitHubRateLimit(accessToken: string): Promise<{
  core?: GitHubRateLimitBucket;
  search?: GitHubRateLimitBucket;
  graphql?: GitHubRateLimitBucket;
} | null> {
  const resp = await fetch('https://api.github.com/rate_limit', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'AccountBridge-Gateway/1.0',
    },
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as {
    resources?: Record<string, { limit: number; used: number; remaining: number; reset: number }>;
  };
  const mapBucket = (b?: { limit: number; used: number; remaining: number; reset: number }) =>
    b
      ? {
          limit: b.limit,
          used: b.used,
          remaining: b.remaining,
          resetAt: new Date(b.reset * 1000).toISOString(),
        }
      : undefined;

  return {
    core: mapBucket(json.resources?.core),
    search: mapBucket(json.resources?.search),
    graphql: mapBucket(json.resources?.graphql),
  };
}
