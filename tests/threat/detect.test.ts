import { describe, expect, it } from 'vitest';
import {
  detectClickFix,
  detectPhishing,
  detectThreats,
  shouldWarn,
} from '../../src/core/threat/detect';
import type { PageContext } from '../../src/core/threat/types';

function ctx(overrides: Partial<PageContext> = {}): PageContext {
  return {
    url: 'https://example.com/',
    hostname: 'example.com',
    scheme: 'https:',
    title: 'Example',
    text: 'Welcome to the example site.',
    hasPasswordField: false,
    credentialFormActions: [],
    ...overrides,
  };
}

function ids(signals: ReturnType<typeof detectThreats>): string[] {
  return signals.map((signal) => signal.id);
}

describe('detectPhishing', () => {
  it('finds nothing on a benign page', () => {
    expect(detectPhishing(ctx())).toEqual([]);
    expect(shouldWarn(detectThreats(ctx()))).toBe(false);
  });

  it('flags a punycode (IDN) hostname', () => {
    const signals = detectPhishing(ctx({ hostname: 'xn--pple-43d.com' }));
    expect(ids(signals)).toContain('idn-homograph');
    expect(signals[0]?.severity).toBe('warn');
  });

  it('flags a password form that posts to another origin as high', () => {
    const signals = detectPhishing(
      ctx({
        url: 'https://login.example.com/',
        hostname: 'login.example.com',
        hasPasswordField: true,
        credentialFormActions: ['https://evil.tld/collect'],
      }),
    );
    const cross = signals.find((s) => s.id === 'credential-cross-origin');
    expect(cross?.severity).toBe('high');
    expect(cross?.explanation).toContain('https://evil.tld');
  });

  it('does not flag a same-origin credential form', () => {
    const signals = detectPhishing(
      ctx({ hasPasswordField: true, credentialFormActions: ['https://example.com/login'] }),
    );
    expect(ids(signals)).not.toContain('credential-cross-origin');
  });

  it('flags a password field over http and on a raw IP', () => {
    const signals = detectPhishing(
      ctx({
        url: 'http://203.0.113.5/',
        hostname: '203.0.113.5',
        scheme: 'http:',
        hasPasswordField: true,
      }),
    );
    expect(ids(signals)).toEqual(expect.arrayContaining(['insecure-credentials', 'ip-host-login']));
  });

  it('flags brand impersonation with credentials as high', () => {
    const signals = detectPhishing(
      ctx({
        hostname: 'paypal-secure-login.tld',
        title: 'Sign in to your PayPal account',
        text: 'Enter your PayPal password to continue.',
        hasPasswordField: true,
      }),
    );
    const brand = signals.find((s) => s.id === 'brand-mismatch');
    expect(brand?.severity).toBe('high');
    expect(brand?.explanation).toContain('PayPal');
  });

  it('does not flag a brand on its official domain', () => {
    const signals = detectPhishing(
      ctx({
        hostname: 'www.paypal.com',
        title: 'PayPal',
        text: 'Log in to PayPal',
        hasPasswordField: true,
      }),
    );
    expect(ids(signals)).not.toContain('brand-mismatch');
  });
});

describe('detectClickFix', () => {
  it('flags run-command instructions (key combo + shell) as high', () => {
    const signals = detectClickFix(
      ctx({
        text: 'Verify you are human: press Windows + R, then paste and run this in PowerShell.',
      }),
    );
    expect(ids(signals)).toEqual(['clickfix-run-command']);
    expect(signals[0]?.severity).toBe('high');
  });

  it('flags a fake verification with paste steps as warn', () => {
    const signals = detectClickFix(
      ctx({
        text: 'Human verification required. To confirm you are not a robot, paste the text and press Enter.',
      }),
    );
    expect(ids(signals)).toEqual(['clickfix-fake-verification']);
    expect(signals[0]?.severity).toBe('warn');
  });

  it('ignores an ordinary page mentioning a terminal', () => {
    const signals = detectClickFix(
      ctx({ text: 'Our terminal emulator tutorial explains basic commands.' }),
    );
    expect(signals).toEqual([]);
  });
});
