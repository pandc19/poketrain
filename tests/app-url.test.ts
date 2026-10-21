import { describe, expect, it } from 'vitest';
import { linkTo, originFrom } from '@/lib/app-url';

describe('the address links point to', () => {
  it('uses APP_URL when it is set, without a trailing slash', () => {
    expect(originFrom({ appUrl: 'https://poketrain.apps.example.com/', host: 'internal:3000', proto: 'http' })).toBe('https://poketrain.apps.example.com');
  });

  it('otherwise uses the address the admin used, with the proxy’s scheme', () => {
    expect(originFrom({ host: 'poketrain.apps.example.com', proto: 'https' })).toBe('https://poketrain.apps.example.com');
    expect(originFrom({ host: 'poketrain.apps.example.com', proto: 'https, http' })).toBe('https://poketrain.apps.example.com');
  });

  it('assumes https for a public host and http for a local one when no scheme is given', () => {
    expect(originFrom({ host: 'poketrain.apps.example.com' })).toBe('https://poketrain.apps.example.com');
    expect(originFrom({ host: 'localhost:3000' })).toBe('http://localhost:3000');
    expect(originFrom({ host: '192.168.1.20:3000' })).toBe('http://192.168.1.20:3000');
  });

  it('falls back to localhost with nothing to go on', () => {
    expect(originFrom({})).toBe('http://localhost:3000');
    expect(originFrom({ appUrl: '  ', host: '' })).toBe('http://localhost:3000');
  });

  it('builds a link with its parameter escaped', () => {
    expect(linkTo('https://x.test', '/register', { invite: 'abc-_123' })).toBe('https://x.test/register?invite=abc-_123');
    expect(linkTo('https://x.test', '/reset-password', { token: 'a b&c' })).toBe('https://x.test/reset-password?token=a+b%26c');
  });
});
