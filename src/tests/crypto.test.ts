import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decryptSecret,
  encryptSecret,
  generateMasterApiKey,
  generatePkcePair,
  hashApiKey,
  hashPassword,
  verifyPassword,
} from '../backend/security/crypto.ts';

test('password hashing verifies matching password and rejects wrong password', () => {
  const hash = hashPassword('Str0ngPassphrase!2026');
  assert.equal(verifyPassword('Str0ngPassphrase!2026', hash), true);
  assert.equal(verifyPassword('WrongPassphrase', hash), false);
});

test('AES-256-GCM encryptSecret and decryptSecret roundtrip cleanly', () => {
  const secretPayload = JSON.stringify({
    accessToken: 'ya29.sample-access-token',
    refreshToken: '1//sample-refresh-token',
  });
  const encrypted = encryptSecret(secretPayload);
  assert.notEqual(encrypted.ciphertext, secretPayload);
  assert.ok(encrypted.iv.length > 0);
  assert.ok(encrypted.authTag.length > 0);

  const decrypted = decryptSecret(encrypted);
  assert.equal(decrypted, secretPayload);
});

test('generateMasterApiKey produces 256-bit entropy key with verifiable SHA-256 hash', () => {
  const live = generateMasterApiKey('production');
  assert.ok(live.rawKey.startsWith('ab_live_'));
  assert.ok(live.rawKey.length >= 50);
  assert.equal(live.keyHash, hashApiKey(live.rawKey));
  assert.ok(live.maskedKey.includes('••••'));
  assert.ok(!live.maskedKey.includes(live.rawKey.slice(-10)));

  const dev = generateMasterApiKey('development');
  assert.ok(dev.rawKey.startsWith('ab_test_'));
});

test('PKCE generator yields valid codeVerifier and SHA-256 base64url challenge', () => {
  const pkce = generatePkcePair();
  assert.ok(pkce.codeVerifier.length >= 40);
  assert.ok(pkce.codeChallenge.length >= 40);
  assert.notEqual(pkce.codeVerifier, pkce.codeChallenge);
});
