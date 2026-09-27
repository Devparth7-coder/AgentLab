import time

import pytest


def wait_completed(client, experiment_id: str, timeout: float = 30):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        item = client.get("/experiments/" + experiment_id).json()
        if item["completed_at"]:
            return item
        time.sleep(0.05)
    raise AssertionError(f"Experiment {experiment_id} stuck: {item['progress']}")


def test_api_registration_benchmark_run_trace_failure(client):
    agent = client.post(
        "/agents",
        json={
            "name": "Echo Agent",
            "provider": "mock",
            "version": {"version": "1.0.0", "model": "echo", "configuration": {"behavior": "echo"}},
        },
    )
    assert agent.status_code == 201, agent.text
    assert agent.json()["is_demo"] is True  # every mock agent must be transparently labeled DEMO
    aid = agent.json()["versions"][0]["id"]
    benchmark = client.post(
        "/benchmarks",
        json={
            "name": "API Test Suite",
            "tasks": [
                {"task_key": "pass", "input": "hello", "expected_output": "hello"},
                {"task_key": "fail", "input": "actual", "expected_output": "expected"},
            ],
        },
    )
    assert benchmark.status_code == 201, benchmark.text
    bv = benchmark.json()["versions"][0]["id"]
    ex = client.post(
        "/experiments",
        json={
            "name": "Echo check",
            "agent_version_id": aid,
            "benchmark_version_id": bv,
            "runs_per_task": 3,
        },
    )
    assert ex.status_code == 201, ex.text
    assert ex.json()["is_demo"] is True
    eid = ex.json()["id"]
    assert ex.json()["created_at"].endswith("+00:00")
    assert client.post(f"/experiments/{eid}/run").status_code == 200
    assert client.post(f"/experiments/{eid}/run").status_code == 200  # idempotent
    finished = wait_completed(client, eid)
    assert finished["progress"]["total"] == 6
    assert finished["progress"]["counts"] == {"PASSED": 3, "FAILED": 3}
    assert next(x for x in finished["metrics"] if x["key"] == "task_success_rate")["value"] == 50
    assert next(x for x in finished["metrics"] if x["key"] == "total_tokens")["value"] is None
    failures = client.get("/failures", params={"experiment_id": eid}).json()
    assert len(failures) == 3 and failures[0]["failure_type"] == "TASK_FAILURE"
    f = client.get("/failures/" + failures[0]["id"]).json()
    trace = client.get("/traces/" + f["trace_id"]).json()
    assert any(event["event_type"] == "FINAL_RESPONSE" for event in trace["events"])
    assert client.get("/evaluations", params={"experiment_id": eid}).status_code == 200
    pages = [
        client.get(f"/experiments/{eid}/runs", params={"limit": 2, "offset": i}).json()
        for i in (0, 2, 4)
    ]
    assert all(len(page) == 2 for page in pages)
    assert len({r["id"] for page in pages for r in page}) == 6
    assert all(r["task_key"] and r["trace_id"] for page in pages for r in page)
    distribution = client.get(f"/experiments/{eid}/task-distribution").json()
    assert [
        (t["passed"], t["n"], t["observed_sample_variance"]) for t in distribution["tasks"]
    ] == [(0, 3, 0.0), (3, 3, 0.0)]
    assert distribution["agent_version_id"] == aid
    assert distribution["benchmark_version_id"] == bv
    ops = client.get("/system/metrics").json()
    assert ops["queued_runs"] == 0 and ops["running_runs"] == 0
    assert ops["evaluated_runs_last_hour"] == 6 and ops["worker_latency_samples"] == 6
    assert ops["worker_run_latency_p95_ms"] is not None
    report = client.post("/reports", json={"experiment_id": eid})
    assert report.status_code == 201, report.text
    assert client.get("/reports/" + report.json()["id"]).json()["content_json"]["demo"] is True
    assert client.get("/reports").json()[0]["is_demo"] is True
    md = client.get("/reports/" + report.json()["id"] + "/download?format=md").text
    assert "50 %" in md and "Not measured" in md and "Reproduction instructions" in md
    pdf = client.get("/reports/" + report.json()["id"] + "/download?format=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert pdf.headers["content-type"] == "application/pdf"
    assert len(pdf.content) > 3000
    assert client.get("/reports/" + report.json()["id"] + "/download?format=x").status_code == 400
    assert client.post(f"/experiments/{eid}/cancel").status_code == 409
    assert client.get("/metrics/definitions").json()[0]["formula"]


def test_demo_real_execution_regression_replay_robustness_report(client):
    assert client.get("/overview").json()["message"] == "NO EVALUATIONS YET"
    assert len(client.get("/benchmarks/catalog").json()["templates"]) == 8
    seeded = client.post("/demo/seed").json()
    assert client.get("/overview").json()["latest_experiment"] is None
    r = client.post("/demo/run", json={"seed": 42})
    assert r.status_code == 202, r.text
    baseline_id = r.json()["baseline_experiment_id"]
    candidate_id = r.json()["candidate_experiment_id"]
    baseline = wait_completed(client, baseline_id)
    candidate = wait_completed(client, candidate_id)
    assert baseline["is_demo"] and candidate["is_demo"]
    assert len(baseline["runs"]) == 50 and len(candidate["runs"]) == 50
    assert sum(x["status"] == "PASSED" for x in baseline["runs"]) == 50
    assert sum(x["status"] == "FAILED" for x in candidate["runs"]) == 10
    assert next(x for x in candidate["metrics"] if x["key"] == "task_success_rate")["value"] == 80
    assert (
        next(x for x in candidate["metrics"] if x["key"] == "estimated_cost_usd")["value"] is None
    )
    comp = client.post(
        "/regressions/compare",
        json={"baseline_experiment_id": baseline_id, "candidate_experiment_id": candidate_id},
    )
    assert comp.status_code == 201, comp.text
    assert comp.json()["verdict"] == "REGRESSION" and len(comp.json()["new_failures"]) == 10
    failure = client.get("/failures", params={"experiment_id": candidate_id}).json()[0]
    assert failure["failure_type"] == "TOOL_ARGUMENT_FAILURE"
    t = client.get("/traces/" + failure["trace_id"]).json()
    assert t["tool_calls"] and t["tool_calls"][0]["argument_valid"] is False
    replay = client.post("/failures/" + failure["id"] + "/replay")
    assert replay.status_code == 202, replay.text
    replay_exp = wait_completed(client, replay.json()["experiment_id"])
    f = client.get("/failures/" + failure["id"]).json()
    assert f["reproductions"][0]["outcome"] == "REPRODUCIBLE"
    assert replay_exp["progress"]["total"] == 1
    robust = client.post(
        "/robustness/generate",
        json={
            "benchmark_version_id": seeded["benchmark_version_id"],
            "transformations": ["whitespace", "tool_failure"],
            "seed": 42,
            "limit": 2,
        },
    )
    assert robust.status_code == 201, robust.text
    robust_bv = robust.json()["versions"][0]["id"]
    ex = client.post(
        "/experiments",
        json={
            "name": "DEMO robustness probe",
            "agent_version_id": seeded["v1_id"],
            "benchmark_version_id": robust_bv,
        },
    )
    assert client.post("/experiments/" + ex.json()["id"] + "/run").status_code == 200
    robust_result = wait_completed(client, ex.json()["id"])
    metric = next(x for x in robust_result["metrics"] if x["key"] == "robustness_rate")
    assert metric["sample_count"] == 4 and metric["value"] == 50
    usage = client.get("/cost/summary", params={"experiment_id": ex.json()["id"]}).json()
    assert usage["api_calls"] is None  # failed tool runs never invent 0 remote API attempts
    assert usage["api_call_coverage"] == "2/4"
    report = client.post("/reports", json={"experiment_id": candidate_id})
    assert report.status_code == 201
    doc = client.get("/reports/" + report.json()["id"]).json()["content_json"]
    assert doc["demo"] and doc["benchmark"]["version"] and doc["failures"]
    html = client.get("/reports/" + report.json()["id"] + "/download?format=html")
    assert html.status_code == 200 and "DEMO · SYNTHETIC" in html.text
    pdf = client.get("/reports/" + report.json()["id"] + "/download?format=pdf")
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF-")
    assert b"DEMO / SYNTHETIC" in pdf.content or len(pdf.content) > 5000


def test_auth_and_no_credentials_in_api(client, monkeypatch):
    import agentlab_api.main as api
    from agentlab.config import Settings

    config = Settings(
        env="test",
        auth_mode="required",
        api_key="test-key-only",
        database_url="sqlite:///unused",
        queue_mode="local-thread",
    )
    monkeypatch.setattr(api, "settings", lambda: config)
    assert client.get("/agents").status_code == 401
    assert client.get("/agents", headers={"X-API-Key": "incorrect"}).status_code == 401
    assert client.get("/agents", headers={"X-API-Key": "test-key-only"}).status_code == 200
    assert client.get("/health").status_code == 200
    assert (
        client.post(
            "/agents",
            headers={"X-API-Key": "test-key-only"},
            json={
                "name": "Cred Leak",
                "provider": "mock",
                "version": {
                    "version": "1.0",
                    "model": "echo",
                    "configuration": {"api_key": "do-not-store"},
                },
            },
        ).status_code
        == 422
    )


def test_broker_dispatch_failure_is_sanitized_and_queued_runs_are_recoverable(client, monkeypatch):
    from agentlab import executions

    seeded = client.post("/demo/seed").json()
    benchmark = client.get("/benchmarks/" + seeded["benchmark_id"]).json()
    task_id = benchmark["versions"][0]["tasks"][0]["id"]
    response = client.post(
        "/experiments",
        json={
            "name": "Recoverable broker failure",
            "agent_version_id": seeded["v1_id"],
            "benchmark_version_id": seeded["benchmark_version_id"],
            "task_ids": [task_id],
        },
    )
    assert response.status_code == 201
    eid = response.json()["id"]
    original_dispatch = executions.dispatch_experiment

    def broken_dispatch(_):
        raise RuntimeError("redis://:hidden-credential@broker:6379")

    monkeypatch.setattr(executions, "dispatch_experiment", broken_dispatch)
    failure = client.post(f"/experiments/{eid}/run")
    assert failure.status_code == 503
    assert "hidden-credential" not in failure.text
    assert client.get(f"/experiments/{eid}").json()["progress"]["counts"] == {"QUEUED": 1}
    assert client.get("/system/metrics").json()["queued_runs"] == 1
    monkeypatch.setattr(executions, "dispatch_experiment", original_dispatch)
    resumed = client.post(f"/experiments/{eid}/resume")
    assert resumed.status_code == 200 and resumed.json()["jobs_dispatched"] == 1
    assert wait_completed(client, eid)["progress"]["completed"] == 1


def test_production_guards_viewer_permissions_and_api_rate_limit(client, monkeypatch):
    import agentlab_api.main as api
    from agentlab.config import Settings

    with pytest.raises(RuntimeError, match="Production requires"):
        Settings(
            env="production",
            auth_mode="disabled",
            api_key="x" * 40,
            database_url="sqlite:///test.db",
            queue_mode="local-thread",
        ).validate_deployment()
    assert (
        Settings(
            env="production",
            auth_mode="required",
            api_key="x" * 40,
            database_url="postgresql+psycopg://example:pass@postgres:5432/db",
            queue_mode="celery",
        ).validate_deployment()
        is None
    )
    cfg = Settings(
        env="test",
        auth_mode="required",
        api_key="test-admin-key",
        readonly_api_key="test-viewer-key",
        database_url="sqlite:///unused",
        queue_mode="local-thread",
        rate_limit_per_minute=3,
    )
    monkeypatch.setattr(api, "settings", lambda: cfg)
    headers = {"X-API-Key": "test-viewer-key"}
    assert client.get("/system/metrics", headers=headers).status_code == 200
    assert client.post("/demo/seed", headers=headers).status_code == 403
    assert client.post("/demo/seed", headers={"X-API-Key": "test-admin-key"}).status_code == 200
    assert client.get("/overview", headers=headers).status_code == 200
    assert client.get("/agents", headers=headers).status_code == 200
    too_many = client.get("/agents", headers=headers)
    assert too_many.status_code == 429
    assert too_many.headers["Retry-After"] == "60"
    assert client.get("/health").status_code == 200  # public readiness skips the rate limit
