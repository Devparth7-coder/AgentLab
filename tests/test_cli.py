"""CLI rejects unsafe or binary-to-terminal exports before any network call."""

from agentlab.cli import app
from typer.testing import CliRunner


def test_binary_report_requires_path():
    result = CliRunner().invoke(app, ["report", "generate", "some-id", "--format", "pdf"])
    assert result.exit_code != 0
    assert "--out" in result.output


def test_invalid_report_format_rejected():
    result = CliRunner().invoke(app, ["report", "generate", "some-id", "--format", "raw"])
    assert result.exit_code != 0
    assert "Format must be" in result.output
