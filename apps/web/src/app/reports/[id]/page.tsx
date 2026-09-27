"use client";
import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download, FileBarChart2 } from "lucide-react";
import { short, stamp, useApi } from "@/lib/api";
import type { ReportDetail } from "@/lib/types";
import {
  DemoBadge,
  ErrorBox,
  JsonBlock,
  Loading,
  PageHeader,
  StatLine,
} from "@/components/ui";
export default function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: r, error } = useApi<ReportDetail>(`/reports/${id}`);
  if (error) return <ErrorBox message={error.message} />;
  if (!r) return <Loading />;
  const doc = r.content_json;
  const agent = doc.agent as Record<string, unknown> | undefined;
  const bench = doc.benchmark as Record<string, unknown> | undefined;
  return (
    <div>
      <Link
        href="/reports"
        className="mb-4 inline-flex items-center gap-1 text-[11px] text-[#8aa1a9] hover:text-mint"
      >
        <ArrowLeft size={12} /> Report ledger
      </Link>
      <PageHeader
        kicker="AGENT RELIABILITY REPORT / FROZEN EVIDENCE"
        title={r.title}
        description={`Report ${short(r.id, 16)} · Generated ${stamp(r.created_at)} · Experiment ${short(r.experiment_id, 16)}`}
        actions={
          <>
            {doc.demo === true && <DemoBadge />}
            <Link
              href={`/experiments/${r.experiment_id}`}
              className="button-secondary"
            >
              Source experiment
              <ArrowRight size={13} />
            </Link>
          </>
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {[
          ["pdf", "Evidence PDF"],
          ["md", "Markdown"],
          ["json", "Structured JSON"],
          ["html", "Print-ready HTML"],
        ].map(([format, label]) => (
          <a
            href={`/api/proxy/reports/${r.id}/download?format=${format}`}
            key={format}
            className={format === "pdf" ? "button-primary" : "button-secondary"}
          >
            <Download size={13} /> {label}
          </a>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <div className="label">REPORT BODY / SNAPSHOT AT GENERATION</div>
              <div className="section-title mt-1">
                Measured evidence & limitations
              </div>
            </div>
            <FileBarChart2 size={17} className="text-mint" />
          </div>
          <div className="max-h-[900px] overflow-auto p-6">
            <pre className="whitespace-pre-wrap font-mono text-[11px] leading-[1.85] text-[#c7ded7]">
              {r.content_markdown}
            </pre>
          </div>
        </div>
        <div className="space-y-5">
          <div className="panel p-5">
            <div className="label">PROVENANCE CHECKPOINT</div>
            <StatLine
              label="Agent"
              value={String(agent?.name ?? "Not measured")}
            />
            <StatLine
              label="Version"
              value={String(agent?.version ?? "Not measured")}
            />
            <StatLine
              label="Provider"
              value={String(agent?.provider ?? "Not measured")}
            />
            <StatLine
              label="Benchmark"
              value={String(bench?.name ?? "Not measured")}
            />
            <StatLine
              label="Benchmark version"
              value={String(bench?.version ?? "Not measured")}
            />
            <StatLine label="Generated" value={stamp(r.created_at)} />
            <div className="mt-3 text-[11px] text-[#91a8ac]">
              Hashes, sources, formulas and measurement timestamps are embedded
              in JSON export and the metric table.
            </div>
          </div>
          <div className="panel p-5">
            <div className="label">MACHINE-READABLE EVIDENCE</div>
            <div className="mt-3 max-h-[320px] overflow-auto">
              <JsonBlock
                value={{
                  experiment_id: r.experiment_id,
                  agent_config_hash: agent?.configuration_hash,
                  benchmark_hash: bench?.content_hash,
                  generated_at: doc.generated_at,
                }}
              />
            </div>
            <a
              className="button-secondary mt-4 w-full"
              href={`/api/proxy/reports/${r.id}/download?format=json`}
            >
              Download complete JSON
              <Download size={13} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
