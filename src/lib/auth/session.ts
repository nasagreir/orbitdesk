import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "orbitdesk_session";

export interface SessionPayload {
  sub: string;
  username: string;
}

function getSecret() {
  const secret =
    process.env.AUTH_SECRET ?? process.env.ORBITDESK_AUTH_SECRET ?? "";
  if (!secret || secret.length < 16) {
    // Dev fallback so local demo still boots; production installer sets AUTH_SECRET
    if (process.env.NODE_ENV !== "production") {
      return new TextEncoder().encode(
        "orbitdesk-dev-secret-change-me-32b",
      );
    }
    throw new Error(
      "AUTH_SECRET is required in production (min 16 characters)",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  username: string,
): Promise<string> {
  return new SignJWT({ username })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(username)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(
  token: string,
): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const username =
      typeof payload.username === "string"
        ? payload.username
        : typeof payload.sub === "string"
          ? payload.sub
          : null;
    if (!username) return null;
    return { sub: username, username };
  } catch {
    return null;
  }
}

export function sessionCookieOptions(maxAgeSeconds = 60 * 60 * 24 * 7) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
