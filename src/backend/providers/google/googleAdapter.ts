export interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

export interface GoogleUserInfo {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
}

export function isGoogleOAuthConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim());
}

export function buildGoogleAuthUrl(params: {
  redirectUri: string;
  state: string;
  codeChallenge: string;
}): string {
  const clientId = process.env.GOOGLE_CLIENT_ID!.trim();
  const query = new URLSearchParams({
    client_id: clientId,
    redirect_uri: params.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: 'true',
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${query.toString()}`;
}

export async function exchangeGoogleCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    code: params.code,
    code_verifier: params.codeVerifier,
    grant_type: 'authorization_code',
    redirect_uri: params.redirectUri,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const json = (await resp.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google token exchange failed (${resp.status})`);
  }
  return json;
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  if (!isGoogleOAuthConfigured()) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not configured');
  }
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await resp.json()) as GoogleTokenResponse & { error?: string; error_description?: string };
  if (!resp.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || `Google token refresh failed (${resp.status})`);
  }
  return json;
}

export async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const resp = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Google userinfo failed (${resp.status}): ${errText}`);
  }
  return (await resp.json()) as GoogleUserInfo;
}

export async function verifyGoogleTokenInfo(accessToken: string): Promise<{
  active: boolean;
  expiresIn?: number;
  scope?: string;
}> {
  const resp = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
  );
  if (!resp.ok) {
    return { active: false };
  }
  const data = (await resp.json()) as { expires_in?: string; scope?: string };
  return {
    active: true,
    expiresIn: data.expires_in ? Number(data.expires_in) : undefined,
    scope: data.scope,
  };
}
