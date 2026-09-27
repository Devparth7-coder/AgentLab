"use client";
import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  GitCompareArrows,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, formatMetric, short, useApi } from "@/lib/api";
import type { Experiment, Failure, Regression } from "@/lib/types";
import { DemoBadge, EmptyState, Loading, PageHeader } from "@/components/ui";
const keys = [
  ["task_success_rate", "Task success", "%"],
  ["tool_accuracy", "Tool accuracy", "%"],
  ["instruction_following", "Instruction following", "%"],
  ["output_validity", "Output validity", "%"],
  ["recovery_rate", "Recovery", "%"],
  ["robustness_rate", "Robustness", "%"],
  ["latency_p95_ms", "P95 latency", "ms"],
  ["estimated_cost_usd", "Est. agent cost", "USD"],
  ["cost_per_success_usd", "Cost / success", "USD"],
  ["total_tokens", "Token usage", "tokens"],
] as const;
function RegressionPageInner() {
  const params = useSearchParams();
  const { data: exps } = useApi<Experiment[]>("/experiments?limit=200", 5000);
  const { data: history, mutate: reloadHistory } =
    useApi<Regression[]>("/regressions");
  const [baseline, setBaseline] = useState(params.get("baseline") ?? "");
  const [candidate, setCandidate] = useState(params.get("candidate") ?? "");
  const [comparison, setComparison] = useState<Regression | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const base = exps?.find((e) => e.id === baseline);
  const trial = exps?.find((e) => e.id === candidate);
  const previous = history?.find(
    (r) =>
      r.baseline_experiment_id === baseline &&
      r.candidate_experiment_id === candidate,
  );
  const report = comparison ?? previous;
  const { data: failures } = useApi<Failure[]>(
    report?.comparable
      ? `/failures?experiment_id=${candidate}&limit=200`
      : null,
  );
  async function compare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<Regression>("/regressions/compare", "POST", {
        baseline_experiment_id: baseline,
        candidate_experiment_id: candidate,
      });
      setComparison(result);
      void reloadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Comparison failed");
    } finally {
      setBusy(false);
    }
  }
  const chart = keys
    .slice(0, 6)
    .filter(
      ([key]) =>
        report?.deltas[key]?.baseline != null &&
        report?.deltas[key]?.candidate != null,
    )
    .map(([key, label]) => ({
      name: label,
      baseline: report!.deltas[key].baseline,
      candidate: report!.deltas[key].candidate,
    }));
  const compatible =
    base?.status === "COMPLETED" &&
    trial?.status === "COMPLETED" &&
    baseline !== candidate;
  return (
    <div>
      <PageHeader
        kicker="ANALYZE / PAIRED COMPARISONS"
        title="Regression laboratory"
        description="Compare the same task/run indices under the same benchmark and evaluation harness. A new failure is a paired observation, not a statistical-significance claim."
      />
      <div className="panel mb-5 p-5">
        <div className="label">COMPARISON DESIGN / SAME WORKLOAD REQUIRED</div>
        <form
          onSubmit={compare}
          className="mt-4 grid gap-3 md:grid-cols-[1fr_32px_1fr_auto]"
        >
          <div>
            <label className="input-label">Baseline experiment</label>
            <select
              required
              className="select"
              value={baseline}
              onChange={(e) => {
                setBaseline(e.target.value);
                setComparison(null);
              }}
            >
              <option value="">Select baseline…</option>
              {exps?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · v{x.agent_version} · {x.status}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden items-end justify-center pb-2 text-[#77958c] md:flex">
            <GitCompareArrows size={17} />
          </div>
          <div>
            <label className="input-label">Candidate experiment</label>
            <select
              required
              className="select"
              value={candidate}
              onChange={(e) => {
                setCandidate(e.target.value);
                setComparison(null);
              }}
            >
              <option value="">Select candidate…</option>
              {exps?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · v{x.agent_version} · {x.status}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              disabled={busy || !compatible}
              type="submit"
              className="button-primary h-[39px]"
            >
              {busy ? "Comparing…" : "Compare versions"}
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
        {base && trial && (
          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-[#8ba7a5]">
            <span className="chip border-[#3b5851] bg-[#172c28] text-[#a3d4bf]">
              Benchmark{" "}
              {base.benchmark_version_id === trial.benchmark_version_id
                ? "matched"
                : "DIFFERENT"}
            </span>
            <span className="chip border-[#3b5851] bg-[#172c28] text-[#a3d4bf]">
              Harness{" "}
              {base.evaluation_version === trial.evaluation_version
                ? "matched"
                : "DIFFERENT"}
            </span>
            <span className="chip border-[#3b5851] bg-[#172c28] text-[#a3d4bf]">
              Seed {base.seed === trial.seed ? "matched" : "DIFFERENT"}
            </span>
            {!compatible && (
              <span className="text-amber">
                Both experiments must be completed before a comparison.
              </span>
            )}
          </div>
        )}
        {error && <div className="mt-3 text-xs text-danger">{error}</div>}
      </div>
      {report ? (
        <>
          <div
            className={`panel mb-5 flex flex-wrap items-start justify-between gap-4 p-5 ${report.verdict === "REGRESSION" ? "border-[#75504f] bg-[#2a2024]" : report.comparable ? "border-[#416350] bg-[#172b24]" : "border-[#5b5644] bg-[#24251f]"}`}
          >
            <div className="flex gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded border ${report.verdict === "REGRESSION" ? "border-[#ab6364] bg-[#4b3031] text-danger" : "border-[#5e8068] bg-[#2a4437] text-mint"}`}
              >
                {report.verdict === "REGRESSION" ? (
                  <TrendingDown size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
              </div>
              <div>
                <div className="label">
                  OPERATIONAL VERDICT / {report.comparator_version}
                </div>
                <div
                  className={`mt-1 text-[19px] font-semibold tracking-tight ${report.verdict === "REGRESSION" ? "text-[#f7c1b8]" : "text-[#d9f4df]"}`}
                >
                  {report.verdict.replaceAll("_", " ")}
                </div>
                <ul className="mt-1 space-y-1 text-[11px] text-[#b3b8b4]">
                  {report.reasons.map((r) => (
                    <li key={r}>• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
            {base?.is_demo && <DemoBadge />}
          </div>
          {report.comparable && (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="panel p-4">
                  <div className="label text-danger">NEW FAILURES</div>
                  <div className="mt-1 font-mono text-[27px] text-[#f29b96]">
                    {report.new_failures.length}
                  </div>
                  <div className="mt-1 text-[10px] text-[#8ba2aa]">
                    Previously passing paired runs now fail
                  </div>
                </div>
                <div className="panel p-4">
                  <div className="label text-mint">RESOLVED</div>
                  <div className="mt-1 font-mono text-[27px] text-mint">
                    {report.resolved_failures.length}
                  </div>
                  <div className="mt-1 text-[10px] text-[#8ba2aa]">
                    Previously failing runs now pass
                  </div>
                </div>
                <div className="panel p-4">
                  <div className="label text-amber">PERSISTENT</div>
                  <div className="mt-1 font-mono text-[27px] text-amber">
                    {report.persistent_failures.length}
                  </div>
                  <div className="mt-1 text-[10px] text-[#8ba2aa]">
                    Failures observed in both versions
                  </div>
                </div>
              </div>
              <div className="mb-5 grid gap-5 xl:grid-cols-[.88fr_1.12fr]">
                <div className="panel p-5">
                  <div className="label">PAIRED SCORE PROFILE / OBSERVED</div>
                  <div className="section-title mt-1">Version comparison</div>
                  {chart.length ? (
                    <div className="mt-5 h-[270px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chart}
                          layout="vertical"
                          margin={{ left: 13, right: 18, top: 4, bottom: 0 }}
                        >
                          <CartesianGrid stroke="#2a3b43" horizontal={false} />
                          <XAxis
                            type="number"
                            domain={[0, 100]}
                            tick={{ fill: "#8096a0", fontSize: 10 }}
                            axisLine={false}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={104}
                            tick={{ fill: "#9cabb4", fontSize: 10 }}
                            axisLine={false}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "#13212a",
                              border: "1px solid #38505a",
                              fontSize: 11,
                            }}
                          />
                          <Legend
                            wrapperStyle={{ fontSize: 10, color: "#9cadaf" }}
                          />
                          <Bar
                            name="Baseline"
                            dataKey="baseline"
                            fill="#638394"
                            barSize={8}
                          />
                          <Bar
                            name="Candidate"
                            dataKey="candidate"
                            fill="#63dfb3"
                            barSize={8}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState
                      title="No paired measured scores"
                      description="Metric values remain Not measured when no corresponding evidence exists."
                    />
                  )}
                </div>
                <div className="panel overflow-hidden">
                  <div className="panel-header">
                    <div>
                      <div className="label">DELTA / OBSERVED DIFFERENCE</div>
                      <div className="section-title mt-1">Measurements</div>
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Metric</th>
                          <th>Baseline</th>
                          <th>Candidate</th>
                          <th>Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {keys.map(([key, label, unit]) => {
                          const delta = report.deltas[key];
                          return (
                            <tr key={key}>
                              <td className="text-[11px]">{label}</td>
                              <td className="font-mono text-[11px]">
                                {formatMetric(delta?.baseline, unit)}
                              </td>
                              <td className="font-mono text-[11px]">
                                {formatMetric(delta?.candidate, unit)}
                              </td>
                              <td
                                className={`font-mono text-[11px] ${delta?.delta == null ? "text-[#8095a0]" : unit === "%" ? (delta.delta < 0 ? "text-danger" : "text-mint") : delta.delta > 0 ? "text-danger" : "text-mint"}`}
                              >
                                {delta?.delta == null
                                  ? "Not measured"
                                  : `${delta.delta > 0 ? "+" : ""}${formatMetric(delta.delta, unit)}`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <div>
                    <div className="label">NEW FAILURE SET</div>
                    <div className="section-title mt-1">
                      Passing → failing task/run pairs
                    </div>
                  </div>
                  <span className="mono text-[#9faaa7]">
                    {report.new_failures.length} affected
                  </span>
                </div>
                {report.new_failures.length ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Task key</th>
                          <th>Run index</th>
                          <th>Classification</th>
                          <th>Baseline</th>
                          <th>Candidate evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.new_failures.map((f, i) => {
                          const found = failures?.find(
                            (x) => x.run_id === f.candidate_run_id,
                          );
                          return (
                            <tr key={i}>
                              <td className="font-mono text-[#dce8e9]">
                                {f.task_key}
                              </td>
                              <td className="mono">#{f.run_index + 1}</td>
                              <td className="text-danger">
                                {found?.failure_type?.replaceAll("_", " ") ??
                                  "Loading evidence…"}
                              </td>
                              <td>
                                <Link
                                  className="mono text-[#8eacb6] hover:text-mint"
                                  href={`/experiments/${baseline}`}
                                >
                                  {short(f.baseline_run_id, 12)}
                                </Link>
                              </td>
                              <td>
                                {found ? (
                                  <Link
                                    href={`/failures/${found.id}`}
                                    className="text-mint hover:underline"
                                  >
                                    Inspect failure
                                    <ArrowRight
                                      size={12}
                                      className="ml-1 inline"
                                    />
                                  </Link>
                                ) : (
                                  <Link
                                    href={`/experiments/${candidate}`}
                                    className="text-mint"
                                  >
                                    Candidate run{" "}
                                    <ArrowRight size={12} className="inline" />
                                  </Link>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="No new failures"
                    description="No previously passing task/run pair failed in the candidate under this comparable workload."
                  />
                )}
              </div>
              <p className="mt-4 text-[11px] text-[#8198a1]">
                Operational threshold for latency: &gt;10% and ≥50ms absolute
                increase with ≥100ms baseline; for cost/success: &gt;10% and
                ≥$0.001. This is not a significance test.
              </p>
            </>
          )}
        </>
      ) : (
        <div className="panel">
          <EmptyState
            title="No comparison selected"
            description="Select two completed experiments. AGENTLAB checks benchmark, harness, task selection, seed and environment before comparing evidence."
            icon={<GitCompareArrows size={21} />}
          />
        </div>
      )}
    </div>
  );
}
export default function RegressionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RegressionPageInner />
    </Suspense>
  );
}
