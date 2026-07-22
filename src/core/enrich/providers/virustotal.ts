/**
 * VirusTotal v3 provider (domain / IP / hash / URL).
 *
 * @see https://docs.virustotal.com/reference/overview
 * @module
 */
import type { IndicatorType } from '../indicator';
import type { EnrichmentFact, EnrichmentProvider, ProviderParse } from '../types';
import { asRecord, numAt, strAt } from './util';

const API = 'https://www.virustotal.com/api/v3';
const GUI = 'https://www.virustotal.com/gui';

function urlId(url: string): string {
  return btoa(url).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function guiLink(type: IndicatorType, indicator: string): string {
  switch (type) {
    case 'domain':
      return `${GUI}/domain/${indicator}`;
    case 'ip':
      return `${GUI}/ip-address/${indicator}`;
    case 'hash':
      return `${GUI}/file/${indicator}`;
    case 'url':
      return `${GUI}/url/${urlId(indicator)}`;
  }
}

export const virusTotalProvider: EnrichmentProvider = {
  id: 'virustotal',
  label: 'VirusTotal',
  origin: 'https://www.virustotal.com/*',

  supports(type) {
    return type === 'domain' || type === 'ip' || type === 'hash' || type === 'url';
  },

  buildRequest(indicator, type, apiKey) {
    const path =
      type === 'domain'
        ? `domains/${indicator}`
        : type === 'ip'
          ? `ip_addresses/${indicator}`
          : type === 'hash'
            ? `files/${indicator}`
            : `urls/${urlId(indicator)}`;
    return { url: `${API}/${path}`, headers: { 'x-apikey': apiKey } };
  },

  parse(indicator, type, status, body): ProviderParse {
    const link = guiLink(type, indicator);
    if (status === 401) {
      return { ok: false, summary: 'VirusTotal: invalid API key.', facts: [], link: null };
    }
    if (status === 404) {
      return { ok: true, summary: 'Not found in VirusTotal.', facts: [], link };
    }
    if (status === 429) {
      return { ok: false, summary: 'VirusTotal: rate limit exceeded.', facts: [], link: null };
    }
    if (status !== 200) {
      return { ok: false, summary: `VirusTotal: HTTP ${String(status)}.`, facts: [], link: null };
    }

    const attributes = asRecord(asRecord(asRecord(body)?.data)?.attributes);
    const stats = asRecord(attributes?.last_analysis_stats);
    const malicious = numAt(stats, 'malicious') ?? 0;
    const suspicious = numAt(stats, 'suspicious') ?? 0;
    const harmless = numAt(stats, 'harmless') ?? 0;
    const undetected = numAt(stats, 'undetected') ?? 0;
    const total = malicious + suspicious + harmless + undetected;

    const facts: EnrichmentFact[] = [
      { label: 'Malicious', value: `${String(malicious)} / ${String(total)}` },
      { label: 'Suspicious', value: String(suspicious) },
    ];
    const reputation = numAt(attributes, 'reputation');
    if (reputation !== null) facts.push({ label: 'Reputation', value: String(reputation) });
    const asOwner = strAt(attributes, 'as_owner');
    if (asOwner !== null) facts.push({ label: 'AS owner', value: asOwner });

    return {
      ok: true,
      summary: `${String(malicious)}/${String(total)} engines flagged malicious.`,
      facts,
      link,
    };
  },
};
