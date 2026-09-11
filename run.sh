#!/usr/bin/env bash
set -euo pipefail

# AI-OllamaPromptHelper start script
# Determines the project root directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check for virtual environment in standard locations (.venv or venv)
if [ -f "$SCRIPT_DIR/.venv/bin/python" ]; then
    PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
elif [ -f "$SCRIPT_DIR/venv/bin/python" ]; then
    PYTHON_BIN="$SCRIPT_DIR/venv/bin/python"
elif [ -f "$SCRIPT_DIR/.venv/Scripts/python.exe" ]; then
    PYTHON_BIN="$SCRIPT_DIR/.venv/Scripts/python.exe"
elif [ -f "$SCRIPT_DIR/venv/Scripts/python.exe" ]; then
    PYTHON_BIN="$SCRIPT_DIR/venv/Scripts/python.exe"
elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
else
    echo "Error: Python was not found in .venv, venv or system PATH." >&2
    echo "Please create a virtual environment first: python -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
    exit 1
fi

exec "$PYTHON_BIN" -m uvicorn app.main:app --reload "$@"
