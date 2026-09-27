"""agentlab CLI; HTTP client only, no direct database or credential persistence."""

import json
import os
from pathlib import Path

import httpx
import typer

app = typer.Typer(help="AGENTLAB · Test. Observe. Break. Improve.", no_args_is_help=True)
agent = typer.Typer(help="Register and inspect immutable agent versions")
benchmark = typer.Typer(help="Create benchmark suites and run them")
experiment = typer.Typer(help="Manage queued experiments")
trace = typer.Typer(help="Inspect observable execution traces")
failure = typer.Typer(help="Investigate and replay failures")
regression = typer.Typer(help="Compare paired experiments")
report = typer.Typer(help="Generate evidence-linked reports")
demo = typer.Typer(help="Clearly labeled deterministic DEMO fixtures")
for name, group in [
    ("agent", agent),
    ("benchmark", benchmark),
    ("experiment", experiment),
    ("trace", trace),
    ("failure", failure),
    ("regression", regression),
    ("report", report),
    ("demo", demo),
]:
    app.add_typer(group, name=name)


def call(method: str, path: str, payload: dict | None = None) -> dict | list:
    base = os.getenv("AGENTLAB_API_URL", "http://localhost:8000").rstrip("/")
    headers = {"X-API-Key": os.environ["AGENTLAB_API_KEY"]} if os.getenv("AGENTLAB_API_KEY") else {}
    try:
        with httpx.Client(base_url=base, headers=headers, timeout=30) as client:
            response = client.request(method, path, json=payload)
        if response.status_code >= 400:
            typer.secho(
                f"API error {response.status_code}: {response.text[:500]}",
                fg=typer.colors.RED,
                err=True,
            )
            raise typer.Exit(code=1)
        return response.json()
    except httpx.RequestError as exc:
        typer.secho(
            f"Cannot reach AGENTLAB API: {type(exc).__name__}", fg=typer.colors.RED, err=True
        )
        raise typer.Exit(code=1) from exc


def show(value):
    typer.echo(json.dumps(value, indent=2, ensure_ascii=False))


@app.command()
def health():
    """Check API and database readiness."""
    show(call("GET", "/health"))


@agent.command("register")
def agent_register(
    file: Path = typer.Option(..., "--file", help="JSON file matching AgentIn schema"),
):
    show(call("POST", "/agents", json.loads(file.read_text())))


@agent.command("list")
def agent_list():
    show(call("GET", "/agents"))


@benchmark.command("create")
def benchmark_create(
    file: Path = typer.Option(..., "--file", help="JSON file containing benchmark + tasks"),
):
    show(call("POST", "/benchmarks", json.loads(file.read_text())))


@benchmark.command("run")
def benchmark_run(
    benchmark_version_id: str,
    agent_version_id: str = typer.Option(..., "--agent-version"),
    name: str = typer.Option("CLI evaluation", "--name"),
    runs: int = typer.Option(1, "--runs"),
    seed: int = typer.Option(0, "--seed"),
):
    ex = call(
        "POST",
        "/experiments",
        {
            "name": name,
            "benchmark_version_id": benchmark_version_id,
            "agent_version_id": agent_version_id,
            "runs_per_task": runs,
            "seed": seed,
        },
    )
    show(call("POST", f"/experiments/{ex['id']}/run"))


@experiment.command("run")
def experiment_run(experiment_id: str):
    show(call("POST", f"/experiments/{experiment_id}/run"))


@experiment.command("status")
def experiment_status(experiment_id: str):
    show(call("GET", f"/experiments/{experiment_id}"))


@trace.command("inspect")
def trace_inspect(trace_id: str):
    show(call("GET", f"/traces/{trace_id}"))


@failure.command("list")
def failure_list(experiment_id: str = typer.Option("", "--experiment")):
    show(call("GET", "/failures" + (f"?experiment_id={experiment_id}" if experiment_id else "")))


@failure.command("replay")
def failure_replay(failure_id: str):
    show(call("POST", f"/failures/{failure_id}/replay"))


@regression.command("compare")
def regression_compare(baseline_experiment_id: str, candidate_experiment_id: str):
    show(
        call(
            "POST",
            "/regressions/compare",
            {
                "baseline_experiment_id": baseline_experiment_id,
                "candidate_experiment_id": candidate_experiment_id,
            },
        )
    )


@report.command("generate")
def report_generate(
    experiment_id: str,
    format: str = typer.Option("md", "--format", help="pdf | md | json | html"),
    out: Path | None = typer.Option(None, "--out"),
):
    if format not in {"pdf", "md", "json", "html"}:
        raise typer.BadParameter("Format must be pdf, md, json or html")
    if format == "pdf" and out is None:
        raise typer.BadParameter(
            "PDF output requires --out PATH (binary data cannot print to terminal)"
        )
    r = call("POST", "/reports", {"experiment_id": experiment_id})
    base = os.getenv("AGENTLAB_API_URL", "http://localhost:8000").rstrip("/")
    headers = {"X-API-Key": os.environ["AGENTLAB_API_KEY"]} if os.getenv("AGENTLAB_API_KEY") else {}
    with httpx.Client(timeout=30, headers=headers) as client:
        response = client.get(base + f"/reports/{r['id']}/download", params={"format": format})
        response.raise_for_status()
    if out:
        out.write_bytes(response.content)
        typer.echo(f"Wrote {out} · report {r['id']}")
    else:
        typer.echo(response.text)


@demo.command("seed")
def demo_seed():
    show(call("POST", "/demo/seed"))


@demo.command("run")
def demo_run(seed: int = typer.Option(42, "--seed")):
    show(call("POST", "/demo/run", {"seed": seed}))


if __name__ == "__main__":
    app()
