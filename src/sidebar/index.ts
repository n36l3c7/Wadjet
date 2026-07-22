/**
 * Sidebar view — the current-case surface.
 *
 * A thin client over the typed message protocol: it renders the case list, the
 * active case and its timeline, and issues create/open/close/add-note requests.
 * All model logic lives in the background; this file is presentation and wiring
 * only.
 *
 * User-controlled strings (case names, note text, tags) are always written via
 * `textContent`, never `innerHTML`, so nothing an analyst records can inject
 * markup into the panel.
 *
 * @module
 */
import { parseTags } from '../core/case/tags';
import type { Case, CaseEntry } from '../core/case/types';
import { sendRequest } from '../core/messaging/client';

/** Query a required element, failing loudly if the markup drifts. */
function must<E extends Element>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (element === null) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const ui = {
  activeName: must<HTMLElement>('#active-case-name'),
  activeStatus: must<HTMLElement>('#active-case-status'),
  btnNewCase: must<HTMLButtonElement>('#btn-new-case'),
  btnCloseCase: must<HTMLButtonElement>('#btn-close-case'),
  casesList: must<HTMLUListElement>('#cases-list'),
  casesEmpty: must<HTMLParagraphElement>('#cases-empty'),
  timelineList: must<HTMLUListElement>('#timeline-list'),
  timelineEmpty: must<HTMLParagraphElement>('#timeline-empty'),
  composer: must<HTMLElement>('#composer'),
  noteInput: must<HTMLTextAreaElement>('#note-input'),
  noteTags: must<HTMLInputElement>('#note-tags'),
  btnAddNote: must<HTMLButtonElement>('#btn-add-note'),
};

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

function renderTag(label: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'tag';
  span.textContent = label;
  return span;
}

function renderCaseItem(entry: Case, activeId: string | null): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'case-item';
  li.dataset.id = entry.id;
  li.setAttribute('aria-current', String(entry.id === activeId));

  const name = document.createElement('span');
  name.textContent = entry.name;

  const meta = document.createElement('span');
  meta.className = 'case-item__meta';
  meta.textContent = entry.status === 'closed' ? 'closed' : 'open';

  li.append(name, meta);
  li.addEventListener('click', () => {
    void openCase(entry.id);
  });
  return li;
}

function renderTimelineEntry(entry: CaseEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'timeline-entry';

  const head = document.createElement('div');
  head.className = 'timeline-entry__head';
  const kind = document.createElement('span');
  kind.textContent = entry.kind;
  const time = document.createElement('span');
  time.textContent = formatTime(entry.timestamp);
  head.append(kind, time);

  const body = document.createElement('div');
  body.className = 'timeline-entry__body';
  body.textContent = entry.text;

  li.append(head, body);
  for (const tag of entry.tags) {
    li.append(renderTag(tag));
  }
  return li;
}

async function refresh(): Promise<void> {
  const [cases, active] = await Promise.all([
    sendRequest('case.list', {}),
    sendRequest('case.getActive', {}),
  ]);

  // Case list.
  ui.casesList.replaceChildren(...cases.map((entry) => renderCaseItem(entry, active?.id ?? null)));
  ui.casesEmpty.hidden = cases.length > 0;

  // Active case header + controls.
  ui.activeName.textContent = active ? active.name : 'No active case';
  ui.activeStatus.hidden = active === null;
  ui.activeStatus.textContent = active ? active.status : '';
  ui.btnCloseCase.disabled = active === null;
  ui.composer.hidden = active === null;

  // Timeline.
  if (active === null) {
    ui.timelineList.replaceChildren();
    ui.timelineEmpty.hidden = false;
    ui.timelineEmpty.textContent = 'Open a case to see its timeline.';
    return;
  }
  const timeline = await sendRequest('case.timeline', { caseId: active.id });
  ui.timelineList.replaceChildren(...timeline.map(renderTimelineEntry));
  ui.timelineEmpty.hidden = timeline.length > 0;
  ui.timelineEmpty.textContent = 'No entries yet. Add a note to start the timeline.';
}

async function createCase(): Promise<void> {
  const name = window.prompt('Case name');
  if (name === null || name.trim() === '') return;
  await sendRequest('case.create', { name });
  await refresh();
}

async function openCase(id: string): Promise<void> {
  await sendRequest('case.open', { id });
  await refresh();
}

async function closeActiveCase(): Promise<void> {
  const active = await sendRequest('case.getActive', {});
  if (active === null) return;
  await sendRequest('case.close', { id: active.id });
  await refresh();
}

async function addNote(): Promise<void> {
  const active = await sendRequest('case.getActive', {});
  if (active === null) return;
  const text = ui.noteInput.value;
  if (text.trim() === '') return;
  await sendRequest('note.add', {
    caseId: active.id,
    text,
    tags: parseTags(ui.noteTags.value),
  });
  ui.noteInput.value = '';
  ui.noteTags.value = '';
  await refresh();
}

/** Report an unexpected failure without leaving the panel silently broken. */
function reportError(context: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[wadjet] ${context}:`, error);
  ui.timelineEmpty.hidden = false;
  ui.timelineEmpty.textContent = `Something went wrong (${context}): ${message}`;
}

ui.btnNewCase.addEventListener('click', () => {
  createCase().catch((error: unknown) => reportError('create case', error));
});
ui.btnCloseCase.addEventListener('click', () => {
  closeActiveCase().catch((error: unknown) => reportError('close case', error));
});
ui.btnAddNote.addEventListener('click', () => {
  addNote().catch((error: unknown) => reportError('add note', error));
});

refresh().catch((error: unknown) => reportError('load', error));
