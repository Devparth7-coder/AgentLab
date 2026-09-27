"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Beaker,
  Play,
  Plus,
  RefreshCcw,
  Search,
} from "lucide-react";
import { api, short, stamp, useApi } from "@/lib/api";
import type { Experiment } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  ProgressBar,
  StatusBadge,
} from "@/components/ui";
function ExperimentsList() {
  const router = useRouter();
  const params = useSearchParams();
  const agent = params.get("agent");
  const { data, error, mutate } = useApi<Experiment[]>(
    `/experiments?limit=200${agent ? `&agent_id=${encodeURIComponent(agent)}` : ""}`,
    4500,
  );
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function demo() {
    setBusy(true);
    setErr("");
    try {
      const result = await api<{
        baseline_experiment_id: string;
        candidate_experiment_id: string;
      }>("/demo/run", "POST", { seed: 42 });
      await mutate();
      router.push(
        `/experiments/${result.candidate_experiment_id}?baseline=${result.baseline_experiment_id}`,
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Demo failed to queue");
      setBusy(false);
    }
  }
  const list =
    data?.filter((e) =>
      `${e.name} ${e.agent_name} ${e.benchmark_name} ${e.status}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <div>
      <PageHeader
        kicker="WORKSPACE / EXPERIMENTS"
        title="Experiment ledger"
        description="Every run is a new, immutable observation. Watch queue progress live; inspect the agent, benchmark, harness and seed that produced a result."
        actions={
          <Link className="button-primary" href="/experiments/new">
            <Plus size={14} /> New experiment
          </Link>
        }
      />
      {err && (
        <div className="mb-4 rounded border border-[#714046] bg-[#332228] p-3 text-xs text-danger">
          {err}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[#355047] bg-[#15231f] px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded border border-[#446752] bg-[#1f3d30] p-2 text-mint">
            <Beaker size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#e3f0e8]">
              Try the controlled regression <DemoBadge compact />
            </div>
            <div className="mt-0.5 text-[11px] text-[#8eab9e]">
              50 cases × 2 deterministic mock versions · measured by actual
              execution workers.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={demo}
          disabled={busy}
          className="button-secondary"
        >
          {busy ? "Queueing…" : "Run 50-case demo"}
          <Play size={13} />
        </button>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">RUNS / MOST RECENT FIRST</div>
            <h2 className="section-title mt-0.5">All experiments</h2>
          </div>
          <div className="flex gap-2">
            <button
              aria-label="Refresh"
              onClick={() => void mutate()}
              className="button-ghost py-1.5"
            >
              <RefreshCcw size={13} />
            </button>
            <div className="flex items-center gap-2 rounded border border-[#33454f] bg-[#0d171e] px-2">
              <Search size={13} className="text-[#738d98]" />
              <input
                className="w-32 bg-transparent py-2 text-[11px] outline-none placeholder:text-[#6a808b]"
                placeholder="Filter ledger…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </div>
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} retry={() => void mutate()} />
          </div>
        )}
        {!data && !error && <Loading />}
        {data &&
          (list.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Agent</th>
                    <th>Benchmark</th>
                    <th>Execution</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className="min-w-[205px]">
                        <Link
                          href={`/experiments/${e.id}`}
                          className="font-semibold text-[#e2eded] hover:text-mint"
                        >
                          {e.name}
                        </Link>
                        <div className="mt-1 font-mono text-[10px] text-[#738a95]">
                          {short(e.id, 12)} {e.is_demo && <DemoBadge compact />}
                        </div>
                      </td>
                      <td>
                        <div className="text-[11px] text-[#c9d8da]">
                          {e.agent_name}
                        </div>
                        <div className="mono text-[#78b9a2]">
                          v{e.agent_version} / {e.provider}
                        </div>
                      </td>
                      <td>
                        <div className="max-w-[185px] truncate text-[11px] text-[#c6d5d8]">
                          {e.benchmark_name}
                        </div>
                        <div className="mono text-[#768f99]">
                          v{e.benchmark_version}
                        </div>
                      </td>
                      <td className="min-w-[165px]">
                        <ProgressBar
                          completed={e.progress.completed}
                          total={e.progress.total}
                          passed={e.progress.counts.PASSED}
                          failed={
                            (e.progress.counts.FAILED ?? 0) +
                            (e.progress.counts.ERROR ?? 0)
                          }
                        />
                      </td>
                      <td>
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="whitespace-nowrap text-[11px]">
                        {stamp(e.started_at ?? e.created_at)}
                      </td>
                      <td>
                        <Link
                          href={`/experiments/${e.id}`}
                          className="text-mint"
                        >
                          <ArrowRight size={15} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No experiments yet"
              description="Pin an agent version and benchmark version, then queue task runs. No numbers appear until the workers measure them."
              action={
                <Link className="button-secondary" href="/experiments/new">
                  Set up experiment
                  <ArrowRight size={13} />
                </Link>
              }
            />
          ))}
      </div>
    </div>
  );
}
export default function ExperimentsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ExperimentsList />
    </Suspense>
  );
}
