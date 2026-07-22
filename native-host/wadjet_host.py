#!/usr/bin/env python3
"""Wadjet native messaging host.

An *optional* helper for the Wadjet Firefox extension. It:

- archives a case (metadata + entries) into a local SQLite database, and writes
  the extension's export bundle (Markdown/HAR/CSV/JSON) as evidence files;
- runs a small allowlist of local tools (``whois``, ``exiftool``, ``yara``) on
  validated inputs.

Security posture:

- No shell. Tools are executed with argument arrays only (``shell=False``).
- Only the three allowlisted tools may run.
- ``whois`` accepts only a domain or IP; ``exiftool``/``yara`` accept only file
  paths confined to the Wadjet home directory (``WADJET_HOME`` or ``~/.wadjet``).
- Evidence filenames are reduced to a safe basename.

Data lives under ``WADJET_HOME`` (default ``~/.wadjet``): ``archive.db`` and
``evidence/<case-id>/``.
"""
from __future__ import annotations

import json
import os
import re
import sqlite3
import struct
import subprocess
import sys
import time

VERSION = "0.8.0"
ALLOWED_TOOLS = ("whois", "exiftool", "yara")
TOOL_TIMEOUT_SECONDS = 30

_DOMAIN = re.compile(r"^(?=.{1,253}$)([a-zA-Z0-9](?:-?[a-zA-Z0-9])*\.)+[a-zA-Z]{2,}$")
_IPV4 = re.compile(r"^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$")
_IPV6 = re.compile(r"^[0-9a-fA-F:]+$")


def wadjet_home() -> str:
    """Return the Wadjet data directory (created on demand by callers)."""
    return os.environ.get("WADJET_HOME") or os.path.join(os.path.expanduser("~"), ".wadjet")


# --- native messaging framing ------------------------------------------------


def read_message(stream) -> dict | None:
    """Read one length-prefixed JSON message, or None at end of stream."""
    raw_length = stream.read(4)
    if len(raw_length) < 4:
        return None
    (length,) = struct.unpack("<I", raw_length)
    data = stream.read(length)
    return json.loads(data.decode("utf-8"))


def write_message(stream, message: dict) -> None:
    """Write one length-prefixed JSON message."""
    data = json.dumps(message).encode("utf-8")
    stream.write(struct.pack("<I", len(data)))
    stream.write(data)
    stream.flush()


# --- validation --------------------------------------------------------------


def is_valid_indicator(value: str) -> bool:
    """Whether ``value`` is a plausible domain or IP (for whois)."""
    value = value.strip()
    if _IPV4.match(value):
        return True
    if ":" in value and _IPV6.match(value):
        return True
    return bool(_DOMAIN.match(value))


def confine_path(home: str, relative: str) -> str:
    """Resolve ``relative`` under ``home``, refusing anything that escapes it."""
    base = os.path.realpath(home)
    target = os.path.realpath(os.path.join(base, relative))
    if target != base and not target.startswith(base + os.sep):
        raise ValueError("path escapes the Wadjet home directory")
    return target


def sanitize_filename(name: str) -> str:
    """Reduce ``name`` to a safe basename."""
    base = os.path.basename(name).strip()
    base = re.sub(r"[^A-Za-z0-9._-]", "_", base)
    return base or "file"


def build_tool_argv(tool: str, tool_input: str, home: str) -> list[str]:
    """Build the argument array for an allowlisted tool, validating the input."""
    if tool not in ALLOWED_TOOLS:
        raise ValueError(f"tool not allowed: {tool}")
    if tool == "whois":
        if not is_valid_indicator(tool_input):
            raise ValueError("whois input must be a domain or IP")
        return ["whois", tool_input.strip()]
    if tool == "exiftool":
        return ["exiftool", confine_path(home, tool_input)]
    rules = os.path.join(os.path.realpath(home), "rules.yar")
    if not os.path.isfile(rules):
        raise ValueError("yara rules not found at <WADJET_HOME>/rules.yar")
    return ["yara", rules, confine_path(home, tool_input)]


# --- command handlers --------------------------------------------------------


def handle_tool(message: dict) -> dict:
    tool = str(message.get("tool", ""))
    tool_input = str(message.get("input", ""))
    argv = build_tool_argv(tool, tool_input, wadjet_home())
    try:
        completed = subprocess.run(
            argv,
            capture_output=True,
            text=True,
            timeout=TOOL_TIMEOUT_SECONDS,
            shell=False,
            check=False,
        )
    except FileNotFoundError:
        return {"ok": False, "error": f"{tool} is not installed on this machine"}
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": f"{tool} timed out"}
    output = completed.stdout + (("\n" + completed.stderr) if completed.stderr else "")
    return {"ok": True, "output": output, "exitCode": completed.returncode}


def _archive_db(db_path: str, case: dict, entries: list[dict]) -> int:
    connection = sqlite3.connect(db_path)
    try:
        connection.execute(
            "CREATE TABLE IF NOT EXISTS cases ("
            "id TEXT PRIMARY KEY, name TEXT, status TEXT, createdAt INTEGER, "
            "closedAt INTEGER, tags TEXT, schemaVersion INTEGER, archivedAt INTEGER)"
        )
        connection.execute(
            "CREATE TABLE IF NOT EXISTS entries ("
            "id TEXT PRIMARY KEY, caseId TEXT, kind TEXT, timestamp INTEGER, json TEXT)"
        )
        connection.execute(
            "INSERT OR REPLACE INTO cases VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                case.get("id"),
                case.get("name"),
                case.get("status"),
                case.get("createdAt"),
                case.get("closedAt"),
                json.dumps(case.get("tags", [])),
                case.get("schemaVersion"),
                int(time.time() * 1000),
            ),
        )
        connection.execute("DELETE FROM entries WHERE caseId = ?", (case.get("id"),))
        connection.executemany(
            "INSERT OR REPLACE INTO entries VALUES (?, ?, ?, ?, ?)",
            [
                (
                    entry.get("id"),
                    entry.get("caseId"),
                    entry.get("kind"),
                    entry.get("timestamp"),
                    json.dumps(entry),
                )
                for entry in entries
            ],
        )
        connection.commit()
    finally:
        connection.close()
    return len(entries)


def handle_archive(message: dict) -> dict:
    import base64

    home = wadjet_home()
    os.makedirs(home, exist_ok=True)
    case = message.get("case") or {}
    entries = message.get("entries") or []
    files = message.get("files") or []

    db_path = os.path.join(home, "archive.db")
    rows = _archive_db(db_path, case, entries)

    case_id = sanitize_filename(str(case.get("id", "case")))
    evidence_dir = os.path.join(home, "evidence", case_id)
    os.makedirs(evidence_dir, exist_ok=True)
    for entry in files:
        name = sanitize_filename(str(entry.get("name", "file")))
        content = base64.b64decode(str(entry.get("contentBase64", "")))
        with open(os.path.join(evidence_dir, name), "wb") as handle:
            handle.write(content)

    return {"ok": True, "dbPath": db_path, "evidenceDir": evidence_dir, "rows": rows}


def handle(message: dict) -> dict:
    """Dispatch one request to its handler."""
    command = message.get("cmd")
    if command == "ping":
        return {"ok": True, "version": VERSION}
    if command == "archive":
        return handle_archive(message)
    if command == "tool":
        return handle_tool(message)
    return {"ok": False, "error": f"unknown command: {command}"}


def main() -> None:
    while True:
        message = read_message(sys.stdin.buffer)
        if message is None:
            break
        try:
            response = handle(message)
        except Exception as error:  # noqa: BLE001 - report any failure to the caller
            response = {"ok": False, "error": str(error)}
        write_message(sys.stdout.buffer, response)


if __name__ == "__main__":
    main()
