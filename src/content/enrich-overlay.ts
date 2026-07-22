/**
 * Inline enrichment overlay (injected content script).
 *
 * Injected on demand when the analyst clicks "Enrich selection". Looks the
 * selection up across configured providers and shows the per-provider results
 * in a shadow-DOM panel next to the selection — each card coloured by that
 * provider's own severity — with "Add to case". Same visual language as the
 * decoder overlay.
 *
 * @module
 */
import type { EnrichmentResult, Severity } from '../core/enrich/types';
import { sendRequest } from '../core/messaging/client';

const HOST_ID = 'wadjet-enrich-overlay-host';

const SEVERITY_COLOR: Record<Severity, string> = {
  clean: '#7fbf7f',
  suspicious: '#e0b23c',
  malicious: '#d9534f',
  unknown: '#24384c',
};

const OVERLAY_CSS = `
.panel { box-sizing: border-box; width: 360px; max-width: 92vw; max-height: 72vh; overflow: auto; padding: 10px; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e6edf3; background: #0d1b2a; border: 1px solid #24384c; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
.hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.title { color: #e0b23c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 700; }
.muted { color: #8fa3b8; font-size: 12px; word-break: break-all; }
.card { padding: 6px 8px; margin-top: 6px; background: #14263a; border: 1px solid #24384c; border-left: 3px solid #24384c; border-radius: 6px; }
.card__head { display: flex; align-items: baseline; gap: 8px; }
.card__provider { font-weight: 600; font-size: 0.72rem; color: #e0b23c; }
.card__sev { font-size: 0.62rem; text-transform: uppercase; letter-spacing: 0.06em; margin-left: auto; }
.card__summary { display: block; margin-top: 2px; font-size: 0.76rem; }
.fact { font-size: 0.7rem; color: #8fa3b8; }
a { color: #e0b23c; }
button { font: inherit; font-size: 12px; padding: 3px 8px; color: #e6edf3; background: #14263a; border: 1px solid #24384c; border-radius: 6px; cursor: pointer; }
button.icon { padding: 2px 6px; }
button.primary { background: #e0b23c; border-color: #e0b23c; color: #1a1200; font-weight: 600; }
button[disabled] { opacity: 0.45; cursor: not-allowed; }
.err { color: #d9534f; font-size: 12px; margin-top: 8px; }
.ftr { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #24384c; }
`;

function selectionText(): string {
  return window.getSelection()?.toString() ?? '';
}

function selectionRect(): DOMRect | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  return rect.width === 0 && rect.height === 0 ? null : rect;
}

function makeButton(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  if (className !== '') button.className = className;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  if (className !== '') element.className = className;
  element.textContent = text;
  return element;
}

function renderCard(result: EnrichmentResult): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.borderLeftColor = SEVERITY_COLOR[result.severity];
  const head = document.createElement('div');
  head.className = 'card__head';
  head.append(span('card__provider', result.provider));
  const sev = span('card__sev', result.severity);
  sev.style.color = SEVERITY_COLOR[result.severity];
  head.append(sev);
  card.append(head, span('card__summary', result.summary));
  for (const fact of result.facts) {
    card.append(span('fact', `${fact.label}: ${fact.value}`));
  }
  return card;
}

function main(): void {
  document.getElementById(HOST_ID)?.remove();

  const host = document.createElement('div');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  const panel = document.createElement('div');
  panel.className = 'panel';
  shadow.append(style, panel);
  document.documentElement.append(host);

  const rect = selectionRect();
  const left = rect ? Math.min(rect.left, window.innerWidth - 372) : window.innerWidth - 372;
  const top = rect ? Math.min(rect.bottom + 8, window.innerHeight - 80) : 20;
  host.style.cssText = `position: fixed; z-index: 2147483647; left: ${String(Math.max(8, left))}px; top: ${String(Math.max(8, top))}px;`;

  const indicator = selectionText().trim();

  function header(): HTMLDivElement {
    const element = document.createElement('div');
    element.className = 'hdr';
    element.append(
      span('title', 'Wadjet · enrich'),
      makeButton('icon', '✕', () => host.remove()),
    );
    return element;
  }

  panel.append(header(), span('muted', `Looking up ${indicator}…`));

  if (indicator === '') {
    panel.replaceChildren(header(), span('muted', 'No text selected.'));
    return;
  }

  void sendRequest('enrich.lookup', { indicator })
    .then(async (outcome) => {
      panel.replaceChildren(header());
      if (outcome.indicatorType === null) {
        panel.append(span('err', 'Not a recognizable domain, IP, hash, or URL.'));
        return;
      }
      panel.append(span('muted', `${outcome.indicator} (${outcome.indicatorType})`));
      if (outcome.results.length === 0) {
        panel.append(
          span('err', 'No provider configured for this type. Add a key in the sidebar.'),
        );
        return;
      }
      for (const result of outcome.results) panel.append(renderCard(result));

      const active = await sendRequest('case.getActive', {}).catch(() => null);
      const footer = document.createElement('div');
      footer.className = 'ftr';
      footer.append(span('muted', active !== null ? `→ ${active.name}` : 'no active case'));
      const add = makeButton('primary', 'Add to case', () => {
        if (active === null) return;
        void sendRequest('enrichment.add', {
          caseId: active.id,
          indicator: outcome.indicator,
          indicatorType: outcome.indicatorType ?? 'unknown',
          results: outcome.results,
        }).then(
          () => host.remove(),
          () => host.remove(),
        );
      });
      if (active === null) add.setAttribute('disabled', '');
      footer.append(add);
      panel.append(footer);
    })
    .catch((error: unknown) => {
      panel.replaceChildren(
        header(),
        span('err', error instanceof Error ? error.message : String(error)),
      );
    });
}

main();
