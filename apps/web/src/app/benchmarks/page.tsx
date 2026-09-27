"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search, X } from "lucide-react";
import { api, formatMetric, selectMetric, useApi } from "@/lib/api";
import type { Benchmark, Catalog, Experiment } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
} from "@/components/ui";

type DraftTask = {
  task_key: string;
  category: string;
  input: string;
  expected: string;
  available_tools: string[];
  evaluation_config?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};
const blank = (): DraftTask => ({
  task_key: `case-${Math.random().toString(36).slice(2, 6)}`,
  category: "General",
  input: "",
  expected: "",
  available_tools: [],
});
const toolOptions = [
  "calculator",
  "dataset.aggregate",
  "dataset.lookup",
  "mock.search",
  "mock.unavailable",
];
function CreateBenchmark({
  close,
  done,
  catalog,
}: {
  close: () => void;
  done: () => void;
  catalog: Catalog | undefined;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("General Agent");
  const [version, setVersion] = useState("1.0.0");
  const [tasks, setTasks] = useState<DraftTask[]>([blank()]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [raw, setRaw] = useState("");
  function patch(index: number, changes: Partial<DraftTask>) {
    setTasks((prev) =>
      prev.map((x, i) => (i === index ? { ...x, ...changes } : x)),
    );
  }
  function applyTemplate(index: number) {
    const t = catalog?.templates[index];
    if (!t) return;
    setName(`${t.name} · Custom`);
    setDescription(t.description);
    setCategory(t.category);
    setVersion(t.version);
    setTasks(
      t.tasks.map((task) => ({
        task_key: task.task_key,
        category: task.category,
        input: task.input,
        expected: JSON.stringify(task.expected_output),
        available_tools: task.available_tools,
        evaluation_config: task.evaluation_config,
        metadata: task.metadata,
      })),
    );
    setAdvanced(false);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = advanced
        ? (JSON.parse(raw) as object)
        : {
            name,
            description,
            category,
            version,
            tasks: tasks.map((t) => {
              let expected: unknown;
              try {
                expected = JSON.parse(t.expected);
              } catch {
                expected = t.expected;
              }
              return {
                task_key: t.task_key,
                category: t.category,
                input: t.input,
                expected_output: expected,
                available_tools: t.available_tools,
                expected_behavior: [],
                constraints: [],
                evaluation_config: t.evaluation_config ?? {
                  evaluators: [{ type: "exact_match" }],
                },
                metadata: t.metadata ?? {},
              };
            }),
          };
      await api("/benchmarks", "POST", body);
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create benchmark");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3">
      <div className="max-h-[94vh] w-full max-w-[770px] overflow-y-auto rounded-lg border border-[#36504b] bg-[#111c23]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[#111c23] px-6 py-4">
          <div>
            <div className="eyebrow">BENCHMARK DESIGNER</div>
            <h2 className="mt-0.5 text-lg font-semibold">
              Create a versioned test suite
            </h2>
          </div>
          <button
            onClick={close}
            aria-label="Close"
            type="button"
            className="text-[#94a8b2]"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-5 p-6">
          <div>
            <div className="input-label">
              Starter templates · no scores, validate for your domain
            </div>
            <div className="flex flex-wrap gap-1.5">
              {catalog?.templates.map((t, i) => (
                <button
                  type="button"
                  onClick={() => applyTemplate(i)}
                  key={t.name}
                  className="chip border-[#3b5559] bg-[#192b31] px-2.5 py-1.5 text-[#a8c7c4] hover:border-mint"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="input-label">Benchmark name</label>
              <input
                className="field"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Research Agent / QA"
              />
            </div>
            <div>
              <label className="input-label">Version</label>
              <input
                className="field"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="input-label">Category</label>
              <input
                className="field"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
            <div>
              <label className="input-label">Description</label>
              <input
                className="field"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scope and assumptions"
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <span className="label">TASK DEFINITIONS / {tasks.length}</span>
            <button
              type="button"
              onClick={() => setAdvanced(!advanced)}
              className="text-[11px] text-mint hover:underline"
            >
              {advanced ? "Use form" : "Advanced JSON import"}
            </button>
          </div>
          {advanced ? (
            <div>
              <p className="mb-2 text-[11px] text-[#8ea3aa]">
                Paste a full BenchmarkIn JSON object: name, version, tasks,
                evaluation_rules. The server validates all rules.
              </p>
              <textarea
                className="field min-h-[260px] font-mono text-[11px]"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder={
                  '{"name":"...","tasks":[{"task_key":"...","input":"...","expected_output":"..."}]}'
                }
              />
            </div>
          ) : (
            <div className="space-y-3">
              {tasks.map((t, i) => (
                <div
                  className="rounded border border-[#2b3d45] bg-[#0e171e] p-4"
                  key={i}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="font-mono text-[11px] text-mint">
                      TASK {String(i + 1).padStart(2, "0")}
                    </span>
                    {tasks.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setTasks(tasks.filter((_, n) => n !== i))
                        }
                        className="text-[#91a5ac] hover:text-danger"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="input-label">Task key</label>
                      <input
                        required
                        className="field mono"
                        value={t.task_key}
                        onChange={(e) => patch(i, { task_key: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="input-label">Category</label>
                      <input
                        className="field"
                        value={t.category}
                        onChange={(e) => patch(i, { category: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="input-label">
                      Agent input / workload
                    </label>
                    <textarea
                      className="field min-h-[75px]"
                      required
                      value={t.input}
                      onChange={(e) => patch(i, { input: e.target.value })}
                      placeholder="What should the agent accomplish?"
                    />
                  </div>
                  <div className="mt-3">
                    <label className="input-label">
                      Expected output (JSON object, number, or exact text)
                    </label>
                    <input
                      className="field mono"
                      required
                      value={t.expected}
                      onChange={(e) => patch(i, { expected: e.target.value })}
                      placeholder={'{"answer": 42}'}
                    />
                  </div>
                  <div className="mt-3">
                    <label className="input-label">
                      Available sandbox tools
                    </label>
                    <div className="flex flex-wrap gap-x-4 gap-y-2">
                      {toolOptions.map((tool) => (
                        <label
                          key={tool}
                          className="flex items-center gap-1 text-[10px] text-[#9fb2bb]"
                        >
                          <input
                            type="checkbox"
                            checked={t.available_tools.includes(tool)}
                            onChange={(e) =>
                              patch(i, {
                                available_tools: e.target.checked
                                  ? [...t.available_tools, tool]
                                  : t.available_tools.filter((x) => x !== tool),
                              })
                            }
                          />
                          {tool}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                className="button-secondary w-full"
                onClick={() => setTasks([...tasks, blank()])}
              >
                <Plus size={13} /> Add task
              </button>
            </div>
          )}
          {error && (
            <div className="rounded border border-[#714046] bg-[#332228] p-3 text-xs text-danger">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" className="button-ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" disabled={busy} className="button-primary">
              {busy ? "Creating…" : "Create benchmark"}
              <ArrowRight size={13} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
export default function BenchmarksPage() {
  const { data, error, isLoading, mutate } = useApi<Benchmark[]>("/benchmarks");
  const { data: catalog } = useApi<Catalog>("/benchmarks/catalog");
  const { data: exps } = useApi<Experiment[]>("/experiments?limit=200");
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("");
  const items =
    data?.filter((b) =>
      `${b.name} ${b.category}`.toLowerCase().includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <div>
      <PageHeader
        kicker="WORKSPACE / BENCHMARKS"
        title="Benchmarks"
        description="Versioned, reusable workloads with reference answers and explicit evaluation rules. A suite is only as good as the evidence it can verify."
        actions={
          <button
            type="button"
            className="button-primary"
            onClick={() => setModal(true)}
          >
            <Plus size={14} /> Create benchmark
          </button>
        }
      />
      <div className="mb-5 grid gap-3 md:grid-cols-3">
        <div className="panel p-4">
          <div className="label">BENCHMARKS</div>
          <div className="mt-2 font-mono text-2xl">{data?.length ?? "—"}</div>
        </div>
        <div className="panel p-4">
          <div className="label">SUITE VERSIONS</div>
          <div className="mt-2 font-mono text-2xl">
            {data ? data.reduce((n, b) => n + b.versions.length, 0) : "—"}
          </div>
        </div>
        <div className="panel p-4">
          <div className="label">TOTAL TASK DEFINITIONS</div>
          <div className="mt-2 font-mono text-2xl">
            {data
              ? data.reduce(
                  (n, b) =>
                    n + b.versions.reduce((s, v) => s + v.task_count, 0),
                  0,
                )
              : "—"}
          </div>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">WORKLOAD INVENTORY</div>
            <h2 className="section-title mt-0.5">Available suites</h2>
          </div>
          <div className="flex items-center gap-2 rounded border border-[#33444f] bg-[#0e171d] px-2">
            <Search size={13} className="text-[#77909a]" />
            <input
              className="w-32 bg-transparent py-2 text-[11px] outline-none placeholder:text-[#6f8690]"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter suites…"
            />
          </div>
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} retry={() => void mutate()} />
          </div>
        )}
        {isLoading && !data && <Loading />}
        {data &&
          (items.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Benchmark</th>
                    <th>Category</th>
                    <th>Version</th>
                    <th>Tasks</th>
                    <th>Latest success</th>
                    <th>Avg latency</th>
                    <th>Avg cost</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((b) => {
                    const exp = exps?.find(
                      (e) =>
                        e.benchmark_version_id === b.versions[0]?.id &&
                        e.status === "COMPLETED",
                    );
                    return (
                      <tr key={b.id}>
                        <td className="min-w-[220px]">
                          <Link
                            href={`/benchmarks/${b.id}`}
                            className="font-semibold text-[#e3eded] hover:text-mint"
                          >
                            {b.name}
                          </Link>
                          <div className="mt-1 max-w-[270px] truncate text-[10px] text-[#849ba4]">
                            {b.description}
                          </div>
                          {b.is_demo && (
                            <span className="mt-1 inline-block">
                              <DemoBadge compact />
                            </span>
                          )}
                        </td>
                        <td>{b.category}</td>
                        <td className="mono">v{b.latest_version}</td>
                        <td className="mono">
                          {b.versions[0]?.task_count ?? 0}
                        </td>
                        <td>
                          {exp
                            ? formatMetric(
                                selectMetric(exp.metrics, "task_success_rate")
                                  ?.value,
                                "%",
                              )
                            : "Not measured"}
                        </td>
                        <td>
                          {exp
                            ? formatMetric(
                                selectMetric(exp.metrics, "average_latency_ms")
                                  ?.value,
                                "ms",
                              )
                            : "Not measured"}
                        </td>
                        <td>
                          {exp
                            ? formatMetric(
                                selectMetric(exp.metrics, "estimated_cost_usd")
                                  ?.value,
                                "USD",
                              )
                            : "Not measured"}
                        </td>
                        <td>
                          <Link
                            href={`/experiments/new?benchmarkVersion=${b.versions[0]?.id}`}
                            className="button-secondary py-1.5"
                          >
                            Run
                            <ArrowRight size={13} />
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No benchmark suites"
              description="Define tasks and reference answers, or start from one of eight unscored starter templates."
              action={
                <button
                  type="button"
                  onClick={() => setModal(true)}
                  className="button-secondary"
                >
                  Create suite <Plus size={14} />
                </button>
              }
            />
          ))}
      </div>
      <p className="mt-4 text-[11px] text-[#7d969e]">
        Starter suites have no benchmark results until you actually run an agent
        on them. Scores shown above come from the latest completed experiment,
        not templates.
      </p>
      {modal && (
        <CreateBenchmark
          close={() => setModal(false)}
          done={() => {
            setModal(false);
            void mutate();
          }}
          catalog={catalog}
        />
      )}
    </div>
  );
}
