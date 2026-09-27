"use client";
import { useState } from "react";
import {
  Activity,
  BookOpenText,
  ExternalLink,
  Fingerprint,
  KeyRound,
  LogOut,
  ShieldCheck,
} from "lucide-react";
import { useApi } from "@/lib/api";
import type { MetricDefinition } from "@/lib/types";
import { ErrorBox, Loading, PageHeader, StatLine } from "@/components/ui";
interface OperationalMetrics {
  measured_at: string;
  source: string;
  queued_runs: number;
  running_runs: number;
  error_runs_total: number;
  evaluated_runs_last_hour: number;
  throughput_runs_per_hour: number;
  worker_run_latency_p95_ms: number | null;
  worker_latency_samples: number;
  api_latency_source: string;
  limitations: string;
}
interface Health {
  status: string;
  service: string;
  queue_mode: string;
  demo_mode: boolean;
  auth_required: boolean;
}
export default function SettingsPage() {
  const { data: definitions, error } = useApi<MetricDefinition[]>(
    "/metrics/definitions",
  );
  const { data: health } = useApi<Health>("/health", 10000);
  const { data: ops, error: opsError } = useApi<OperationalMetrics>(
    "/system/metrics",
    10000,
  );
  const [busy, setBusy] = useState(false);
  async function logout() {
    setBusy(true);
    await fetch("/api/auth", { method: "DELETE" });
    window.location.reload();
  }
  return (
    <div>
      <PageHeader
        kicker="SYSTEM / METHODOLOGY"
        title="Settings & definitions"
        description="Configuration is managed in server environment variables. Metrics document their formula, source and directionality here and in each measured experiment."
      />
      <div className="mb-5 grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
        <div className="panel p-5">
          <div className="label">SYSTEM HEALTH</div>
          <div className="mt-3">
            <StatLine label="API" value={health?.status ?? "Checking…"} />
            <StatLine
              label="Job dispatch"
              value={health?.queue_mode ?? "Checking…"}
            />
            <StatLine
              label="Authentication required"
              value={
                health?.auth_required === undefined
                  ? "Checking…"
                  : health.auth_required
                    ? "Yes"
                    : "Disabled (local dev)"
              }
            />
            <StatLine
              label="Auto-seed demo fixtures"
              value={
                health?.demo_mode === undefined
                  ? "Checking…"
                  : health.demo_mode
                    ? "Yes"
                    : "No"
              }
            />
          </div>
          <div className="mt-5 rounded border border-[#315246] bg-[#172b23] p-3 text-[11px] text-[#9fbfb1]">
            <Activity size={15} className="mb-1 text-mint" />
            Worker progress is persisted in the database and read through REST
            polling. Production dispatch uses Redis/Celery; local-thread mode is
            for development only.
          </div>
        </div>
        <div className="panel p-5">
          <div className="label">SECURITY / OPERATOR GUIDE</div>
          <div className="mt-4 space-y-4">
            {[
              {
                icon: KeyRound,
                title: "Credentials belong in environment variables",
                text: "Agent versions save a validated secret_ref name, never a credential value. The web console holds its backend key server-side.",
              },
              {
                icon: ShieldCheck,
                title: "No arbitrary tool execution",
                text: "Only built-in read-only and mock tools execute. High-risk perturbations use simulated failures.",
              },
              {
                icon: Fingerprint,
                title: "Evidence is append-only",
                text: "Agent versions, benchmark versions, evaluated runs, comparisons and report snapshots are not silently overwritten.",
              },
            ].map((x) => (
              <div className="flex gap-3" key={x.title}>
                <x.icon size={17} className="mt-0.5 shrink-0 text-mint" />
                <div>
                  <div className="text-xs font-semibold text-[#d5e7e4]">
                    {x.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-[#91a6af]">
                    {x.text}
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
            <a
              href="/api/proxy/openapi.json"
              className="button-secondary"
              target="_blank"
              rel="noreferrer"
            >
              View OpenAPI schema
              <ExternalLink size={13} />
            </a>
            <button onClick={logout} disabled={busy} className="button-ghost">
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      </div>
      <div className="panel mb-5 p-5">
        <div className="label">OBSERVED OPERATIONS / DATABASE</div>
        <div className="section-title mt-1">Execution health</div>
        <p className="mt-1 text-[11px] leading-relaxed text-[#8fa8a6]">
          These are actual database counts at the measurement time, not a
          promise about the Redis broker. Throughput is a trailing one-hour
          count. API latencies are emitted to structured per-request logs.
        </p>
        {opsError && (
          <div className="mt-3">
            <ErrorBox message={opsError.message} />
          </div>
        )}
        <div className="mt-4 grid gap-x-10 gap-y-1 sm:grid-cols-2 xl:grid-cols-3">
          <StatLine
            label="Queued runs"
            value={ops ? String(ops.queued_runs) : "Checking…"}
          />
          <StatLine
            label="In-flight runs"
            value={ops ? String(ops.running_runs) : "Checking…"}
          />
          <StatLine
            label="Worker errors / all time"
            value={ops ? String(ops.error_runs_total) : "Checking…"}
          />
          <StatLine
            label="Evaluated runs / last hour"
            value={ops ? String(ops.evaluated_runs_last_hour) : "Checking…"}
          />
          <StatLine
            label="Run latency p95"
            value={
              ops
                ? ops.worker_run_latency_p95_ms === null
                  ? "Not measured"
                  : `${ops.worker_run_latency_p95_ms} ms (n=${ops.worker_latency_samples})`
                : "Checking…"
            }
          />
          <StatLine
            label="Measured at"
            value={ops?.measured_at ?? "Checking…"}
          />
        </div>
        <p className="mt-3 border-t border-border pt-3 font-mono text-[10px] text-[#8ba69e]">
          {ops?.source ?? "experiment_runs + latency_records"} ·{" "}
          {ops?.limitations ?? "Awaiting measurement"}
        </p>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">DEFINITIONS / FORMULAS / SOURCES</div>
            <div className="section-title mt-1">Metric reference</div>
          </div>
          <BookOpenText size={17} className="text-mint" />
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} />
          </div>
        )}
        {!definitions && !error && <Loading />}
        {definitions && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Definition</th>
                  <th>Formula</th>
                  <th>Data source</th>
                  <th>Direction</th>
                </tr>
              </thead>
              <tbody>
                {definitions.map((x) => (
                  <tr key={x.key}>
                    <td className="font-mono text-mint">{x.key}</td>
                    <td className="max-w-[250px] text-[11px]">
                      {x.definition}
                    </td>
                    <td className="max-w-[215px] font-mono text-[10px] text-[#a0c3b6]">
                      {x.formula}
                    </td>
                    <td className="font-mono text-[10px]">{x.data_source}</td>
                    <td className="font-mono text-[10px] uppercase">
                      {x.direction}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="mt-5 text-[11px] text-[#859ca2]">
        Research question: How reliably can an autonomous AI agent complete
        tasks while using external tools under normal, noisy, and adversarial
        conditions? No unmeasured metric is displayed as a score.
      </div>
    </div>
  );
}
