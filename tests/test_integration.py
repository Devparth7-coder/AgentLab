import time


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
    eid = ex.json()["id"]
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
    report = client.post("/reports", json={"experiment_id": eid})
    assert report.status_code == 201, report.text
    md = client.get("/reports/" + report.json()["id"] + "/download?format=md").text
    assert "50 %" in md and "Not measured" in md and "Reproduction instructions" in md
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
    report = client.post("/reports", json={"experiment_id": candidate_id})
    assert report.status_code == 201
    doc = client.get("/reports/" + report.json()["id"]).json()["content_json"]
    assert doc["demo"] and doc["benchmark"]["version"] and doc["failures"]
    html = client.get("/reports/" + report.json()["id"] + "/download?format=html")
    assert html.status_code == 200 and "DEMO · SYNTHETIC" in html.text


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
