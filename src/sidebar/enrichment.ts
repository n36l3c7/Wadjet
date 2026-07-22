/**
 * Sidebar enrichment UI: provider key settings, manual lookup, and results.
 *
 * Kept separate from the main sidebar wiring to keep each file focused. Provider
 * keys are entered here (masked, write-only from the UI's perspective — the
 * settings view only reports whether a key is set) and the relevant host
 * permission is requested from the Save click's user gesture.
 *
 * @module
 */
import type { EnrichmentEntry } from '../core/case/types';
import type { LookupOutcome } from '../core/enrich/service';
import type { EnrichmentResult, ProviderId } from '../core/enrich/types';
import { sendRequest } from '../core/messaging/client';
import type { SettingsView } from '../core/settings/store';

function must<E extends Element>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  if (className !== '') element.className = className;
  element.textContent = text;
  return element;
}

function providerLink(url: string): HTMLAnchorElement | null {
  if (!url.startsWith('https://')) return null;
  const anchor = document.createElement('a');
  anchor.className = 'enrich-link';
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.textContent = 'open ↗';
  return anchor;
}

function renderResultCard(result: EnrichmentResult): HTMLElement {
  const card = document.createElement('div');
  card.className = 'enrich-card';
  const head = document.createElement('div');
  head.className = 'enrich-card__head';
  head.append(span('enrich-card__provider', result.provider));
  if (!result.ok) head.append(span('enrich-card__bad', 'error'));
  const link = result.link !== null ? providerLink(result.link) : null;
  if (link) head.append(link);
  card.append(head, span('enrich-card__summary', result.summary));
  for (const fact of result.facts) {
    const row = document.createElement('div');
    row.className = 'enrich-fact';
    row.append(span('enrich-fact__label', `${fact.label}: `), span('', fact.value));
    card.append(row);
  }
  return card;
}

/** Render an enrichment entry for the case timeline. */
export function renderEnrichmentEntry(entry: EnrichmentEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'timeline-entry timeline-entry--enrichment';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.className = 'req-summary';
  summary.append(
    span('req-method', 'ENRICH'),
    span('req-url', `${entry.indicator} (${entry.indicatorType})`),
  );
  details.append(summary);
  for (const result of entry.results) details.append(renderResultCard(result));
  li.append(details);
  return li;
}

/** Dependencies the enrichment UI needs from the main sidebar. */
export interface EnrichmentUiDeps {
  readonly getActiveCaseId: () => string | null;
  readonly onAttached: () => void;
}

/** Wire the enrichment input, results, and provider-key settings. */
export function setupEnrichment(deps: EnrichmentUiDeps): void {
  const ui = {
    input: must<HTMLInputElement>('#enrich-input'),
    button: must<HTMLButtonElement>('#btn-enrich'),
    results: must<HTMLElement>('#enrich-results'),
    providers: must<HTMLElement>('#providers-list'),
  };
  let lastLookup: LookupOutcome | null = null;

  function reportError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[wadjet] ${context}:`, error);
    ui.results.replaceChildren(span('enrich-error', `${context}: ${message}`));
  }

  function renderProviders(view: SettingsView): void {
    ui.providers.replaceChildren(
      ...view.map((provider) => {
        const row = document.createElement('div');
        row.className = 'provider';
        const status = provider.hasKey
          ? provider.hasPermission
            ? 'key set · allowed'
            : 'key set · permission needed'
          : 'no key';
        row.append(span('provider__label', `${provider.label} (${provider.supports.join('/')})`));
        row.append(span('provider__status', status));
        const input = document.createElement('input');
        input.type = 'password';
        input.className = 'provider__key';
        input.placeholder = provider.hasKey ? '•••••• (set) — replace or clear' : 'API key';
        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'btn';
        save.textContent = 'Save';
        save.addEventListener('click', () => {
          void saveKey(provider.id, provider.origin, input.value).then(() => {
            input.value = '';
          });
        });
        const controls = document.createElement('div');
        controls.className = 'provider__controls';
        controls.append(input, save);
        row.append(controls);
        return row;
      }),
    );
  }

  async function refreshSettings(): Promise<void> {
    renderProviders(await sendRequest('enrich.settings', {}));
  }

  async function saveKey(provider: ProviderId, origin: string, apiKey: string): Promise<void> {
    if (apiKey !== '') {
      const granted = await browser.permissions.request({ origins: [origin] });
      if (!granted) {
        ui.results.replaceChildren(span('enrich-error', `${provider}: host permission denied.`));
        return;
      }
    }
    await sendRequest('enrich.setKey', { provider, apiKey });
    await refreshSettings();
  }

  function renderResults(outcome: LookupOutcome): void {
    ui.results.replaceChildren();
    if (outcome.indicatorType === null) {
      ui.results.append(span('enrich-error', 'Not a recognizable domain, IP, hash, or URL.'));
      return;
    }
    const header = document.createElement('div');
    header.className = 'enrich-results__head';
    header.append(span('', `${outcome.indicator} (${outcome.indicatorType})`));
    ui.results.append(header);

    if (outcome.results.length === 0) {
      ui.results.append(
        span(
          'enrich-error',
          'No provider configured for this indicator type. Add an API key below.',
        ),
      );
      return;
    }
    for (const result of outcome.results) ui.results.append(renderResultCard(result));

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn btn--primary';
    add.textContent = 'Add to case';
    if (deps.getActiveCaseId() === null) add.setAttribute('disabled', '');
    add.addEventListener('click', () => void attachToCase());
    ui.results.append(add);
  }

  async function doEnrich(): Promise<void> {
    const indicator = ui.input.value.trim();
    if (indicator === '') return;
    const outcome = await sendRequest('enrich.lookup', { indicator });
    lastLookup = outcome;
    renderResults(outcome);
  }

  async function attachToCase(): Promise<void> {
    const caseId = deps.getActiveCaseId();
    if (caseId === null || lastLookup === null || lastLookup.results.length === 0) return;
    await sendRequest('enrichment.add', {
      caseId,
      indicator: lastLookup.indicator,
      indicatorType: lastLookup.indicatorType ?? 'unknown',
      results: lastLookup.results,
    });
    lastLookup = null;
    ui.input.value = '';
    ui.results.replaceChildren();
    deps.onAttached();
  }

  ui.button.addEventListener('click', () => {
    doEnrich().catch((error: unknown) => reportError('enrich', error));
  });

  refreshSettings().catch((error: unknown) => reportError('load providers', error));
}
