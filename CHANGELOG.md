# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
During the `0.x` series, each wave maps to a minor version.

## [Unreleased]

## [0.6.0] - 2026-07-22

### Added

- **Wave 6 — Export.**
- Export the active case as a Markdown report (metadata, extracted IOCs,
  timeline), a HAR 1.2 of captured requests, a CSV of IOCs, or a full JSON dump.
- Deterministic IOC extraction from structured fields only (request and
  detonation URLs and their hostnames, decoded-artifact sources, enrichment
  indicators), deduplicated and classified.
- Download exports via the Firefox `downloads` API, or copy them to the
  clipboard. Redacted header values remain redacted in every format.
- New permission: `downloads`.

## [0.5.0] - 2026-07-22

### Added

- **Wave 5 — Isolated detonation.**
- "Open in throwaway container": opens a URL in a fresh `contextualIdentities`
  container (isolated cookies/storage) and removes the container when its tab
  closes. Recorded on the case as a new `detonation` entry kind.
- Launch from a context menu (link or selection), a sidebar field, or a button
  on a captured request entry.
- Honest UI throughout: the feature states that it isolates cookies/storage
  only and is **not** a network, process, or exploit sandbox.
- New permissions: `contextualIdentities` and `cookies`.

## [0.4.0] - 2026-07-22

### Added

- **Wave 4 — Enrichment.**
- On-demand lookup of a domain, IP, hash, or URL across a registry of
  independent providers — VirusTotal, AlienVault OTX, AbuseIPDB — each queried
  only when its API key is configured. Results are shown per provider and never
  merged into a single score.
- Deterministic indicator classification; a per-provider token-bucket rate
  limiter; a TTL cache of results; offline-safe behaviour (cache hits need no
  network, and failures/rate-limits yield an explanation rather than throwing).
- A new `enrichment` entry kind on the filterable timeline.
- Provider API keys stored in `browser.storage.local` (never in the repo or
  logs); the settings view reports only whether a key is set.
- "Enrich selection" context menu (attaches to the active case) and a manual
  enrichment field in the sidebar with a preview and "Add to case".
- New optional per-provider host permissions, requested only when you save a
  provider's key.

### Note

- Scope: the brief specified a single provider for this wave; by request it now
  supports three independent providers gated on configured keys (no cross-
  provider aggregation).

### Added

- **Wave 3 — Inline decoders.**
- Deterministic, decode-only decoders: base64 (incl. url-safe), URL/percent,
  hex, unicode escapes, and JWT (header + payload; the signature is shown but
  never verified). Each is a pure, individually-tested function.
- Rule-based encoding detection that suggests likely decoders with a
  plain-language reason for each — suggestion only, never a verdict.
- A "Decode selection" context-menu item that injects an on-demand overlay next
  to the selection (shadow DOM): apply suggested or manual decoders, chain one
  onto another's output, and add the result to the active case.
- A new `decoded-artifact` entry kind (input, decoder chain, output, source URL)
  on the filterable timeline, with input/output capped for storage.
- New permissions: `menus`, `activeTab`, and `scripting` (the overlay is
  injected on demand; no broad host access is needed for decoding).

## [0.2.0] - 2026-07-22

### Added

- **Wave 2 — Traffic capture.**
- Opt-in capture of HTTP(S) requests bound to the active case, via non-blocking
  `webRequest` observation (never interception). Records method, URL, resource
  type, status, timings, redirect chain, request/response headers, remote IP,
  cache flag, and errors as a new `request` entry kind. Bodies are not captured.
- Sensitive-header redaction at capture time, driven by a versioned, editable
  denylist data file. Redact-by-default with an explicit per-session opt-in to
  retain raw values; fails loud (masks everything) if the denylist is unusable.
- A start/stop capture toggle in the sidebar that requests the optional
  `<all_urls>` host permission on first use and binds capture to one case.
- A filterable (by kind and free text), paginated timeline that renders notes
  and captured requests, with expandable request details.
- New permissions: `webRequest` (required) and `<all_urls>` (optional).

### Changed

- The content store gains a newest-first, kind-filtered, cursor-paginated
  `queryEntries`; the sidebar timeline uses it instead of loading everything.

## [0.1.0] - 2026-07-22

### Added

- **Wave 1 — Foundation.**
- Project scaffolding: TypeScript (strict), ESLint (type-aware) + Prettier,
  Vitest, and an esbuild-based build pipeline wired to `web-ext`.
- MV3 Firefox manifest with an empty sidebar shell. Requests only the `storage`
  permission; declares no data collection.
- Hybrid storage layer: a metadata store over `browser.storage.local` for cases
  and the active-case pointer, an IndexedDB content store for the time-ordered
  entry stream, and a content-addressed IndexedDB blob store for future binary
  evidence.
- Case model (`schemaVersion` 1): create / open / close cases, append
  timestamped note entries with tags, and a per-case timeline ordered by time.
  Entries are a discriminated union designed to admit new kinds without a schema
  migration.
- Typed `runtime` message protocol between the sidebar and the background
  coordinator, which owns the single `CaseService` instance.
- Sidebar UI to create, open, and close cases, add notes, and view the timeline.
- CI: GitHub Actions running typecheck, lint, format check, tests, build, and
  `web-ext lint` on every push and pull request.
- Documentation: README, CONTRIBUTING, and SECURITY.

[Unreleased]: https://github.com/n36l3c7/Wadjet/compare/v0.6.0...HEAD
[0.6.0]: https://github.com/n36l3c7/Wadjet/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/n36l3c7/Wadjet/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/n36l3c7/Wadjet/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/n36l3c7/Wadjet/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/n36l3c7/Wadjet/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/n36l3c7/Wadjet/releases/tag/v0.1.0
