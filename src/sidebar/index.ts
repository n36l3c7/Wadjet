/**
 * Sidebar view — the current-case surface.
 *
 * A thin client over the typed message protocol: it renders the case list, the
 * active case, the traffic-capture control, and a filtered, paginated timeline
 * of the case's entries (notes and captured requests). All model logic lives in
 * the background; this file is presentation and wiring only.
 *
 * User-controlled and captured strings (case names, note text, tags, URLs,
 * header values) are always written via `textContent`, never `innerHTML`, so
 * nothing recorded or observed can inject markup into the panel.
 *
 * @module
 */
import { parseTags } from '../core/case/tags';
import type { CaseEntry, CaseEntryKind, NoteEntry, RequestEntry } from '../core/case/types';
import { sendRequest } from '../core/messaging/client';
import type { CaptureState } from '../core/traffic/state';

const ALL_URLS = '<all_urls>';
const PAGE_SIZE = 50;

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
  capture: must<HTMLElement>('#capture'),
  btnCaptureToggle: must<HTMLButtonElement>('#btn-capture-toggle'),
  captureRetain: must<HTMLInputElement>('#capture-retain'),
  captureStatus: must<HTMLElement>('#capture-status'),
  captureHint: must<HTMLParagraphElement>('#capture-hint'),
  filterKind: must<HTMLSelectElement>('#filter-kind'),
  filterText: must<HTMLInputElement>('#filter-text'),
  timelineList: must<HTMLUListElement>('#timeline-list'),
  timelineEmpty: must<HTMLParagraphElement>('#timeline-empty'),
  btnLoadMore: must<HTMLButtonElement>('#btn-load-more'),
  composer: must<HTMLElement>('#composer'),
  noteInput: must<HTMLTextAreaElement>('#note-input'),
  noteTags: must<HTMLInputElement>('#note-tags'),
  btnAddNote: must<HTMLButtonElement>('#btn-add-note'),
};

type KindFilter = 'all' | CaseEntryKind;

const state = {
  activeCaseId: null as string | null,
  capture: null as CaptureState | null,
  kindFilter: 'all' as KindFilter,
  entries: [] as CaseEntry[],
  hasMore: false,
  nextBefore: null as number | null,
};

// --- small DOM helpers -----------------------------------------------------

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleString();
}

function renderTag(label: string): HTMLElement {
  return span('tag', label);
}

// --- rendering -------------------------------------------------------------

function renderCaseItem(entry: { id: string; name: string; status: string }): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'case-item';
  li.dataset.id = entry.id;
  li.setAttribute('aria-current', String(entry.id === state.activeCaseId));
  li.append(span('', entry.name), span('case-item__meta', entry.status));
  li.addEventListener('click', () => {
    void run('open case', openCase(entry.id));
  });
  return li;
}

function renderNote(entry: NoteEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'timeline-entry';
  const head = document.createElement('div');
  head.className = 'timeline-entry__head';
  head.append(span('', 'note'), span('', formatTime(entry.timestamp)));
  const body = document.createElement('div');
  body.className = 'timeline-entry__body';
  body.textContent = entry.text;
  li.append(head, body);
  for (const tag of entry.tags) li.append(renderTag(tag));
  return li;
}

function renderHeaderList(title: string, headers: RequestEntry['requestHeaders']): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'req-headers';
  wrap.append(span('req-headers__title', `${title} (${String(headers.length)})`));
  for (const header of headers) {
    const row = document.createElement('div');
    row.className = 'req-header';
    row.append(span('req-header__name', `${header.name}: `));
    const value = span('req-header__value', header.value);
    if (header.redacted) value.classList.add('req-header__value--redacted');
    row.append(value);
    wrap.append(row);
  }
  return wrap;
}

function requestDuration(entry: RequestEntry): string {
  const { startedAt, completedAt } = entry.timings;
  if (completedAt === null) return '—';
  return `${String(Math.max(0, Math.round(completedAt - startedAt)))} ms`;
}

function renderRequest(entry: RequestEntry): HTMLLIElement {
  const li = document.createElement('li');
  li.className = 'timeline-entry timeline-entry--request';

  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.className = 'req-summary';
  const statusText =
    entry.statusCode !== null ? String(entry.statusCode) : entry.outcome === 'error' ? 'ERR' : '—';
  const statusEl = span('req-status', statusText);
  if (entry.outcome === 'error') statusEl.classList.add('req-status--error');
  summary.append(span('req-method', entry.method), statusEl, span('req-url', entry.url));
  details.append(summary);

  const meta = document.createElement('div');
  meta.className = 'req-meta';
  const bits = [
    entry.resourceType,
    formatTime(entry.timestamp),
    requestDuration(entry),
    entry.remoteIp ?? '',
    entry.fromCache ? 'cached' : '',
    entry.redirectChain.length > 0 ? `${String(entry.redirectChain.length)} redirect(s)` : '',
    entry.sensitiveRetained ? 'raw values retained' : '',
  ].filter((bit) => bit !== '');
  meta.textContent = bits.join(' · ');
  details.append(meta);

  if (entry.error !== null) {
    const err = document.createElement('div');
    err.className = 'req-error';
    err.textContent = entry.error;
    details.append(err);
  }

  if (entry.redirectChain.length > 0) {
    const chain = document.createElement('div');
    chain.className = 'req-redirects';
    for (const hop of entry.redirectChain) {
      chain.append(
        span('req-redirect', `${String(hop.statusCode ?? '—')}  ${hop.fromUrl} → ${hop.toUrl}`),
      );
    }
    details.append(chain);
  }

  details.append(
    renderHeaderList('Request headers', entry.requestHeaders),
    renderHeaderList('Response headers', entry.responseHeaders),
  );

  li.append(details);
  for (const tag of entry.tags) li.append(renderTag(tag));
  return li;
}

function renderEntry(entry: CaseEntry): HTMLLIElement {
  return entry.kind === 'note' ? renderNote(entry) : renderRequest(entry);
}

function matchesTextFilter(entry: CaseEntry): boolean {
  const query = ui.filterText.value.trim().toLowerCase();
  if (query === '') return true;
  const haystack =
    entry.kind === 'note'
      ? entry.text
      : `${entry.method} ${entry.url} ${String(entry.statusCode ?? '')}`;
  return haystack.toLowerCase().includes(query);
}

function renderTimeline(): void {
  const visible = state.entries.filter(matchesTextFilter);
  ui.timelineList.replaceChildren(...visible.map(renderEntry));
  ui.btnLoadMore.hidden = !state.hasMore;
  if (visible.length > 0) {
    ui.timelineEmpty.hidden = true;
    return;
  }
  ui.timelineEmpty.hidden = false;
  ui.timelineEmpty.textContent =
    state.entries.length === 0
      ? 'No entries yet. Add a note or start capture.'
      : 'No loaded entries match the filter.';
}

function renderCapture(): void {
  if (state.activeCaseId === null) {
    ui.capture.hidden = true;
    return;
  }
  ui.capture.hidden = false;
  const active = state.capture?.active ?? false;
  ui.btnCaptureToggle.textContent = active ? 'Stop capture' : 'Start capture';
  ui.btnCaptureToggle.classList.toggle('btn--primary', !active);
  ui.captureRetain.disabled = active;
  if (!active)
    ui.captureRetain.checked = state.capture?.retainSensitive ?? ui.captureRetain.checked;
  ui.captureStatus.textContent = active
    ? state.capture?.retainSensitive
      ? 'Capturing — raw values retained'
      : 'Capturing'
    : 'Idle';
  ui.captureStatus.classList.toggle('capture__status--on', active);
}

// --- data loading ----------------------------------------------------------

function kindsParam(): CaseEntryKind[] | null {
  return state.kindFilter === 'all' ? null : [state.kindFilter];
}

async function loadFirstPage(caseId: string): Promise<void> {
  const page = await sendRequest('case.entries', {
    caseId,
    query: { kinds: kindsParam(), limit: PAGE_SIZE, before: null },
  });
  state.entries = page.entries;
  state.hasMore = page.hasMore;
  state.nextBefore = page.nextBefore;
}

async function loadMore(): Promise<void> {
  if (state.activeCaseId === null || !state.hasMore) return;
  const page = await sendRequest('case.entries', {
    caseId: state.activeCaseId,
    query: { kinds: kindsParam(), limit: PAGE_SIZE, before: state.nextBefore },
  });
  state.entries = [...state.entries, ...page.entries];
  state.hasMore = page.hasMore;
  state.nextBefore = page.nextBefore;
  renderTimeline();
}

async function refresh(): Promise<void> {
  const [cases, active, capture] = await Promise.all([
    sendRequest('case.list', {}),
    sendRequest('case.getActive', {}),
    sendRequest('capture.getState', {}),
  ]);

  state.activeCaseId = active?.id ?? null;
  state.capture = capture;

  ui.casesList.replaceChildren(...cases.map(renderCaseItem));
  ui.casesEmpty.hidden = cases.length > 0;

  ui.activeName.textContent = active ? active.name : 'No active case';
  ui.activeStatus.hidden = active === null;
  ui.activeStatus.textContent = active ? active.status : '';
  ui.btnCloseCase.disabled = active === null;
  ui.composer.hidden = active === null;

  renderCapture();

  if (active === null) {
    state.entries = [];
    state.hasMore = false;
    state.nextBefore = null;
    ui.timelineList.replaceChildren();
    ui.btnLoadMore.hidden = true;
    ui.timelineEmpty.hidden = false;
    ui.timelineEmpty.textContent = 'Open a case to see its timeline.';
    return;
  }

  await loadFirstPage(active.id);
  renderTimeline();
}

// --- actions ---------------------------------------------------------------

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
  if (state.activeCaseId === null) return;
  await sendRequest('case.close', { id: state.activeCaseId });
  await refresh();
}

async function startCapture(): Promise<void> {
  if (state.activeCaseId === null) return;
  // permissions.request must run inside the click gesture, before any await.
  const granted = await browser.permissions.request({ origins: [ALL_URLS] });
  if (!granted) {
    ui.captureHint.textContent =
      'Permission denied — capture needs access to requests on all sites.';
    return;
  }
  await sendRequest('capture.start', {
    caseId: state.activeCaseId,
    retainSensitive: ui.captureRetain.checked,
  });
  await refresh();
}

async function stopCapture(): Promise<void> {
  await sendRequest('capture.stop', {});
  await refresh();
}

async function addNote(): Promise<void> {
  if (state.activeCaseId === null) return;
  const text = ui.noteInput.value;
  if (text.trim() === '') return;
  await sendRequest('note.add', {
    caseId: state.activeCaseId,
    text,
    tags: parseTags(ui.noteTags.value),
  });
  ui.noteInput.value = '';
  ui.noteTags.value = '';
  await refresh();
}

/** Run an async action, surfacing failures instead of leaving the panel broken. */
function run(context: string, action: Promise<void>): Promise<void> {
  return action.catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[wadjet] ${context}:`, error);
    ui.timelineEmpty.hidden = false;
    ui.timelineEmpty.textContent = `Something went wrong (${context}): ${message}`;
  });
}

// --- wiring ----------------------------------------------------------------

ui.btnNewCase.addEventListener('click', () => void run('create case', createCase()));
ui.btnCloseCase.addEventListener('click', () => void run('close case', closeActiveCase()));
ui.btnAddNote.addEventListener('click', () => void run('add note', addNote()));
ui.btnLoadMore.addEventListener('click', () => void run('load more', loadMore()));

ui.btnCaptureToggle.addEventListener('click', () => {
  // Decide synchronously from cached state so the permission prompt (start) runs
  // inside the user gesture.
  if (state.capture?.active) {
    void run('stop capture', stopCapture());
  } else {
    void run('start capture', startCapture());
  }
});

ui.filterKind.addEventListener('change', () => {
  const value = ui.filterKind.value;
  state.kindFilter = value === 'note' || value === 'request' ? value : 'all';
  if (state.activeCaseId !== null) {
    void run('filter', loadFirstPage(state.activeCaseId).then(renderTimeline));
  }
});

ui.filterText.addEventListener('input', () => {
  renderTimeline();
});

void run('load', refresh());
