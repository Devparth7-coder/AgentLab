# Evaluation and metric methodology

**Question:** How reliably can an autonomous AI agent complete tasks while using external tools under normal, noisy and adversarial conditions? The platform records observable behavior and rule outcomes; it does not infer private reasoning or claim general intelligence.

## Evaluation contract

Each benchmark **version** owns its references and rules. Supported evaluator types are `exact_match` (string/JSON reference), `json_schema` (Draft 2020-12, remote `$ref` rejected), `reference_numeric` (explicit absolute tolerance), `tool_rules` (required/forbidden/exclusive selection and exact named arguments), `rule_based` (required/forbidden substrings and length), and `trusted_python` (**installed** allowlisted `nonempty_json` / `nonnegative_total` plugins; never user scripts). Optional `llm_judge` is **off** until `AGENTLAB_ENABLE_LLM_JUDGE=true`, HTTPS endpoint, model and key are configured; judge outcomes are fallible and the judge's own cost is excluded. If no rule can be measured, the run is `ERROR`, not an invented pass. When a reference exists and no rule is specified, `exact_match` is the default. Rule success means **the stated criterion passed**, not that a human endorsed the whole answer.

Evaluator results preserve type, version, PASS/FAIL/NOT_MEASURED, evidence and reason. Failure types (e.g. tool selection/argument failure, schema failure, recovery failure, timeout) are **diagnostic classifications from these records**, not asserted model-internal root causes.

## Actual metric formulas

Every final `metric` row stores key, definition, formula, unit/direction, value or null, sample count, numerator/denominator where relevant, measurement time, data source and provenance (experiment, agent/benchmark version IDs and hashes, harness, Git commit, seed, environment, demo flag). The UI exposes these; `GET /metrics/definitions` is the live authoritative catalog.

| Metric | Calculation / denominator |
| --- | --- |
| `task_success_rate` | `100 × PASSED / (PASSED + FAILED + ERROR)` completed non-cancelled runs. |
| `failure_rate` | `100 × (FAILED + ERROR) / completed non-cancelled runs`. |
| `tool_accuracy` | `100 × correctly selected, argument-valid, successful tool calls / tool calls for tasks with explicit tool rules`. No rule ⇒ **Not measured**, not 100%. |
| `instruction_following`, `output_validity` | Percent PASS among **measured** rule-based / JSON-schema evaluations, respectively. |
| `recovery_rate` | `100 × passed runs with observed retry after tool error / runs with tool error`. A tool error without retry does not count as recovery. |
| `robustness_rate` | `100 × passed meaning-preserving perturbed runs / completed meaning-preserving perturbed runs`. Adversarial/ambiguous/malformed variants are reported separately, not silently included. |
| `latency_p50_ms`, `latency_p95_ms`, `latency_p99_ms` | Nearest-rank (`ceil(q×n)`-th sorted) run wall-clock duration; `average_latency_ms` is arithmetic mean. Only recorded durations count, with coverage. |
| `average_tool_latency_ms` | Sum of measured tool-call durations / measured tool calls. |
| `total_tokens` | Sum of provider-reported input + output tokens **only if every non-cancelled completed run reports usage**. Partial coverage ⇒ null. |
| `estimated_cost_usd` | Sum of `(input_tokens × configured input USD/million + output_tokens × configured output USD/million) / 1,000,000` across covered runs **only if usage and prices cover all**. `cost_per_success_usd` divides that full total by passed runs; if none, null. No default pricing. |

Costs cover configured **agent inference only**; tool fees and optional judge calls are excluded. A 0 value is reported only if it was actually measured (e.g. configured price 0 with full usage); otherwise **Not measured**. Provider retries may incur duplicated charges even if the usage response is missing: do not mistake this estimate for an invoice. TTFT is null unless a provider explicitly reports it. Wall-clock latency is not an internal model speed metric.

## Multi-run uncertainty, perturbation and comparison

Per task, repeat a pinned task up to 20 times with `seed + run_index`; report `n`, pass/fail/error counts, empirical success rate, 95% Wilson score interval and observed Bernoulli **sample** variance `p(1-p) n/(n−1)` when `n≥2`. A deterministic mock can have 0 observed variance; it does **not** prove an LLM will do so. A Wilson interval reflects observed task-level binomial uncertainty, not causality/significance. Zero completed runs ⇒ null interval/rate; one run ⇒ null sample variance.

Robustness generation is **seeded and immutable**: whitespace, wording, irrelevant text, transport noise, long context and simulated tool faults preserve the original target; conflict, ambiguity, adversarial injection, distractor and malformed input are marked non-preserving/adversarial. Metadata stores the source task/version and transformation seed. Faults affect only allowlisted mock tools; they never call dangerous real services. A mock adapter reads explicit fixture metadata, so its result should **not** be used to infer language sensitivity.

Regression is a paired operational comparator (`paired-1.0.0`). It refuses unfinished/partial experiments, records `INCOMPARABLE` for mismatched pinned conditions, and otherwise compares each `(task_id, run_index)` pair, recording new, resolved and persistent failures and metric deltas. A new failed previously passing pair is a `REGRESSION`. A measured cost-per-success or P95 latency increase also triggers a regression **only if** it exceeds the explicit operational >10% and absolute/minimum thresholds in `packages/agentlab/regression.py`; these are **not statistical significance tests**. If cost/latency is null, no performance-regression claim is made. A `NO_REGRESSION_DETECTED` verdict is not proof of equality.

Replay creates a new experiment. Only a matching deterministic **mock** status + exact output hash is `REPRODUCIBLE`; an identical external-provider output is at most `PARTIALLY REPRODUCIBLE` because model revisions/third-party state cannot be pinned by this platform. A different external response is `NON-DETERMINISTIC`. All original history remains.

## Interpretation and provenance

When reporting a number, include the sample (`n`), formula, time, source, experiment ID, agent version/hash, benchmark version/hash, harness, seed, environment and demo status from the metric's provenance. Do not compare a mock score to a live-model score, or assume language-model generality from a finite benchmark. Tool/evaluator coverage may vary between benchmarks; a higher score on a different suite is not evidence of improvement. For a formally controlled study, supply external stratification, holdouts and uncertainty procedures beyond the platform's operational paired checks.
