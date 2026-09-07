"""Tests for app.services.markdown_exporter (parsing, slugify, export/read round-trip,
and path-traversal safety) — see README.md section 9.
"""
from pathlib import Path

from app.services.markdown_exporter import (
    ExtractedPrompt,
    export_prompts,
    parse_prompts,
    read_library,
    slugify_topic,
)


class TestParsePrompts:
    def test_single_tag_is_parsed(self):
        text = '<prompt type="image" description="A cat">A fluffy cat sitting on a mat</prompt>'
        result = parse_prompts(text)

        assert len(result) == 1
        assert result[0].type == "image"
        assert result[0].description == "A cat"
        assert result[0].prompt == "A fluffy cat sitting on a mat"

    def test_multiple_tags_are_parsed_in_order(self):
        text = (
            'Here are two ideas:\n'
            '<prompt type="image" description="First">Prompt one</prompt>\n'
            '<prompt type="video" description="Second">Prompt two</prompt>\n'
        )

        result = parse_prompts(text)

        assert [p.type for p in result] == ["image", "video"]
        assert [p.description for p in result] == ["First", "Second"]
        assert [p.prompt for p in result] == ["Prompt one", "Prompt two"]

    def test_attribute_order_is_tolerated(self):
        text = '<prompt description="Desc" type="text">Body text</prompt>'

        result = parse_prompts(text)

        assert len(result) == 1
        assert result[0].type == "text"
        assert result[0].description == "Desc"

    def test_no_tags_returns_empty_list(self):
        assert parse_prompts("Just a plain reply with no markup.") == []

    def test_malformed_unclosed_tag_is_ignored(self):
        text = '<prompt type="image" description="Broken">no closing tag here'

        assert parse_prompts(text) == []

    def test_tag_missing_required_attribute_is_ignored(self):
        text = '<prompt type="image">Missing description attribute</prompt>'

        assert parse_prompts(text) == []


class TestSlugifyTopic:
    def test_normal_text(self):
        assert slugify_topic("Fantasy Landscapes") == "fantasy-landscapes"

    def test_empty_string_falls_back_to_untitled(self):
        assert slugify_topic("") == "untitled"

    def test_whitespace_only_falls_back_to_untitled(self):
        assert slugify_topic("   \t  ") == "untitled"

    def test_path_traversal_dotdot_slash(self):
        slug = slugify_topic("../../../etc/passwd")

        assert ".." not in slug
        assert "/" not in slug
        assert slug == "etc-passwd"

    def test_path_traversal_encoded(self):
        slug = slugify_topic("..%2f..%2f")

        assert ".." not in slug
        assert "/" not in slug
        assert "%2f" not in slug

    def test_mixed_case_and_special_characters(self):
        slug = slugify_topic("My Topic!! @2026 #Cool")

        assert slug == "my-topic-2026-cool"

    def test_result_only_contains_whitelisted_characters(self):
        slug = slugify_topic("Wëird Ünïcode / Path\\Traversal..Attempt")

        assert all(ch.islower() or ch.isdigit() or ch == "-" for ch in slug)


class TestExportAndReadLibraryRoundTrip:
    def test_round_trip_preserves_fields_including_special_markdown_chars(self, tmp_path: Path):
        prompts = [
            ExtractedPrompt(type="image", description="A castle", prompt="A castle on a hill"),
            ExtractedPrompt(
                type="text",
                description="Code-ish text",
                prompt="Use `inline code` and a # heading marker\nand a second line.",
            ),
        ]

        export_prompts(str(tmp_path), "My Topic", prompts)
        entries = read_library(str(tmp_path), "My Topic")

        assert len(entries) == 2
        assert entries[0].type == "image"
        assert entries[0].description == "A castle"
        assert entries[0].prompt == "A castle on a hill"
        assert entries[1].type == "text"
        assert entries[1].description == "Code-ish text"
        assert entries[1].prompt == "Use `inline code` and a # heading marker\nand a second line."

    def test_export_creates_file_with_topic_heading(self, tmp_path: Path):
        export_prompts(
            str(tmp_path), "Space Battles", [ExtractedPrompt(type="video", description="D", prompt="P")]
        )

        path = tmp_path / "space-battles.md"
        assert path.exists()
        assert path.read_text(encoding="utf-8").startswith("# Space Battles\n")

    def test_read_library_returns_empty_list_when_file_missing(self, tmp_path: Path):
        assert read_library(str(tmp_path), "Never Written") == []

    def test_export_appends_to_existing_file(self, tmp_path: Path):
        export_prompts(str(tmp_path), "Topic", [ExtractedPrompt(type="image", description="One", prompt="P1")])
        export_prompts(str(tmp_path), "Topic", [ExtractedPrompt(type="image", description="Two", prompt="P2")])

        entries = read_library(str(tmp_path), "Topic")

        assert [e.description for e in entries] == ["One", "Two"]


class TestPathTraversalSafety:
    def test_export_and_read_with_malicious_topic_stay_inside_output_folder(self, tmp_path: Path):
        output_folder = tmp_path / "output"
        output_folder.mkdir()
        malicious_topic = "../../evil"

        written_path = export_prompts(
            str(output_folder),
            malicious_topic,
            [ExtractedPrompt(type="text", description="D", prompt="P")],
        )

        resolved_output = output_folder.resolve()
        assert resolved_output in written_path.resolve().parents or written_path.resolve() == resolved_output
        assert written_path.resolve().is_relative_to(resolved_output)

        entries = read_library(str(output_folder), malicious_topic)
        assert len(entries) == 1

        # Nothing was written outside the output folder (e.g. no file literally
        # named "evil.md" two directories above it).
        escaped_path = tmp_path.parent.parent / "evil.md"
        assert not escaped_path.exists()
