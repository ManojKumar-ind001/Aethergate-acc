import crypto from 'node:crypto';
import type { ApiEnvironment } from '../../shared/types.ts';

const SCRYPT_KEYLEN = 64;
const GCM_IV_LEN = 12;

let ephemeralFallbackKey: Buffer | null = null;

export function isPersistentEncryptionKeyConfigured(): boolean {
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim();
  return Boolean(raw && raw.length >= 16);
}

function getEncryptionKey(): Buffer {
  const raw = process.env.ENCRYPTION_MASTER_KEY?.trim();
  if (raw && raw.length >= 16) {
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, 'hex');
    }
    return crypto.scryptSync(raw, 'accountbridge-aes256-salt-v1', 32);
  }
  if (!ephemeralFallbackKey) {
    ephemeralFallbackKey = crypto.randomBytes(32);
  }
  return ephemeralFallbackKey;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, expectedHex] = parts;
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function encryptSecret(plaintext: string): {
  ciphertext: string;
  iv: string;
  authTag: string;
} {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(GCM_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

export function decryptSecret(payload: {
  ciphertext: string;
  iv: string;
  authTag: string;
}): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const authTag = Buffer.from(payload.authTag, 'base64');
  const ciphertext = Buffer.from(payload.ciphertext, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

export function generateMasterApiKey(environment: ApiEnvironment): {
  rawKey: string;
  keyPrefix: string;
  maskedKey: string;
  keyHash: string;
} {
  const prefixEnv = environment === 'production' ? 'ab_live_' : 'ab_test_';
  // 32 random bytes = 256 bits of cryptographic entropy
  const randomSecret = crypto.randomBytes(32).toString('base64url');
  const rawKey = `${prefixEnv}${randomSecret}`;
  const keyPrefix = rawKey.slice(0, 14);
  const maskedKey = `${rawKey.slice(0, 10)}••••••••••••••••`;
  const keyHash = hashApiKey(rawKey);
  return { rawKey, keyPrefix, maskedKey, keyHash };
}

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
}

export function generateSessionToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
  return { rawToken, tokenHash };
}

export function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier, 'utf8')
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

export function generateId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id.replace(/-/g, '')}` : id;
}
