# Wadjet

A Firefox WebExtension that turns the browser into a **case-bound investigation
console** for security analysts. Everything an analyst touches during an
analysis — requests, decoded payloads, enrichment verdicts, screenshots, notes —
is automatically bound to a **case**, timestamped, and (in later waves)
exportable as a report. The goal is to stop context fragmentation during an
investigation.

Wadjet is **not** a proxy, **not** a scanner, and **not** a threat-intel
product. It integrates with the tools an analyst already uses; it does not
reimplement them. See [Non-goals](#non-goals).

> Named after Wadjet, the Egyptian cobra goddess of protection, and the _wedjat_
> (Eye of Horus).

## Status

**v0.2.0 — Traffic capture.** Building on the Foundation, this wave adds
opt-in capture of HTTP(S) requests bound to the active case: method, URL,
status, timings, redirect chains, and request/response headers, shown on a
filterable, paginated timeline in the sidebar. Capture is non-blocking
observation only (never interception), needs a one-time host permission granted
when you start it, and redacts sensitive headers (`Authorization`, `Cookie`,
tokens, …) before they are stored. Request/response **bodies** are not captured.
See [`CHANGELOG.md`](CHANGELOG.md).

## Requirements

- **Firefox** desktop, current ESR or stable (`strict_min_version` 128.0).
- **Node.js** 20+ and npm (for building from source).

## Getting started

```sh
npm install        # install dev dependencies
npm run build      # bundle the extension into dist/
npm run ext:run    # launch a temporary Firefox with the extension loaded
```

The sidebar (Wadjet's current-case surface) opens from the Firefox sidebar
button, or via **View → Sidebar → Wadjet**.

### Development scripts

| Script                | Purpose                                            |
| --------------------- | -------------------------------------------------- |
| `npm run build`       | One-off production bundle into `dist/`.            |
| `npm run build:watch` | Rebuild on change (inline sourcemaps, unminified). |
| `npm run typecheck`   | `tsc --noEmit` in strict mode.                     |
| `npm run lint`        | ESLint (type-aware).                               |
| `npm run format`      | Prettier check.                                    |
| `npm test`            | Vitest unit tests.                                 |
| `npm run ext:lint`    | `web-ext lint` (AMO validation) against `dist/`.   |
| `npm run check`       | Everything above, in sequence — the pre-PR gate.   |

## Architecture

The extension has two runtime contexts today:

- **Background coordinator** (`src/background/`) — owns the single source of
  truth for the case model (the `CaseService`) and answers typed messages. It is
  the only context that mutates persisted data.
- **Sidebar** (`src/sidebar/`) — a thin view over the typed message protocol;
  presentation and wiring only.

The background context also runs the non-blocking `webRequest` listeners that
feed traffic capture; the sidebar drives the capture toggle and the host-
permission prompt.

Shared domain logic lives in `src/core/`:

- `core/case/` — the case model: types, schema/version guards, and the service.
- `core/storage/` — a hybrid persistence layer: `browser.storage.local` for
  case metadata, IndexedDB for the entry stream and content-addressed blobs.
- `core/traffic/` — request correlation (assembling `webRequest` events into one
  record) and sensitive-header redaction, both pure and unit-tested.
- `core/messaging/` — the typed request/response protocol and client.

Persisted records carry a `schemaVersion`, so the on-disk shape can evolve
across waves through explicit migrations rather than guesswork.

## Permissions

Wadjet requests the **minimum viable** permissions at every wave; each is
justified here and in the PR that introduced it.

| Permission              | Since  | Why                                                                                          |
| ----------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `storage`               | v0.1.0 | Persist the case list and the active-case pointer locally.                                   |
| `webRequest`            | v0.2.0 | Observe request metadata and headers for traffic capture (non-blocking; never intercepting). |
| `<all_urls>` (optional) | v0.2.0 | Host access to capture across sites. **Optional** — requested only when you start capture.   |

Case entries and binary evidence are stored in IndexedDB, which requires no
manifest permission. Wadjet makes **no network requests of its own** and
transmits nothing; captured traffic stays local, sensitive headers are redacted
before storage, and the extension declares `data_collection_permissions: none`.

## Non-goals

Wadjet will not become any of the following, by design:

- A proxy or interception engine (integrate with Burp/mitmproxy instead).
- A vulnerability scanner or any active testing capability.
- A browser fingerprint spoofing / anti-detection tool.
- An ML/statistical classifier of phishing or malware. (Deterministic,
  individually explainable signals are a _post-1.0_ candidate.)
- A fork of Firefox.

## License

[MPL-2.0](LICENSE).
