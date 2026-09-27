"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Beaker,
  FileWarning,
  FlaskConical,
  Layers3,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { api, formatMetric, selectMetric, stamp, useApi } from "@/lib/api";
import type { Benchmark, Experiment } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
const cases: [string, string, boolean][] = [
  ["whitespace", "Whitespace / formatting", true],
  ["wording", "Wording changes", true],
  ["irrelevant", "Irrelevant information", true],
  ["noise", "Transport noise", true],
  ["long_context", "Long context", true],
  ["tool_failure", "First tool failure", true],
  ["invalid_tool_response", "Invalid tool response", true],
  ["tool_unavailable", "Tool unavailable", true],
  ["repeated_failures", "Repeated failures", true],
  ["ambiguity", "Ambiguous instruction", false],
  ["conflict", "Conflicting instruction", false],
  ["adversarial", "Untrusted injection", false],
  ["distractor", "Distractor answer", false],
  ["malformed", "Malformed input", false],
];
export default function RobustnessPage() {
  const router = useRouter();
  const { data: benchmarks } = useApi<Benchmark[]>("/benchmarks");
  const { data: exps } = useApi<Experiment[]>("/experiments?limit=200", 6000);
  const [bench, setBench] = useState("");
  const [selected, setSelected] = useState([
    "whitespace",
    "irrelevant",
    "tool_failure",
  ]);
  const [limit, setLimit] = useState("10");
  const [seed, setSeed] = useState("42");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const bases = benchmarks?.filter((b) => b.category !== "Robustness") ?? [];
  const chosen = bases
    .flatMap((b) => b.versions)
    .find((v) => v.id === (bench || bases[0]?.versions[0]?.id));
  const generated =
    benchmarks?.filter((b) => b.category === "Robustness") ?? [];
  const runs =
    exps?.filter((e) =>
      generated.some((b) =>
        b.versions.some((v) => v.id === e.benchmark_version_id),
      ),
    ) ?? [];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen || !selected.length) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Benchmark>("/robustness/generate", "POST", {
        benchmark_version_id: chosen.id,
        transformations: selected,
        seed: Number(seed),
        limit: Number(limit),
      });
      router.push(`/benchmarks/${result.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate variants");
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        kicker="ANALYZE / ROBUSTNESS LAB"
        title="Break it deliberately."
        description="Apply seeded, controlled perturbations to existing tasks. Meaning-preserving variants contribute to robustness rate; ambiguous or adversarial variants remain separately inspectable."
      />
      <div className="mb-5 grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
        <form onSubmit={submit} className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <div className="label">CONTROLLED STRESSOR DESIGN</div>
              <div className="section-title mt-1">
                Generate an immutable variant suite
              </div>
            </div>
            <Beaker size={19} className="text-mint" />
          </div>
          <div className="space-y-5 p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="robust-source" className="input-label">
                  Source benchmark version
                </label>
                <select
                  id="robust-source"
                  value={chosen?.id ?? ""}
                  onChange={(e) => setBench(e.target.value)}
                  className="select"
                  required
                >
                  {bases.flatMap((b) =>
                    b.versions.map((v) => (
                      <option value={v.id} key={v.id}>
                        {b.name} · v{v.version} · {v.task_count} tasks
                      </option>
                    )),
                  )}
                </select>
              </div>
              <div>
                <label htmlFor="robust-limit" className="input-label">
                  Task limit / source
                </label>
                <input
                  id="robust-limit"
                  className="field mono"
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="robust-seed" className="input-label">
                  Deterministic seed
                </label>
                <input
                  id="robust-seed"
                  className="field mono"
                  type="number"
                  min={0}
                  value={seed}
                  onChange={(e) => setSeed(e.target.value)}
                />
              </div>
              <div className="flex items-end sm:col-span-2">
                <div className="w-full rounded border border-[#345147] bg-[#172a23] px-3 py-2 text-[11px] text-[#aecbb8]">
                  Up to <b>{Number(limit || 0) * selected.length}</b> task
                  variants · No dangerous real-world actions
                </div>
              </div>
            </div>
            <div>
              <div className="input-label">Select perturbations</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {cases.map(([key, label, preserved]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded border px-3 py-2.5 ${selected.includes(key) ? "border-[#468368] bg-[#19352b]" : "border-[#2b3c44] bg-[#0d171e]"}`}
                  >
                    <span className="flex items-center gap-2 text-[11px] text-[#c5d6d2]">
                      <input
                        type="checkbox"
                        checked={selected.includes(key)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, key]
                              : selected.filter((x) => x !== key),
                          )
                        }
                      />
                      {label}
                    </span>
                    <span
                      className={`font-mono text-[9px] ${preserved ? "text-mint" : "text-amber"}`}
                    >
                      {preserved ? "IN-SCOPE" : "SEPARATE"}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {error && <ErrorBox message={error} />}
            <div className="flex justify-end border-t border-border pt-4">
              <button
                disabled={busy || !selected.length || !chosen}
                className="button-primary"
              >
                {busy ? "Generating…" : "Generate variant suite"}
                <ArrowRight size={13} />
              </button>
            </div>
          </div>
        </form>
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="label">METHODOLOGY / NO ILLUSORY ROBUSTNESS</div>
            <div className="mt-4 flex gap-3">
              <ShieldCheck size={18} className="shrink-0 text-mint" />
              <div>
                <div className="text-xs font-semibold">
                  Meaning-preserving tests
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#93acb0]">
                  Wording, noise, context and simulated tool faults preserve the
                  original target. These measured runs form robustness_rate:
                  passes / completed meaning-preserving runs.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <ShieldAlert size={18} className="shrink-0 text-amber" />
              <div>
                <div className="text-xs font-semibold">
                  Adversarial and ambiguous tests
                </div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#93acb0]">
                  Conflict, ambiguity, distractors and malformed requests can
                  change interpretation; scores remain visible per run but are
                  not silently merged into the meaning-preserving robustness
                  denominator.
                </p>
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <FileWarning size={18} className="shrink-0 text-[#86bed4]" />
              <div>
                <div className="text-xs font-semibold">Safety boundary</div>
                <p className="mt-1 text-[11px] leading-relaxed text-[#93acb0]">
                  Tool failures and invalid responses are injected into mock,
                  allowlisted tools. No uploaded code, shell commands, or
                  destructive production tools run.
                </p>
              </div>
            </div>
          </div>
          <div className="panel p-5">
            <div className="label">RESEARCH NOTE</div>
            <p className="mt-3 text-[12px] leading-relaxed text-[#a2b5b4]">
              A deterministic mock agent reads fixture metadata, not natural
              language. Its robustness scores validate platform wiring—not a
              model&apos;s real-world resilience. Use a configured external
              provider for language-sensitive research.
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div className="label">GENERATED ROBUSTNESS SUITES</div>
            <span className="mono text-[#829ca3]">{generated.length}</span>
          </div>
          {generated.length ? (
            <div className="divide-y divide-border">
              {generated.slice(0, 8).map((b) => (
                <Link
                  key={b.id}
                  href={`/benchmarks/${b.id}`}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#1e2c33]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[12px] font-semibold text-[#d7e7e5]">
                      {b.name}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#839da3]">
                      {b.versions[0]?.task_count} variants ·{" "}
                      {stamp(b.created_at)}
                    </div>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-mint" />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No variants generated"
              description="Select a source benchmark and generate a controlled stress suite."
              icon={<Layers3 size={19} />}
            />
          )}
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div className="label">MEASURED VARIANT RUNS</div>
            <span className="mono text-[#829ca3]">{runs.length}</span>
          </div>
          {runs.length ? (
            <div className="divide-y divide-border">
              {runs.slice(0, 8).map((e) => (
                <Link
                  href={`/experiments/${e.id}`}
                  key={e.id}
                  className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[#1e2c33]"
                >
                  <div>
                    <div className="text-[12px] font-semibold text-[#d3e4e4]">
                      {e.name} {e.is_demo && <DemoBadge compact />}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#85a49d]">
                      Robustness:{" "}
                      {formatMetric(
                        selectMetric(e.metrics, "robustness_rate")?.value,
                        "%",
                      )}{" "}
                      · {e.progress.completed}/{e.progress.total} runs
                    </div>
                  </div>
                  <StatusBadge status={e.status} />
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No robustness evaluations"
              description="Run a generated variant suite with a pinned agent version to measure it."
              icon={<FlaskConical size={19} />}
            />
          )}
        </div>
      </div>
    </div>
  );
}
