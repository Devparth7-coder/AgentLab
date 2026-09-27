"use client";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronDown,
  Clock3,
  FlaskConical,
  HelpCircle,
  LoaderCircle,
  Minus,
  X,
} from "lucide-react";
import Link from "next/link";
import { ReactNode } from "react";
import clsx from "clsx";
import { formatMetric, number, short, stamp } from "@/lib/api";
import type { Metric, Status } from "@/lib/types";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-[790px]">
        <div className="eyebrow mb-2">{kicker}</div>
        <h1 className="text-[27px] font-semibold leading-tight tracking-[-.045em] text-[#f0f5f7] md:text-[32px]">
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-[710px] text-[13px] leading-relaxed text-[#90a4b1]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span className="chip border-[#876d3d] bg-[#4b361d]/50 text-[#f1bd72]">
      {compact ? "DEMO" : "DEMO · SYNTHETIC"}
    </span>
  );
}
export function StatusBadge({ status }: { status: Status | string }) {
  const s = status.toUpperCase();
  const isGood = [
    "PASSED",
    "COMPLETED",
    "SUCCESS",
    "REPRODUCIBLE",
    "IMPROVEMENT",
    "NO_REGRESSION_DETECTED",
  ].includes(s);
  const isBad = ["FAILED", "ERROR", "REGRESSION", "NON-DETERMINISTIC"].includes(
    s,
  );
  const isPending = ["RUNNING", "QUEUED", "CREATED", "PENDING"].includes(s);
  return (
    <span
      className={clsx(
        "chip",
        isGood
          ? "border-[#2d6956] bg-[#143c32] text-[#69e6b7]"
          : isBad
            ? "border-[#754345] bg-[#49292e] text-[#f38e8c]"
            : isPending
              ? "border-[#465f76] bg-[#203449] text-[#93cae2]"
              : "border-[#544e40] bg-[#2b2b27] text-[#c6b998]",
      )}
    >
      {isGood ? (
        <Check size={10} />
      ) : isBad ? (
        <X size={10} />
      ) : isPending ? (
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : (
        <Minus size={10} />
      )}{" "}
      {s.replaceAll("_", " ")}
    </span>
  );
}
export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-[238px] flex-col items-center justify-center gap-3 px-5 py-9 text-center micro-grid">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#36525a] bg-[#172a31] text-mint">
        {icon ?? <FlaskConical size={20} />}
      </div>
      <div className="font-mono text-[11px] font-semibold tracking-[.12em] text-[#d7e5e9]">
        {title.toUpperCase()}
      </div>
      <p className="max-w-[420px] text-xs leading-relaxed text-[#899ca8]">
        {description}
      </p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
export function Loading({ label = "Loading evidence" }: { label?: string }) {
  return (
    <div className="flex min-h-[145px] items-center justify-center gap-2 text-xs text-[#8295a1]">
      <LoaderCircle size={15} className="animate-spin text-mint" />
      {label}…
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="rounded-lg border border-[#704044] bg-[#281e24] p-4 text-[12px] text-[#f0aaa8]">
      <div className="flex items-center gap-2 font-semibold">
        <AlertCircle size={15} /> Unable to load evidence
      </div>
      <p className="mt-1 text-[#d5a5a5]">{message}</p>
      {retry && (
        <button type="button" onClick={retry} className="button-secondary mt-3">
          Retry
        </button>
      )}
    </div>
  );
}
export function MetricCard({
  metric,
  label,
  note,
  className,
}: {
  metric?: Metric;
  label: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={clsx("panel relative overflow-hidden p-4", className)}>
      <div className="absolute left-0 top-0 h-full w-[2px] bg-[#57bf9d]/60" />
      <div className="flex items-start justify-between">
        <span className="label">{label}</span>
        <span className="text-[#66808b]">
          <HelpCircle size={13} />
        </span>
      </div>
      <div
        className={clsx(
          "mt-3 text-[25px] font-medium tracking-[-.055em] leading-none",
          metric?.value == null
            ? "text-[#95a5ad] text-[17px] tracking-normal"
            : "text-[#eef7f5]",
        )}
      >
        {metric ? formatMetric(metric.value, metric.unit) : "Not measured"}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-[#7f96a2]">
        <span>
          {metric
            ? `${metric.sample_count} measured ${metric.sample_count === 1 ? "sample" : "samples"}`
            : (note ?? "Pending evaluation")}
        </span>
        <span className="mono text-[#536e78]">
          {metric ? short(metric.experiment_id, 6) : "—"}
        </span>
      </div>
      {metric && (
        <details className="group mt-3 border-t border-border pt-2 text-[10px] text-[#899da8]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[#7caea4]">
            Evidence & formula{" "}
            <ChevronDown size={11} className="group-open:rotate-180" />
          </summary>
          <div className="mt-2 space-y-1 leading-relaxed">
            <div>{metric.definition}</div>
            <div>
              <b>Formula:</b> {metric.formula}
            </div>
            <div>
              <b>Source:</b> {metric.data_source}
            </div>
            <div>
              <b>Measured:</b> {stamp(metric.measured_at)}
            </div>
            <div>
              <b>Versions:</b> agent{" "}
              {String(metric.provenance.agent_version ?? "—")} / benchmark{" "}
              {String(metric.provenance.benchmark_version ?? "—")}
            </div>
            <div>
              <b>Experiment:</b>{" "}
              <Link
                href={`/experiments/${metric.experiment_id}`}
                className="text-mint hover:underline"
              >
                {short(metric.experiment_id, 12)}
              </Link>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
export function ProgressBar({
  completed,
  total,
  passed,
  failed,
}: {
  completed: number;
  total: number;
  passed?: number;
  failed?: number;
}) {
  const pass = total ? (100 * (passed ?? 0)) / total : 0;
  const fail = total ? (100 * (failed ?? 0)) / total : 0;
  const done = total ? (100 * completed) / total : 0;
  return (
    <div aria-label={`${completed} of ${total} runs complete`}>
      <div className="flex h-2 overflow-hidden rounded-full bg-[#26353e]">
        <span className="bg-[#5fe3b5]" style={{ width: `${pass}%` }} />
        <span className="bg-[#ec8481]" style={{ width: `${fail}%` }} />
        <span
          className="bg-[#6c879a]"
          style={{ width: `${Math.max(0, done - pass - fail)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[#8398a5]">
        <span>
          {number(completed, 0)} / {number(total, 0)} runs
        </span>
        <span>{number(done, 0)}%</span>
      </div>
    </div>
  );
}
export function JsonBlock({
  value,
  title,
}: {
  value: unknown;
  title?: string;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-[#2d3c45] bg-[#0c141a]">
      {title && (
        <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#77919f]">
          {title}
        </div>
      )}
      <pre className="max-h-[450px] overflow-auto p-3 font-mono text-[11px] leading-[1.65] text-[#a6d4c9]">
        {typeof value === "string"
          ? value
          : JSON.stringify(value ?? null, null, 2)}
      </pre>
    </div>
  );
}
export function LinkArrow({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint hover:text-[#a2f7d6]"
    >
      {children}
      <ArrowRight size={13} />
    </Link>
  );
}
export function StatLine({
  label,
  value,
  children,
}: {
  label: string;
  value?: string | number | null;
  children?: ReactNode;
}) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#25313b] py-2.5 last:border-0">
      <span className="text-[11px] text-[#899eaa]">{label}</span>
      <span className="text-right font-mono text-[11px] text-[#d1e0e7]">
        {children ?? value ?? "Not measured"}
      </span>
    </div>
  );
}
export function MiniLabel({ children }: { children: ReactNode }) {
  return <span className="label">{children}</span>;
}
export function TimeIcon() {
  return <Clock3 size={13} />;
}
