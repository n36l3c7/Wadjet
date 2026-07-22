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

**v0.3.0 — Inline decoders.** Adds a "Decode selection" context-menu item that
opens an on-demand overlay next to the selection: it suggests likely encodings
(base64, URL, hex, unicode, JWT) with a reason for each, decodes, **chains** one
decoder onto another's output, and attaches the result to the active case as a
decoded artifact. Decoding is deterministic and decode-only (no JWT signature
verification); the overlay is injected on demand via `activeTab`, so decoding
needs no broad host access.

Earlier waves: **v0.2.0** opt-in traffic capture (redacted request metadata and
headers on a filterable timeline); **v0.1.0** the Foundation (case model,
storage, sidebar). See [`CHANGELOG.md`](CHANGELOG.md).

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
feed traffic capture and hosts the "Decode selection" context menu; the sidebar
drives the capture toggle and the host-permission prompt. An overlay content
script (`src/content/`) is injected on demand for inline decoding.

Shared domain logic lives in `src/core/`:

- `core/case/` — the case model: types, schema/version guards, and the service.
- `core/storage/` — a hybrid persistence layer: `browser.storage.local` for
  case metadata, IndexedDB for the entry stream and content-addressed blobs.
- `core/traffic/` — request correlation (assembling `webRequest` events into one
  record) and sensitive-header redaction, both pure and unit-tested.
- `core/decode/` — deterministic decoders (base64, URL, hex, unicode, JWT) and
  rule-based encoding detection, both pure and unit-tested.
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
| `menus`                 | v0.3.0 | Add the "Decode selection" context-menu item.                                                |
| `activeTab`             | v0.3.0 | Access the current tab to inject the decoder overlay, granted by the menu click.             |
| `scripting`             | v0.3.0 | Inject the decoder overlay content script on demand.                                         |

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
