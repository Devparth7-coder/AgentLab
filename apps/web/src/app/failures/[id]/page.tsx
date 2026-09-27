"use client";
import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw, ShieldAlert } from "lucide-react";
import { api, short, stamp, useApi } from "@/lib/api";
import type { Failure } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  JsonBlock,
  Loading,
  PageHeader,
  StatLine,
  StatusBadge,
} from "@/components/ui";
export default function FailurePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: f, error, mutate } = useApi<Failure>(`/failures/${id}`, 3800);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function replay() {
    setBusy(true);
    setErr("");
    try {
      await api(`/failures/${id}/replay`, "POST");
      await mutate();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Replay could not be queued");
    } finally {
      setBusy(false);
    }
  }
  if (error)
    return <ErrorBox message={error.message} retry={() => void mutate()} />;
  if (!f) return <Loading />;
  return (
    <div>
      <Link
        href="/failures"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#8fa5ad] hover:text-mint"
      >
        <ArrowLeft size={12} /> Failure explorer
      </Link>
      <PageHeader
        kicker="FAILURE / FORENSIC RECORD"
        title={`FLR-${short(f.id, 12).toUpperCase()}`}
        description={`${f.failure_type.replaceAll("_", " ")} · ${f.agent_name} v${f.agent_version} · ${f.task_key}`}
        actions={
          <>
            {f.is_demo && <DemoBadge compact />}
            <StatusBadge status={f.severity} />
            <button
              type="button"
              onClick={replay}
              disabled={busy}
              className="button-primary"
            >
              <RotateCcw size={13} />
              {busy ? "Queueing…" : "Replay failure"}
            </button>
          </>
        }
      />
      {err && (
        <div className="mb-4 rounded border border-[#784346] bg-[#342328] p-3 text-xs text-danger">
          {err}
        </div>
      )}
      <div className="panel mb-5 flex flex-wrap items-start gap-4 border-[#694646] bg-[#271c21] p-5">
        <div className="rounded border border-[#874c4e] bg-[#492b30] p-2 text-danger">
          <ShieldAlert size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="label text-[#de9b96]">
            ROOT-CAUSE SIGNAL / CLASSIFIED FROM EVALUATION EVIDENCE
          </div>
          <h2 className="mt-1 text-lg font-semibold text-[#f1dddd]">
            {f.summary}
          </h2>
          <p className="mt-1 text-[11px] text-[#bfaaa9]">
            A classification is a diagnostic hypothesis based on explicit
            evaluator rules, not a confirmed model-internal root cause.
          </p>
        </div>
        <div className="font-mono text-[10px] text-[#af9491]">
          DETECTED {stamp(f.detected_at)}
        </div>
      </div>
      <div className="mb-5 grid gap-5 lg:grid-cols-[1.3fr_.75fr]">
        <div className="space-y-5">
          <div className="panel overflow-hidden">
            <div className="panel-header">
              <div>
                <div className="label">TASK / INPUT</div>
                <div className="section-title mt-1">{f.task_key}</div>
              </div>
              <span className="mono text-[#839ba4]">
                {short(f.task_id, 14)}
              </span>
            </div>
            <p className="p-5 text-[13px] leading-relaxed text-[#d4e1e3]">
              {f.task_input ?? "Not measured"}
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="panel p-4">
              <div className="mb-3 label text-[#98d9b9]">
                EXPECTED / REFERENCE
              </div>
              <JsonBlock value={f.expected} />
            </div>
            <div className="panel p-4">
              <div className="mb-3 label text-danger">OBSERVED / AGENT</div>
              <JsonBlock value={f.observed} />
            </div>
          </div>
          <div className="panel p-5">
            <div className="label">EVALUATOR EVIDENCE / SOURCE</div>
            <div className="mt-3">
              <JsonBlock value={f.evidence} />
            </div>
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="label">INVESTIGATION CONTROLS</div>
            <div className="mt-3">
              <StatLine label="Failure type" value={f.failure_type} />
              <StatLine label="Severity" value={f.severity} />
              <StatLine
                label="First seen"
                value={stamp(f.frequency?.first_seen ?? f.detected_at)}
              />
              <StatLine
                label="Last seen"
                value={stamp(f.frequency?.last_seen ?? f.detected_at)}
              />
              <StatLine
                label="Frequency"
                value={
                  f.frequency
                    ? `${f.frequency.failures} / ${f.frequency.runs} runs`
                    : "Not measured"
                }
              />
              <StatLine label="Trace ID" value={short(f.trace_id, 16)} />
              <StatLine
                label="Agent version ID"
                value={short(f.agent_version_id, 16)}
              />
            </div>
            <Link
              href={`/traces/${f.trace_id}`}
              className="button-secondary mt-5 w-full"
            >
              Open complete trace
              <ArrowRight size={13} />
            </Link>
          </div>
          <div className="panel p-5">
            <div className="label">REPRODUCTION / PINNED CONFIG</div>
            <div className="mt-3">
              <JsonBlock value={f.reproduction_config} />
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#8fa6a9]">
              Replay creates a new one-task experiment, retaining this original
              record. Only identical deterministic mock results are labeled
              reproducible.
            </p>
          </div>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">REPLAY HISTORY</div>
            <div className="section-title mt-1">Reproduction attempts</div>
          </div>
          <button
            type="button"
            onClick={replay}
            disabled={busy}
            className="button-secondary"
          >
            <RotateCcw size={13} /> Replay again
          </button>
        </div>
        {f.reproductions?.length ? (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Attempt</th>
                  <th>Outcome</th>
                  <th>Evidence</th>
                  <th>Created</th>
                  <th>New experiment</th>
                </tr>
              </thead>
              <tbody>
                {f.reproductions.map((r, i) => (
                  <tr key={r.id}>
                    <td className="mono">#{f.reproductions!.length - i}</td>
                    <td>
                      <StatusBadge status={r.outcome} />
                    </td>
                    <td className="max-w-[435px] text-[11px]">{r.reason}</td>
                    <td className="whitespace-nowrap">{stamp(r.created_at)}</td>
                    <td>
                      <Link
                        href={`/experiments/${r.experiment_id}`}
                        className="text-mint hover:underline"
                      >
                        {short(r.experiment_id, 16)}{" "}
                        <ArrowRight size={12} className="inline" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No replay attempted"
            description="Queue a one-case experiment to test whether the failure reproduces under pinned conditions."
            icon={<RotateCcw size={18} />}
          />
        )}
      </div>
    </div>
  );
}
