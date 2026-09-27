"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Plus, Search, X } from "lucide-react";
import { api, stamp, useApi } from "@/lib/api";
import type { Agent } from "@/lib/types";
import {
  DemoBadge,
  EmptyState,
  ErrorBox,
  Loading,
  PageHeader,
  StatusBadge,
} from "@/components/ui";

const providers = [
  "mock",
  "openai",
  "anthropic",
  "gemini",
  "ollama",
  "huggingface",
  "custom_http",
] as const;
const tools = [
  "dataset.aggregate",
  "dataset.lookup",
  "calculator",
  "mock.search",
  "mock.unavailable",
];
const credentialRef: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  huggingface: "HF_TOKEN",
};

function Registration({
  close,
  done,
}: {
  close: () => void;
  done: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [provider, setProvider] = useState<string>("mock");
  const [model, setModel] = useState("echo");
  const [version, setVersion] = useState("1.0.0");
  const [prompt, setPrompt] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [behavior, setBehavior] = useState("echo");
  const [secretRef, setSecretRef] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [priceOutput, setPriceOutput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const configuration: Record<string, unknown> =
        provider === "mock" ? { behavior } : {};
      if (provider !== "mock" && provider !== "ollama")
        configuration.secret_ref =
          secretRef || credentialRef[provider] || undefined;
      if (priceInput && priceOutput)
        configuration.pricing = {
          input_per_million_usd: Number(priceInput),
          output_per_million_usd: Number(priceOutput),
        };
      await api("/agents", "POST", {
        name,
        description,
        provider,
        version: {
          version,
          model,
          system_prompt: prompt,
          tool_configuration: selected,
          configuration,
          temperature: 0,
          max_tokens: 1024,
        },
      });
      done();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register agent");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="max-h-[92vh] w-full max-w-[635px] overflow-y-auto rounded-lg border border-[#35534c] bg-[#111c23] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-[#111c23] px-6 py-4">
          <div>
            <div className="eyebrow">AGENT REGISTRY</div>
            <div className="mt-1 text-lg font-semibold">Register an agent</div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="text-[#8ca1ac] hover:text-white"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Agent name</label>
              <input
                className="field"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ResearchAgent"
              />
            </div>
            <div>
              <label className="input-label">Initial version</label>
              <input
                className="field mono"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="1.0.0"
              />
            </div>
          </div>
          <div>
            <label className="input-label">Description</label>
            <input
              className="field"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this agent designed to do?"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="input-label">Provider adapter</label>
              <select
                className="select"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel(e.target.value === "mock" ? "echo" : "");
                }}
              >
                {providers.map((p) => (
                  <option key={p} value={p}>
                    {p === "mock"
                      ? "Mock · deterministic / DEMO"
                      : p.replace("_", " ").toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="input-label">Model identifier</label>
              <input
                required
                className="field mono"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Configured provider model"
              />
            </div>
          </div>
          {provider === "mock" ? (
            <div>
              <label className="input-label">Mock behavior</label>
              <select
                className="select"
                value={behavior}
                onChange={(e) => setBehavior(e.target.value)}
              >
                <option value="echo">Echo task input</option>
                <option value="static_response">Static response (empty)</option>
                <option value="tool_recovery">Simulated tool recovery</option>
              </select>
              <p className="mt-1 text-[10px] text-[#8ca5ad]">
                Mock agents never make real inference calls. Use them for
                plumbing tests only.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="input-label">
                  Credential environment reference
                </label>
                <input
                  className="field mono"
                  value={secretRef}
                  onChange={(e) => setSecretRef(e.target.value)}
                  placeholder={
                    credentialRef[provider] ||
                    (provider === "ollama"
                      ? "None (local)"
                      : "AGENTLAB_PROVIDER_AGENT_KEY")
                  }
                />
                <p className="mt-1 text-[10px] text-[#8299a3]">
                  Only the variable name is stored; never paste a key.
                </p>
              </div>
              <div>
                <label className="input-label">
                  Price / 1M tokens (USD, optional)
                </label>
                <div className="flex gap-2">
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="any"
                    value={priceInput}
                    onChange={(e) => setPriceInput(e.target.value)}
                    placeholder="Input"
                  />
                  <input
                    className="field"
                    type="number"
                    min="0"
                    step="any"
                    value={priceOutput}
                    onChange={(e) => setPriceOutput(e.target.value)}
                    placeholder="Output"
                  />
                </div>
              </div>
            </div>
          )}
          <div>
            <label className="input-label">
              System prompt (restricted; hash shown in read APIs)
            </label>
            <textarea
              className="field min-h-[82px] resize-y"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Agent instructions; do not include credentials"
            />
          </div>
          <div>
            <label className="input-label">Sandbox tool permissions</label>
            <div className="grid grid-cols-2 gap-2 rounded border border-border bg-[#0d171e] p-3 sm:grid-cols-3">
              {tools.map((tool) => (
                <label
                  className="flex items-center gap-2 text-[11px] text-[#aabfc4]"
                  key={tool}
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(tool)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, tool]
                          : selected.filter((x) => x !== tool),
                      )
                    }
                  />
                  <span className="font-mono">{tool}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-[#8299a3]">
              Only these side-effect-free, built-in mock tools can be executed.
            </p>
          </div>
          {error && (
            <div className="rounded border border-[#713f44] bg-[#322328] p-3 text-xs text-danger">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <button type="button" onClick={close} className="button-ghost">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="button-primary">
              {busy ? "Registering…" : "Register agent"}
              <ArrowRight size={14} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const { data, error, isLoading, mutate } = useApi<Agent[]>("/agents");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const matches =
    data?.filter((a) =>
      `${a.name} ${a.provider} ${a.description}`
        .toLowerCase()
        .includes(filter.toLowerCase()),
    ) ?? [];
  return (
    <div>
      <PageHeader
        kicker="WORKSPACE / REGISTRY"
        title="Agents & versions"
        description="Register provider-neutral agents, pin tool permissions, and track every configuration change as an immutable version."
        actions={
          <button
            className="button-primary"
            type="button"
            onClick={() => setOpen(true)}
          >
            <Plus size={14} /> Register agent
          </button>
        }
      />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="panel p-4">
          <span className="label">REGISTERED AGENTS</span>
          <div className="mt-2 font-mono text-2xl text-[#eaf4ee]">
            {data?.length ?? "—"}
          </div>
        </div>
        <div className="panel p-4">
          <span className="label">PINNED VERSIONS</span>
          <div className="mt-2 font-mono text-2xl text-[#eaf4ee]">
            {data ? data.reduce((n, a) => n + a.versions.length, 0) : "—"}
          </div>
        </div>
        <div className="panel p-4">
          <span className="label">PROVIDER FAMILIES</span>
          <div className="mt-2 font-mono text-2xl text-[#eaf4ee]">
            {data ? new Set(data.map((a) => a.provider)).size : "—"}
          </div>
        </div>
      </div>
      <div className="panel overflow-hidden">
        <div className="panel-header">
          <div>
            <div className="label">INVENTORY / VERSIONED CONFIGURATIONS</div>
            <h2 className="section-title mt-0.5">Registered agents</h2>
          </div>
          <div className="flex items-center gap-2 rounded border border-[#32444e] bg-[#0e171d] px-2.5">
            <Search size={13} className="text-[#77909a]" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter agents…"
              className="w-36 bg-transparent py-2 text-[11px] outline-none placeholder:text-[#71858f]"
            />
          </div>
        </div>
        {error && (
          <div className="p-5">
            <ErrorBox message={error.message} retry={() => void mutate()} />
          </div>
        )}
        {isLoading && !data && <Loading />}
        {data &&
          (matches.length ? (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Provider / model</th>
                    <th>Latest version</th>
                    <th>Tools</th>
                    <th>Registered</th>
                    <th>State</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((a) => (
                    <tr key={a.id}>
                      <td className="min-w-[190px]">
                        <Link
                          href={`/agents/${a.id}`}
                          className="font-semibold text-[#e4efef] hover:text-mint"
                        >
                          {a.name}
                        </Link>
                        <div className="mt-1 max-w-[230px] truncate text-[10px] text-[#7d94a0]">
                          {a.description || "No description"}
                        </div>
                      </td>
                      <td>
                        <div className="font-mono text-[11px] text-[#a8d4bf]">
                          {a.provider}
                        </div>
                        <div className="mt-1 text-[10px] text-[#899da8]">
                          {a.versions[0]?.model ?? "Not configured"}
                        </div>
                      </td>
                      <td>
                        <span className="chip border-[#3d6257] bg-[#1a3431] text-[#a7ebce]">
                          v{a.latest_version}
                        </span>
                        <div className="mt-1 font-mono text-[10px] text-[#6d858f]">
                          {a.versions.length} version(s)
                        </div>
                      </td>
                      <td className="max-w-[230px]">
                        <span className="font-mono text-[10px] text-[#a1b9bd]">
                          {a.versions[0]?.tool_configuration.join(", ") ||
                            "No tools"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[10px]">
                        {stamp(a.created_at)}
                      </td>
                      <td>
                        {a.is_demo ? (
                          <DemoBadge compact />
                        ) : (
                          <StatusBadge status={a.status} />
                        )}
                      </td>
                      <td>
                        <Link
                          href={`/agents/${a.id}`}
                          aria-label="Agent details"
                          className="text-mint"
                        >
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
              title={filter ? "No matching agents" : "No agents registered"}
              description={
                filter
                  ? "Change your search filter."
                  : "Register a provider-neutral agent to begin. Only credential environment-variable names are saved."
              }
              action={
                !filter && (
                  <button
                    className="button-secondary"
                    type="button"
                    onClick={() => setOpen(true)}
                  >
                    Register agent
                    <Plus size={14} />
                  </button>
                )
              }
            />
          ))}
      </div>
      <div className="mt-5 flex items-start gap-2 rounded-lg border border-[#2d4847] bg-[#122422] p-4 text-[11px] text-[#95bdb2]">
        <KeyRound size={15} className="mt-0.5 shrink-0 text-mint" />
        <span>
          <b>Security:</b> API keys come from server environment variables.
          AGENTLAB stores model IDs, configuration hashes and sandbox tool
          permissions—not credential values.
        </span>
      </div>
      {open && (
        <Registration
          close={() => setOpen(false)}
          done={() => {
            setOpen(false);
            void mutate();
          }}
        />
      )}
    </div>
  );
}
