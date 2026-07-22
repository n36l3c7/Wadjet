/**
 * Wadjet DevTools panel.
 *
 * Watches the inspected tab's network traffic (`devtools.network`), runs the
 * deterministic security-header analysis on the main document's response, pulls
 * the page's TLS/certificate info from the background, and lets the analyst
 * attach the findings to the active case.
 *
 * The HAR entry type from `devtools.network` is opaque in the type definitions,
 * so its fields are read through a minimal local shape.
 *
 * @module
 */
import { analyzeSecurityHeaders, type RawResponseHeader } from '../core/analysis/security-headers';
import type { SecurityHeaderFinding, TlsInfo } from '../core/analysis/types';
import { sendRequest } from '../core/messaging/client';

interface HarHeader {
  name?: string;
  value?: string;
}
interface HarEntryLike {
  request?: { url?: string };
  response?: { headers?: HarHeader[]; content?: { mimeType?: string } };
}

function must<E extends Element>(selector: string): E {
  const element = document.querySelector<E>(selector);
  if (element === null) throw new Error(`Missing required element: ${selector}`);
  return element;
}

const ui = {
  target: must<HTMLParagraphElement>('#target'),
  findings: must<HTMLUListElement>('#findings'),
  tls: must<HTMLElement>('#tls'),
  targetCase: must<HTMLElement>('#target-case'),
  btnReanalyze: must<HTMLButtonElement>('#btn-reanalyze'),
  btnAdd: must<HTMLButtonElement>('#btn-add'),
};

let lastUrl: string | null = null;
let lastFindings: SecurityHeaderFinding[] = [];
let lastTls: TlsInfo | null = null;
let activeCaseId: string | null = null;

function span(className: string, text: string): HTMLSpanElement {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

function renderFindings(): void {
  ui.findings.replaceChildren(
    ...lastFindings.map((finding) => {
      const li = document.createElement('li');
      li.className = 'finding';
      li.append(
        span('finding__name', finding.header),
        span(`finding__status finding__status--${finding.status}`, finding.status),
        span('finding__detail', finding.detail),
      );
      return li;
    }),
  );
}

function tlsRow(label: string, value: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'tls__row';
  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;
  row.append(strong, document.createTextNode(value));
  return row;
}

function renderTls(): void {
  ui.tls.replaceChildren();
  if (lastTls === null) {
    ui.tls.append(
      span(
        '',
        'No TLS info (plain HTTP, or host permission not granted — enable capture to grant).',
      ),
    );
    return;
  }
  const tls = lastTls;
  const validity =
    tls.validFrom !== null && tls.validTo !== null
      ? `${new Date(tls.validFrom).toISOString().slice(0, 10)} → ${new Date(tls.validTo).toISOString().slice(0, 10)}`
      : '—';
  ui.tls.append(
    tlsRow('State', tls.state),
    tlsRow('Protocol', `${tls.protocol ?? '—'} · ${tls.cipher ?? '—'}`),
    tlsRow('Subject', tls.subject ?? '—'),
    tlsRow('Issuer', tls.issuer ?? '—'),
    tlsRow('Valid', validity),
  );
}

function render(): void {
  ui.target.textContent = lastUrl ?? 'Waiting for a document response…';
  renderFindings();
  renderTls();
  ui.targetCase.textContent = activeCaseId !== null ? '→ active case' : 'no active case';
  ui.btnAdd.disabled = lastUrl === null || activeCaseId === null;
}

async function analyze(url: string, headers: RawResponseHeader[]): Promise<void> {
  lastUrl = url;
  lastFindings = analyzeSecurityHeaders(headers);
  lastTls = await sendRequest('tls.get', { url }).catch(() => null);
  const active = await sendRequest('case.getActive', {}).catch(() => null);
  activeCaseId = active?.id ?? null;
  render();
}

function analyzeEntry(entry: HarEntryLike): void {
  const mime = entry.response?.content?.mimeType ?? '';
  if (!mime.toLowerCase().includes('text/html')) return;
  const url = entry.request?.url;
  if (url === undefined || url === '') return;
  const headers: RawResponseHeader[] = (entry.response?.headers ?? [])
    .filter(
      (header): header is { name: string; value: string } =>
        typeof header.name === 'string' && typeof header.value === 'string',
    )
    .map((header) => ({ name: header.name, value: header.value }));
  void analyze(url, headers);
}

async function scanHar(): Promise<void> {
  const har = (await browser.devtools.network.getHAR()) as {
    entries?: HarEntryLike[];
    log?: { entries?: HarEntryLike[] };
  };
  const entries = har.entries ?? har.log?.entries ?? [];
  let latest: HarEntryLike | null = null;
  for (const entry of entries) {
    const mime = entry.response?.content?.mimeType ?? '';
    if (mime.toLowerCase().includes('text/html')) latest = entry;
  }
  if (latest !== null) analyzeEntry(latest);
}

async function addToCase(): Promise<void> {
  if (lastUrl === null || activeCaseId === null) return;
  await sendRequest('analysis.add', {
    caseId: activeCaseId,
    url: lastUrl,
    findings: lastFindings,
    tls: lastTls,
  });
  ui.btnAdd.textContent = 'Added';
  setTimeout(() => {
    ui.btnAdd.textContent = 'Add to case';
  }, 1500);
}

browser.devtools.network.onRequestFinished.addListener((request) => {
  analyzeEntry(request as unknown as HarEntryLike);
});
ui.btnReanalyze.addEventListener('click', () => {
  void scanHar();
});
ui.btnAdd.addEventListener('click', () => {
  void addToCase();
});

render();
void scanHar();
