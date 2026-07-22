/**
 * The enrichment provider registry.
 *
 * @module
 */
import type { EnrichmentProvider, ProviderId } from '../types';
import { abuseIpdbProvider } from './abuseipdb';
import { otxProvider } from './otx';
import { virusTotalProvider } from './virustotal';

/** All known providers. */
export const PROVIDERS: readonly EnrichmentProvider[] = [
  virusTotalProvider,
  otxProvider,
  abuseIpdbProvider,
];

/** All provider ids, in registry order. */
export const PROVIDER_IDS: readonly ProviderId[] = PROVIDERS.map((provider) => provider.id);

/** Look up a provider by id. */
export function providerById(id: ProviderId): EnrichmentProvider | undefined {
  return PROVIDERS.find((provider) => provider.id === id);
}
