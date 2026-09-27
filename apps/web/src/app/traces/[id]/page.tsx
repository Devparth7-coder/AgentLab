"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { short, stamp, useApi } from "@/lib/api";
import type { Trace } from "@/lib/types";
import {
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  StatusBadge,
} from "@/components/ui";
import { TraceTimeline } from "@/components/trace-viewer";
export default function TracePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data, error, mutate } = useApi<Trace>(`/traces/${id}`);
  if (error)
    return <ErrorBox message={error.message} retry={() => void mutate()} />;
  if (!data) return <Loading />;
  return (
    <div>
      <Link
        href="/traces"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#88a0aa] hover:text-mint"
      >
        <ArrowLeft size={13} /> Trace explorer
      </Link>
      <PageHeader
        kicker="TRACE / EVIDENCE TIMELINE"
        title={`TRC-${short(data.id, 12).toUpperCase()}`}
        description={`${data.task_key} · Run #${data.run_index + 1} · ${stamp(data.created_at)}`}
        actions={
          <>
            <StatusBadge status={data.run_status} />
            <Link
              href={`/experiments/${data.experiment_id}`}
              className="button-secondary"
            >
              Open experiment
              <ArrowRight size={13} />
            </Link>
          </>
        }
      />
      <div className="panel mb-4 grid gap-3 p-4 sm:grid-cols-3">
        <div>
          <div className="label">TASK INPUT</div>
          <div className="mt-1 text-[12px] leading-relaxed text-[#cfdee1]">
            {data.task_input ?? "Not measured"}
          </div>
        </div>
        <div>
          <div className="label">EXPERIMENT</div>
          <Link
            href={`/experiments/${data.experiment_id}`}
            className="mt-1 inline-block font-mono text-[11px] text-mint hover:underline"
          >
            {short(data.experiment_id, 20)}…
          </Link>
        </div>
        <div>
          <div className="label">OBSERVABILITY CONTRACT</div>
          <div className="mt-1 text-[11px] text-[#92a9ad]">
            Inputs redacted · tool results sandboxed · no private
            chain-of-thought
          </div>
        </div>
      </div>
      {data.events?.length ? (
        <TraceTimeline trace={data} />
      ) : (
        <EmptyState
          title="No captured events"
          description="This trace has no observable events; inspect the experiment failure and worker logs."
        />
      )}
    </div>
  );
}
