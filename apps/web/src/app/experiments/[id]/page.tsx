"use client";
import { Suspense, use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Beaker,
  FileBarChart2,
  GitCompareArrows,
  PauseCircle,
  Play,
  RefreshCcw,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  formatMetric,
  selectMetric,
  short,
  stamp,
  useApi,
} from "@/lib/api";
import type { Experiment, Run } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  JsonBlock,
  Loading,
  MetricCard,
  PageHeader,
  ProgressBar,
  StatLine,
  StatusBadge,
} from "@/components/ui";
interface TaskDistribution {
  tasks: {
    task_id: string;
    task_key: string;
    n: number;
    passed: number;
    failed: number;
    errors: number;
    success_rate_percent: number | null;
    wilson_95_ci_percent: [number, number] | null;
    observed_sample_variance: number | null;
  }[];
  note: string;
}
function ExperimentDetail({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const baselineId = search.get("baseline");
  const {
    data: ex,
    error,
    mutate,
  } = useApi<Experiment>(`/experiments/${id}`, 2500);
  const { data: baseline } = useApi<Experiment>(
    baselineId ? `/experiments/${baselineId}` : null,
    3500,
  );
  const [tab, setTab] = useState("Runs");
  const [filter, setFilter] = useState("ALL");
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");
  const [moreRuns, setMoreRuns] = useState<Run[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const { data: distribution, mutate: refreshDistribution } =
    useApi<TaskDistribution>(
      ex?.runs_per_task && ex.runs_per_task > 1
        ? `/experiments/${id}/task-distribution`
        : null,
      6000,
    );
  // The experiment and per-task summaries are separate requests: the latter may
  // have been polled before the last job finished. Revalidate on finalization.
  useEffect(() => {
    if (ex?.status === "COMPLETED" && ex.runs_per_task > 1)
      void refreshDistribution();
  }, [ex?.status, ex?.runs_per_task, refreshDistribution]);
  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await api<Run[]>(
        `/experiments/${id}/runs?offset=${runs.length}&limit=200`,
      );
      setMoreRuns((prev) => [...prev, ...next]);
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Could not load more runs",
      );
    } finally {
      setLoadingMore(false);
    }
  }
  async function act(action: "cancel" | "resume" | "run" | "report") {
    setBusy(action);
    setActionError("");
    try {
      if (action === "report") {
        const result = await api<{ id: string }>("/reports", "POST", {
          experiment_id: id,
        });
        router.push(`/reports/${result.id}`);
      } else {
        await api(`/experiments/${id}/${action}`, "POST");
        await mutate();
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy("");
    }
  }
  if (error)
    return <ErrorBox message={error.message} retry={() => void mutate()} />;
  if (!ex) return <Loading />;
  const counts = ex.progress.counts;
  const initial = ex.runs ?? [];
  const initialIds = new Set(initial.map((r) => r.id));
  const runs = [...initial, ...moreRuns.filter((r) => !initialIds.has(r.id))];
  const visible = runs.filter((r) => filter === "ALL" || r.status === filter);
  const done = ex.status === "COMPLETED" || ex.status === "CANCELLED";
  const distributionCurrent =
    ex.status !== "COMPLETED" ||
    distribution?.tasks.reduce((sum, task) => sum + task.n, 0) ===
      ex.progress.completed;
  return (
    <div>
      <Link
        href="/experiments"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#91a7b0] hover:text-mint"
      >
        <ArrowLeft size={12} /> Experiment ledger
      </Link>
      <PageHeader
        kicker="EXPERIMENT / OBSERVED EXECUTION"
        title={ex.name}
        description={`${ex.agent_name} v${ex.agent_version} · ${ex.benchmark_name} v${ex.benchmark_version} · ${stamp(ex.created_at)}`}
        actions={
          <>
            {ex.is_demo && <DemoBadge compact />}
            <StatusBadge status={ex.status} />
            {done && (
              <button
                onClick={() => void act("report")}
                disabled={!!busy}
                className="button-primary"
              >
                <FileBarChart2 size={14} /> Generate report
              </button>
            )}
          </>
        }
      />
      {actionError && (
        <div className="mb-4 rounded border border-[#784447] bg-[#322328] p-3 text-xs text-danger">
          {actionError}
        </div>
      )}
      {baselineId && (
        <div className="panel mb-5 flex flex-wrap items-center justify-between gap-4 border-[#476451] bg-[#142820] p-4">
          <div className="flex items-center gap-3">
            <Beaker size={19} className="text-mint" />
            <div>
              <div className="text-xs font-semibold text-[#ddf1e6]">
                GUIDED DEMO · PAIRED VERSIONS
              </div>
              <p className="mt-0.5 text-[11px] text-[#91b2a1]">
                Baseline: {baseline?.progress.completed ?? "…"}/
                {baseline?.progress.total ?? "…"} runs · Candidate:{" "}
                {ex.progress.completed}/{ex.progress.total} runs. Results are
                measured from a synthetic mock fixture.
              </p>
            </div>
          </div>
          {done && baseline?.status === "COMPLETED" ? (
            <Link
              href={`/regression?baseline=${baselineId}&candidate=${id}`}
              className="button-primary"
            >
              <GitCompareArrows size={14} /> Compare versions
            </Link>
          ) : (
            <span className="text-[11px] text-[#91a9a6]">
              Waiting for both runs to finish…
            </span>
          )}
        </div>
      )}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          label="Task success"
          metric={selectMetric(ex.metrics, "task_success_rate")}
        />
        <MetricCard
          label="Tool accuracy"
          metric={selectMetric(ex.metrics, "tool_accuracy")}
        />
        <MetricCard
          label="Output validity"
          metric={selectMetric(ex.metrics, "output_validity")}
        />
        <MetricCard
          label="P95 latency"
          metric={selectMetric(ex.metrics, "latency_p95_ms")}
        />
        <MetricCard
          label="Cost / success"
          metric={selectMetric(ex.metrics, "cost_per_success_usd")}
        />
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-[1.5fr_.75fr]">
        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="label">DURABLE WORKER QUEUE</div>
              <div className="section-title mt-1">Evaluation progress</div>
            </div>
            <span className="font-mono text-[10px] text-[#859ba3]">
              {ex.progress.completed}/{ex.progress.total} runs
            </span>
          </div>
          <ProgressBar
            completed={ex.progress.completed}
            total={ex.progress.total}
            passed={counts.PASSED}
            failed={(counts.FAILED ?? 0) + (counts.ERROR ?? 0)}
          />
          <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[
              "QUEUED",
              "RUNNING",
              "PASSED",
              "FAILED",
              "ERROR",
              "CANCELLED",
            ].map((s) => (
              <div
                key={s}
                className="rounded border border-[#2b3a43] bg-[#0d181f] px-2 py-2"
              >
                <div className="font-mono text-[9px] text-[#859ba3]">{s}</div>
                <div
                  className={`mt-1 font-mono text-lg ${s === "FAILED" || s === "ERROR" ? "text-[#f19794]" : s === "PASSED" ? "text-mint" : "text-[#d7e4e8]"}`}
                >
                  {counts[s as keyof typeof counts] ?? 0}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => void mutate()} className="button-secondary">
              <RefreshCcw size={13} /> Refresh
            </button>
            {ex.status === "CREATED" && (
              <button
                onClick={() => void act("run")}
                className="button-primary"
              >
                <Play size={13} /> Queue runs
              </button>
            )}
            {!done && ex.status !== "CREATED" && (
              <>
                <button
                  onClick={() => void act("resume")}
                  className="button-secondary"
                >
                  Resume queued
                </button>
                <button
                  onClick={() => void act("cancel")}
                  className="button-danger"
                >
                  <PauseCircle size={13} /> Cancel pending
                </button>
              </>
            )}
            {done && (
              <Link
                href={`/traces?experiment=${id}`}
                className="button-secondary"
              >
                <Activity size={13} /> Open traces
              </Link>
            )}
          </div>
        </div>
        <div className="panel p-5">
          <div className="label">EXPERIMENT FINGERPRINT</div>
          <StatLine
            label="Agent"
            value={`${ex.agent_name} v${ex.agent_version}`}
          />
          <StatLine
            label="Benchmark"
            value={`v${ex.benchmark_version} · ${ex.selected_task_ids.length} tasks`}
          />
          <StatLine label="Runs per task" value={ex.runs_per_task} />
          <StatLine label="Seed" value={ex.seed} />
          <StatLine label="Harness" value={ex.evaluation_version} />
          <StatLine label="Git commit" value={short(ex.git_commit, 14)} />
          <StatLine label="Config SHA-256">
            <span title={ex.configuration_hash}>
              {short(ex.configuration_hash, 18)}…
            </span>
          </StatLine>
          <StatLine label="Experiment ID" value={short(ex.id, 18)} />
          <StatLine label="Completed" value={stamp(ex.completed_at)} />
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header flex-wrap">
          <div className="flex items-center gap-5">
            {["Runs", "Metrics", "Provenance"].map((x) => (
              <button
                key={x}
                type="button"
                onClick={() => setTab(x)}
                className={`text-xs font-semibold ${tab === x ? "text-mint" : "text-[#8299a4] hover:text-white"}`}
              >
                {x}
              </button>
            ))}
          </div>
          {tab === "Runs" && (
            <select
              className="select w-auto min-w-[130px] py-1.5"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="ALL">All runs</option>
              {[
                "PASSED",
                "FAILED",
                "ERROR",
                "RUNNING",
                "QUEUED",
                "CANCELLED",
              ].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
        </div>
        {tab === "Runs" &&
          (visible.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Task / run</th>
                    <th>Status</th>
                    <th>Observed output</th>
                    <th>Trace</th>
                    <th>Failure</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r: Run) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-mono text-[11px] text-[#d5e3e5]">
                          {r.task_key}{" "}
                          <span className="text-[#768d99]">
                            #{r.run_index + 1}
                          </span>
                        </div>
                        <div className="font-mono text-[9px] text-[#6e8490]">
                          {short(r.id, 10)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="max-w-[350px]">
                        <span
                          className="block truncate font-mono text-[10px] text-[#9bbab8]"
                          title={r.response_preview ?? undefined}
                        >
                          {r.response_preview ??
                            r.error ??
                            "Pending evaluation"}
                        </span>
                      </td>
                      <td>
                        {r.trace_id ? (
                          <Link
                            href={`/traces/${r.trace_id}`}
                            className="text-[11px] text-mint hover:underline"
                          >
                            Open trace{" "}
                            <ArrowRight size={11} className="inline" />
                          </Link>
                        ) : (
                          <span className="text-[#6a818c]">Pending</span>
                        )}
                      </td>
                      <td>
                        {r.failure_id ? (
                          <Link
                            href={`/failures/${r.failure_id}`}
                            className="text-[11px] text-danger hover:underline"
                          >
                            Inspect failure{" "}
                            <ArrowRight size={11} className="inline" />
                          </Link>
                        ) : (
                          <span className="text-[#69837e]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {ex.progress.total > runs.length && (
                <div className="flex items-center justify-between border-t border-border p-3 text-[11px] text-[#8ca2ac]">
                  <span>
                    Showing {runs.length} of {ex.progress.total} runs.
                  </span>
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={loadingMore}
                    className="button-secondary"
                  >
                    {loadingMore ? "Loading…" : "Load 200 more"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <EmptyState
              title="No matching runs"
              description={
                ex.status === "CREATED"
                  ? "Queue this experiment to create per-task runs."
                  : "No runs have reached this state yet."
              }
            />
          ))}
        {tab === "Metrics" && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric / direction</th>
                  <th>Measured</th>
                  <th>Sample</th>
                  <th>Formula</th>
                  <th>Source / timestamp</th>
                </tr>
              </thead>
              <tbody>
                {ex.metrics?.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="font-mono text-mint">{m.key}</span>
                      <div className="mt-1 text-[10px] text-[#899da6]">
                        {m.direction} is better
                      </div>
                    </td>
                    <td className="whitespace-nowrap font-mono text-[#e1eeee]">
                      {formatMetric(m.value, m.unit)}
                    </td>
                    <td className="mono">n={m.sample_count}</td>
                    <td className="max-w-[300px] text-[11px]">{m.formula}</td>
                    <td className="text-[10px]">
                      {m.data_source}
                      <div className="mt-1 text-[#7a919c]">
                        {stamp(m.measured_at)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!ex.metrics?.length && (
              <EmptyState
                title="Pending evaluation"
                description="Final metrics are computed from completed run records; the absence of scores is intentional."
              />
            )}
            {ex.runs_per_task > 1 && (
              <div className="border-t border-border p-5">
                <div className="label">PER-TASK / MULTI-RUN VARIANCE</div>
                <div className="mt-1 text-[11px] text-[#8fa6ab]">
                  Configured for {ex.runs_per_task} runs per task. Partial
                  results update as jobs finish; Wilson 95% intervals are not
                  significance claims.
                </div>
                {!distributionCurrent ? (
                  <p className="mt-3 text-xs text-[#91a8ac]">
                    Refreshing final per-task observations…
                  </p>
                ) : (
                  <div className="mt-3 max-h-[280px] overflow-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Task</th>
                          <th>Pass / n</th>
                          <th>Success</th>
                          <th>Wilson 95% CI</th>
                          <th>Sample variance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {distribution?.tasks.map((t) => (
                          <tr key={t.task_id}>
                            <td className="font-mono text-mint">
                              {t.task_key}
                            </td>
                            <td className="mono">
                              {t.passed} / {t.n}
                            </td>
                            <td className="mono">
                              {formatMetric(t.success_rate_percent, "%")}
                            </td>
                            <td className="mono">
                              {t.wilson_95_ci_percent
                                ? `${t.wilson_95_ci_percent[0]}–${t.wilson_95_ci_percent[1]}%`
                                : "Not measured"}
                            </td>
                            <td className="mono">
                              {t.observed_sample_variance ?? "Not measured"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {tab === "Provenance" && (
          <div className="grid gap-4 p-5 lg:grid-cols-2">
            <JsonBlock
              value={{
                agent_version_id: ex.agent_version_id,
                benchmark_version_id: ex.benchmark_version_id,
                experiment_configuration_hash: ex.configuration_hash,
                evaluation_version: ex.evaluation_version,
                seed: ex.seed,
                runs_per_task: ex.runs_per_task,
                git_commit: ex.git_commit,
                environment: ex.environment,
              }}
              title="Pinned experiment inputs"
            />
            <div className="space-y-4">
              <div className="rounded border border-[#31554a] bg-[#162921] p-4">
                <ShieldCheck size={17} className="text-mint" />
                <div className="mt-2 text-xs font-semibold">
                  Historical results are append-only
                </div>
                <div className="mt-1 text-[11px] text-[#95aaab]">
                  A rerun creates a new experiment with the same configuration.
                  External models and tool state may remain nondeterministic.
                </div>
              </div>
              <Link className="button-secondary" href="/settings">
                Read metric methodology <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
export default function ExperimentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<Loading />}>
      <ExperimentDetail id={id} />
    </Suspense>
  );
}
