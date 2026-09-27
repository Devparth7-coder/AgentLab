"use client";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ClipboardList,
  Cpu,
  FileText,
  RefreshCcw,
  Search,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import clsx from "clsx";
import type { Trace, TraceEvent, ToolCall } from "@/lib/types";
import { number } from "@/lib/api";
import { JsonBlock, StatusBadge } from "@/components/ui";

type Mode = "ALL" | "TOOLS" | "ERRORS" | "OUTPUT";
function eventIcon(event: TraceEvent) {
  const name = event.event_type;
  const C =
    name === "TOOL_CALL"
      ? Wrench
      : name === "TOOL_ERROR" || name === "AGENT_ERROR"
        ? AlertTriangle
        : name === "TOOL_RESPONSE"
          ? Check
          : name === "FINAL_RESPONSE"
            ? FileText
            : name === "AGENT_RETRY"
              ? RefreshCcw
              : name === "AGENT_STARTED"
                ? Cpu
                : ClipboardList;
  return <C size={15} />;
}
function color(event: TraceEvent) {
  return event.status === "ERROR"
    ? "text-danger border-[#744247] bg-[#41252c]"
    : event.event_type === "TOOL_CALL"
      ? "text-[#83c4d4] border-[#3c5c66] bg-[#1d333c]"
      : event.event_type === "FINAL_RESPONSE"
        ? "text-mint border-[#397255] bg-[#1a3d32]"
        : "text-[#a7b6c0] border-[#394c55] bg-[#1c2b32]";
}
export function ToolCallInspector({ call }: { call: ToolCall }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={call.status} />
        {call.argument_valid === false && (
          <span className="chip border-[#754447] bg-[#41262a] text-danger">
            ARGUMENT MISMATCH
          </span>
        )}
        {call.selection_valid === false && (
          <span className="chip border-[#754447] bg-[#41262a] text-danger">
            WRONG TOOL
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-border bg-[#101b23] p-3">
          <div className="label">TOOL</div>
          <div className="mt-2 font-mono text-[11px] text-[#d6edf0]">
            {call.tool_name}
          </div>
        </div>
        <div className="rounded border border-border bg-[#101b23] p-3">
          <div className="label">WALL TIME</div>
          <div className="mt-2 font-mono text-[12px] text-[#d9e8ec]">
            {number(call.duration_ms, 3)}ms
          </div>
        </div>
      </div>
      <JsonBlock
        value={call.arguments}
        title="Validated / redacted arguments"
      />
      <JsonBlock
        value={call.result?.output ?? {}}
        title="Sandboxed tool response"
      />
      {call.result?.error && (
        <div className="rounded border border-[#754447] bg-[#322129] px-3 py-2 text-xs text-danger">
          {call.result.error}
        </div>
      )}
      <p className="text-[10px] leading-relaxed text-[#76909b]">
        Argument and selection validity are measured only when this task defines
        explicit tool rules. Null means Not measured, not correct.
      </p>
    </div>
  );
}
export function TraceTimeline({ trace }: { trace: Trace }) {
  const events = useMemo(() => trace.events ?? [], [trace.events]);
  const [selected, setSelected] = useState<number>(
    events.find((x) => x.event_type === "TOOL_ERROR")?.sequence ??
      events.find((x) => x.event_type === "TOOL_CALL")?.sequence ??
      0,
  );
  const [mode, setMode] = useState<Mode>("ALL");
  const [search, setSearch] = useState("");
  const current = events.find((e) => e.sequence === selected) ?? events[0];
  const call = (trace.tool_calls ?? []).find(
    (c) => c.event_sequence === current?.sequence,
  );
  const visible = useMemo(
    () =>
      events.filter((e) => {
        const matches =
          mode === "ALL" ||
          (mode === "TOOLS" && e.event_type.startsWith("TOOL")) ||
          (mode === "ERRORS" &&
            (e.status === "ERROR" || e.event_type === "AGENT_RETRY")) ||
          (mode === "OUTPUT" &&
            ["TASK_STARTED", "FINAL_RESPONSE", "AGENT_ERROR"].includes(
              e.event_type,
            ));
        return (
          matches &&
          (!search ||
            `${e.event_type} ${e.tool_name ?? ""} ${JSON.stringify(e.input_metadata)} ${JSON.stringify(e.output_metadata)}`
              .toLowerCase()
              .includes(search.toLowerCase()))
        );
      }),
    [events, mode, search],
  );
  const maxOffset = Math.max(trace.duration_ms ?? 0, 1);
  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">EXECUTION FOOTPRINT</div>
            <div className="section-title mt-0.5">Observable timeline</div>
          </div>
          <span className="mono text-[#8aabb1]">
            {events.length} events · {number(trace.duration_ms, 2)}ms
          </span>
        </div>
        <div className="p-4">
          <div className="space-y-2">
            {events.map((e) => (
              <button
                type="button"
                key={e.id}
                onClick={() => setSelected(e.sequence)}
                className="flex w-full items-center gap-3 text-left"
              >
                <span className="w-[97px] shrink-0 text-right font-mono text-[10px] text-[#79919d]">
                  +{number(e.offset_ms, 2)}ms
                </span>
                <div className="relative h-3 flex-1 rounded bg-[#1d3038]">
                  <span
                    style={{
                      left: `${Math.min(98, (e.offset_ms / maxOffset) * 100)}%`,
                      width: `${Math.max(1.5, Math.min(40, ((e.duration_ms ?? 1) / maxOffset) * 100))}%`,
                    }}
                    className={clsx(
                      "absolute top-[2px] h-2 rounded-sm",
                      e.status === "ERROR"
                        ? "bg-[#e77c80]"
                        : e.event_type === "TOOL_CALL"
                          ? "bg-[#7ebcc8]"
                          : e.event_type === "FINAL_RESPONSE"
                            ? "bg-mint"
                            : "bg-[#547c84]",
                    )}
                  />
                </div>
                <span className="w-[135px] shrink-0 truncate font-mono text-[10px] text-[#92a5ac]">
                  {e.event_type.replaceAll("_", " ")}
                </span>
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-4 border-t border-border pt-3 text-[10px] text-[#7f969f]">
            <span>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#547c84]" />
              Lifecycle
            </span>
            <span>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#7ebcc8]" />
              Tool
            </span>
            <span>
              <span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-[#e77c80]" />
              Error
            </span>
          </div>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(280px,.8fr)_minmax(330px,1.2fr)]">
        <div className="panel overflow-hidden">
          <div className="panel-header flex-col items-stretch gap-3">
            <div className="flex items-center justify-between">
              <div className="label">01 / EVENT STREAM</div>
              <span className="mono text-[#809ba3]">
                {visible.length} shown
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {(["ALL", "TOOLS", "ERRORS", "OUTPUT"] as Mode[]).map((x) => (
                <button
                  type="button"
                  key={x}
                  onClick={() => setMode(x)}
                  className={clsx(
                    "rounded border px-2.5 py-1 font-mono text-[10px]",
                    mode === x
                      ? "border-[#4c9f7e] bg-[#1a3d31] text-mint"
                      : "border-border text-[#829aa3] hover:text-white",
                  )}
                >
                  {x}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 rounded border border-[#31434c] bg-[#0d161d] px-2.5">
              <Search size={13} className="text-[#7a909a]" />
              <input
                className="w-full bg-transparent py-2 text-[11px] outline-none placeholder:text-[#6b838c]"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search type, tool or metadata…"
              />
            </div>
          </div>
          <div className="max-h-[660px] overflow-auto px-2 py-2">
            {visible.map((e) => (
              <button
                type="button"
                key={e.id}
                onClick={() => setSelected(e.sequence)}
                className={clsx(
                  "trace-line relative mb-1 flex w-full gap-3 rounded-md px-2 py-2.5 text-left transition-colors",
                  selected === e.sequence
                    ? "border border-[#3b6659] bg-[#1c352d]"
                    : "border border-transparent hover:bg-[#1b2c35]",
                )}
              >
                <div
                  className={clsx(
                    "relative z-10 flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded border",
                    color(e),
                  )}
                >
                  {eventIcon(e)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex justify-between gap-1">
                    <div
                      className={clsx(
                        "font-mono text-[11px] font-semibold",
                        e.status === "ERROR" ? "text-danger" : "text-[#d7e6e9]",
                      )}
                    >
                      {e.event_type.replaceAll("_", " ")}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-[#79919c]">
                      +{number(e.offset_ms, 1)}ms
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#89a2a9]">
                    <span className="truncate">
                      {e.tool_name ??
                        (e.error
                          ? "Error captured"
                          : e.event_type === "FINAL_RESPONSE"
                            ? "Response captured"
                            : "Lifecycle event")}
                    </span>
                    {e.duration_ms !== null && (
                      <span className="shrink-0 font-mono text-[9px] text-[#829ba2]">
                        {number(e.duration_ms, 2)}ms
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {!visible.length && (
              <p className="p-4 text-xs text-[#829ba3]">
                No events match these filters.
              </p>
            )}
          </div>
        </div>
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <div className="label">02 / INSPECTOR</div>
              <div className="section-title mt-1">
                {current?.event_type.replaceAll("_", " ") ?? "Select an event"}
              </div>
            </div>
            {current && (
              <span className="mono text-[#86a69f]">
                EVENT {String(current.sequence).padStart(2, "0")}
              </span>
            )}
          </div>
          {current ? (
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded border border-border bg-[#0c171d] p-3">
                  <div className="label">STATUS</div>
                  <div className="mt-2">
                    <StatusBadge status={current.status} />
                  </div>
                </div>
                <div className="rounded border border-border bg-[#0c171d] p-3">
                  <div className="label">OFFSET</div>
                  <div className="mt-2 font-mono text-xs text-[#d2e1e4]">
                    +{number(current.offset_ms, 3)}ms
                  </div>
                </div>
                <div className="rounded border border-border bg-[#0c171d] p-3">
                  <div className="label">DURATION</div>
                  <div className="mt-2 font-mono text-xs text-[#d2e1e4]">
                    {current.duration_ms != null
                      ? `${number(current.duration_ms, 3)}ms`
                      : "Not measured"}
                  </div>
                </div>
              </div>
              {current.tool_name && (
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <span className="label">SANDBOX TOOL</span>
                  <span className="font-mono text-[11px] text-[#a9daca]">
                    {current.tool_name}
                  </span>
                </div>
              )}
              {call ? (
                <ToolCallInspector call={call} />
              ) : (
                <>
                  <JsonBlock
                    value={current.input_metadata}
                    title="Observable input metadata (redacted)"
                  />
                  <JsonBlock
                    value={current.output_metadata}
                    title="Observable output metadata (redacted)"
                  />
                  {current.error && (
                    <div className="rounded border border-[#714248] bg-[#3a252b] p-3 text-xs text-danger">
                      {current.error}
                    </div>
                  )}
                </>
              )}
              <div className="flex items-start gap-2 rounded border border-[#314a47] bg-[#132923] p-3 text-[10px] leading-relaxed text-[#a0c0b1]">
                <ShieldCheck size={15} className="mt-0.5 shrink-0 text-mint" />
                Private chain-of-thought is never collected. Visible events
                contain observable tool calls, validated metadata, outputs and
                error evidence only.
              </div>
            </div>
          ) : (
            <div className="p-6 text-xs text-[#869da7]">
              Select an event to inspect evidence.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
