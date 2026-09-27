"""Immutable, evidence-linked Markdown/JSON/print-friendly HTML report snapshot."""

from html import escape

from sqlalchemy import select
from sqlalchemy.orm import Session

from agentlab import models as m
from agentlab.serializers import row


def generate(db: Session, ex: m.Experiment) -> m.Report:
    if not ex.completed_at:
        raise ValueError("Wait for the experiment to finish before generating a report")
    v = db.get(m.AgentVersion, ex.agent_version_id)
    agent = db.get(m.Agent, v.agent_id)
    bv = db.get(m.BenchmarkVersion, ex.benchmark_version_id)
    benchmark = db.get(m.Benchmark, bv.benchmark_id)
    metrics = [
        row(metric)
        for metric in db.scalars(
            select(m.Metric).where(m.Metric.experiment_id == ex.id).order_by(m.Metric.key)
        ).all()
    ]
    failures = [
        row(failure)
        for failure in db.scalars(
            select(m.Failure)
            .where(m.Failure.experiment_id == ex.id)
            .order_by(m.Failure.detected_at)
        ).all()
    ]
    runs = db.scalars(select(m.ExperimentRun).where(m.ExperimentRun.experiment_id == ex.id)).all()
    regressions = [
        row(reg)
        for reg in db.scalars(
            select(m.Regression).where(
                (m.Regression.baseline_experiment_id == ex.id)
                | (m.Regression.candidate_experiment_id == ex.id)
            )
        ).all()
    ]
    document = {
        "title": f"AGENT RELIABILITY REPORT · {ex.name}",
        "demo": ex.is_demo,
        "generated_at": m.now().isoformat(),
        "experiment": row(ex),
        "agent": {
            "name": agent.name,
            "provider": agent.provider,
            "model": v.model,
            "version": v.version,
            "revision": v.model_revision,
            "configuration_hash": v.configuration_hash,
            "prompt_hash": v.system_prompt_hash,
            "tools": v.tool_configuration,
        },
        "benchmark": {
            "name": benchmark.name,
            "version": bv.version,
            "content_hash": bv.content_hash,
            "category": benchmark.category,
        },
        "methodology": {
            "evaluation_version": ex.evaluation_version,
            "seed": ex.seed,
            "runs_per_task": ex.runs_per_task,
            "non_cancelled_run_count": sum(r.status in {"PASSED", "FAILED", "ERROR"} for r in runs),
            "task_count": len(ex.selected_task_ids),
            "evaluation_rules": bv.evaluation_rules,
        },
        "metrics": metrics,
        "trace_statistics": {
            "traces": db.query(m.Trace).filter_by(experiment_id=ex.id).count(),
            "tool_calls": db.query(m.ToolCall)
            .join(m.Trace, m.ToolCall.trace_id == m.Trace.id)
            .filter(m.Trace.experiment_id == ex.id)
            .count(),
        },
        "failures": failures,
        "regressions": regressions,
        "limitations": [
            "Only measured evaluators contribute to pass/fail; unmeasured values are null.",
            "Cost excludes tool fees and optional LLM-judge calls; requires configured pricing and provider-reported tokens.",
            "Remote model revisions and third-party tool state may not be reproducible.",
            "Operational regression thresholds are not statistical significance tests.",
            "DEMO results are from deterministic synthetic tools, not language-model capability measurements."
            if ex.is_demo
            else "LLM judges, if enabled, are fallible and should not be treated as ground truth.",
        ],
        "reproduction": {
            "agent_version_id": v.id,
            "benchmark_version_id": bv.id,
            "evaluation_version": ex.evaluation_version,
            "configuration_hash": ex.configuration_hash,
            "git_commit": ex.git_commit,
            "seed": ex.seed,
            "command": f"agentlab experiment run {ex.id}  # existing experiment is immutable; create a new one to rerun",
        },
    }
    title = document["title"]
    md = [
        f"# {title}",
        "",
        "**DEMO — SYNTHETIC FIXTURES, NOT REAL MODEL RESULTS**"
        if ex.is_demo
        else "**Measured experiment; inspect provenance below.**",
        "",
        "## Executive summary",
        f"Experiment: `{ex.id}` · Status: {ex.status} · {len(runs)} runs",
        "",
        "## Agent configuration",
        f"{agent.name} v{v.version} · {agent.provider} / {v.model}",
        f"Configuration SHA-256: `{v.configuration_hash}` · Prompt SHA-256: `{v.system_prompt_hash}`",
        "",
        "## Benchmark",
        f"{benchmark.name} v{bv.version} · SHA-256 `{bv.content_hash}`",
        "",
        "## Methodology",
        f"Harness: {ex.evaluation_version} · Seed: {ex.seed} · Runs/task: {ex.runs_per_task}",
        "",
        "## Metrics",
        "| Metric | Value | Sample | Formula | Data source | Measured at |",
        "| --- | ---: | ---: | --- | --- | --- |",
    ]
    for metric in metrics:
        value = (
            "Not measured" if metric["value"] is None else f"{metric['value']:.6g} {metric['unit']}"
        )
        md.append(
            f"| {metric['key']} | {value} | {metric['sample_count']} | {metric['formula']} | {metric['data_source']} | {metric['measured_at']} |"
        )
    md += [
        "",
        "## Trace statistics",
        f"{document['trace_statistics']['traces']} recorded traces · {document['trace_statistics']['tool_calls']} tool calls",
        "",
        "## Failures",
        f"{len(failures)} recorded failures",
    ]
    for failure in failures:
        md.append(
            f"- `{failure['id']}` {failure['failure_type']} · {failure['severity']} · trace `{failure['trace_id']}`"
        )
    md += [
        "",
        "## Robustness",
        "See robustness_rate above (Not measured unless meaning-preserving perturbed runs exist).",
        "",
        "## Regression",
        f"{len(regressions)} comparable/attempted comparisons are included in JSON export.",
        "",
        "## Cost and latency",
        "Costs require provider usage and configured prices. Latencies measure completed wall-clock runs, not model-internal processing.",
        "",
        "## Limitations",
    ]
    md += [f"- {v}" for v in document["limitations"]]
    md += [
        "",
        "## Reproduction instructions",
        f"Agent version `{v.id}` · Benchmark version `{bv.id}` · Seed `{ex.seed}`",
        f"Git commit `{ex.git_commit}` · Experiment config `{ex.configuration_hash}`",
        "Create a *new* experiment with the same version IDs, seed and harness; never overwrite this result.",
    ]
    markdown = "\n".join(md) + "\n"
    metric_rows = "".join(
        f"<tr><td>{escape(x['key'])}</td><td>{escape('Not measured' if x['value'] is None else str(round(x['value'], 6)) + ' ' + x['unit'])}</td><td>{x['sample_count']}</td><td>{escape(x['formula'])}</td><td>{escape(x['data_source'])}</td></tr>"
        for x in metrics
    )
    failure_rows = "".join(
        f"<tr><td>{escape(x['id'][:10])}</td><td>{escape(x['failure_type'])}</td><td>{escape(x['severity'])}</td><td>{escape(x['trace_id'][:10])}</td></tr>"
        for x in failures
    )
    html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{escape(title)}</title><style>
    body{{font-family:Inter,system-ui,sans-serif;background:#0c1117;color:#e1eaf0;max-width:1050px;margin:48px auto;padding:0 24px;line-height:1.6}}
    h1{{font-size:28px;letter-spacing:-.03em}}h2{{color:#51dfba;border-bottom:1px solid #27333e;padding-bottom:8px;margin-top:38px}}
    p,li{{color:#a5b2be}}small,code{{color:#7b8d9c}}table{{width:100%;border-collapse:collapse;font-size:13px}}
    th,td{{border-bottom:1px solid #27333e;padding:10px;text-align:left;vertical-align:top}}th{{color:#7b8d9c}}
    .stamp{{display:inline-block;padding:4px 9px;border:1px solid #53765e;color:#61dfac;font-size:12px;letter-spacing:.1em}}
    @media print{{body{{background:white;color:#111;margin:12mm auto}}p,li,small,code{{color:#333}}h2{{color:#114a43}}th,td{{border-color:#bbb}}}}
    </style></head><body><span class="stamp">{"DEMO · SYNTHETIC" if ex.is_demo else "MEASURED EXPERIMENT"}</span>
    <h1>{escape(title)}</h1><p>Experiment {escape(ex.id)} · Generated {escape(document["generated_at"])}</p>
    <h2>Executive summary</h2><p>{escape(agent.name)} v{escape(v.version)} evaluated on {escape(benchmark.name)} v{escape(bv.version)}. {len(runs)} runs, {len(failures)} failures.</p>
    <h2>Configuration & provenance</h2><p>Agent SHA-256 {escape(v.configuration_hash)}<br>Benchmark SHA-256 {escape(bv.content_hash)}<br>Harness {escape(ex.evaluation_version)} · Seed {ex.seed} · Git {escape(ex.git_commit)}</p>
    <h2>Methodology & metrics</h2><table><thead><tr><th>Metric</th><th>Value</th><th>n</th><th>Formula</th><th>Source</th></tr></thead><tbody>{metric_rows}</tbody></table>
    <h2>Trace statistics</h2><p>{document["trace_statistics"]["traces"]} traces · {document["trace_statistics"]["tool_calls"]} tool calls</p>
    <h2>Failures</h2><table><tr><th>ID</th><th>Type</th><th>Severity</th><th>Trace</th></tr>{failure_rows}</table>
    <h2>Robustness / regression / cost / latency</h2><p>See metric rows; missing measurements are explicitly Not measured. {len(regressions)} comparison record(s).</p>
    <h2>Limitations</h2><ul>{"".join("<li>" + escape(s) + "</li>" for s in document["limitations"])}</ul>
    <h2>Reproduction</h2><p>Agent version {escape(v.id)} · Benchmark version {escape(bv.id)} · Seed {ex.seed}. Create a new experiment with the same pinned versions; historic results are immutable.</p></body></html>"""
    report = m.Report(
        experiment_id=ex.id,
        title=title,
        content_markdown=markdown,
        content_html=html,
        content_json=document,
    )
    db.add(report)
    db.flush()
    return report
