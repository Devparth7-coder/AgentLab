"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleDollarSign, Clock3, Info } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMetric, number, selectMetric, useApi } from "@/lib/api";
import type { Experiment, Metric } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  MetricCard,
  PageHeader,
  StatLine,
} from "@/components/ui";
interface CostSummary {
  experiment_id: string;
  estimated_cost_usd: Metric | null;
  total_tokens: Metric | null;
  api_calls: number | null;
  api_call_coverage: string;
  tool_calls: number;
  tool_breakdown: {
    tool_name: string;
    calls: number;
    average_ms: number;
    p95_ms: number;
  }[];
  records: {
    run_id: string;
    api_calls: number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    estimated_cost_usd: number | null;
  }[];
  note: string;
}
interface LatencyDistribution {
  experiment_id: string;
  records: {
    run_id: string;
    total_ms: number;
    tool_ms: number;
    ttft_ms: number | null;
  }[];
  note: string;
}
export default function CostPage() {
  const { data: exps } = useApi<Experiment[]>("/experiments?limit=200", 6000);
  const [chosen, setChosen] = useState("");
  const ex = exps?.find(
    (e) =>
      e.id === (chosen || exps.find((e) => e.completed_at)?.id || exps[0]?.id),
  );
  const { data: cost, error } = useApi<CostSummary>(
    ex ? `/cost/summary?experiment_id=${ex.id}` : null,
    5000,
  );
  const { data: latency } = useApi<LatencyDistribution>(
    ex ? `/latency/distribution?experiment_id=${ex.id}` : null,
    5000,
  );
  const { data: detail } = useApi<Experiment>(
    ex ? `/experiments/${ex.id}` : null,
    7000,
  );
  const durations = latency?.records.map((x) => x.total_ms) ?? [];
  const max = Math.max(...durations, 0);
  const bins =
    max > 0
      ? Array.from({ length: 8 }, (_, i) => ({
          label: `${number(((i + 0.5) * max) / 8, 1)}ms`,
          runs: durations.filter(
            (x) => Math.min(7, Math.floor((x / max) * 8)) === i,
          ).length,
        }))
      : [];
  const measuredCost = selectMetric(detail?.metrics, "estimated_cost_usd");
  const measuredTokens = selectMetric(detail?.metrics, "total_tokens");
  return (
    <div>
      <PageHeader
        kicker="ANALYZE / ECONOMICS & PERFORMANCE"
        title="Know what it costs to be right."
        description="Token, API-call, tool and wall-clock measurements are sourced from run records. Missing usage or pricing remains Not measured—not zero."
      />
      <div className="panel mb-5 flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="label">ANALYZE EXPERIMENT</div>
        <select
          className="select w-auto max-w-[420px] flex-1"
          value={ex?.id ?? ""}
          onChange={(e) => setChosen(e.target.value)}
        >
          <option value="" disabled>
            Select experiment…
          </option>
          {exps?.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name} · v{x.agent_version} · {x.status}
            </option>
          ))}
        </select>
        {ex?.is_demo && <DemoBadge compact />}
        {ex && (
          <Link href={`/experiments/${ex.id}`} className="button-secondary">
            Inspect source
            <ArrowRight size={13} />
          </Link>
        )}
      </div>
      {!ex ? (
        <div className="panel">
          <EmptyState
            title="No experiment selected"
            description="Run an evaluation to capture latency. Provider token and cost data require supported usage fields and configured pricing."
            icon={<CircleDollarSign size={20} />}
          />
        </div>
      ) : (
        <>
          {error && <ErrorBox message={error.message} />}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <MetricCard label="Estimated agent cost" metric={measuredCost} />
            <MetricCard
              label="Cost per success"
              metric={selectMetric(detail?.metrics, "cost_per_success_usd")}
            />
            <MetricCard label="Reported tokens" metric={measuredTokens} />
            <MetricCard
              label="P95 run latency"
              metric={selectMetric(detail?.metrics, "latency_p95_ms")}
            />
            <MetricCard
              label="Average tool latency"
              metric={selectMetric(detail?.metrics, "average_tool_latency_ms")}
            />
          </div>
          <div className="mb-5 grid gap-5 xl:grid-cols-[1.22fr_.78fr]">
            <div className="panel overflow-hidden">
              <div className="panel-header">
                <div>
                  <div className="label">WALL-CLOCK DISTRIBUTION</div>
                  <div className="section-title mt-1">
                    Run latency / observed
                  </div>
                </div>
                <Clock3 size={16} className="text-[#88ab9f]" />
              </div>
              {bins.length ? (
                <div className="h-[252px] px-3 py-5">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={bins}
                      margin={{ left: -19, right: 9, top: 5, bottom: 0 }}
                    >
                      <CartesianGrid
                        vertical={false}
                        stroke="#2b3b43"
                        strokeDasharray="2 4"
                      />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: "#879da6", fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fill: "#879da6", fontSize: 10 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: "#122129",
                          border: "1px solid #33505a",
                          fontSize: 11,
                        }}
                      />
                      <Bar
                        dataKey="runs"
                        fill="#60d5af"
                        radius={[2, 2, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  title="Latency not measured"
                  description="Run evaluations to see observed wall-clock distributions."
                />
              )}
              <div className="flex justify-between border-t border-border px-5 py-3 font-mono text-[10px] text-[#83a0a4]">
                <span>{durations.length} recorded runs</span>
                <span>p50 / p95 / p99 nearest-rank</span>
              </div>
            </div>
            <div className="panel p-5">
              <div className="label">COVERAGE / EVIDENCE</div>
              <StatLine
                label="Provider API calls"
                value={cost?.api_calls ?? null}
              />
              <StatLine
                label="API call coverage"
                value={cost?.api_call_coverage ?? "Not measured"}
              />
              <StatLine
                label="Sandbox tool calls"
                value={cost?.tool_calls ?? null}
              />
              <StatLine
                label="Token coverage"
                value={
                  measuredTokens?.provenance?.measurement_coverage?.toString() ??
                  "Not measured"
                }
              />
              <StatLine
                label="Pricing coverage"
                value={
                  measuredCost?.provenance?.measurement_coverage?.toString() ??
                  "Not measured"
                }
              />
              <StatLine label="Runs with latency" value={durations.length} />
              <div className="mt-5 rounded border border-[#3d4e47] bg-[#1a2723] p-3 text-[11px] leading-relaxed text-[#a2b8af]">
                <Info size={15} className="mb-1 text-mint" />
                <b>Estimate boundary:</b> only agent inference token pricing is
                included. Tool fees and optional judge usage are excluded. The
                mock adapter reports no tokens, so demo cost is always Not
                measured.
              </div>
            </div>
          </div>
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            <div className="panel overflow-hidden">
              <div className="panel-header">
                <div className="label">SLOW TOOL BREAKDOWN / MEASURED</div>
                <span className="mono text-[#8098a1]">
                  {cost?.tool_breakdown.length ?? 0} tools
                </span>
              </div>
              {cost?.tool_breakdown.length ? (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Tool</th>
                        <th>Calls</th>
                        <th>Mean</th>
                        <th>P95</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cost.tool_breakdown.map((t) => (
                        <tr key={t.tool_name}>
                          <td className="font-mono text-mint">{t.tool_name}</td>
                          <td className="mono">{t.calls}</td>
                          <td className="mono">
                            {formatMetric(t.average_ms, "ms")}
                          </td>
                          <td className="mono">
                            {formatMetric(t.p95_ms, "ms")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No tool calls"
                  description="No sandbox tool calls have been observed in this experiment."
                />
              )}
            </div>
            <div className="panel overflow-hidden">
              <div className="panel-header">
                <div className="label">PER-RUN USAGE / PROVIDER-REPORTED</div>
                <span className="mono text-[#8098a1]">
                  {cost?.records.length ?? 0} records
                </span>
              </div>
              {cost?.records.length ? (
                <div className="max-h-[305px] overflow-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Run ID</th>
                        <th>Input</th>
                        <th>Output</th>
                        <th>Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cost.records.map((r) => (
                        <tr key={r.run_id}>
                          <td className="mono">{r.run_id.slice(0, 10)}</td>
                          <td className="mono">
                            {r.input_tokens ?? "Not measured"}
                          </td>
                          <td className="mono">
                            {r.output_tokens ?? "Not measured"}
                          </td>
                          <td className="mono">
                            {formatMetric(r.estimated_cost_usd, "USD")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  title="No usage records"
                  description="Provider responses have not reported token usage yet."
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
