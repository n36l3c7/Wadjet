# Contributing to Wadjet

## Delivery model — waves

Wadjet is built in numbered **waves**, one at a time. A wave is scoped, its
features are each decided explicitly (with design options and trade-offs), and
it is closed only when tests pass, docs are updated, the changelog is written,
the version is bumped, and a release is tagged. Nothing is implemented before it
is agreed.

## Development workflow

1. Branch per wave: `wave/NN-short-name` (e.g. `wave/02-traffic-capture`).
2. Implement with tests and TSDoc.
3. Run the full gate before opening a PR:

   ```sh
   npm run check
   ```

   This runs typecheck, lint, format check, tests, a production build, and
   `web-ext lint`.

4. Open a PR into `main`; it is squash-merged. `main` must always build and
   always load in Firefox.

## Commit conventions

- **Conventional Commits**: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`,
  `chore:`.
- **Semantic Versioning**. During `0.x`, each wave maps to a minor version.
- Tag each completed wave (`v0.2.0`) and keep [`CHANGELOG.md`](CHANGELOG.md) in
  [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## Code quality

- TypeScript in **strict** mode. No `any` without a comment justifying it.
- ESLint + Prettier, enforced in CI.
- **TSDoc** on every exported function, type, and module.
- Unit tests for pure logic; integration tests where the WebExtension API allows.
- Record the rationale for every non-obvious decision in the PR description.
- Minimum viable permissions. Every new permission is justified in the PR
  description and documented in the [README](README.md).
- Secrets never in the repo, never in logs.

## Architecture ground rules

- The **background** context is the only writer of the case model. UI surfaces
  talk to it through the typed message protocol (`src/core/messaging/`); they do
  not touch storage directly.
- User-controlled strings are rendered with `textContent`, never `innerHTML`.
- Persisted records carry a `schemaVersion`; changing the on-disk shape means
  bumping it and providing a migration.

## License

By contributing you agree that your contributions are licensed under the
[Mozilla Public License 2.0](LICENSE).
