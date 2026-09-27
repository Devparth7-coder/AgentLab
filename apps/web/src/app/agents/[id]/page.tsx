"use client";
import { FormEvent, use, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Fingerprint,
  GitBranchPlus,
  Plus,
} from "lucide-react";
import {
  api,
  formatMetric,
  selectMetric,
  short,
  stamp,
  useApi,
} from "@/lib/api";
import type { Agent, Experiment } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  LinkArrow,
  Loading,
  MetricCard,
  PageHeader,
  StatLine,
  StatusBadge,
} from "@/components/ui";

const tabs = [
  "Overview",
  "Versions",
  "Evaluations",
  "Traces",
  "Failures",
  "Regression",
  "Cost",
] as const;
export default function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: agent, error, mutate } = useApi<Agent>(`/agents/${id}`);
  const { data: exps } = useApi<Experiment[]>(
    `/experiments?agent_id=${id}&limit=100`,
    6000,
  );
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");
  const [adding, setAdding] = useState(false);
  const [version, setVersion] = useState("");
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [err, setErr] = useState("");
  const last = exps?.find((e) => e.status === "COMPLETED");
  const { data: lastDetail } = useApi<Experiment>(
    last ? `/experiments/${last.id}` : null,
    8000,
  );
  const latest = agent?.versions[0];
  async function add(e: FormEvent) {
    e.preventDefault();
    if (!latest) return;
    setErr("");
    try {
      await api(`/agents/${id}/versions`, "POST", {
        version,
        model,
        system_prompt: prompt,
        tool_configuration: latest.tool_configuration,
        configuration: latest.configuration,
        temperature: latest.temperature,
        max_tokens: latest.max_tokens,
        model_revision: latest.model_revision,
      });
      await mutate();
      setAdding(false);
      setVersion("");
      setPrompt("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create version");
    }
  }
  if (error) return <ErrorBox message={error.message} />;
  if (!agent) return <Loading />;
  return (
    <div>
      <Link
        href="/agents"
        className="mb-4 inline-flex items-center gap-1.5 text-[11px] text-[#8da7ae] hover:text-mint"
      >
        <ArrowLeft size={12} /> Agent registry
      </Link>
      <PageHeader
        kicker="AGENT REGISTRY / VERSIONED"
        title={agent.name}
        description={agent.description || "No description provided."}
        actions={
          <>
            <StatusBadge status={agent.status} />
            {agent.is_demo && <DemoBadge compact />}
            <Link href="/experiments/new" className="button-primary">
              <Plus size={14} /> Run evaluation
            </Link>
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label="Task success"
          metric={selectMetric(lastDetail?.metrics, "task_success_rate")}
        />
        <MetricCard
          label="Tool accuracy"
          metric={selectMetric(lastDetail?.metrics, "tool_accuracy")}
        />
        <MetricCard
          label="P95 latency"
          metric={selectMetric(lastDetail?.metrics, "latency_p95_ms")}
        />
        <MetricCard
          label="Cost / success"
          metric={selectMetric(lastDetail?.metrics, "cost_per_success_usd")}
        />
      </div>
      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`tab whitespace-nowrap ${tab === t ? "tab-active" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_.85fr]">
          <div className="panel p-5">
            <div className="label">AGENT CONFIGURATION / LATEST PIN</div>
            <div className="mt-3">
              <StatLine label="Provider" value={agent.provider} />
              <StatLine label="Model" value={latest?.model} />
              <StatLine label="Model revision" value={latest?.model_revision} />
              <StatLine label="Version" value={latest?.version} />
              <StatLine label="Temperature" value={latest?.temperature} />
              <StatLine label="Max tokens" value={latest?.max_tokens} />
              <StatLine
                label="Tool permissions"
                value={latest?.tool_configuration.join(", ") || "None"}
              />
              <StatLine label="Config SHA-256">
                <span title={latest?.configuration_hash}>
                  {short(latest?.configuration_hash, 18)}…
                </span>
              </StatLine>
              <StatLine label="Prompt SHA-256">
                <span title={latest?.system_prompt_hash}>
                  {short(latest?.system_prompt_hash, 18)}…
                </span>
              </StatLine>
            </div>
            <p className="mt-3 text-[10px] text-[#69808e]">
              Raw system prompts are never returned by read APIs. Version
              snapshots remain immutable.
            </p>
          </div>
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div className="label">RECENT EVALUATIONS</div>
              <LinkArrow href={`/experiments?agent=${id}`}>View all</LinkArrow>
            </div>
            {exps?.length ? (
              <div className="divide-y divide-border">
                {exps.slice(0, 5).map((e) => (
                  <Link
                    key={e.id}
                    href={`/experiments/${e.id}`}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#1d2b33]"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[12px] font-semibold text-[#dce8ea]">
                        {e.name}
                      </div>
                      <div className="mt-1 font-mono text-[10px] text-[#758d98]">
                        v{e.agent_version} · {stamp(e.created_at)}
                      </div>
                    </div>
                    <StatusBadge status={e.status} />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No evaluations"
                description="Run this agent against a versioned benchmark to measure reliability."
              />
            )}
          </div>
        </div>
      )}
      {tab === "Versions" && (
        <div className="grid gap-5 xl:grid-cols-[1fr_.75fr]">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div className="label">IMMUTABLE VERSION LEDGER</div>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setModel(latest?.model ?? "");
                  setAdding(!adding);
                }}
              >
                <GitBranchPlus size={13} /> New version
              </button>
            </div>
            <div className="divide-y divide-border">
              {agent.versions.map((v) => (
                <div key={v.id} className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="chip border-[#3d6257] bg-[#1a3431] text-[#a7ebce]">
                      v{v.version}
                    </span>
                    <span className="font-mono text-[10px] text-[#8298a4]">
                      {stamp(v.created_at)}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-[#c6d6da]">
                    {agent.provider} / {v.model}
                  </div>
                  <div className="mt-2 font-mono text-[10px] text-[#809aa2]">
                    CONFIG {short(v.configuration_hash, 24)}…
                  </div>
                  <div className="mt-1 font-mono text-[10px] text-[#809aa2]">
                    PROMPT {short(v.system_prompt_hash, 24)}…
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {v.tool_configuration.map((x) => (
                      <span
                        key={x}
                        className="chip border-[#345059] bg-[#1a2b32] text-[#95b5be]"
                      >
                        {x}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="panel p-5">
            {adding ? (
              <form onSubmit={add} className="space-y-4">
                <div className="section-title">Create a new pinned version</div>
                <p className="text-[11px] text-[#89a0a9]">
                  Tool permissions and configuration are copied from latest.
                  Edit the prompt/model; the old snapshot cannot be changed.
                </p>
                <div>
                  <label className="input-label">Version</label>
                  <input
                    required
                    className="field"
                    value={version}
                    onChange={(e) => setVersion(e.target.value)}
                    placeholder="2.0.0"
                  />
                </div>
                <div>
                  <label className="input-label">Model</label>
                  <input
                    required
                    className="field"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                </div>
                <div>
                  <label className="input-label">System prompt</label>
                  <textarea
                    className="field min-h-24"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="New version instructions"
                  />
                </div>
                {err && <p className="text-xs text-danger">{err}</p>}
                <button className="button-primary" type="submit">
                  Create version
                  <ArrowRight size={14} />
                </button>
              </form>
            ) : (
              <div>
                <Fingerprint size={21} className="text-mint" />
                <h3 className="section-title mt-3">Snapshot integrity</h3>
                <p className="mt-2 text-[12px] leading-relaxed text-[#8fa6ae]">
                  Each pinned version captures the model, revision, prompt hash,
                  tool policy and environment metadata. Previous experiments
                  retain their exact version IDs.
                </p>
                <button
                  type="button"
                  className="button-secondary mt-4"
                  onClick={() => {
                    setModel(latest?.model ?? "");
                    setAdding(true);
                  }}
                >
                  Add version <Plus size={14} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {tab === "Evaluations" && (
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div className="label">EXPERIMENT HISTORY</div>
            <LinkArrow href="/experiments/new">New evaluation</LinkArrow>
          </div>
          {exps?.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Version</th>
                    <th>Benchmark</th>
                    <th>Success</th>
                    <th>Progress</th>
                    <th>State</th>
                  </tr>
                </thead>
                <tbody>
                  {exps.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <Link
                          href={`/experiments/${e.id}`}
                          className="font-semibold text-mint"
                        >
                          {e.name}
                        </Link>
                      </td>
                      <td className="mono">v{e.agent_version}</td>
                      <td>
                        {e.benchmark_name} v{e.benchmark_version}
                      </td>
                      <td>
                        {formatMetric(
                          selectMetric(e.metrics, "task_success_rate")?.value,
                          "%",
                        )}
                      </td>
                      <td className="mono">
                        {e.progress.completed}/{e.progress.total}
                      </td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No evaluations"
              description="This agent has not been evaluated yet."
            />
          )}
        </div>
      )}
      {["Traces", "Failures", "Regression", "Cost"].includes(tab) && (
        <div className="panel p-7">
          <div className="label">DIAGNOSTIC WORKSPACE</div>
          <h3 className="section-title mt-2">{tab} for this agent</h3>
          <p className="mt-2 text-xs text-[#8fa5ae]">
            Open an experiment for version-specific evidence, or browse the
            searchable {tab.toLowerCase()} workspace.
          </p>
          <div className="mt-5 flex gap-2">
            <Link
              href={
                (
                  {
                    Traces: "/traces",
                    Failures: "/failures",
                    Regression: "/regression",
                    Cost: "/cost",
                  } as Record<string, string>
                )[tab]
              }
              className="button-secondary"
            >
              Open {tab.toLowerCase()}
              <ArrowRight size={14} />
            </Link>
            {last && (
              <Link href={`/experiments/${last.id}`} className="button-ghost">
                Latest experiment
                <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
