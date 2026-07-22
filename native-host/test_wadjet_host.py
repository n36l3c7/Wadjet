"""Unit tests for the pure parts of the Wadjet native host."""
import io
import os
import tempfile
import unittest

import wadjet_host as host


class FramingTests(unittest.TestCase):
    def test_round_trip(self) -> None:
        buffer = io.BytesIO()
        host.write_message(buffer, {"cmd": "ping"})
        buffer.seek(0)
        self.assertEqual(host.read_message(buffer), {"cmd": "ping"})

    def test_empty_stream_returns_none(self) -> None:
        self.assertIsNone(host.read_message(io.BytesIO()))


class ValidationTests(unittest.TestCase):
    def test_valid_indicators(self) -> None:
        self.assertTrue(host.is_valid_indicator("example.com"))
        self.assertTrue(host.is_valid_indicator("8.8.8.8"))
        self.assertTrue(host.is_valid_indicator("2001:4860:4860::8888"))

    def test_invalid_indicators(self) -> None:
        self.assertFalse(host.is_valid_indicator("not an indicator"))
        self.assertFalse(host.is_valid_indicator("; rm -rf /"))

    def test_sanitize_filename(self) -> None:
        self.assertEqual(host.sanitize_filename("../../etc/passwd"), "passwd")
        self.assertEqual(host.sanitize_filename("a b*c.md"), "a_b_c.md")


class ConfinePathTests(unittest.TestCase):
    def test_allows_paths_within_home(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            target = host.confine_path(home, "sub/file.jpg")
            self.assertTrue(target.startswith(os.path.realpath(home)))

    def test_rejects_escape(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaises(ValueError):
                host.confine_path(home, "../escape.txt")


class ToolArgvTests(unittest.TestCase):
    def test_whois_requires_valid_indicator(self) -> None:
        self.assertEqual(host.build_tool_argv("whois", "example.com", "/tmp"), ["whois", "example.com"])
        with self.assertRaises(ValueError):
            host.build_tool_argv("whois", "; evil", "/tmp")

    def test_unknown_tool_rejected(self) -> None:
        with self.assertRaises(ValueError):
            host.build_tool_argv("rm", "x", "/tmp")

    def test_exiftool_confines_path(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            argv = host.build_tool_argv("exiftool", "evidence/file.jpg", home)
            self.assertEqual(argv[0], "exiftool")
            self.assertTrue(argv[1].startswith(os.path.realpath(home)))

    def test_yara_requires_rules(self) -> None:
        with tempfile.TemporaryDirectory() as home:
            with self.assertRaises(ValueError):
                host.build_tool_argv("yara", "file.bin", home)


if __name__ == "__main__":
    unittest.main()
