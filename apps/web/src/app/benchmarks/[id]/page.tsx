"use client";
import { FormEvent, use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Plus, ShieldCheck } from "lucide-react";
import { api, short, stamp, useApi } from "@/lib/api";
import type { Benchmark } from "@/lib/types";
import {
  DemoBadge,
  ErrorBox,
  JsonBlock,
  Loading,
  PageHeader,
  StatLine,
} from "@/components/ui";
export default function BenchmarkPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: b, error, mutate } = useApi<Benchmark>(`/benchmarks/${id}`);
  const [chosen, setChosen] = useState("");
  const [add, setAdd] = useState(false);
  const [newVersion, setNewVersion] = useState("");
  const [taskKey, setTaskKey] = useState("");
  const [input, setInput] = useState("");
  const [expected, setExpected] = useState("");
  const [err, setErr] = useState("");
  const v = b?.versions.find((x) => x.id === chosen) ?? b?.versions[0];
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!v) return;
    setErr("");
    try {
      let expected_output: unknown;
      try {
        expected_output = JSON.parse(expected);
      } catch {
        expected_output = expected;
      }
      await api("/tasks", "POST", {
        benchmark_version_id: v.id,
        new_version: newVersion,
        task_key: taskKey,
        input,
        expected_output,
        available_tools: [],
        evaluation_config: { evaluators: [{ type: "exact_match" }] },
      });
      setAdd(false);
      setChosen("");
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create version");
    }
  }
  if (error) return <ErrorBox message={error.message} />;
  if (!b) return <Loading />;
  return (
    <div>
      <Link
        href="/benchmarks"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#87a1a9] hover:text-mint"
      >
        <ArrowLeft size={13} /> Benchmarks
      </Link>
      <PageHeader
        kicker="BENCHMARK REGISTRY / IMMUTABLE WORKLOAD"
        title={b.name}
        description={b.description}
        actions={
          <>
            {b.is_demo && <DemoBadge />}
            <Link
              className="button-primary"
              href={`/experiments/new?benchmarkVersion=${v?.id}`}
            >
              <ArrowRight size={14} /> Run benchmark
            </Link>
          </>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <div className="label">CATEGORY</div>
          <div className="mt-2 text-lg font-medium">{b.category}</div>
        </div>
        <div className="panel p-4">
          <div className="label">PINNED VERSIONS</div>
          <div className="mt-2 font-mono text-2xl">{b.versions.length}</div>
        </div>
        <div className="panel p-4">
          <div className="label">TASKS / SELECTED VERSION</div>
          <div className="mt-2 font-mono text-2xl">{v?.task_count ?? 0}</div>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <span className="label">SELECT VERSION</span>
        <select
          className="select w-auto min-w-[170px]"
          value={v?.id ?? ""}
          onChange={(e) => setChosen(e.target.value)}
        >
          {b.versions.map((x) => (
            <option value={x.id} key={x.id}>
              v{x.version} · {x.task_count} tasks
            </option>
          ))}
        </select>
        <span className="mono text-[#74908f]">
          SHA-256 {short(v?.content_hash, 24)}…
        </span>
        <button
          type="button"
          className="button-secondary ml-auto"
          onClick={() => setAdd(!add)}
        >
          <Plus size={13} /> Add task as new version
        </button>
      </div>
      {add && (
        <form
          onSubmit={submit}
          className="panel mb-5 grid gap-3 p-5 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <div className="label">CLONE / NEVER EDIT HISTORICAL TASKS</div>
            <h3 className="section-title mt-1">
              Add task to a new suite version
            </h3>
          </div>
          <div>
            <label className="input-label">New version</label>
            <input
              required
              className="field"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              placeholder="2.0.0"
            />
          </div>
          <div>
            <label className="input-label">Task key</label>
            <input
              required
              className="field"
              value={taskKey}
              onChange={(e) => setTaskKey(e.target.value)}
              placeholder="case-002"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="input-label">Input</label>
            <textarea
              required
              className="field min-h-[65px]"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="input-label">Expected JSON or exact text</label>
            <input
              required
              className="field"
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
            />
          </div>
          {err && <p className="text-xs text-danger">{err}</p>}
          <div className="sm:col-span-2">
            <button type="submit" className="button-primary">
              Create version
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      )}
      <div className="grid gap-5 xl:grid-cols-[1.45fr_.7fr]">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <div className="label">WORKLOAD / VERSION {v?.version}</div>
              <div className="section-title mt-0.5">Task definitions</div>
            </div>
            <span className="mono text-[#778d98]">{v?.task_count} tasks</span>
          </div>
          <div className="max-h-[660px] overflow-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Category</th>
                  <th>Input / expected</th>
                  <th>Tools</th>
                </tr>
              </thead>
              <tbody>
                {v?.tasks?.map((t) => (
                  <tr key={t.id}>
                    <td className="mono text-mint">{t.task_key}</td>
                    <td>{t.category}</td>
                    <td className="max-w-[385px]">
                      <div
                        className="truncate text-[11px] text-[#cedfe2]"
                        title={t.input}
                      >
                        {t.input}
                      </div>
                      <div className="mt-1 truncate font-mono text-[10px] text-[#849ca4]">
                        Reference:{" "}
                        {JSON.stringify(t.expected_output) ?? "Not measured"}
                      </div>
                    </td>
                    <td className="font-mono text-[10px] text-[#97adad]">
                      {t.available_tools.join(", ") || "None"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="label">METHODOLOGY / VERSION {v?.version}</div>
            <StatLine label="Version" value={v?.version} />
            <StatLine label="Tasks" value={v?.task_count} />
            <StatLine label="Created" value={stamp(v?.created_at)} />
            <StatLine label="Content SHA-256">
              <span title={v?.content_hash}>{short(v?.content_hash, 20)}…</span>
            </StatLine>
            <div className="mt-4">
              <JsonBlock
                value={v?.evaluation_rules}
                title="Suite rules & references"
              />
            </div>
          </div>
          <div className="panel flex gap-3 p-5">
            <ShieldCheck size={19} className="shrink-0 text-mint" />
            <p className="text-[11px] leading-relaxed text-[#95adb1]">
              Each version owns its own tasks, references, and evaluator
              configuration. Adding a task creates a new content hash. Old
              experiments continue to point at their original version.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
