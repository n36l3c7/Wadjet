/**
 * Deterministic detectors for phishing and ClickFix signals.
 *
 * Every function here is pure: it maps a {@link PageContext} to a list of
 * {@link ThreatSignal}s, quoting the evidence that made each fire. There is no
 * scoring, weighting, or statistical model — a signal either matches or it does
 * not, and callers display the matches verbatim.
 *
 * @module
 */
import type { PageContext, ThreatSignal } from './types';

/** A brand commonly impersonated, with its terms and its official domains. */
interface Brand {
  readonly name: string;
  readonly terms: readonly string[];
  readonly domains: readonly string[];
}

/**
 * Small, fixed brand table. Deliberately short and hand-curated — this is a
 * mismatch heuristic, not a directory, and it stays explainable.
 */
export const BRANDS: readonly Brand[] = [
  {
    name: 'Microsoft',
    terms: ['microsoft', 'office365', 'office 365', 'outlook', 'onedrive', 'sharepoint'],
    domains: ['microsoft.com', 'microsoftonline.com', 'live.com', 'office.com', 'outlook.com'],
  },
  {
    name: 'Google',
    terms: ['google account', 'gmail', 'google workspace'],
    domains: ['google.com', 'gmail.com', 'googlemail.com'],
  },
  { name: 'Apple', terms: ['apple id', 'icloud'], domains: ['apple.com', 'icloud.com'] },
  { name: 'PayPal', terms: ['paypal'], domains: ['paypal.com'] },
  { name: 'Amazon', terms: ['amazon'], domains: ['amazon.com', 'amazonaws.com'] },
  { name: 'Facebook', terms: ['facebook'], domains: ['facebook.com'] },
  { name: 'Instagram', terms: ['instagram'], domains: ['instagram.com'] },
  { name: 'Netflix', terms: ['netflix'], domains: ['netflix.com'] },
  { name: 'LinkedIn', terms: ['linkedin'], domains: ['linkedin.com'] },
  { name: 'DHL', terms: ['dhl express', 'dhl parcel'], domains: ['dhl.com'] },
];

/** True when `hostname` is `domain` or a sub-domain of it. */
function registrableMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

/** True when the hostname is a raw IPv4/IPv6 literal rather than a name. */
function isIpLiteral(hostname: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) return true;
  return hostname.startsWith('[') || hostname.includes(':');
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Deterministic phishing signals derived from URL, DOM structure, and text. */
export function detectPhishing(ctx: PageContext): ThreatSignal[] {
  const out: ThreatSignal[] = [];
  const host = ctx.hostname.toLowerCase();

  const punycode = host.split('.').filter((label) => label.startsWith('xn--'));
  if (punycode.length > 0) {
    out.push({
      id: 'idn-homograph',
      kind: 'phishing',
      severity: 'warn',
      title: 'Internationalized (punycode) domain',
      explanation: `The hostname uses internationalized labels (${punycode.join(', ')}), which can imitate a familiar name with look-alike characters.`,
    });
  }

  const pageOrigin = originOf(ctx.url);
  for (const action of ctx.credentialFormActions) {
    const actionOrigin = originOf(action);
    if (actionOrigin !== null && pageOrigin !== null && actionOrigin !== pageOrigin) {
      out.push({
        id: 'credential-cross-origin',
        kind: 'phishing',
        severity: 'high',
        title: 'Password form submits to another site',
        explanation: `A login form on this page sends your password to ${actionOrigin}, not ${pageOrigin}.`,
      });
      break;
    }
  }

  if (ctx.hasPasswordField && ctx.scheme !== 'https:') {
    out.push({
      id: 'insecure-credentials',
      kind: 'phishing',
      severity: 'warn',
      title: 'Password requested over HTTP',
      explanation:
        'This page asks for a password over an insecure (http) connection; credentials could be read in transit.',
    });
  }

  if (ctx.hasPasswordField && isIpLiteral(host)) {
    out.push({
      id: 'ip-host-login',
      kind: 'phishing',
      severity: 'warn',
      title: 'Login served from a raw IP address',
      explanation: `A login form is served from a raw IP address (${host}) rather than a named domain — unusual for a legitimate service.`,
    });
  }

  // Brand mismatch only fires in a credential context (a password field), so a
  // page merely mentioning a brand name does not trip the warning.
  if (ctx.hasPasswordField) {
    const haystack = `${ctx.title} ${ctx.text}`.toLowerCase();
    for (const brand of BRANDS) {
      if (!brand.terms.some((term) => haystack.includes(term))) continue;
      if (brand.domains.some((domain) => registrableMatches(host, domain))) continue;
      out.push({
        id: 'brand-mismatch',
        kind: 'phishing',
        severity: 'high',
        title: `Impersonates ${brand.name}?`,
        explanation: `The page presents itself as ${brand.name} and asks for credentials, but is hosted on ${host}, which is not an official ${brand.name} domain.`,
      });
      break;
    }
  }

  return out;
}

const KEY_COMBO =
  /(?:\bwin(?:dows)?\s*\+\s*r\b|⊞\s*\+?\s*r\b|\bctrl\s*\+\s*v\b|\bcommand\s*\+\s*v\b|⌘\s*\+?\s*v\b)/i;
const SHELL_TARGET =
  /(?:\bpowershell\b|\bcmd(?:\.exe)?\b|\bwindows\s+run\b|\brun\s+dialog\b|\bterminal\b|\biterm\b)/i;
const PASTE_VERB = /(?:\bpaste\b|\bctrl\s*\+\s*v\b|\bpress\s+enter\b)/i;
const VERIFY_CONTEXT =
  /(?:verify (?:you|that you) are (?:a )?human|i'?m not a robot|human verification|are you human|complete the captcha|verification steps|confirm you are not a robot)/i;

/**
 * Deterministic ClickFix signals: pages that trick a visitor into running a
 * command themselves, usually behind a fake "verify you are human" prompt.
 */
export function detectClickFix(ctx: PageContext): ThreatSignal[] {
  const text = `${ctx.title}\n${ctx.text}`;
  const keyCombo = KEY_COMBO.exec(text);
  const shell = SHELL_TARGET.exec(text);
  const paste = PASTE_VERB.test(text);
  const verify = VERIFY_CONTEXT.test(text);

  const cues: string[] = [];
  if (keyCombo) cues.push(`"${keyCombo[0].trim()}"`);
  if (shell) cues.push(`"${shell[0].trim()}"`);

  if (keyCombo !== null && shell !== null) {
    return [
      {
        id: 'clickfix-run-command',
        kind: 'clickfix',
        severity: 'high',
        title: 'Possible "ClickFix" run-command trick',
        explanation: `The page instructs you to open a command tool and run something (matched ${cues.join(
          ' and ',
        )})${
          verify ? ' behind a fake human-verification prompt' : ''
        }. Never paste or run commands a web page tells you to.`,
      },
    ];
  }

  if (verify && (paste || keyCombo !== null)) {
    return [
      {
        id: 'clickfix-fake-verification',
        kind: 'clickfix',
        severity: 'warn',
        title: 'Fake human-verification with paste/run steps',
        explanation: `The page pairs a human-verification prompt with instructions to paste or run something${
          keyCombo !== null ? ` (${cues.join(', ')})` : ''
        }. Legitimate CAPTCHAs never ask you to run commands.`,
      },
    ];
  }

  return [];
}

/** All deterministic signals for a page, phishing first then ClickFix. */
export function detectThreats(ctx: PageContext): ThreatSignal[] {
  return [...detectPhishing(ctx), ...detectClickFix(ctx)];
}

/** True when at least one signal warrants warning the user (warn or high). */
export function shouldWarn(signals: readonly ThreatSignal[]): boolean {
  return signals.some((signal) => signal.severity === 'warn' || signal.severity === 'high');
}
