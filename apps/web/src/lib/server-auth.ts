import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

const cookieName = "agentlab_session";
const maxAge = 8 * 60 * 60;

export function webAuthDisabled() {
  // Public proxy with embedded backend admin key would be a serious vulnerability.
  // Only permit unguarded BFF when running the Next development server.
  return (
    process.env.WEB_AUTH_MODE === "disabled" &&
    process.env.NODE_ENV !== "production"
  );
}

function secret() {
  const value = process.env.WEB_SESSION_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && value.length < 32)
    throw new Error("WEB_SESSION_SECRET must be >= 32 characters");
  return value;
}

export function cookieValue() {
  const expires = Math.floor(Date.now() / 1000) + maxAge;
  const timestamp = String(expires);
  const signature = createHmac("sha256", secret())
    .update(timestamp)
    .digest("hex");
  return `${timestamp}.${signature}`;
}

export async function isAuthorized(): Promise<boolean> {
  if (webAuthDisabled()) return true;
  const raw = (await cookies()).get(cookieName)?.value;
  if (!raw) return false;
  const [timestamp, signature] = raw.split(".");
  if (
    !timestamp ||
    !signature ||
    !/^\d{10}$/.test(timestamp) ||
    Number(timestamp) < Date.now() / 1000
  )
    return false;
  const expected = createHmac("sha256", secret())
    .update(timestamp)
    .digest("hex");
  if (signature.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export { cookieName, maxAge };
