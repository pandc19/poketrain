import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { chooseAiSource } from '@/lib/ai/user-provider';
import { keyHint } from '@/lib/ai/verify-key';
import { canStoreSecrets, decryptSecret, encryptSecret } from '@/lib/secret-box';

const env = (secret?: string) => ({ AI_KEY_SECRET: secret });
const SECRET = randomBytes(32).toString('base64');
const USER = '00000000-0000-7000-8000-0000000000aa';

describe('storing a key', () => {
  it('gets the key back for the same user', () => {
    const blob = encryptSecret('sk-ant-api03-abcdefghijklmnop', USER, env(SECRET));
    expect(decryptSecret(blob, USER, env(SECRET))).toBe('sk-ant-api03-abcdefghijklmnop');
  });

  it('does not keep the key readable, and never writes it the same way twice', () => {
    const a = encryptSecret('sk-the-key-itself-1234567890', USER, env(SECRET));
    const b = encryptSecret('sk-the-key-itself-1234567890', USER, env(SECRET));
    expect(a).not.toContain('the-key-itself');
    expect(a).not.toBe(b);
    expect(a.startsWith('v1.')).toBe(true);
  });

  it('does not decrypt for another user: a copied blob is useless', () => {
    const blob = encryptSecret('sk-secret-key-0000000000000', USER, env(SECRET));
    expect(decryptSecret(blob, '00000000-0000-7000-8000-0000000000bb', env(SECRET))).toBeNull();
  });

  it('does not decrypt if it was changed', () => {
    const [v, iv, tag, body] = encryptSecret('sk-secret-key-0000000000000', USER, env(SECRET)).split('.');
    const flipped = body.slice(0, -2) + (body.endsWith('AA') ? 'BB' : 'AA');
    expect(decryptSecret([v, iv, tag, flipped].join('.'), USER, env(SECRET))).toBeNull();
    expect(decryptSecret('v1.garbage', USER, env(SECRET))).toBeNull();
    expect(decryptSecret('', USER, env(SECRET))).toBeNull();
  });

  it('does not decrypt after the server secret changed (the user adds the key again)', () => {
    const blob = encryptSecret('sk-secret-key-0000000000000', USER, env(SECRET));
    expect(decryptSecret(blob, USER, env(randomBytes(32).toString('base64')))).toBeNull();
  });

  it('refuses to store anything without a good secret, instead of storing it badly', () => {
    expect(canStoreSecrets(env(undefined))).toBe(false);
    expect(canStoreSecrets(env(''))).toBe(false);
    expect(canStoreSecrets(env(randomBytes(16).toString('base64')))).toBe(false);
    expect(canStoreSecrets(env(SECRET))).toBe(true);
    expect(() => encryptSecret('sk-x', USER, env(undefined))).toThrow();
    expect(decryptSecret('v1.a.b.c', USER, env(undefined))).toBeNull();
  });

  it('shows only the last four characters', () => {
    expect(keyHint('sk-ant-api03-abcdefghijWXYZ')).toBe('WXYZ');
  });
});

describe('whose key pays', () => {
  it('uses the player’s own key before anything else', () => {
    expect(chooseAiSource({ hasOwnKey: true, aiEnabled: false, serverKey: false })).toBe('own');
    expect(chooseAiSource({ hasOwnKey: true, aiEnabled: true, serverKey: true })).toBe('own');
  });

  it('uses the server’s key only for an account the admin gave AI to, and only if the server has one', () => {
    expect(chooseAiSource({ hasOwnKey: false, aiEnabled: true, serverKey: true })).toBe('server');
    expect(chooseAiSource({ hasOwnKey: false, aiEnabled: true, serverKey: false })).toBeNull();
  });

  it('gives no AI otherwise, so nothing is charged to the server by chance', () => {
    expect(chooseAiSource({ hasOwnKey: false, aiEnabled: false, serverKey: true })).toBeNull();
    expect(chooseAiSource({ hasOwnKey: false, aiEnabled: false, serverKey: false })).toBeNull();
  });
});
