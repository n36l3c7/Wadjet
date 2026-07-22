@echo off
rem Windows launcher for the Wadjet native messaging host.
rem Native messaging cannot point at a .py directly on Windows, so this wrapper
rem runs it. If "python" is not on PATH, replace it with "py" or a full path.
python "%~dp0wadjet_host.py"
