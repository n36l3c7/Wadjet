# Security Policy

Wadjet is a tool for security analysts, and it handles data from investigations
that may itself be sensitive. Security of the extension is a first-class concern.

## Reporting a vulnerability

Please report suspected vulnerabilities **privately**. Do not open a public
issue for a security report.

- Use GitHub's [private vulnerability reporting](https://github.com/n36l3c7/Wadjet/security/advisories/new)
  for this repository, or
- contact the maintainer directly.

Please include a description, reproduction steps, affected version, and impact.
You will receive an acknowledgement, and we will coordinate a fix and disclosure
timeline with you.

## Scope

In scope:

- The extension itself (background, sidebar, core logic) and its build pipeline.
- Handling of case data (storage, and — in later waves — export and the native
  host).

Out of scope for this project by design (these are non-goals, not gaps):

- Acting as a proxy, scanner, or active testing tool.
- Anti-detection / fingerprint-spoofing behaviour.

## Design posture (v0.1.0)

- **Local only.** The Foundation wave performs no network requests and declares
  `data_collection_permissions: none`. Case data never leaves the browser.
- **Least privilege.** The manifest requests only `storage`. Every future
  permission must be justified in its PR and documented in the README.
- **No secrets in the repo or logs.** API keys (introduced when enrichment
  arrives) will use a dedicated storage strategy, never source or logs.
- **Untrusted input is validated at the boundary.** Persisted records and
  inbound messages are checked before use; user-controlled strings are rendered
  with `textContent`, never `innerHTML`.

A full threat model of the extension is scheduled as an explicit deliverable and
is tracked incrementally as sensitive data surfaces are added, rather than
deferred wholesale to v1.0.0.
