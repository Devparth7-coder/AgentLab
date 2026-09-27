import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import {
  cookieName,
  cookieValue,
  isAuthorized,
  maxAge,
  webAuthDisabled,
} from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(
    {
      authorized: await isAuthorized(),
      demo: webAuthDisabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== request.headers.get("host"))
        throw new Error("Origin mismatch");
    } catch {
      return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
    }
  }
  const body = (await request.json().catch(() => ({}))) as {
    accessKey?: string;
  };
  const provided = typeof body.accessKey === "string" ? body.accessKey : "";
  const expected = process.env.WEB_ACCESS_KEY ?? "";
  if (
    !expected ||
    expected.length < 32 ||
    provided.length !== expected.length ||
    !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  ) {
    return NextResponse.json(
      { error: "Invalid access key" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const response = NextResponse.json({ authorized: true });
  response.cookies.set(cookieName, cookieValue(), {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie(request),
    path: "/",
    maxAge,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ authorized: false });
  response.cookies.set(cookieName, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: secureCookie(request),
    path: "/",
    maxAge: 0,
  });
  return response;
}

function secureCookie(request: NextRequest): boolean {
  // NextURL can reflect the bind address (0.0.0.0) rather than the browser's Host.
  const browserHost = request.headers.get("host")?.split(":")[0] ?? "";
  const local = ["localhost", "127.0.0.1", "0.0.0.0"].includes(browserHost);
  return (
    request.nextUrl.protocol === "https:" ||
    (process.env.NODE_ENV === "production" && !local)
  );
}
