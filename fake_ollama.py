"""Small Ollama-compatible mock for local UI development.

Run with ``python .local/fake_ollama.py`` and point ``ollamaUrl`` in
``config.local.json`` at ``http://127.0.0.1:11434``. A user message containing
``lorem(words,paragraphs)`` controls the exact words per paragraph and number
of paragraphs; other messages receive a short default Lorem Ipsum response.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from time import perf_counter
from typing import Any


LOREM_WORDS = (
    "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod "
    "tempor incididunt ut labore et dolore magna aliqua"
).split()
LOREM_COMMAND = re.compile(
    r"\blorem\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)", re.IGNORECASE
)
MAX_OUTPUT_WORDS = 10_000
FAKE_THINKING = (
    "Ich prüfe die Eingabe und plane eine passende Lorem-Ipsum-Antwort."
)


def message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return " ".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and isinstance(block.get("text"), str)
        )
    return ""


def make_lorem(prompt: str) -> str:
    match = LOREM_COMMAND.search(prompt)
    words_per_paragraph, paragraph_count = (10, 1)
    if match:
        words_per_paragraph, paragraph_count = map(int, match.groups())
        if words_per_paragraph < 1 or paragraph_count < 1:
            raise ValueError("lorem() values must both be greater than zero")
        if words_per_paragraph * paragraph_count > MAX_OUTPUT_WORDS:
            raise ValueError(
                f"lorem() output is limited to {MAX_OUTPUT_WORDS} words"
            )

    paragraphs = []
    for paragraph_index in range(paragraph_count):
        start = (paragraph_index * words_per_paragraph) % len(LOREM_WORDS)
        words = [
            LOREM_WORDS[(start + word_index) % len(LOREM_WORDS)]
            for word_index in range(words_per_paragraph)
        ]
        paragraphs.append(" ".join(words).capitalize() + ".")
    return "\n\n".join(paragraphs)


def timestamp() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class FakeOllamaHandler(BaseHTTPRequestHandler):
    server_version = "FakeOllama/1.0"
    protocol_version = "HTTP/1.0"

    def send_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/api/tags":
            model = self.server.model_name
            self.send_json(
                {
                    "models": [
                        {
                            "name": model,
                            "model": model,
                            "modified_at": timestamp(),
                            "size": 0,
                            "digest": "0" * 64,
                            "details": {
                                "format": "mock",
                                "family": "mock",
                                "families": ["mock"],
                                "parameter_size": "0",
                                "quantization_level": "unknown",
                            },
                        }
                    ]
                }
            )
            return
        if self.path == "/api/version":
            self.send_json({"version": "0.0.0-fake"})
            return
        self.send_json({"error": "Not found"}, status=404)

    def do_POST(self) -> None:
        if self.path != "/api/chat":
            self.send_json({"error": "Not found"}, status=404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(length))
            messages = request.get("messages", [])
            prompt = next(
                (
                    message_text(message.get("content"))
                    for message in reversed(messages)
                    if message.get("role") == "user"
                ),
                "",
            )
            response_text = make_lorem(prompt)
            thinking_enabled = request.get("think") is True
            thinking_text = FAKE_THINKING if thinking_enabled else None
        except (json.JSONDecodeError, TypeError, ValueError) as error:
            self.send_json({"error": str(error)}, status=400)
            return

        if request.get("stream", True):
            self.stream_chat(response_text, thinking_text)
        else:
            self.send_json(
                self.chat_result(response_text, perf_counter(), thinking_text)
            )

    def chat_result(
        self, content: str, started_at: float, thinking: str | None = None
    ) -> dict[str, Any]:
        message = {"role": "assistant", "content": content}
        if thinking:
            message["thinking"] = thinking
        return {
            "model": self.server.model_name,
            "created_at": timestamp(),
            "message": message,
            "done": True,
            "done_reason": "stop",
            "total_duration": int(
                (perf_counter() - started_at) * 1_000_000_000
            ),
            "prompt_eval_count": 0,
            "eval_count": len(content.split()),
        }

    def stream_chat(self, content: str, thinking: str | None = None) -> None:
        started_at = perf_counter()
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        try:
            if thinking:
                for chunk in re.findall(r"\S+\s*", thinking):
                    self.write_json_line(
                        {
                            "model": self.server.model_name,
                            "created_at": timestamp(),
                            "message": {
                                "role": "assistant",
                                "thinking": chunk,
                            },
                            "done": False,
                        }
                    )
            for chunk in re.findall(r"\S+\s*", content):
                self.write_json_line(
                    {
                        "model": self.server.model_name,
                        "created_at": timestamp(),
                        "message": {"role": "assistant", "content": chunk},
                        "done": False,
                    }
                )
            result = self.chat_result("", started_at)
            result["message"] = {"role": "assistant", "content": ""}
            result["eval_count"] = len(content.split())
            self.write_json_line(result)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def write_json_line(self, payload: dict[str, Any]) -> None:
        line = json.dumps(payload, ensure_ascii=False) + "\n"
        self.wfile.write(line.encode("utf-8"))
        self.wfile.flush()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run a small local fake Ollama server."
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="interface to bind (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=11434,
        help="port to listen on (default: 11434)",
    )
    parser.add_argument(
        "--model",
        default="fake-lorem:latest",
        help="model name reported by /api/tags",
    )
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), FakeOllamaHandler)
    server.model_name = args.model
    print(
        f"Fake Ollama listening at http://{args.host}:{args.port} "
        f"(model: {args.model})"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping fake Ollama.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
