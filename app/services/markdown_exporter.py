"""Parses <prompt> markup from LLM replies and exports/reads a per-topic Markdown
prompt library (see README.md section 9).

Markdown entry format (one per extracted prompt, appended to
`<outputFolder>/<slugify_topic(topic)>.md`)::

    # <topic>

    ## <description>

    **Type:** <type>

    ```text
    <prompt text>
    ```

    ## Feedback

    <!-- Add feedback here manually. -->

    ---

The code-fence length is chosen dynamically (at least 3 backticks, longer than
any backtick run already present in the prompt text) so the prompt text round
-trips exactly, including embedded backticks or `#` characters. The "Feedback"
section is a manual-only placeholder: `read_library` never parses or returns
its content.
"""
from __future__ import annotations

import re
from pathlib import Path

from pydantic import BaseModel

_PROMPT_TAG_RE = re.compile(
    r"<prompt\s+([^>]*?)>(.*?)</prompt>", re.DOTALL | re.IGNORECASE
)
_ATTR_RE_TEMPLATE = r'{name}\s*=\s*"([^"]*)"'
_TYPE_ATTR_RE = re.compile(_ATTR_RE_TEMPLATE.format(name="type"), re.IGNORECASE)
_DESCRIPTION_ATTR_RE = re.compile(_ATTR_RE_TEMPLATE.format(name="description"), re.IGNORECASE)

# Only characters in this whitelist ever survive slugification; everything
# else (including "." and "/") is replaced, which makes path traversal
# impossible regardless of the input (OWASP A01 - path traversal).
_SLUG_INVALID_RE = re.compile(r"[^a-z0-9]+")
_MAX_SLUG_LENGTH = 80

# Entries are separated by a "---" line (see _render_entry). Splitting on
# that first, then matching each segment independently, means a broken or
# manually-edited segment is simply skipped instead of its leftover text
# bleeding into the next real entry (which a single file-wide regex would do,
# since its non-greedy "description" group would just keep expanding until it
# found the next "**Type:**" anywhere in the file).
_SEPARATOR_RE = re.compile(r"^-{3,}\s*$", re.MULTILINE)
_ENTRY_RE = re.compile(
    r"^## (?P<description>.+?)\n\n"
    r"\*\*Type:\*\*\s*(?P<type>\S+)\n\n"
    r"(?P<fence>`{3,})text\n"
    r"(?P<prompt>.*?)\n"
    r"(?P=fence)\n",
    re.MULTILINE | re.DOTALL,
)


class ExtractedPrompt(BaseModel):
    """A single prompt suggestion extracted from an LLM reply or the Markdown library."""

    type: str
    description: str
    prompt: str


def parse_prompts(text: str) -> list[ExtractedPrompt]:
    """Find all well-formed <prompt type="..." description="...">...</prompt>
    occurrences in text. Malformed or unclosed tags are silently skipped."""
    results: list[ExtractedPrompt] = []
    for attrs_raw, body in _PROMPT_TAG_RE.findall(text):
        type_match = _TYPE_ATTR_RE.search(attrs_raw)
        description_match = _DESCRIPTION_ATTR_RE.search(attrs_raw)
        if not type_match or not description_match:
            continue
        results.append(
            ExtractedPrompt(
                type=type_match.group(1),
                description=description_match.group(1),
                prompt=body.strip(),
            )
        )
    return results


def slugify_topic(topic: str) -> str:
    """Build a filesystem-safe slug for a topic name.

    Defensive by construction: only lowercase letters and digits are ever kept,
    everything else (including "..", "/", "\\") becomes a single "-"
    separator, so path traversal is impossible even for adversarial input.
    Falls back to "untitled" if the result would otherwise be empty.
    """
    lowered = topic.strip().lower()
    slug = _SLUG_INVALID_RE.sub("-", lowered).strip("-")
    slug = slug[:_MAX_SLUG_LENGTH].strip("-")
    return slug or "untitled"


def _library_path(output_folder: str, topic: str) -> Path:
    """Resolve the Markdown library path for topic, guaranteed to stay inside
    output_folder (defense in depth on top of slugify_topic's whitelist)."""
    base = Path(output_folder).resolve()
    candidate = (base / f"{slugify_topic(topic)}.md").resolve()
    if candidate != base and base not in candidate.parents:
        raise ValueError(f"Resolved path {candidate} escapes output folder {base}")
    return candidate


def _fence_for(text: str) -> str:
    """Pick a backtick fence longer than any backtick run already in text."""
    max_run = 0
    current = 0
    for char in text:
        if char == "`":
            current += 1
            max_run = max(max_run, current)
        else:
            current = 0
    return "`" * max(3, max_run + 1)


def _render_entry(prompt: ExtractedPrompt) -> str:
    fence = _fence_for(prompt.prompt)
    return (
        f"## {prompt.description}\n\n"
        f"**Type:** {prompt.type}\n\n"
        f"{fence}text\n"
        f"{prompt.prompt}\n"
        f"{fence}\n\n"
        "## Feedback\n\n"
        "<!-- Add feedback here manually. -->\n\n"
        "---\n\n"
    )


def export_prompts(output_folder: str, topic: str, prompts: list[ExtractedPrompt]) -> Path:
    """Append each prompt as a Markdown section to the topic's library file,
    creating the file with a top-level '# <topic>' heading if needed."""
    path = _library_path(output_folder, topic)
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(f"# {topic}\n\n", encoding="utf-8")
    with path.open("a", encoding="utf-8") as file:
        for prompt in prompts:
            file.write(_render_entry(prompt))
    return path


def read_library(output_folder: str, topic: str) -> list[ExtractedPrompt]:
    """Read back the entries previously written by export_prompts for topic.
    Returns an empty list if no library file exists yet for this topic.

    Robust against manual edits: the file is first split into segments on
    each "---" separator line, then each segment is searched independently
    for one "## description" / "**Type:**" / fenced prompt block. A segment
    that does not contain a well-formed entry (e.g. free-form notes someone
    typed into the Feedback section) is silently skipped, and parsing simply
    resumes at the next "---"-delimited segment instead of corrupting or
    swallowing the following real entry."""
    path = _library_path(output_folder, topic)
    if not path.exists():
        return []
    content = path.read_text(encoding="utf-8")
    entries = []
    for segment in _SEPARATOR_RE.split(content):
        match = _ENTRY_RE.search(segment)
        if not match:
            continue
        entries.append(
            ExtractedPrompt(
                type=match.group("type"),
                description=match.group("description").strip(),
                prompt=match.group("prompt"),
            )
        )
    return entries


def list_topics(output_folder: str) -> list[str]:
    """Return the topic names of every existing Markdown library, read from
    each file's '# <topic>' heading (the slug alone would lose casing/spacing).
    Chat histories live under <outputFolder>/chats/, so a non-recursive glob
    here never picks those up. Sorted case-insensitively for a stable order."""
    base = Path(output_folder)
    if not base.is_dir():
        return []
    topics: list[str] = []
    for file in base.glob("*.md"):
        first_line = file.read_text(encoding="utf-8").splitlines()[:1]
        if first_line and first_line[0].startswith("# "):
            topics.append(first_line[0][2:].strip())
    return sorted(topics, key=str.casefold)
