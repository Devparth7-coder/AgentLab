"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Activity, ArrowRight, Search } from "lucide-react";
import { short, stamp, useApi } from "@/lib/api";
import type { Trace } from "@/lib/types";
import {
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
function Traces() {
  const params = useSearchParams();
  const experiment = params.get("experiment");
  const initial = params.get("search") ?? "";
  const [search, setSearch] = useState(initial);
  const [event, setEvent] = useState("");
  const query = new URLSearchParams();
  if (experiment) query.set("experiment_id", experiment);
  if (search.trim()) query.set("search", search.trim());
  if (event) query.set("event_type", event);
  query.set("limit", "200");
  const { data, error, mutate } = useApi<Trace[]>(
    `/traces?${query.toString()}`,
  );
  return (
    <div>
      <PageHeader
        kicker="ANALYZE / TRACE EXPLORER"
        title="Every step, accounted for."
        description="A searchable execution timeline of observable agent behavior, sandboxed tool calls, output, errors and latency. No hidden reasoning is stored."
      />
      <div className="panel overflow-hidden">
        <div className="panel-header flex-wrap">
          <div>
            <div className="label">CAPTURED EXECUTIONS</div>
            <div className="section-title mt-1">Trace ledger</div>
          </div>
          <div className="flex gap-2">
            <select
              className="select w-auto py-1.5"
              value={event}
              onChange={(e) => setEvent(e.target.value)}
            >
              <option value="">All event types</option>
              {[
                "TOOL_CALL",
                "TOOL_ERROR",
                "FINAL_RESPONSE",
                "AGENT_ERROR",
                "AGENT_RETRY",
              ].map((x) => (
                <option value={x} key={x}>
                  {x.replaceAll("_", " ")}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-2 rounded border border-[#33444e] bg-[#0c171d] px-2.5">
              <Search size={13} className="text-[#708996]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Task key or tool name…"
                className="w-36 bg-transparent py-2 text-[11px] outline-none placeholder:text-[#68818c] sm:w-52"
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
          (data.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Trace</th>
                    <th>Task</th>
                    <th>Experiment</th>
                    <th>Outcome</th>
                    <th>Duration</th>
                    <th>Captured</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <Link
                          href={`/traces/${t.id}`}
                          className="font-mono text-[11px] font-semibold text-mint hover:underline"
                        >
                          TRC-{short(t.id, 10).toUpperCase()}
                        </Link>
                      </td>
                      <td className="font-mono text-[11px] text-[#d4e1e5]">
                        {t.task_key}{" "}
                        <span className="text-[#798e97]">
                          #{t.run_index + 1}
                        </span>
                      </td>
                      <td>
                        <Link
                          href={`/experiments/${t.experiment_id}`}
                          className="mono text-[#a4b8bb] hover:text-mint"
                        >
                          {short(t.experiment_id, 16)}
                        </Link>
                      </td>
                      <td>
                        <StatusBadge status={t.run_status} />
                      </td>
                      <td className="font-mono text-[11px]">
                        {t.duration_ms?.toFixed(2) ?? "Not measured"}ms
                      </td>
                      <td className="whitespace-nowrap text-[10px]">
                        {stamp(t.created_at)}
                      </td>
                      <td>
                        <Link href={`/traces/${t.id}`} className="text-mint">
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
              title="No matching traces"
              description="Complete an evaluation to capture observable events. Filter by task key or tool name."
              icon={<Activity size={20} />}
            />
          ))}
      </div>
    </div>
  );
}
export default function TracesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Traces />
    </Suspense>
  );
}
