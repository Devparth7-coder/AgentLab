"use client";
import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Play, ShieldCheck } from "lucide-react";
import { api, short, useApi } from "@/lib/api";
import type { Agent, Benchmark, Experiment } from "@/lib/types";
import {
  DemoBadge,
  ErrorBox,
  Loading,
  PageHeader,
  StatLine,
} from "@/components/ui";
function NewExperimentForm() {
  const router = useRouter();
  const search = useSearchParams();
  const { data: agents } = useApi<Agent[]>("/agents");
  const { data: benchmarks } = useApi<Benchmark[]>("/benchmarks?limit=200");
  const [agentId, setAgentId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [benchId, setBenchId] = useState("");
  const [benchVersionId, setBenchVersionId] = useState("");
  const [name, setName] = useState("Reliability evaluation");
  const [runs, setRuns] = useState("1");
  const [seed, setSeed] = useState("42");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const prefBenchVersion = search.get("benchmarkVersion");
  const chosenAgent = agents?.find((a) => a.id === (agentId || agents[0]?.id));
  const chosenVersion = chosenAgent?.versions.find(
    (v) => v.id === (versionId || chosenAgent.versions[0]?.id),
  );
  // Never silently switch to an unrelated suite when a pinned version was requested.
  const initialBench = prefBenchVersion
    ? benchmarks?.find((b) => b.versions.some((v) => v.id === prefBenchVersion))
    : benchmarks?.[0];
  const chosenBench = benchmarks?.find(
    (b) => b.id === (benchId || initialBench?.id),
  );
  const chosenBenchVersion =
    chosenBench?.versions.find(
      (v) =>
        v.id ===
        (benchVersionId || prefBenchVersion || chosenBench.versions[0]?.id),
    ) || chosenBench?.versions[0];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosenVersion || !chosenBenchVersion) return;
    setBusy(true);
    setError("");
    try {
      const ex = await api<Experiment>("/experiments", "POST", {
        name,
        agent_version_id: chosenVersion.id,
        benchmark_version_id: chosenBenchVersion.id,
        runs_per_task: Number(runs),
        seed: Number(seed),
      });
      await api(`/experiments/${ex.id}/run`, "POST");
      router.push(`/experiments/${ex.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not run experiment");
      setBusy(false);
    }
  }
  return (
    <div>
      <Link
        href="/experiments"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#849fa7] hover:text-mint"
      >
        <ArrowLeft size={12} /> Experiment ledger
      </Link>
      <PageHeader
        kicker="EXPERIMENT DESIGN / PINNED PROVENANCE"
        title="Run an evaluation"
        description="Select immutable versions. AGENTLAB creates one queued, traceable worker job for every task × run index."
      />
      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <form onSubmit={submit} className="panel p-6">
          <div className="label">CONFIGURATION / NEW EXPERIMENT</div>
          <div className="mt-5 space-y-5">
            <div>
              <label htmlFor="experiment-name" className="input-label">
                Experiment name
              </label>
              <input
                id="experiment-name"
                required
                className="field"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="experiment-agent" className="input-label">
                  Agent
                </label>
                <select
                  id="experiment-agent"
                  className="select"
                  value={chosenAgent?.id ?? ""}
                  onChange={(e) => {
                    setAgentId(e.target.value);
                    setVersionId("");
                  }}
                >
                  {agents?.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.name} {a.is_demo ? "(DEMO)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="experiment-agent-version"
                  className="input-label"
                >
                  Pinned agent version
                </label>
                <select
                  id="experiment-agent-version"
                  className="select"
                  value={chosenVersion?.id ?? ""}
                  onChange={(e) => setVersionId(e.target.value)}
                >
                  {chosenAgent?.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="experiment-benchmark" className="input-label">
                  Benchmark
                </label>
                <select
                  id="experiment-benchmark"
                  className="select"
                  value={chosenBench?.id ?? ""}
                  onChange={(e) => {
                    setBenchId(e.target.value);
                    setBenchVersionId("");
                  }}
                >
                  {benchmarks?.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.is_demo ? "(DEMO)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="experiment-benchmark-version"
                  className="input-label"
                >
                  Pinned benchmark version
                </label>
                <select
                  id="experiment-benchmark-version"
                  className="select"
                  value={chosenBenchVersion?.id ?? ""}
                  onChange={(e) => setBenchVersionId(e.target.value)}
                >
                  {chosenBench?.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version} · {v.task_count} tasks
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="experiment-runs" className="input-label">
                  Runs per task (1–20)
                </label>
                <input
                  id="experiment-runs"
                  type="number"
                  min={1}
                  max={20}
                  className="field mono"
                  value={runs}
                  onChange={(e) => setRuns(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-[#8299a2]">
                  Repeat tasks to quantify nondeterminism.
                </p>
              </div>
              <div>
                <label htmlFor="experiment-seed" className="input-label">
                  Random seed
                </label>
                <input
                  id="experiment-seed"
                  type="number"
                  min={0}
                  className="field mono"
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-[#8299a2]">
                  Stored in provenance; external models may not honor it.
                </p>
              </div>
            </div>
            {prefBenchVersion && benchmarks && !initialBench && (
              <ErrorBox message="Pinned benchmark version is unavailable in the first 200 suites. Refresh the registry or run directly from a visible benchmark." />
            )}
            {error && <ErrorBox message={error} />}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-5">
              <span className="text-[11px] text-[#90a6ae]">
                {chosenBenchVersion
                  ? chosenBenchVersion.task_count * Number(runs || 0)
                  : "—"}{" "}
                jobs will be queued
              </span>
              <button
                className="button-primary"
                disabled={busy || !chosenVersion || !chosenBenchVersion}
              >
                {busy ? "Creating & queueing…" : "Create & run evaluation"}
                <Play size={13} />
              </button>
            </div>
          </div>
        </form>
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="label">REPRODUCIBILITY SNAPSHOT</div>
            <div className="mt-3">
              <StatLine
                label="Agent version ID"
                value={short(chosenVersion?.id, 16)}
              />
              <StatLine label="Model" value={chosenVersion?.model} />
              <StatLine
                label="Agent config hash"
                value={short(chosenVersion?.configuration_hash, 16)}
              />
              <StatLine
                label="Benchmark version ID"
                value={short(chosenBenchVersion?.id, 16)}
              />
              <StatLine
                label="Benchmark content hash"
                value={short(chosenBenchVersion?.content_hash, 16)}
              />
              <StatLine label="Evaluation harness" value="harness-1.0.0" />
              <StatLine
                label="Tool permissions"
                value={chosenVersion?.tool_configuration.join(", ") || "None"}
              />
            </div>
            {(chosenAgent?.is_demo || chosenBench?.is_demo) && (
              <div className="mt-4">
                <DemoBadge />
              </div>
            )}
          </div>
          <div className="panel flex gap-3 p-5">
            <ShieldCheck size={20} className="shrink-0 text-mint" />
            <div>
              <div className="text-xs font-semibold text-[#dcece6]">
                Safe by default
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[#8fa8ab]">
                Tools are built-in, side-effect-free fixtures. Remote agents
                require environment credentials; an unconfigured provider
                produces an error trace, not a fake score.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function NewExperimentPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewExperimentForm />
    </Suspense>
  );
}
