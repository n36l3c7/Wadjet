# Wadjet native host (optional)

A small Python helper for the Wadjet extension. It is **optional** — the
extension works fully without it. When installed, it adds:

- a **SQLite archive** of a case (metadata + entries) at `<WADJET_HOME>/archive.db`;
- **filesystem evidence**: the case's export bundle (Markdown/HAR/CSV/JSON) written
  to `<WADJET_HOME>/evidence/<case-id>/`;
- **local tools** run on validated inputs: `whois`, `exiftool`, `yara`.

`WADJET_HOME` defaults to `~/.wadjet`.

## Requirements

- Python 3.9+.
- For the tools you want to use: `whois`, `exiftool`, and/or `yara` on `PATH`.
  For `yara`, put your rules at `<WADJET_HOME>/rules.yar`.

## Install

1. Point the manifest at the launcher. Edit `wadjet_host.json` and set `path` to
   an **absolute** path:
   - Windows: the absolute path to `wadjet_host.bat`.
   - macOS/Linux: the absolute path to `wadjet_host.py` (and `chmod +x wadjet_host.py`).

2. Register the manifest with Firefox:
   - **Linux:** copy `wadjet_host.json` to
     `~/.mozilla/native-messaging-hosts/wadjet_host.json`.
   - **macOS:** copy it to
     `~/Library/Application Support/Mozilla/NativeMessagingHosts/wadjet_host.json`.
   - **Windows:** create a registry key
     `HKEY_CURRENT_USER\Software\Mozilla\NativeMessagingHosts\wadjet_host`
     whose default value is the absolute path to `wadjet_host.json`.

3. In the extension sidebar, the **Native host** status should read "connected".

## Security

- No shell is ever used; tools run with argument arrays only.
- Only `whois`, `exiftool`, and `yara` can run.
- `whois` accepts only a domain or IP. `exiftool`/`yara` accept only file paths
  **confined to `WADJET_HOME`** (put files to inspect under that directory).
- The manifest's `allowed_extensions` restricts the host to this extension.

## Tests

```sh
python -m unittest discover native-host
```
