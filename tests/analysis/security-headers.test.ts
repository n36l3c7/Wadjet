import { describe, expect, it } from 'vitest';
import { analyzeSecurityHeaders } from '../../src/core/analysis/security-headers';

describe('analyzeSecurityHeaders', () => {
  it('reports present and missing headers', () => {
    const findings = analyzeSecurityHeaders([
      { name: 'content-security-policy', value: "default-src 'self'" },
      { name: 'Strict-Transport-Security', value: 'max-age=31536000' },
      { name: 'X-Content-Type-Options', value: 'nosniff' },
    ]);
    const byHeader = (header: string) => findings.find((finding) => finding.header === header);
    expect(byHeader('Content-Security-Policy')?.status).toBe('present');
    expect(byHeader('Strict-Transport-Security')?.status).toBe('present');
    expect(byHeader('X-Content-Type-Options')?.status).toBe('present');
    expect(byHeader('X-Frame-Options')?.status).toBe('missing');
  });

  it('flags weak HSTS when max-age is zero', () => {
    const findings = analyzeSecurityHeaders([
      { name: 'strict-transport-security', value: 'max-age=0' },
    ]);
    expect(findings.find((finding) => finding.header === 'Strict-Transport-Security')?.status).toBe(
      'weak',
    );
  });

  it('matches header names case-insensitively', () => {
    const findings = analyzeSecurityHeaders([{ name: 'REFERRER-POLICY', value: 'no-referrer' }]);
    expect(findings.find((finding) => finding.header === 'Referrer-Policy')?.status).toBe(
      'present',
    );
  });

  it('always returns a finding for every curated header', () => {
    const findings = analyzeSecurityHeaders([]);
    expect(findings).toHaveLength(9);
    expect(findings.every((finding) => finding.status === 'missing')).toBe(true);
    expect(findings.every((finding) => finding.detail.length > 0)).toBe(true);
  });
});
