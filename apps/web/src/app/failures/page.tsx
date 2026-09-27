"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Bug, Search } from "lucide-react";
import { short, stamp, useApi } from "@/lib/api";
import type { Agent, Failure } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
const types = [
  "TASK_FAILURE",
  "TOOL_SELECTION_FAILURE",
  "TOOL_ARGUMENT_FAILURE",
  "HALLUCINATION",
  "INSTRUCTION_FAILURE",
  "OUTPUT_SCHEMA_FAILURE",
  "TIMEOUT",
  "RECOVERY_FAILURE",
  "ROBUSTNESS_FAILURE",
  "REGRESSION",
  "COST_ANOMALY",
];
function FailureExplorer() {
  const params = useSearchParams();
  const experiment = params.get("experiment");
  const { data: agents } = useApi<Agent[]>("/agents");
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState("");
  const [kind, setKind] = useState("");
  const [agent, setAgent] = useState("");
  const [date, setDate] = useState("");
  const [version, setVersion] = useState("");
  const query = new URLSearchParams({ limit: "200" });
  if (experiment) query.set("experiment_id", experiment);
  if (q.trim()) query.set("search", q.trim());
  if (severity) query.set("severity", severity);
  if (kind) query.set("failure_type", kind);
  if (agent) query.set("agent_id", agent);
  if (version) query.set("version_id", version);
  if (date) query.set("date_from", new Date(date + "T00:00:00Z").toISOString());
  const { data, error, mutate } = useApi<Failure[]>(
    `/failures?${query.toString()}`,
    6500,
  );
  return (
    <div>
      <PageHeader
        kicker="ANALYZE / FAILURE EXPLORER"
        title="Failures, not anecdotes."
        description="Inspect the discrepancy between expected and observed behavior, open its trace, and queue a single-case replay without overwriting the original."
      />
      <div className="panel overflow-hidden">
        <div className="panel-header flex-wrap">
          <div>
            <div className="label">FAILURE INDEX</div>
            <div className="section-title mt-1">
              Observed failures{" "}
              <span className="ml-2 font-mono text-xs font-normal text-[#8199a1]">
                {data?.length ?? "—"} shown
              </span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded border border-[#344550] bg-[#0c171d] px-2.5">
              <Search size={13} className="text-[#80949f]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Task, type, summary…"
                className="w-[155px] bg-transparent py-2 text-[11px] outline-none placeholder:text-[#6c828d]"
              />
            </div>
            <select
              className="select w-auto py-1.5"
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">All severities</option>
              {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="select w-auto max-w-[170px] py-1.5"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">All types</option>
              {types.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <select
              className="select w-auto max-w-[150px] py-1.5"
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value);
                setVersion("");
              }}
            >
              <option value="">All agents</option>
              {agents?.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            {agent && (
              <select
                className="select w-auto max-w-[140px] py-1.5"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              >
                <option value="">All versions</option>
                {agents
                  ?.find((a) => a.id === agent)
                  ?.versions.map((v) => (
                    <option value={v.id} key={v.id}>
                      {v.version}
                    </option>
                  ))}
              </select>
            )}
            <input
              type="date"
              aria-label="Since date"
              className="field w-auto py-1.5"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} retry={() => void mutate()} />
          </div>
        )}
        {!data && !error && <Loading />}
        {data &&
          (data.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Failure ID</th>
                    <th>Agent / version</th>
                    <th>Task</th>
                    <th>Classification</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>First seen</th>
                    <th>Last seen</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <Link
                          href={`/failures/${f.id}`}
                          className="font-mono text-[11px] font-semibold text-danger hover:underline"
                        >
                          FLR-{short(f.id, 9).toUpperCase()}
                        </Link>
                      </td>
                      <td>
                        <div className="max-w-[175px] truncate text-[#ccdadd]">
                          {f.agent_name}
                        </div>
                        <span className="mono text-[#91bca9]">
                          v{f.agent_version}
                        </span>{" "}
                        {f.is_demo && <DemoBadge compact />}
                      </td>
                      <td className="font-mono text-[11px] text-[#bacdd0]">
                        {f.task_key}
                      </td>
                      <td>
                        <span className="chip border-[#684a4a] bg-[#38282c] text-[#edaaa0]">
                          {f.failure_type.replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`font-mono text-[10px] ${f.severity === "HIGH" ? "text-danger" : "text-amber"}`}
                        >
                          {f.severity}
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={f.status} />
                      </td>
                      <td className="whitespace-nowrap text-[10px]">
                        {stamp(f.first_seen)}
                      </td>
                      <td className="whitespace-nowrap text-[10px]">
                        {stamp(f.last_seen)}
                      </td>
                      <td>
                        <Link className="text-mint" href={`/failures/${f.id}`}>
                          <ArrowRight size={14} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No matching failures"
              description="No failures have been recorded for these filters. A clean table is not a measured safety guarantee."
              icon={<Bug size={20} />}
            />
          ))}
      </div>
      <p className="mt-4 text-[11px] text-[#8297a1]">
        Frequency and reproduction status are shown on each failure detail. Only
        observed failed runs create failure records.
      </p>
    </div>
  );
}
export default function FailuresPage() {
  return (
    <Suspense fallback={<Loading />}>
      <FailureExplorer />
    </Suspense>
  );
}
