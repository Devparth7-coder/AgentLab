"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Boxes,
  Bug,
  ChevronRight,
  CircleHelp,
  Database,
  FileBarChart2,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Layers3,
  LockKeyhole,
  Menu,
  Search,
  ServerCog,
  ShieldCheck,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/lib/api";

type Icon = typeof Gauge;
const primary: { href: string; text: string; icon: Icon }[] = [
  { href: "/", text: "Overview", icon: Gauge },
  { href: "/agents", text: "Agents", icon: Boxes },
  { href: "/benchmarks", text: "Benchmarks", icon: Database },
  { href: "/suites", text: "Test suites", icon: Layers3 },
  { href: "/experiments", text: "Experiments", icon: FlaskConical },
];
const diagnostics: { href: string; text: string; icon: Icon }[] = [
  { href: "/traces", text: "Traces", icon: Activity },
  { href: "/failures", text: "Failures", icon: Bug },
  { href: "/robustness", text: "Robustness", icon: ShieldCheck },
  { href: "/regression", text: "Regression", icon: GitCompareArrows },
  { href: "/cost", text: "Cost & latency", icon: BarChart3 },
  { href: "/reports", text: "Reports", icon: FileBarChart2 },
];

function Brand() {
  return (
    <Link
      href="/"
      className="flex h-[72px] items-center gap-3 border-b border-border px-5"
    >
      <span className="relative flex h-[32px] w-[32px] items-center justify-center rounded-[5px] border border-[#5bbd9d]/70 bg-[#143930] text-[20px] font-black leading-none tracking-[-.13em] text-[#8cf8cc]">
        A
        <span className="absolute bottom-1 right-0.5 h-1 w-3 rotate-[-36deg] bg-[#7df0c0]" />
      </span>
      <span>
        <span className="block font-mono text-[17px] font-bold leading-[1] tracking-[.035em] text-[#ebf8f0]">
          AGENTLAB
        </span>
        <span className="mt-1 block font-mono text-[9px] tracking-[.06em] text-[#719389]">
          TEST. OBSERVE. BREAK. IMPROVE.
        </span>
      </span>
    </Link>
  );
}
function NavSection({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: typeof primary;
  pathname: string;
  onNavigate: () => void;
}) {
  return (
    <div className="mb-6">
      <div className="px-5 pb-2 font-mono text-[10px] uppercase tracking-[.2em] text-[#5f7582]">
        {title}
      </div>
      <div className="px-2.5">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              href={item.href}
              key={item.href}
              onClick={onNavigate}
              className={clsx(
                "mb-0.5 flex h-[35px] items-center gap-3 rounded-[5px] px-3 text-[12px] font-medium transition-colors",
                active
                  ? "bg-[#1d3937] text-[#b6f7d9]"
                  : "text-[#889da9] hover:bg-[#1d2b34] hover:text-[#ecf3f6]",
              )}
            >
              <Icon
                size={15}
                strokeWidth={active ? 2 : 1.7}
                className={active ? "text-mint" : "text-[#738996]"}
              />
              <span className="flex-1">{item.text}</span>
              {active && <span className="h-1.5 w-1.5 rounded-full bg-mint" />}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
function Sidebar({ pathname, close }: { pathname: string; close: () => void }) {
  const health = useApi<{ status: string; queue_mode: string }>(
    "/health",
    20000,
  );
  return (
    <div className="flex h-full flex-col border-r border-border bg-[#0e161d]">
      <Brand />
      <div className="flex-1 overflow-y-auto py-5">
        <NavSection
          title="WORKSPACE"
          items={primary}
          pathname={pathname}
          onNavigate={close}
        />
        <NavSection
          title="ANALYZE"
          items={diagnostics}
          pathname={pathname}
          onNavigate={close}
        />
        <div className="mx-4 my-2 h-px bg-border" />
        <div className="px-2.5">
          <Link
            href="/settings"
            onClick={close}
            className={clsx(
              "flex h-9 items-center gap-3 rounded px-3 text-xs hover:bg-[#1d2b34]",
              pathname === "/settings" ? "text-mint" : "text-[#8da2ae]",
            )}
          >
            <ServerCog size={15} /> Settings
          </Link>
        </div>
      </div>
      <div className="border-t border-border px-4 py-4">
        <div className="mb-2.5 flex items-center gap-2 font-mono text-[10px] text-[#84a099]">
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-full",
              health.data?.status === "ok"
                ? "bg-mint"
                : health.error
                  ? "bg-[#ee8182]"
                  : "bg-amber",
            )}
          />
          {health.data?.status === "ok"
            ? "SYSTEM OPERATIONAL"
            : health.error
              ? "API NOT CONNECTED"
              : "CHECKING API"}
        </div>
        <div className="text-[10px] leading-relaxed text-[#5f7783]">
          Evidence over claims.
          <br />
          Live metrics come from recorded runs.
        </div>
      </div>
    </div>
  );
}
function Login({ onSuccess }: { onSuccess: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessKey: key }),
      });
      if (!r.ok) throw new Error("Invalid access key");
      setKey("");
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center lab-grid px-5">
      <div className="w-full max-w-[425px] rounded-xl border border-[#38504b] bg-[#101a21] p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#1a4335] font-mono text-xl font-bold text-mint">
            A
          </div>
          <div>
            <div className="font-mono text-xl font-bold tracking-tight">
              AGENTLAB
            </div>
            <div className="font-mono text-[10px] tracking-widest text-[#6f9186]">
              TEST. OBSERVE. BREAK. IMPROVE.
            </div>
          </div>
        </div>
        <LockKeyhole size={20} className="mb-4 text-mint" />
        <div className="text-xl font-semibold tracking-tight">
          Access the control room
        </div>
        <p className="mt-1 text-xs text-[#8ca2ae]">
          Enter the console access key configured by your administrator. It is
          never stored in the browser.
        </p>
        <form onSubmit={submit} className="mt-6">
          <label className="input-label" htmlFor="access">
            Console access key
          </label>
          <input
            id="access"
            className="field"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter access key"
            required
          />
          {error && <p className="mt-2 text-xs text-danger">{error}</p>}
          <button className="button-primary mt-5 w-full" disabled={busy}>
            {busy ? "Verifying…" : "Unlock AGENTLAB"} <ChevronRight size={15} />
          </button>
        </form>
        <p className="mt-5 border-t border-border pt-4 text-[10px] text-[#69818c]">
          Session is HTTP-only, signed, and time-limited. The backend key
          remains server-side.
        </p>
      </div>
    </div>
  );
}
function TopBar({
  pathname,
  onMenu,
}: {
  pathname: string;
  onMenu: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const crumbs = pathname.split("/").filter(Boolean);
  return (
    <div className="sticky top-0 z-20 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-[#0d151c]/95 px-5 backdrop-blur md:px-8">
      <div className="flex min-w-0 items-center gap-2 text-xs text-[#8ba0ad]">
        <button
          type="button"
          onClick={onMenu}
          aria-label="Open menu"
          className="mr-2 lg:hidden"
        >
          <Menu size={20} />
        </button>
        <span className="hidden font-mono text-[10px] tracking-widest text-[#5f8283] sm:block">
          WORKSPACE
        </span>
        <ChevronRight size={13} className="hidden sm:block" />
        <span className="truncate font-semibold capitalize text-[#d9e6e9]">
          {crumbs.length
            ? crumbs.at(-1)?.replaceAll("-", " ").slice(0, 35)
            : "Overview"}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim())
              router.push(`/traces?search=${encodeURIComponent(q.trim())}`);
          }}
          className="hidden items-center gap-2 rounded-md border border-[#2b3b45] bg-[#121d25] px-3 py-1.5 md:flex"
        >
          <Search size={14} className="text-[#79909b]" />
          <input
            aria-label="Search traces"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-36 bg-transparent text-[11px] text-[#dfebee] outline-none placeholder:text-[#68818c] xl:w-48"
            placeholder="Search traces…"
          />
          <span className="rounded border border-[#3b4d57] px-1 font-mono text-[9px] text-[#6a838f]">
            ↵
          </span>
        </form>
        <span className="hidden items-center gap-1.5 font-mono text-[10px] text-[#7ca494] sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-mint" /> EVIDENCE FIRST
        </span>
        <Link
          href="/settings"
          title="Methodology & settings"
          className="text-[#869ba7] hover:text-mint"
        >
          <CircleHelp size={17} />
        </Link>
      </div>
    </div>
  );
}
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    fetch("/api/auth", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { authorized: boolean }) => setAuthorized(d.authorized))
      .catch(() => setAuthorized(false));
  }, []);
  if (authorized === null)
    return (
      <div className="flex min-h-screen items-center justify-center font-mono text-xs text-[#7a9d92]">
        AGENTLAB // VERIFYING ACCESS
      </div>
    );
  if (!authorized) return <Login onSuccess={() => setAuthorized(true)} />;
  return (
    <div className="min-h-screen">
      <aside className="fixed bottom-0 left-0 top-0 z-30 hidden w-[238px] lg:block">
        <Sidebar pathname={pathname} close={() => setOpen(false)} />
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/70 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="h-full w-[245px]"
          >
            <Sidebar pathname={pathname} close={() => setOpen(false)} />
          </div>
          <button
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 text-white"
          >
            <X />
          </button>
        </div>
      )}
      <div className="min-w-0 lg:pl-[238px]">
        <TopBar pathname={pathname} onMenu={() => setOpen(true)} />
        <main className="mx-auto w-full max-w-[1600px] px-5 pb-20 pt-7 md:px-8 xl:px-9">
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4 font-mono text-[10px] text-[#64808a] md:px-9">
          <span>AGENTLAB / RELIABILITY ENGINEERING</span>
          <span>
            DON&apos;T TRUST AN AGENT BECAUSE IT SOUNDS CONVINCING. TEST IT.
          </span>
        </footer>
      </div>
    </div>
  );
}
