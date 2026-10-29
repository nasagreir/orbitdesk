import { NextResponse } from "next/server";
import { z } from "zod";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { userCount, verifyUser } from "@/lib/auth/users";

const bodySchema = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const count = await userCount();
    if (count === 0) {
      return NextResponse.json(
        {
          error:
            "No users configured. Create one in the LXC: orbitdesk-user create admin",
          needsSetup: true,
        },
        { status: 403 },
      );
    }

    const json = await request.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
    }

    const user = await verifyUser(parsed.data.username, parsed.data.password);
    if (!user) {
      return NextResponse.json(
        { error: "Invalid username or password" },
        { status: 401 },
      );
    }

    const token = await createSessionToken(user.username);
    const response = NextResponse.json({
      ok: true,
      username: user.username,
    });
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Login failed",
      },
      { status: 500 },
    );
  }
}
