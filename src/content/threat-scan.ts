/**
 * On-page threat scanner (injected content script).
 *
 * Injected into completed top-level navigations while on-page protection is on.
 * It extracts a serializable {@link PageContext} from the DOM, runs the pure
 * deterministic detectors, and — only when a signal warrants it — shows a
 * non-blocking banner that lists exactly which signals fired and why. "Save to
 * case" records the finding and, if configured, augments it with reputation and
 * domain age. Nothing is sent anywhere until the analyst clicks Save.
 *
 * @module
 */
import type { Severity } from '../core/enrich/types';
import { sendRequest } from '../core/messaging/client';
import { detectThreats, shouldWarn } from '../core/threat/detect';
import type { PageContext, ThreatAugmentation, ThreatSignal } from '../core/threat/types';

const HOST_ID = 'wadjet-threat-banner-host';
const TEXT_LIMIT = 20_000;

const SEVERITY_COLOR: Record<ThreatSignal['severity'], string> = {
  high: '#d9534f',
  warn: '#e0b23c',
  info: '#8fa3b8',
};

const ENRICH_COLOR: Record<Severity, string> = {
  clean: '#7fbf7f',
  suspicious: '#e0b23c',
  malicious: '#d9534f',
  unknown: '#24384c',
};

const CSS = `
.bar { box-sizing: border-box; position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647; max-height: 55vh; overflow: auto; padding: 12px 16px; font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e6edf3; background: #0d1b2a; border-bottom: 3px solid #d9534f; box-shadow: 0 6px 24px rgba(0,0,0,0.45); }
.bar.warn { border-bottom-color: #e0b23c; }
.hd { display: flex; align-items: center; gap: 10px; }
.mark { font-size: 18px; line-height: 1; }
.ttl { font-weight: 700; letter-spacing: 0.02em; }
.sub { color: #8fa3b8; font-size: 12px; }
.spacer { flex: 1; }
.sig { margin-top: 8px; padding: 6px 10px; background: #14263a; border-left: 3px solid #24384c; border-radius: 6px; }
.sig__t { font-weight: 600; font-size: 12.5px; }
.sig__k { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #8fa3b8; margin-left: 6px; }
.sig__e { color: #c7d2de; font-size: 12px; margin-top: 2px; }
.aug { margin-top: 8px; font-size: 12px; color: #8fa3b8; }
.card { margin-top: 6px; padding: 5px 8px; background: #14263a; border: 1px solid #24384c; border-left: 3px solid #24384c; border-radius: 6px; font-size: 12px; }
.card b { color: #e0b23c; }
.ftr { display: flex; align-items: center; gap: 10px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #24384c; }
button { font: inherit; font-size: 12px; padding: 4px 10px; color: #e6edf3; background: #14263a; border: 1px solid #24384c; border-radius: 6px; cursor: pointer; }
button.primary { background: #e0b23c; border-color: #e0b23c; color: #1a1200; font-weight: 600; }
button.icon { padding: 2px 8px; }
button[disabled] { opacity: 0.5; cursor: default; }
`;

function el(tag: string, className: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className !== '') node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (className !== '') b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function buildContext(): PageContext {
  const credentialFormActions: string[] = [];
  for (const form of Array.from(document.querySelectorAll('form'))) {
    if (form.querySelector('input[type="password" i]') === null) continue;
    const action = form.getAttribute('action');
    let resolved = location.href;
    if (action !== null && action !== '') {
      try {
        resolved = new URL(action, location.href).href;
      } catch {
        resolved = location.href;
      }
    }
    credentialFormActions.push(resolved);
  }
  return {
    url: location.href,
    hostname: location.hostname,
    scheme: location.protocol,
    title: document.title,
    text: (document.body?.innerText ?? '').slice(0, TEXT_LIMIT),
    hasPasswordField: document.querySelector('input[type="password" i]') !== null,
    credentialFormActions,
  };
}

function renderSignal(signal: ThreatSignal): HTMLElement {
  const box = el('div', 'sig');
  box.style.borderLeftColor = SEVERITY_COLOR[signal.severity];
  const title = el('div', 'sig__t', signal.title);
  title.append(el('span', 'sig__k', signal.kind));
  box.append(title, el('div', 'sig__e', signal.explanation));
  return box;
}

function renderAugmentation(aug: ThreatAugmentation): HTMLElement {
  const wrap = el('div', 'aug');
  if (aug.domainAgeDays !== null) {
    wrap.append(el('div', '', `Domain age: ${String(aug.domainAgeDays)} day(s).`));
  }
  for (const result of aug.enrichment) {
    const card = el('div', 'card');
    card.style.borderLeftColor = ENRICH_COLOR[result.severity];
    const head = el('span', '');
    head.append(
      el('b', '', `${result.provider} `),
      document.createTextNode(`(${result.severity}) `),
    );
    card.append(head, document.createTextNode(result.summary));
    wrap.append(card);
  }
  if (aug.domainAgeDays === null && aug.enrichment.length === 0) {
    wrap.textContent = 'No extra context (no provider configured and native host unavailable).';
  }
  return wrap;
}

async function main(): Promise<void> {
  if (window.top !== window.self) return; // top-level document only
  if (!/^https?:$/.test(location.protocol)) return;

  const context = buildContext();
  const signals = detectThreats(context);

  const existing = document.getElementById(HOST_ID);
  if (!shouldWarn(signals)) {
    existing?.remove();
    return;
  }
  existing?.remove();

  const host = el('div', '');
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = CSS;

  const high = signals.some((signal) => signal.severity === 'high');
  const bar = el('div', high ? 'bar' : 'bar warn');

  const head = el('div', 'hd');
  head.append(
    el('span', 'mark', high ? '⚠' : '🛡'),
    el(
      'span',
      'ttl',
      high ? 'Wadjet — potential threat on this page' : 'Wadjet — heads up on this page',
    ),
    el('span', 'spacer', ''),
    button('icon', '✕', () => host.remove()),
  );
  bar.append(head, el('div', 'sub', location.hostname));
  for (const signal of signals) bar.append(renderSignal(signal));

  const active = await sendRequest('case.getActive', {}).catch(() => null);
  const footer = el('div', 'ftr');
  const status = el(
    'span',
    'sub',
    active !== null ? `Active case: ${active.name}` : 'No active case',
  );
  const save = button('primary', 'Save to case', () => {
    save.disabled = true;
    save.textContent = 'Saving…';
    void sendRequest('threat.report', { url: context.url, signals }).then(
      (res) => {
        save.textContent = res.recorded ? 'Saved ✓' : 'Recorded locally';
        bar.append(renderAugmentation(res.augmentation));
      },
      () => {
        save.disabled = false;
        save.textContent = 'Save failed — retry';
      },
    );
  });
  if (active === null) save.disabled = true;
  footer.append(status, el('span', 'spacer', ''), save);
  bar.append(footer);

  shadow.append(style, bar);
  document.documentElement.append(host);
}

void main();
