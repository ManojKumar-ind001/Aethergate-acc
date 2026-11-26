import crypto from 'node:crypto';
import { AI_KEY_PROVIDERS, type AiKeyProviderOption } from '../../../shared/types.ts';

export type AiKeyProviderId = AiKeyProviderOption['id'];

export interface VerifiedAiKey {
  providerAccountId: string;
  displayName: string;
  email: string | null;
  username: string | null;
  limitValue: number | null;
  usedValue: number | null;
  unit: string | null;
  resetPeriod: 'monthly' | 'daily' | null;
  notes: string;
}

const PROVIDER_IDS = new Set<string>(AI_KEY_PROVIDERS.map((p) => p.id));

export function isAiKeyProvider(provider: string): provider is AiKeyProviderId {
  return PROVIDER_IDS.has(provider);
}

export function normalizeAiBaseUrl(raw: string | undefined, fallback: string): string {
  const value = (raw || fallback).trim();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Enter a valid base URL, for example http://localhost:3001');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Base URL must start with http:// or https://');
  }
  const host = url.hostname.toLowerCase();
  if (host === '169.254.169.254' || host === 'metadata.google.internal') {
    throw new Error('That base URL is not allowed.');
  }
  return url.origin;
}

function keyFingerprint(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 12);
}

function accountIdentity(email: string | undefined, fallback: string): string {
  const clean = (email || '').trim().toLowerCase();
  if (clean && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return clean;
  return fallback;
}

async function readJson(url: string, apiKey: string): Promise<{ status: number; json: Record<string, unknown> }> {
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
  });
  const text = await resp.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = { raw: text.slice(0, 240) };
    }
  }
  return { status: resp.status, json };
}

function rejectIfUnauthorized(status: number, providerName: string, json: Record<string, unknown>): void {
  if (status === 401 || status === 403) {
    const message = typeof json.error === 'string' ? json.error : `${providerName} rejected this API key.`;
    throw new Error(message);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`${providerName} check failed (${status}).`);
  }
}

export async function verifyAiKey(params: {
  provider: AiKeyProviderId;
  apiKey: string;
  email?: string;
  baseUrl?: string;
}): Promise<VerifiedAiKey> {
  const apiKey = params.apiKey.trim();
  if (apiKey.length < 8) {
    throw new Error('API key looks too short.');
  }
  const option = AI_KEY_PROVIDERS.find((p) => p.id === params.provider);
  if (!option) throw new Error('Unsupported AI provider.');

  if (params.provider === 'huggingface') {
    const { status, json } = await readJson('https://huggingface.co/api/whoami-v2', apiKey);
    rejectIfUnauthorized(status, 'Hugging Face', json);
    const username = typeof json.name === 'string' ? json.name : null;
    const email = typeof json.email === 'string' ? json.email : params.email || null;
    const fullname = typeof json.fullname === 'string' ? json.fullname : null;
    const id = accountIdentity(email || undefined, username || `hf-${keyFingerprint(apiKey)}`);
    return {
      providerAccountId: id,
      displayName: fullname || username || id,
      email,
      username,
      limitValue: null,
      usedValue: null,
      unit: null,
      resetPeriod: null,
      notes: 'Hugging Face token verified with whoami. Inference quota is not exposed by this API.',
    };
  }

  if (params.provider === 'openrouter') {
    const { status, json } = await readJson('https://openrouter.ai/api/v1/key', apiKey);
    rejectIfUnauthorized(status, 'OpenRouter', json);
    const data = (json.data as Record<string, unknown> | undefined) || json;
    const label = typeof data.label === 'string' ? data.label : null;
    const limit = typeof data.limit === 'number' ? data.limit : null;
    const used = typeof data.usage === 'number' ? data.usage : null;
    const email = params.email?.trim().toLowerCase() || null;
    const id = accountIdentity(email || undefined, label || `or-${keyFingerprint(apiKey)}`);
    return {
      providerAccountId: id,
      displayName: label || email || 'OpenRouter',
      email,
      username: label,
      limitValue: limit,
      usedValue: used,
      unit: limit !== null ? 'USD' : null,
      resetPeriod: limit !== null ? 'monthly' : null,
      notes:
        limit !== null
          ? 'Usage and limit returned by OpenRouter /api/v1/key.'
          : 'OpenRouter key verified. This key has no numeric credit limit in the API response.',
    };
  }

  if (params.provider === 'freellmapi') {
    const origin = normalizeAiBaseUrl(params.baseUrl, option.defaultBaseUrl || 'http://localhost:3001');
    const { status, json } = await readJson(`${origin}/v1/models`, apiKey);
    rejectIfUnauthorized(status, 'FreeLLMAPI', json);
    const models = Array.isArray(json.data) ? json.data.length : 0;
    const email = params.email?.trim().toLowerCase() || null;
    const id = accountIdentity(email || undefined, `freellmapi-${keyFingerprint(apiKey)}`);
    return {
      providerAccountId: id,
      displayName: email || `FreeLLMAPI (${origin})`,
      email,
      username: origin,
      limitValue: null,
      usedValue: null,
      unit: null,
      resetPeriod: null,
      notes: `FreeLLMAPI at ${origin} accepted the key${models ? ` and listed ${models} models` : ''}. Token budget is the sum of the provider keys you add there, not a balance granted by AetherGate.`,
    };
  }

  const modelUrls: Record<Exclude<AiKeyProviderId, 'huggingface' | 'openrouter' | 'freellmapi'>, string> = {
    groq: 'https://api.groq.com/openai/v1/models',
    cerebras: 'https://api.cerebras.ai/v1/models',
    mistral: 'https://api.mistral.ai/v1/models',
    cohere: 'https://api.cohere.com/v1/models',
    nvidia: 'https://integrate.api.nvidia.com/v1/models',
  };
  const { status, json } = await readJson(modelUrls[params.provider], apiKey);
  rejectIfUnauthorized(status, option.name, json);
  const email = params.email?.trim().toLowerCase() || null;
  const id = accountIdentity(email || undefined, `${params.provider}-${keyFingerprint(apiKey)}`);
  return {
    providerAccountId: id,
    displayName: email || option.name,
    email,
    username: null,
    limitValue: null,
    usedValue: null,
    unit: null,
    resetPeriod: null,
    notes: `${option.name} accepted this API key. The models endpoint does not return a remaining free-tier balance.`,
  };
}
