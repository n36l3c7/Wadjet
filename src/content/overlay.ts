/**
 * Inline codec overlay (injected content script).
 *
 * Injected on demand when the analyst clicks "Decode selection". Renders a
 * self-contained panel (shadow DOM) next to the selection with an **editable
 * chain** of conversions applied to the original text: append a suggested or
 * manual operation, remove any step (even mid-chain), or drag to reorder — the
 * result recomputes from the original each time. Chains can decode, encode, and
 * defang/refang, then be attached to the active case.
 *
 * Re-injection is safe — any previous overlay is removed first.
 *
 * @module
 */
import { detect } from '../core/decode/detect';
import {
  OPERATIONS,
  OPERATION_IDS,
  computeChain,
  type OperationId,
} from '../core/decode/operations';
import { sendRequest } from '../core/messaging/client';

const HOST_ID = 'wadjet-decoder-overlay-host';

const OVERLAY_CSS = `
.panel { box-sizing: border-box; width: 380px; max-width: 92vw; max-height: 72vh; overflow: auto; padding: 10px; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e6edf3; background: #0d1b2a; border: 1px solid #24384c; border-radius: 8px; box-shadow: 0 8px 28px rgba(0,0,0,0.5); }
.hdr { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.title { color: #e0b23c; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 700; }
.label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #8fa3b8; margin: 8px 0 3px; }
.muted { color: #8fa3b8; font-size: 12px; }
.value { margin: 0; padding: 8px; background: #0a1622; border: 1px solid #24384c; border-radius: 6px; white-space: pre-wrap; word-break: break-word; max-height: 160px; overflow: auto; font-family: ui-monospace, Consolas, monospace; font-size: 12px; }
.steps { display: flex; flex-direction: column; gap: 3px; }
.step { display: flex; align-items: center; gap: 6px; padding: 3px 6px; background: #14263a; border: 1px solid #24384c; border-radius: 6px; cursor: grab; }
.step--fail { border-color: #d9534f; }
.step__grip { color: #8fa3b8; }
.step__label { flex: 1; font-size: 12px; }
.step__x { background: none; border: none; color: #8fa3b8; cursor: pointer; padding: 0 4px; }
.step__x:hover { color: #d9534f; }
.row { display: flex; flex-wrap: wrap; gap: 6px; }
button { font: inherit; font-size: 12px; padding: 3px 7px; color: #e6edf3; background: #14263a; border: 1px solid #24384c; border-radius: 6px; cursor: pointer; }
button:hover:not([disabled]) { border-color: #7a6320; }
button[disabled] { opacity: 0.45; cursor: not-allowed; }
button.icon { padding: 2px 6px; }
button.sug { border-color: #7a6320; color: #e0b23c; }
button.primary { background: #e0b23c; border-color: #e0b23c; color: #1a1200; font-weight: 600; }
.grp { font-size: 10px; color: #8fa3b8; text-transform: uppercase; letter-spacing: 0.06em; margin: 6px 0 2px; }
.err { color: #d9534f; font-size: 12px; margin-top: 6px; }
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
  const width = 380;
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
  const chain: OperationId[] = [];
  let saved = false;
  let activeCaseId: string | null = null;
  let activeCaseName: string | null = null;

  function close(): void {
    host.remove();
  }

  function addOp(id: OperationId): void {
    chain.push(id);
    saved = false;
    render();
  }

  function removeOp(index: number): void {
    chain.splice(index, 1);
    saved = false;
    render();
  }

  function reorder(from: number, to: number): void {
    if (from === to || from < 0 || from >= chain.length) return;
    const [moved] = chain.splice(from, 1);
    if (moved === undefined) return;
    chain.splice(to, 0, moved);
    saved = false;
    render();
  }

  function addToCase(output: string): void {
    if (activeCaseId === null || chain.length === 0) return;
    void sendRequest('decoded.add', {
      caseId: activeCaseId,
      input: original,
      chain,
      output,
      sourceUrl: location.href,
    })
      .then(() => {
        saved = true;
        render();
      })
      .catch((error: unknown) => {
        panel.append(textLine('err', error instanceof Error ? error.message : String(error)));
      });
  }

  function renderSteps(failureIndex: number | null): HTMLDivElement {
    const steps = document.createElement('div');
    steps.className = 'steps';
    chain.forEach((id, index) => {
      const row = document.createElement('div');
      row.className = failureIndex === index ? 'step step--fail' : 'step';
      row.draggable = true;
      row.append(textLine('step__grip', '⋮⋮'), textLine('step__label', OPERATIONS[id].label));
      row.append(makeButton('step__x', '✕', () => removeOp(index)));
      row.addEventListener('dragstart', (event) => {
        event.dataTransfer?.setData('text/plain', String(index));
      });
      row.addEventListener('dragover', (event) => {
        event.preventDefault();
      });
      row.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = Number(event.dataTransfer?.getData('text/plain'));
        if (!Number.isNaN(from)) reorder(from, index);
      });
      steps.append(row);
    });
    return steps;
  }

  function render(): void {
    panel.replaceChildren();

    const header = document.createElement('div');
    header.className = 'hdr';
    header.append(textLine('title', 'Wadjet · convert'), makeButton('icon', '✕', close));
    panel.append(header);

    if (original === '') {
      panel.append(textLine('muted', 'No text selected. Select something and reopen.'));
      return;
    }

    const result = computeChain(original, chain);

    if (chain.length > 0) {
      panel.append(textLine('label', 'Chain'), renderSteps(result.failure?.index ?? null));
    }
    if (result.failure !== null) {
      panel.append(
        textLine('err', `Step ${String(result.failure.index + 1)} failed: ${result.failure.error}`),
      );
    }

    const output = document.createElement('pre');
    output.className = 'value';
    output.textContent = result.output;
    panel.append(textLine('label', chain.length > 0 ? 'Output' : 'Selection'), output);

    const suggestions = detect(result.output);
    if (suggestions.length > 0) {
      panel.append(textLine('label', 'Suggested'));
      const row = document.createElement('div');
      row.className = 'row';
      for (const candidate of suggestions) {
        const button = makeButton('sug', OPERATIONS[candidate.id].label, () => addOp(candidate.id));
        button.title = candidate.reason;
        row.append(button);
      }
      panel.append(row);
    }

    for (const group of ['decode', 'encode', 'defang'] as const) {
      panel.append(textLine('grp', group));
      const row = document.createElement('div');
      row.className = 'row';
      for (const id of OPERATION_IDS) {
        if (OPERATIONS[id].group === group) {
          row.append(makeButton('', OPERATIONS[id].label, () => addOp(id)));
        }
      }
      panel.append(row);
    }

    if (saved) panel.append(textLine('ok', 'Added to the case timeline.'));

    const footer = document.createElement('div');
    footer.className = 'ftr';
    footer.append(
      textLine(
        'muted',
        activeCaseId !== null ? `→ ${activeCaseName ?? 'active case'}` : 'no active case',
      ),
    );
    const addButton = makeButton('primary', 'Add to case', () => addToCase(result.output));
    if (chain.length === 0 || activeCaseId === null) addButton.setAttribute('disabled', '');
    footer.append(addButton);
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
