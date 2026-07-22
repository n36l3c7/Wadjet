# Wadjet — threat model

Scope: the Wadjet Firefox extension and its optional native host. This is the
extension's threat model of **itself** — what it protects, the boundaries it sits
on, the threats to those, and the mitigations in place. It is maintained
alongside the code and revisited when a wave adds a new surface.

## Assets

| Asset                          | Where it lives                               | Sensitivity |
| ------------------------------ | -------------------------------------------- | ----------- |
| Case data (entries)            | IndexedDB (browser profile)                  | Medium–High |
| Captured request headers       | IndexedDB; sensitive values redacted at rest | High        |
| Decoded artifacts, tool output | IndexedDB                                    | Medium–High |
| Provider API keys              | `browser.storage.local` (browser profile)    | High        |
| Exported reports               | User-chosen download location                | Medium–High |
| Native archive + evidence      | `~/.wadjet` on the local filesystem          | Medium–High |

## Trust boundaries

1. **Web page ↔ content scripts.** The decoder/enrichment overlays run in an
   isolated content-script world injected on demand. They read the selection and
   render into a shadow root; they never write page-controlled data with
   `innerHTML` (only `textContent`).
2. **UI surfaces ↔ background.** Sidebar, DevTools panel, and content scripts talk
   to the background over `runtime` messaging. The background owns all model
   mutation and all privileged APIs.
3. **Extension ↔ third-party providers.** Enrichment is the only outbound network
   path, and only to the provider whose key the analyst configured.
4. **Extension ↔ native host.** `sendNativeMessage` to `wadjet_host`, a separate
   process the analyst installs. The native-messaging manifest is locked to this
   extension id.
5. **Browser profile.** The profile is the ultimate trust boundary for data at
   rest (IndexedDB, `storage.local`, `~/.wadjet`).

## Threats and mitigations

- **Secret leakage from captured traffic.** Sensitive headers (`Authorization`,
  `Cookie`, tokens) are redacted at capture time by a versioned denylist and
  never persisted in the clear unless the analyst explicitly opts in for a
  session. Redaction is preserved in every export. Secrets are never logged.
- **Markup/script injection via recorded or observed text.** All UI renders
  user- and page-controlled strings with `textContent`; there is no `innerHTML`,
  `eval`, `document.write`, or `new Function` in the codebase. Provider permalinks
  are only rendered as links when they are `https://` URLs built from fixed
  prefixes.
- **Over-broad permissions.** Permissions are minimum-viable per wave and
  documented in the README. The broad `<all_urls>` host access (capture, TLS) is
  **optional** and requested only on explicit user action. `webRequestBlocking`
  is used by one observe-only listener (TLS via `getSecurityInfo`).
- **Native host command execution.** The host never uses a shell (argument arrays
  only), runs only three allowlisted tools, validates the `whois` indicator, and
  confines `exiftool`/`yara` file paths to its data directory. The manifest's
  `allowed_extensions` restricts callers to this extension.
- **Data exfiltration.** Wadjet performs no passive/telemetry collection. The one
  outbound path (enrichment) sends only a user-provided indicator to a
  user-configured provider; declared to Firefox as **optional** data collection.
- **API key theft.** Keys live in the browser profile (`storage.local`), never in
  the repo, logs, or request URLs (they are sent in headers). The settings view
  reports only whether a key is set.

## Residual risks (accepted for 1.0)

- **Data at rest is not encrypted beyond the browser profile / OS account.** An
  attacker with the profile or the `~/.wadjet` directory can read case data and
  keys. Passphrase-at-rest encryption is a documented future option (ADR 0010).
- **A page with a strict CSP may affect the injected overlay's styling** (the
  shadow-root `<style>` is subject to the page context). Functionality degrades,
  not a security issue.
- **Same-extension messages are trusted after a structural check.** All senders
  are extension contexts (no `externally_connectable`); a compromised content
  script could only act within the active case.
- **The native host runs third-party tools** whose own security is outside
  Wadjet's control; it is optional and installed deliberately by the analyst.

## Reporting

Security issues: see [`SECURITY.md`](SECURITY.md).
