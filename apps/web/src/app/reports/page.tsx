"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileBarChart2, FileText, ShieldCheck } from "lucide-react";
import { api, short, stamp, useApi } from "@/lib/api";
import type { Experiment, ReportListItem } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
} from "@/components/ui";
export default function ReportsPage() {
  const router = useRouter();
  const {
    data: reports,
    error,
    mutate,
  } = useApi<ReportListItem[]>("/reports", 8000);
  const { data: exps } = useApi<Experiment[]>("/experiments?limit=200");
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const complete = exps?.filter((e) => !!e.completed_at) ?? [];
  async function generate(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    setErr("");
    try {
      const result = await api<ReportListItem>("/reports", "POST", {
        experiment_id: selected,
      });
      await mutate();
      router.push(`/reports/${result.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Report generation failed");
      setBusy(false);
    }
  }
  return (
    <div>
      <PageHeader
        kicker="EVIDENCE / REPORTS"
        title="Research reports"
        description="Freeze a provenance-linked snapshot with measured metrics, formulas, failures, trace statistics, methodology and limitations. Export PDF, Markdown, JSON or print-ready HTML."
      />
      <div className="panel mb-5 flex flex-wrap items-end gap-4 p-5">
        <div className="min-w-[235px] flex-1">
          <div className="label">GENERATE IMMUTABLE SNAPSHOT</div>
          <form
            onSubmit={generate}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <div className="min-w-[220px] flex-1">
              <label className="input-label">Completed experiment</label>
              <select
                required
                className="select"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">Select experiment…</option>
                {complete.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.name} · v{ex.agent_version} {ex.is_demo ? "(DEMO)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <button
              disabled={busy || !selected}
              type="submit"
              className="button-primary h-[40px]"
            >
              <FileBarChart2 size={14} />
              {busy ? "Generating…" : "Generate report"}
            </button>
          </form>
          {err && <p className="mt-2 text-xs text-danger">{err}</p>}
        </div>
        <div className="rounded border border-[#35564b] bg-[#162821] px-4 py-3 text-[10px] leading-relaxed text-[#a7c7b4]">
          <ShieldCheck size={14} className="mb-1 text-mint" /> Snapshots never
          overwrite earlier reports.
          <br />
          Unmeasured fields remain explicit.
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">REPORT LEDGER</div>
            <div className="section-title mt-1">Generated documents</div>
          </div>
          <span className="mono text-[#839aa2]">
            {reports?.length ?? "—"} snapshots
          </span>
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} />
          </div>
        )}
        {!reports && !error && <Loading />}
        {reports &&
          (reports.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Experiment</th>
                    <th>Mode</th>
                    <th>Generated</th>
                    <th>Exports</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    return (
                      <tr key={r.id}>
                        <td>
                          <Link
                            href={`/reports/${r.id}`}
                            className="font-semibold text-[#e0edec] hover:text-mint"
                          >
                            {r.title}
                          </Link>
                          <div className="mono mt-1 text-[#77939a]">
                            RPT-{short(r.id, 10)}
                          </div>
                        </td>
                        <td>
                          <Link
                            href={`/experiments/${r.experiment_id}`}
                            className="mono text-[#a1c5b7] hover:underline"
                          >
                            {short(r.experiment_id, 17)}
                          </Link>
                        </td>
                        <td>
                          {r.is_demo ? (
                            <DemoBadge compact />
                          ) : (
                            <span className="font-mono text-[10px] text-[#8ca3a7]">
                              MEASURED
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap">
                          {stamp(r.created_at)}
                        </td>
                        <td className="whitespace-nowrap">
                          {["pdf", "md", "json", "html"].map((format) => (
                            <a
                              key={format}
                              href={`/api/proxy/reports/${r.id}/download?format=${format}`}
                              className="mr-2 font-mono text-[10px] uppercase text-mint hover:underline"
                            >
                              .{format}
                            </a>
                          ))}
                        </td>
                        <td>
                          <Link href={`/reports/${r.id}`} className="text-mint">
                            <ArrowRight size={15} />
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
              title="No reports generated"
              description="Finish an experiment and freeze its measured evidence into a research-style report."
              icon={<FileText size={20} />}
            />
          ))}
      </div>
    </div>
  );
}
