"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Beaker,
  Database,
  FileSearch,
  FlaskConical,
  GitCompareArrows,
  Layers3,
  Play,
  Plus,
  ShieldAlert,
  TrendingUp,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, selectMetric, short, stamp } from "@/lib/api";
import { useApi } from "@/lib/api";
import type { Overview, Experiment } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  LinkArrow,
  Loading,
  MetricCard,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";

const coreMetrics = [
  { key: "task_success_rate", label: "Task success", hint: "PASS / completed" },
  { key: "tool_accuracy", label: "Tool accuracy", hint: "Requires tool rules" },
  {
    key: "robustness_rate",
    label: "Robustness",
    hint: "Requires variant suite",
  },
  { key: "latency_p95_ms", label: "P95 latency", hint: "Wall-clock measured" },
  {
    key: "cost_per_success_usd",
    label: "Cost / success",
    hint: "Requires token + pricing data",
  },
];

export default function OverviewPage() {
  const router = useRouter();
  const { data, error, isLoading, mutate } = useApi<Overview>(
    "/overview",
    9000,
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function startDemo() {
    setBusy(true);
    setMessage("");
    try {
      const ids = await api<{
        baseline_experiment_id: string;
        candidate_experiment_id: string;
      }>("/demo/run", "POST", { seed: 42 });
      await mutate();
      router.push(
        `/experiments/${ids.candidate_experiment_id}?baseline=${ids.baseline_experiment_id}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not queue demo");
      setBusy(false);
    }
  }
  const latest = data?.latest_experiment;
  const chart =
    data?.recent_experiments
      .filter(
        (ex) =>
          ex.completed_at &&
          selectMetric(ex.metrics, "task_success_rate")?.value != null,
      )
      .reverse()
      .map((ex) => ({
        name: `${ex.agent_version} · ${short(ex.id, 4)}`,
        rate: selectMetric(ex.metrics, "task_success_rate")?.value ?? null,
      })) ?? [];
  return (
    <div>
      <PageHeader
        kicker="CONTROL ROOM / OVERVIEW"
        title="Reliability, under a microscope."
        description="A live view of measured agent behavior. Every result links back to a versioned task, an observable trace, and the rules that produced it."
        actions={
          <Link href="/experiments/new" className="button-primary">
            <Play size={13} /> New evaluation
          </Link>
        }
      />
      {error && (
        <ErrorBox message={error.message} retry={() => void mutate()} />
      )}{" "}
      {isLoading && !data && <Loading />}
      {message && (
        <div className="mb-4 rounded border border-[#754044] bg-[#35252a] px-4 py-3 text-xs text-danger">
          {message}
        </div>
      )}
      {data && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">
            {coreMetrics.map((item) => (
              <MetricCard
                key={item.key}
                label={item.label}
                metric={selectMetric(latest?.metrics, item.key)}
                note={item.hint}
              />
            ))}
          </div>
          {!latest ? (
            <div className="panel mb-5 overflow-hidden">
              <div className="grid lg:grid-cols-[1.15fr_.85fr]">
                <div className="lab-grid px-6 py-8 md:px-8 md:py-9">
                  <span className="eyebrow">START HERE / ZERO ASSUMPTIONS</span>
                  <h2 className="mt-4 max-w-[530px] text-[27px] font-semibold tracking-[-.04em] text-[#f0f5f3]">
                    No evaluations yet.
                    <br />
                    <span className="text-[#8da49f]">
                      That&apos;s an honest baseline.
                    </span>
                  </h2>
                  <p className="mt-3 max-w-[520px] text-[13px] leading-relaxed text-[#9daeb6]">
                    Register an agent, pin a benchmark version and run real
                    tests. Or launch the clearly labeled synthetic demo to
                    explore tracing and regression analysis.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-2">
                    <Link href="/agents" className="button-primary">
                      <Plus size={14} /> Register agent
                    </Link>
                    <Link href="/benchmarks" className="button-secondary">
                      <Layers3 size={14} /> Create benchmark
                    </Link>
                  </div>
                </div>
                <div className="border-t border-border bg-[#142028] px-6 py-8 md:px-8 lg:border-l lg:border-t-0">
                  <div className="flex items-center justify-between">
                    <div className="label">GUIDED EXPERIMENT</div>
                    <span className="chip border-[#856b41] bg-[#392e22] text-amber">
                      DEMO / 50 CASES
                    </span>
                  </div>
                  <div className="mt-5 flex items-center gap-3 text-mint">
                    <Beaker size={21} />
                    <span className="font-semibold tracking-tight">
                      Find the controlled regression
                    </span>
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-[#91a4ae]">
                    Execute two versions against the same synthetic revenue
                    dataset. Inspect tool-argument failures, replay one, and
                    generate a report. All numbers come from executed mock
                    runs—not a real model.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={startDemo}
                    className="button-secondary mt-5"
                  >
                    {busy ? "Queueing 100 runs…" : "Run controlled demo"}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#3a504b] bg-[#14221f] px-5 py-3">
              <div className="flex items-center gap-3 text-xs text-[#aec9be]">
                <div className="flex h-8 w-8 items-center justify-center rounded border border-[#487363] bg-[#244237] text-mint">
                  <FileSearch size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-2 font-semibold text-[#e0f4e9]">
                    Latest measured experiment{" "}
                    {latest.is_demo && <DemoBadge compact />}
                  </div>
                  <span className="mt-0.5 block text-[11px] text-[#8eada2]">
                    {latest.agent_name} v{latest.agent_version} ·{" "}
                    {latest.benchmark_name} v{latest.benchmark_version}
                  </span>
                </div>
              </div>
              <LinkArrow href={`/experiments/${latest.id}`}>
                Inspect evidence
              </LinkArrow>
            </div>
          )}
          <div className="grid items-start gap-5 xl:grid-cols-[1.45fr_.8fr]">
            <div className="panel overflow-hidden">
              <div className="panel-header">
                <div>
                  <div className="label">EXECUTION LEDGER</div>
                  <h3 className="section-title mt-0.5">Recent evaluations</h3>
                </div>
                <LinkArrow href="/experiments">View all runs</LinkArrow>
              </div>
              {data.recent_experiments.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Experiment</th>
                        <th>Agent / suite</th>
                        <th>Progress</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_experiments.map((ex: Experiment) => (
                        <tr key={ex.id}>
                          <td>
                            <Link
                              href={`/experiments/${ex.id}`}
                              className="font-semibold text-[#e1ecee] hover:text-mint"
                            >
                              {ex.name}
                            </Link>
                            <div className="mt-1 font-mono text-[10px] text-[#738c97]">
                              {short(ex.id, 12)} · {stamp(ex.created_at)}
                            </div>
                          </td>
                          <td>
                            <span className="text-[#c2d1d7]">
                              {ex.agent_name}{" "}
                              <span className="font-mono text-[#89bba9]">
                                v{ex.agent_version}
                              </span>
                            </span>
                            <div className="mt-1 text-[10px] text-[#7f949f]">
                              {ex.benchmark_name}{" "}
                              {ex.is_demo && <DemoBadge compact />}
                            </div>
                          </td>
                          <td className="min-w-[122px]">
                            <ProgressBar
                              completed={ex.progress.completed}
                              total={ex.progress.total}
                              passed={ex.progress.counts.PASSED}
                              failed={
                                (ex.progress.counts.FAILED ?? 0) +
                                (ex.progress.counts.ERROR ?? 0)
                              }
                            />
                          </td>
                          <td>
                            <StatusBadge status={ex.status} />
                          </td>
                          <td>
                            <Link
                              href={`/experiments/${ex.id}`}
                              className="text-[#7b9e9b] hover:text-mint"
                            >
                              <ArrowUpRight size={15} />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="Execution ledger empty"
                  description="When you run an evaluation, each per-task job appears here with real progress and source-linked results."
                  action={
                    <Link href="/experiments/new" className="button-secondary">
                      Create experiment <ArrowRight size={14} />
                    </Link>
                  }
                />
              )}
            </div>
            <div className="space-y-5">
              <div className="panel overflow-hidden">
                <div className="panel-header">
                  <div>
                    <div className="label">MEASUREMENT HISTORY</div>
                    <h3 className="section-title mt-0.5">
                      Task success by run
                    </h3>
                  </div>
                  <TrendingUp size={16} className="text-[#668b8a]" />
                </div>
                <div className="h-[202px] px-3 py-5">
                  {chart.length >= 2 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chart}
                        margin={{ top: 8, right: 8, left: -22, bottom: 4 }}
                      >
                        <CartesianGrid
                          vertical={false}
                          stroke="#253640"
                          strokeDasharray="2 4"
                        />
                        <XAxis
                          dataKey="name"
                          tick={{ fill: "#738c98", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          domain={[0, 100]}
                          tick={{ fill: "#738c98", fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "#111d25",
                            border: "1px solid #324652",
                            color: "#dce8eb",
                            fontSize: 11,
                          }}
                        />
                        <Line
                          type="linear"
                          dataKey="rate"
                          stroke="#65e0b4"
                          strokeWidth={2}
                          dot={{ fill: "#65e0b4", r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      title="Not measured"
                      description="Run at least two experiments to see observed success over time."
                      icon={<Activity size={19} />}
                    />
                  )}
                </div>
              </div>
              <div className="panel p-5">
                <div className="label">EVIDENCE INVENTORY / LIVE</div>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4">
                  {[
                    {
                      label: "Registered agents",
                      val: data.counts.agents,
                      icon: FlaskConical,
                      href: "/agents",
                    },
                    {
                      label: "Benchmark suites",
                      val: data.counts.benchmarks,
                      icon: Database,
                      href: "/benchmarks",
                    },
                    {
                      label: "Recorded traces",
                      val: data.counts.traces,
                      icon: Activity,
                      href: "/traces",
                    },
                    {
                      label: "Failure records",
                      val: data.counts.failures,
                      icon: ShieldAlert,
                      href: "/failures",
                    },
                  ].map((item) => (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="group border-b border-[#293741] pb-2"
                    >
                      <div className="flex items-center gap-1.5 text-[10px] text-[#8b9ea8]">
                        <item.icon size={13} />
                        {item.label}
                      </div>
                      <div className="mt-1 font-mono text-lg font-semibold text-[#dfeced] group-hover:text-mint">
                        {item.val}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[
              {
                icon: Activity,
                title: "Observe every step",
                detail: "Trace observable actions and sandboxed tool results.",
                href: "/traces",
              },
              {
                icon: GitCompareArrows,
                title: "Compare paired runs",
                detail:
                  "Detect new failures only when benchmarks are comparable.",
                href: "/regression",
              },
              {
                icon: FileSearch,
                title: "Export with provenance",
                detail: "Every result carries its formula, source and version.",
                href: "/reports",
              },
            ].map((item) => (
              <Link
                href={item.href}
                key={item.title}
                className="panel flex gap-3 p-4 transition-colors hover:border-[#3c675b]"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-[#345149] bg-[#1b312e] text-mint">
                  <item.icon size={17} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#dce9e9]">
                    {item.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[#8297a0]">
                    {item.detail}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
