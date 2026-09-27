"""Render a frozen report snapshot as an auditable, printable PDF.

Only the report's immutable JSON is read; live experiment metrics are never substituted.
"""

from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    LongTable,
    PageTemplate,
    Paragraph,
    Spacer,
    TableStyle,
)

DARK = colors.HexColor("#152620")
INK = colors.HexColor("#233a35")
MUTED = colors.HexColor("#596e68")
MINT = colors.HexColor("#127456")
LINE = colors.HexColor("#d9e5df")
PALE = colors.HexColor("#eff6f2")
PAGE_W, PAGE_H = A4
GUTTER = 18 * mm
BODY_WIDTH = PAGE_W - 2 * GUTTER


def pdf_bytes(document: dict) -> bytes:
    """Export all measured metrics and failures without changing the source snapshot."""
    out = BytesIO()
    doc = BaseDocTemplate(
        out,
        pagesize=A4,
        leftMargin=GUTTER,
        rightMargin=GUTTER,
        topMargin=35 * mm,
        bottomMargin=20 * mm,
        title=str(document.get("title", "AGENTLAB evidence report")),
        author="AGENTLAB",
    )
    frame = Frame(
        GUTTER,
        20 * mm,
        BODY_WIDTH,
        PAGE_H - 55 * mm,
        leftPadding=0,
        rightPadding=0,
        topPadding=0,
        bottomPadding=0,
    )

    def header_footer(canvas, _doc):
        canvas.saveState()
        canvas.setFillColor(DARK)
        canvas.rect(0, PAGE_H - 26 * mm, PAGE_W, 26 * mm, fill=1, stroke=0)
        canvas.setFillColor(colors.HexColor("#a7ead0"))
        canvas.setFont("Helvetica-Bold", 12)
        canvas.drawString(GUTTER, PAGE_H - 13 * mm, "A  AGENTLAB")
        canvas.setFillColor(colors.HexColor("#dcece5"))
        canvas.setFont("Helvetica", 8)
        canvas.drawRightString(PAGE_W - GUTTER, PAGE_H - 13 * mm, "RELIABILITY / EVIDENCE REPORT")
        canvas.setStrokeColor(LINE)
        canvas.line(GUTTER, 16 * mm, PAGE_W - GUTTER, 16 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(MUTED)
        canvas.drawString(
            GUTTER, 10 * mm, f"EXPERIMENT {str(document.get('experiment', {}).get('id', ''))[:20]}"
        )
        canvas.drawRightString(PAGE_W - GUTTER, 10 * mm, f"PAGE {_doc.page}")
        canvas.restoreState()

    doc.addPageTemplates(PageTemplate(id="report", frames=[frame], onPage=header_footer))
    styles = {
        "title": ParagraphStyle(
            "title",
            fontName="Helvetica-Bold",
            fontSize=19,
            leading=23,
            textColor=DARK,
            spaceAfter=11,
        ),
        "section": ParagraphStyle(
            "section",
            fontName="Helvetica-Bold",
            fontSize=11,
            leading=15,
            textColor=MINT,
            spaceBefore=14,
            spaceAfter=7,
        ),
        "body": ParagraphStyle(
            "body", fontName="Helvetica", fontSize=9, leading=13, textColor=INK, spaceAfter=5
        ),
        "small": ParagraphStyle(
            "small", fontName="Helvetica", fontSize=7.6, leading=10.5, textColor=INK, wordWrap="CJK"
        ),
        "muted": ParagraphStyle(
            "muted", fontName="Helvetica", fontSize=8, leading=11, textColor=MUTED, spaceAfter=6
        ),
        "tablehead": ParagraphStyle(
            "tablehead",
            fontName="Helvetica-Bold",
            fontSize=7.3,
            leading=9.5,
            textColor=colors.white,
        ),
        "tag": ParagraphStyle(
            "tag", fontName="Helvetica-Bold", fontSize=8, leading=11, textColor=MINT, spaceAfter=9
        ),
    }

    def p(value, style="body"):
        return Paragraph(escape(str(value if value is not None else "Not measured")), styles[style])

    def section(title):
        return p(title.upper(), "section")

    def grid(columns, width):
        table = LongTable(columns, colWidths=width, repeatRows=1, hAlign="LEFT")
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), DARK),
                    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PALE]),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 7),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                    ("LINEBELOW", (0, -1), (-1, -1), 0.3, LINE),
                ]
            )
        )
        return table

    agent = document.get("agent", {})
    benchmark = document.get("benchmark", {})
    ex = document.get("experiment", {})
    method = document.get("methodology", {})
    metrics = document.get("metrics", [])
    failures = document.get("failures", [])
    regressions = document.get("regressions", [])
    trace_stats = document.get("trace_statistics", {})
    tag = (
        "DEMO / SYNTHETIC FIXTURES - NOT REAL MODEL RESULTS"
        if document.get("demo")
        else "MEASURED EXPERIMENT"
    )
    story = [
        p(tag, "tag"),
        p(document.get("title", "AGENT RELIABILITY REPORT"), "title"),
        p(
            f"Generated {document.get('generated_at', 'Not measured')}  |  Experiment {ex.get('id', '')}",
            "muted",
        ),
        section("Executive summary"),
        p(
            f"{agent.get('name', 'Unknown')} v{agent.get('version', '?')} "
            f"({agent.get('provider', '?')} / {agent.get('model', '?')}) evaluated against "
            f"{benchmark.get('name', '?')} v{benchmark.get('version', '?')} on "
            f"{method.get('non_cancelled_run_count', 'Not measured')} non-cancelled runs. "
            f"Status: {ex.get('status', '?')}. {len(failures)} recorded failures; "
            f"{trace_stats.get('traces', 'Not measured')} observable traces."
        ),
        section("Configuration and provenance"),
        grid(
            [
                [p("FIELD", "tablehead"), p("PINNED VALUE", "tablehead")],
                *[
                    [p(k, "small"), p(v, "small")]
                    for k, v in [
                        ("Agent version ID", ex.get("agent_version_id")),
                        ("Agent configuration SHA-256", agent.get("configuration_hash")),
                        ("Benchmark version ID", ex.get("benchmark_version_id")),
                        ("Benchmark SHA-256", benchmark.get("content_hash")),
                        ("Harness", method.get("evaluation_version")),
                        (
                            "Seed / repetitions",
                            f"{method.get('seed')} / {method.get('runs_per_task')}",
                        ),
                        ("Git commit", ex.get("git_commit")),
                        ("Experiment config SHA-256", ex.get("configuration_hash")),
                    ]
                ],
            ],
            [BODY_WIDTH * 0.31, BODY_WIDTH * 0.69],
        ),
        section("Metrics and measurement method"),
        p(
            "Only completed, observed measurements are shown. Null means Not measured. "
            "Each metric includes its actual sample count, formula, data source and measurement time.",
            "muted",
        ),
    ]
    metric_table = [
        [p(s, "tablehead") for s in ["METRIC", "VALUE", "N", "FORMULA / METHOD", "SOURCE / TIME"]]
    ]
    for metric in metrics:
        val = metric.get("value")
        rendered = "Not measured" if val is None else f"{val:.6g} {metric.get('unit', '')}"
        metric_table.append(
            [
                p(metric.get("key"), "small"),
                p(rendered, "small"),
                p(metric.get("sample_count"), "small"),
                p(metric.get("formula"), "small"),
                p(f"{metric.get('data_source', '')}\n{metric.get('measured_at', '')}", "small"),
            ]
        )
    story.append(grid(metric_table, [BODY_WIDTH * x for x in (0.18, 0.14, 0.06, 0.34, 0.28)]))
    story += [
        section("Trace and failure evidence"),
        p(
            f"{trace_stats.get('traces', 'Not measured')} traces; "
            f"{trace_stats.get('tool_calls', 'Not measured')} sandboxed tool calls. "
            "No private chain-of-thought is stored."
        ),
        p(
            f"{len(failures)} failures recorded. The frozen JSON export preserves full "
            "failure evidence and all comparison records.",
            "muted",
        ),
    ]
    if failures:
        rows = [
            [
                p(s, "tablehead")
                for s in ["FAILURE ID", "CLASSIFICATION", "SEVERITY", "TASK / TRACE"]
            ]
        ]
        for failure in failures:
            rows.append(
                [
                    p(failure.get("id", "")[:12], "small"),
                    p(failure.get("failure_type"), "small"),
                    p(failure.get("severity"), "small"),
                    p(
                        f"{failure.get('task_key', '')} / {str(failure.get('trace_id', ''))[:12]}",
                        "small",
                    ),
                ]
            )
        story.append(grid(rows, [BODY_WIDTH * x for x in (0.19, 0.27, 0.14, 0.4)]))
    story += [
        section("Robustness / regression / cost and latency"),
        p(
            f"Robustness and cost are shown in the measured metric table above, or Not measured. "
            f"{len(regressions)} comparison record(s) in JSON. Latency is completed "
            "run wall-clock time, not model-internal processing."
        ),
        section("Limitations"),
    ]
    for item in document.get("limitations", []):
        story.append(p("- " + str(item), "small"))
        story.append(Spacer(1, 2))
    reproduction = document.get("reproduction", {})
    story += [
        section("Reproduction"),
        p(
            f"Pin agent version {reproduction.get('agent_version_id', '')} and benchmark "
            f"version {reproduction.get('benchmark_version_id', '')}. Rerun with seed "
            f"{reproduction.get('seed', '')}, harness {reproduction.get('evaluation_version', '')} "
            f"and experiment config hash {reproduction.get('configuration_hash', '')}. "
            "Create a NEW experiment; never overwrite this historical result."
        ),
        p(
            "For full structured evidence, download the immutable JSON snapshot. "
            "Printing this PDF does not trigger a new evaluation.",
            "muted",
        ),
    ]
    doc.build(story)
    return out.getvalue()
