#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
General template for running a command inside a fixed working directory
with easily configurable variables.

Usage:
  pythonapp <script_name> <argument>

How to configure:
  1. Set WORK_DIR   - the folder where the command will run.
  2. Set COMMAND_TEMPLATE - the command to execute.
                     Use {input} as a placeholder for the user argument.
                     Example: 'mytool.exe --user {input}'

The user argument is read from:
  - Environment variable PYTHONAPP_INPUT  (set by EasyUI automatically), or
  - Command-line argument sys.argv[1]     (when run manually)
"""
import os
import subprocess
import sys


if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')


# ── Configuration ─────────────────────────────────────────────────────────────

# Full path to the folder where the command should run.
# Example: r"C:\Tools\my-downloader"
WORK_DIR = r""

# The command template to execute in a new console window.
# Use {input} where the user-supplied argument should appear.
# Example: 'mytool.exe --output "C:\\Downloads" --user {input}'
COMMAND_TEMPLATE = ""

# ──────────────────────────────────────────────────────────────────────────────


def main() -> int:
    env_input = os.environ.get("PYTHONAPP_INPUT", "").strip()
    user_arg = env_input.split()[0].strip() if env_input else (sys.argv[1].strip() if len(sys.argv) >= 2 else "")

    if not user_arg:
        print("Usage: pythonapp <script_name> <argument>")
        print("Example: pythonapp myscript nasa")
        return 1

    if not WORK_DIR or not COMMAND_TEMPLATE:
        print("ERROR: WORK_DIR and COMMAND_TEMPLATE must be set in this script before use.")
        return 1

    command_core = COMMAND_TEMPLATE.format(input=user_arg)
    clean_env = os.environ.copy()
    clean_env.pop("VIRTUAL_ENV", None)
    clean_env.pop("PROMPT", None)

    try:
        subprocess.Popen(
            ["cmd.exe", "/k", command_core],
            cwd=WORK_DIR,
            env=clean_env,
            creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0),
        )
    except Exception as exc:
        print(f"ERROR: Failed to run command: {exc}")
        return 1

    print("OK: Command launched successfully.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())