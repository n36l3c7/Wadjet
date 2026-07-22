/**
 * Inline decoder overlay (injected content script).
 *
 * Injected on demand when the analyst clicks "Decode selection". Renders a
 * self-contained panel (in a shadow root, so page styles cannot reach it) next
 * to the selection: it suggests likely decoders with reasons, applies them,
 * chains one onto another's output, and attaches the result to the active case.
 *
 * Re-injection is safe — any previous overlay is removed first.
 *
 * @module
 */
import { DECODER_IDS, DECODERS, decode, type DecoderId } from '../core/decode/decoders';
import { detect } from '../core/decode/detect';
import { sendRequest } from '../core/messaging/client';

const HOST_ID = 'wadjet-decoder-overlay-host';

const OVERLAY_CSS = `
.panel {
  box-sizing: border-box;
  width: 360px;
  max-width: 90vw;
  max-height: 70vh;
  overflow: auto;
  padding: 10px;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #e6edf3;
  background: #0d1b2a;
  border: 1px solid #24384c;
  border-radius: 8px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
}
.hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.title { color: #e0b23c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 700; }
.label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #8fa3b8; margin: 8px 0 4px; }
.muted { color: #8fa3b8; font-size: 12px; }
.chain { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin-bottom: 6px; }
.chip { font-size: 11px; padding: 1px 7px; border: 1px solid #24384c; border-radius: 999px; color: #8fa3b8; }
.chip--on { color: #e0b23c; border-color: #7a6320; }
.arrow { color: #8fa3b8; }
.value { margin: 0; padding: 8px; background: #0a1622; border: 1px solid #24384c; border-radius: 6px; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
button { font: inherit; font-size: 12px; padding: 4px 8px; color: #e6edf3; background: #14263a; border: 1px solid #24384c; border-radius: 6px; cursor: pointer; }
button:hover:not([disabled]) { border-color: #7a6320; }
button[disabled] { opacity: 0.45; cursor: not-allowed; }
button.icon { padding: 2px 6px; }
button.sug { border-color: #7a6320; color: #e0b23c; }
button.primary { background: #e0b23c; border-color: #e0b23c; color: #1a1200; font-weight: 600; }
.err { color: #d9534f; font-size: 12px; margin-top: 8px; }
.ok { color: #7fbf7f; font-size: 12px; margin-top: 8px; }
.ftr { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; padding-top: 8px; border-top: 1px solid #24384c; }
.actions { display: flex; gap: 6px; }
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

function positionHost(host: HTMLElement, rect: DOMRect | null): void {
  const width = 360;
  const left = rect
    ? Math.min(rect.left, window.innerWidth - width - 12)
    : window.innerWidth - width - 12;
  const top = rect ? Math.min(rect.bottom + 8, window.innerHeight - 80) : 20;
  host.style.cssText = `position: fixed; z-index: 2147483647; left: ${String(Math.max(8, left))}px; top: ${String(Math.max(8, top))}px;`;
}

function makeButton(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  if (className !== '') button.className = className;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function textLine(className: string, content: string): HTMLDivElement {
  const element = document.createElement('div');
  element.className = className;
  element.textContent = content;
  return element;
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
  positionHost(host, selectionRect());

  const original = selectionText();
  let current = original;
  const chain: DecoderId[] = [];
  let lastError: string | null = null;
  let saved = false;
  let activeCaseId: string | null = null;
  let activeCaseName: string | null = null;

  function close(): void {
    host.remove();
  }

  function apply(id: DecoderId): void {
    const result = decode(id, current);
    saved = false;
    if (!result.ok) {
      lastError = `${DECODERS[id].label}: ${result.error}`;
    } else {
      chain.push(id);
      current = result.output;
      lastError = null;
    }
    render();
  }

  function reset(): void {
    current = original;
    chain.length = 0;
    lastError = null;
    saved = false;
    render();
  }

  function addToCase(): void {
    if (activeCaseId === null) {
      lastError = 'No active case — open one in the Wadjet sidebar first.';
      render();
      return;
    }
    void sendRequest('decoded.add', {
      caseId: activeCaseId,
      input: original,
      chain,
      output: current,
      sourceUrl: location.href,
    })
      .then(() => {
        saved = true;
        lastError = null;
        render();
      })
      .catch((error: unknown) => {
        lastError = error instanceof Error ? error.message : String(error);
        render();
      });
  }

  function render(): void {
    panel.replaceChildren();

    const header = document.createElement('div');
    header.className = 'hdr';
    header.append(textLine('title', 'Wadjet · decode'), makeButton('icon', '✕', close));
    panel.append(header);

    if (original === '') {
      panel.append(textLine('muted', 'No text selected. Select something and reopen.'));
      return;
    }

    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'chain';
    breadcrumb.append(textLine('chip', 'selection'));
    for (const id of chain) {
      breadcrumb.append(textLine('arrow', '→'), textLine('chip chip--on', DECODERS[id].label));
    }
    panel.append(breadcrumb);

    const value = document.createElement('pre');
    value.className = 'value';
    value.textContent = current;
    panel.append(value);

    const suggestions = detect(current);
    if (suggestions.length > 0) {
      panel.append(textLine('label', 'Suggested'));
      const row = document.createElement('div');
      row.className = 'row';
      for (const candidate of suggestions) {
        const button = makeButton('sug', DECODERS[candidate.id].label, () => apply(candidate.id));
        button.title = candidate.reason;
        row.append(button);
      }
      panel.append(row);
    }

    panel.append(textLine('label', 'Apply manually'));
    const manual = document.createElement('div');
    manual.className = 'row';
    for (const id of DECODER_IDS) {
      manual.append(makeButton('', DECODERS[id].label, () => apply(id)));
    }
    panel.append(manual);

    if (lastError !== null) panel.append(textLine('err', lastError));
    if (saved) panel.append(textLine('ok', 'Added to the case timeline.'));

    const footer = document.createElement('div');
    footer.className = 'ftr';
    footer.append(
      textLine(
        'muted',
        activeCaseId !== null ? `→ ${activeCaseName ?? 'active case'}` : 'no active case',
      ),
    );
    const actions = document.createElement('div');
    actions.className = 'actions';
    const addButton = makeButton('primary', 'Add to case', addToCase);
    if (chain.length === 0 || activeCaseId === null) addButton.setAttribute('disabled', '');
    actions.append(makeButton('', 'Reset', reset), addButton);
    footer.append(actions);
    panel.append(footer);
  }

  render();

  void sendRequest('case.getActive', {})
    .then((active) => {
      activeCaseId = active?.id ?? null;
      activeCaseName = active?.name ?? null;
      render();
    })
    .catch(() => {
      /* leave the target as "no active case" */
    });
}

main();
