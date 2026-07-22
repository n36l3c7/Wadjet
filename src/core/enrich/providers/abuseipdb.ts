/**
 * AbuseIPDB provider (IP only).
 *
 * @see https://docs.abuseipdb.com/
 * @module
 */
import type { EnrichmentFact, EnrichmentProvider, ProviderParse } from '../types';
import { asRecord, numAt, strAt } from './util';

const API = 'https://api.abuseipdb.com/api/v2/check';

export const abuseIpdbProvider: EnrichmentProvider = {
  id: 'abuseipdb',
  label: 'AbuseIPDB',
  origin: 'https://api.abuseipdb.com/*',

  supports(type) {
    return type === 'ip';
  },

  buildRequest(indicator, _type, apiKey) {
    const url = `${API}?ipAddress=${encodeURIComponent(indicator)}&maxAgeInDays=90`;
    return { url, headers: { Key: apiKey, Accept: 'application/json' } };
  },

  parse(indicator, _type, status, body): ProviderParse {
    const link = `https://www.abuseipdb.com/check/${indicator}`;
    if (status === 401) {
      return { ok: false, summary: 'AbuseIPDB: invalid API key.', facts: [], link: null };
    }
    if (status === 429) {
      return { ok: false, summary: 'AbuseIPDB: rate limit exceeded.', facts: [], link: null };
    }
    if (status !== 200) {
      return { ok: false, summary: `AbuseIPDB: HTTP ${String(status)}.`, facts: [], link: null };
    }

    const data = asRecord(asRecord(body)?.data);
    const score = numAt(data, 'abuseConfidenceScore') ?? 0;
    const reports = numAt(data, 'totalReports') ?? 0;
    const facts: EnrichmentFact[] = [
      { label: 'Abuse score', value: `${String(score)}%` },
      { label: 'Reports (90d)', value: String(reports) },
    ];
    const country = strAt(data, 'countryCode');
    if (country !== null) facts.push({ label: 'Country', value: country });
    const isp = strAt(data, 'isp');
    if (isp !== null) facts.push({ label: 'ISP', value: isp });

    return {
      ok: true,
      summary: `Abuse confidence ${String(score)}% (${String(reports)} reports in 90 days).`,
      facts,
      link,
    };
  },
};
