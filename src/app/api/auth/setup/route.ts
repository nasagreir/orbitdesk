import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { createUser, userCount } from "@/lib/auth/users";

const bodySchema = z.object({
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(200),
  confirmPassword: z.string().min(8).max(200),
});

/**
 * First-start bootstrap — only available when no users exist yet.
 * Creates the initial operator account and signs them in.
 */
export async function POST(request: Request) {
  try {
    const count = await userCount();
    if (count > 0) {
      return NextResponse.json(
        { error: "Setup already completed. Sign in instead." },
        { status: 409 },
      );
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Choose a username (3–32 chars) and a password of at least 8 characters.",
        },
        { status: 400 },
      );
    }

    if (parsed.data.password !== parsed.data.confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 },
      );
    }

    const username = await createUser(
      parsed.data.username,
      parsed.data.password,
    );
    const token = await createSessionToken(username);
    const response = NextResponse.json({ ok: true, username });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not complete setup",
      },
      { status: 500 },
    );
  }
}
