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

## Design posture

- **Local first.** The only outbound network path is on-demand enrichment, to the
  provider whose key the analyst configured. Nothing is collected passively.
- **Least privilege.** Permissions are minimum-viable per feature and justified in
  the README; the broad `<all_urls>` host access is optional and user-granted.
- **No secrets in the repo or logs.** Provider API keys live in the browser
  profile, never in source, logs, or request URLs. Captured sensitive headers are
  redacted at rest by default.
- **Untrusted input is validated at the boundary.** Persisted records and inbound
  messages are checked; user- and page-controlled strings are rendered with
  `textContent`, never `innerHTML`. The native host runs only allowlisted tools
  with argument arrays (no shell) on validated inputs.

The full threat model is maintained in [`THREAT_MODEL.md`](THREAT_MODEL.md).
