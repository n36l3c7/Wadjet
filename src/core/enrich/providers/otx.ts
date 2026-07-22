/**
 * AlienVault OTX provider (domain / IP / hash).
 *
 * @see https://otx.alienvault.com/api
 * @module
 */
import type { IndicatorType } from '../indicator';
import type { EnrichmentFact, EnrichmentProvider, ProviderParse } from '../types';
import { asRecord, numAt } from './util';

const API = 'https://otx.alienvault.com/api/v1/indicators';
const GUI = 'https://otx.alienvault.com/indicator';

function section(type: IndicatorType, indicator: string): { path: string; guiType: string } {
  if (type === 'ip') {
    const family = indicator.includes(':') ? 'IPv6' : 'IPv4';
    return { path: `${family}/${indicator}/general`, guiType: 'ip' };
  }
  if (type === 'domain') return { path: `domain/${indicator}/general`, guiType: 'domain' };
  return { path: `file/${indicator}/general`, guiType: 'file' };
}

export const otxProvider: EnrichmentProvider = {
  id: 'otx',
  label: 'AlienVault OTX',
  origin: 'https://otx.alienvault.com/*',

  supports(type) {
    return type === 'domain' || type === 'ip' || type === 'hash';
  },

  buildRequest(indicator, type, apiKey) {
    return {
      url: `${API}/${section(type, indicator).path}`,
      headers: { 'X-OTX-API-KEY': apiKey },
    };
  },

  parse(indicator, type, status, body): ProviderParse {
    const link = `${GUI}/${section(type, indicator).guiType}/${indicator}`;
    if (status === 403) {
      return {
        ok: false,
        summary: 'OTX: invalid API key.',
        facts: [],
        link: null,
        severity: 'unknown',
      };
    }
    if (status === 404) {
      return { ok: true, summary: 'Not found in OTX.', facts: [], link, severity: 'unknown' };
    }
    if (status !== 200) {
      return {
        ok: false,
        summary: `OTX: HTTP ${String(status)}.`,
        facts: [],
        link: null,
        severity: 'unknown',
      };
    }

    const pulseInfo = asRecord(asRecord(body)?.pulse_info);
    const count = numAt(pulseInfo, 'count') ?? 0;
    const facts: EnrichmentFact[] = [{ label: 'OTX pulses', value: String(count) }];
    const pulses = pulseInfo?.pulses;
    if (Array.isArray(pulses)) {
      const names = pulses
        .map((pulse) => asRecord(pulse)?.name)
        .filter((name): name is string => typeof name === 'string')
        .slice(0, 3);
      if (names.length > 0) facts.push({ label: 'Recent pulses', value: names.join('; ') });
    }

    return {
      ok: true,
      summary:
        count > 0
          ? `${String(count)} OTX pulse(s) reference this.`
          : 'No OTX pulses reference this.',
      facts,
      link,
      severity: count > 0 ? 'suspicious' : 'clean',
    };
  },
};
