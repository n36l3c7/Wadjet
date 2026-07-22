# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
During the `0.x` series, each wave maps to a minor version.

## [Unreleased]

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

[Unreleased]: https://github.com/n36l3c7/Wadjet/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/n36l3c7/Wadjet/releases/tag/v0.1.0
