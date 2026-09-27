import { NextRequest, NextResponse } from "next/server";
import { isAuthorized } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, context: RouteContext) {
  if (!(await isAuthorized()))
    return NextResponse.json(
      { detail: "Sign in to AGENTLAB to view evidence." },
      { status: 401 },
    );
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        throw new Error("Origin mismatch");
    } catch {
      return NextResponse.json({ detail: "Origin mismatch" }, { status: 403 });
    }
  }
  if (request.method !== "GET") {
    const size = Number(request.headers.get("content-length") ?? "0");
    if (size > 1_048_576)
      return NextResponse.json(
        { detail: "Request too large" },
        { status: 413 },
      );
  }
  const { path } = await context.params;
  if (
    !path?.length ||
    path.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    return NextResponse.json({ detail: "Invalid path" }, { status: 400 });
  }
  const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
  const apiKey = process.env.BACKEND_API_KEY ?? "";
  if (process.env.NODE_ENV === "production" && !apiKey)
    return NextResponse.json(
      { detail: "Server not configured" },
      { status: 503 },
    );
  const upstream = new URL(
    `/${path.map(encodeURIComponent).join("/")}${request.nextUrl.search}`,
    base,
  );
  const headers: Record<string, string> = {
    Accept: request.headers.get("accept") ?? "application/json",
  };
  if (apiKey) headers["X-API-Key"] = apiKey;
  if (request.method !== "GET") headers["Content-Type"] = "application/json";
  try {
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(90_000),
    });
    const content = await response.arrayBuffer();
    const out = new NextResponse(content, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        ...(response.headers.get("content-disposition")
          ? {
              "Content-Disposition": response.headers.get(
                "content-disposition",
              )!,
            }
          : {}),
      },
    });
    return out;
  } catch {
    return NextResponse.json(
      {
        detail: "AGENTLAB backend unavailable. Check API service and database.",
      },
      { status: 502 },
    );
  }
}

export { proxy as GET, proxy as POST };
