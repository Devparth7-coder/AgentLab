"use client";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { useApi, short, stamp } from "@/lib/api";
import type { Benchmark } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
} from "@/components/ui";
export default function SuitesPage() {
  const { data, error } = useApi<Benchmark[]>("/benchmarks");
  return (
    <div>
      <PageHeader
        kicker="WORKSPACE / TEST SUITES"
        title="Immutable test suites"
        description="A benchmark version is a pinned collection of tasks and evaluation rules. Choose the precise version before running or comparing experiments."
        actions={
          <Link href="/benchmarks" className="button-primary">
            <Plus size={14} /> New benchmark
          </Link>
        }
      />
      {error && <ErrorBox message={error.message} />}{" "}
      {!data && !error && <Loading />}
      {data && (
        <div className="panel overflow-hidden">
          <div className="panel-header">
            <div>
              <div className="label">VERSION LEDGER</div>
              <h2 className="section-title mt-0.5">Pinned workloads</h2>
            </div>
            <span className="mono text-[#80959e]">
              {data.reduce((n, b) => n + b.versions.length, 0)} versions
            </span>
          </div>
          {data.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Suite</th>
                    <th>Version</th>
                    <th>Category</th>
                    <th>Tasks</th>
                    <th>Content hash</th>
                    <th>Created</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.flatMap((b) =>
                    b.versions.map((v) => (
                      <tr key={v.id}>
                        <td>
                          <Link
                            href={`/benchmarks/${b.id}`}
                            className="font-semibold text-[#e1ebec] hover:text-mint"
                          >
                            {b.name}
                          </Link>{" "}
                          {b.is_demo && <DemoBadge compact />}
                        </td>
                        <td>
                          <span className="chip border-[#3a6056] bg-[#1b3531] text-mint">
                            v{v.version}
                          </span>
                        </td>
                        <td>{b.category}</td>
                        <td className="mono">{v.task_count}</td>
                        <td className="mono text-[#93b3af]">
                          {short(v.content_hash, 16)}…
                        </td>
                        <td className="whitespace-nowrap">
                          {stamp(v.created_at)}
                        </td>
                        <td>
                          <Link
                            href={`/experiments/new?benchmarkVersion=${v.id}`}
                            className="button-secondary py-1.5"
                          >
                            Run
                            <ArrowRight size={12} />
                          </Link>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No suites defined"
              description="Create a benchmark with versioned tasks and explicit evaluation rules."
              action={
                <Link className="button-secondary" href="/benchmarks">
                  Create benchmark
                  <ArrowRight size={13} />
                </Link>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
