import { createHmac, timingSafeEqual } from "node:crypto";
import type { PublicUser, UserRole } from "../domain/types";

export interface TokenPayload {
  sub: string;
  role: UserRole;
  exp: number;
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7;

function base64Url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sign(value: string, secret: string): string {
  return base64Url(createHmac("sha256", secret).update(value).digest());
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function issueToken(
  user: PublicUser,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): { token: string; expiresIn: number; expiresAt: string } {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = base64Url(JSON.stringify({ sub: user.id, role: user.role, exp }));
  const unsigned = `${header}.${payload}`;
  const signature = sign(unsigned, secret);

  return {
    token: `${unsigned}.${signature}`,
    expiresIn: ttlSeconds,
    expiresAt: new Date(exp * 1000).toISOString()
  };
}

export function verifyToken(token: string, secret: string): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const unsigned = `${header}.${payload}`;
  const expectedSignature = sign(unsigned, secret);

  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  try {
    const decoded = JSON.parse(
      Buffer.from(payload.replaceAll("-", "+").replaceAll("_", "/"), "base64").toString(
        "utf8"
      )
    ) as TokenPayload;

    if (!decoded.sub || !decoded.role || !decoded.exp) {
      return null;
    }

    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}
