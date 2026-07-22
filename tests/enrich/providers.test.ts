import { describe, expect, it } from 'vitest';
import { abuseIpdbProvider } from '../../src/core/enrich/providers/abuseipdb';
import { otxProvider } from '../../src/core/enrich/providers/otx';
import { virusTotalProvider } from '../../src/core/enrich/providers/virustotal';

describe('VirusTotal provider', () => {
  it('builds the domain endpoint with the api key header', () => {
    const request = virusTotalProvider.buildRequest('example.com', 'domain', 'KEY');
    expect(request.url).toBe('https://www.virustotal.com/api/v3/domains/example.com');
    expect(request.headers['x-apikey']).toBe('KEY');
  });

  it('summarizes analysis stats on 200', () => {
    const body = {
      data: {
        attributes: {
          last_analysis_stats: { malicious: 3, suspicious: 1, harmless: 80, undetected: 6 },
          reputation: -5,
        },
      },
    };
    const parsed = virusTotalProvider.parse('example.com', 'domain', 200, body);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toContain('3/90');
    expect(parsed.link).toContain('example.com');
    expect(parsed.severity).toBe('malicious');
  });

  it('flags an invalid key on 401', () => {
    expect(virusTotalProvider.parse('x', 'domain', 401, null).ok).toBe(false);
  });

  it('supports domain, ip, hash and url', () => {
    expect(virusTotalProvider.supports('url')).toBe(true);
    expect(virusTotalProvider.supports('hash')).toBe(true);
  });
});

describe('OTX provider', () => {
  it('counts pulses and lists names', () => {
    const body = {
      pulse_info: { count: 2, pulses: [{ name: 'Campaign A' }, { name: 'Campaign B' }] },
    };
    const parsed = otxProvider.parse('example.com', 'domain', 200, body);
    expect(parsed.summary).toContain('2 OTX');
    expect(parsed.facts.some((fact) => fact.value.includes('Campaign A'))).toBe(true);
    expect(parsed.severity).toBe('suspicious');
  });

  it('does not support url', () => {
    expect(otxProvider.supports('domain')).toBe(true);
    expect(otxProvider.supports('url')).toBe(false);
  });
});

describe('AbuseIPDB provider', () => {
  it('supports only ip', () => {
    expect(abuseIpdbProvider.supports('ip')).toBe(true);
    expect(abuseIpdbProvider.supports('domain')).toBe(false);
  });

  it('summarizes the abuse score', () => {
    const body = {
      data: { abuseConfidenceScore: 42, totalReports: 7, countryCode: 'US', isp: 'ExampleISP' },
    };
    const parsed = abuseIpdbProvider.parse('1.2.3.4', 'ip', 200, body);
    expect(parsed.summary).toContain('42%');
    expect(parsed.link).toContain('1.2.3.4');
    expect(parsed.severity).toBe('suspicious');
  });
});
