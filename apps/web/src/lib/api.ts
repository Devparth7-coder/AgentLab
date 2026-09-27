"use client";
import useSWR from "swr";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api/proxy${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!res.ok) {
    let reason = `Request failed (${res.status})`;
    try {
      const json = (await res.json()) as {
        detail?: string | { msg: string }[];
      };
      reason =
        typeof json.detail === "string"
          ? json.detail
          : Array.isArray(json.detail)
            ? json.detail.map((x) => x.msg).join(", ")
            : reason;
    } catch {
      /* preserve generic message */
    }
    throw new ApiError(res.status, reason);
  }
  return res.json() as Promise<T>;
}

export function useApi<T>(path: string | null, refreshInterval = 0) {
  return useSWR<T, ApiError>(path, (url) => api<T>(url), {
    refreshInterval,
    revalidateOnFocus: true,
    dedupingInterval: 1500,
    keepPreviousData: true,
  });
}

export const short = (id: string | null | undefined, n = 8) =>
  id ? id.slice(0, n) : "—";
export const stamp = (date: string | null | undefined) =>
  date
    ? new Date(date).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "Not measured";
export const number = (value: number | null | undefined, digits = 1) =>
  value == null
    ? "Not measured"
    : new Intl.NumberFormat(undefined, {
        maximumFractionDigits: digits,
      }).format(value);
export const formatMetric = (
  value: number | null | undefined,
  unit: string,
) => {
  if (value == null) return "Not measured";
  if (unit === "%") return `${number(value, 1)}%`;
  if (unit === "ms")
    return value >= 1000
      ? `${number(value / 1000, 2)}s`
      : `${number(value, 2)}ms`;
  if (unit === "USD")
    return `$${value < 0.01 && value > 0 ? value.toFixed(5) : value.toFixed(3)}`;
  return `${number(value, 0)} ${unit}`;
};

export const selectMetric = <T extends { key: string }>(
  metrics: T[] | undefined,
  key: string,
): T | undefined => metrics?.find((x) => x.key === key);
