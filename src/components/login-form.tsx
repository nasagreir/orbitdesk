"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Orbit, KeyRound, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/";

  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json();
        if (body.authenticated) {
          router.replace(next);
          return;
        }
        setNeedsSetup(Boolean(body.needsSetup));
      } catch {
        /* ignore */
      }
    })();
  }, [next, router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json();
      if (!res.ok) {
        setNeedsSetup(Boolean(body.needsSetup));
        throw new Error(body.error ?? "Login failed");
      }
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="starfield absolute inset-0 opacity-70" />
      </div>

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[color:var(--card)]/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <Orbit className="size-5" />
          </span>
          <div>
            <h1 className="font-heading text-2xl text-white">OrbitDesk</h1>
            <p className="text-sm text-slate-400">Sign in to the control plane</p>
          </div>
        </div>

        {needsSetup && (
          <div className="mb-4 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">
            <p className="flex items-start gap-2">
              <Terminal className="mt-0.5 size-4 shrink-0" />
              <span>
                No users yet. On the LXC host shell:
                <code className="mt-2 block rounded-lg bg-black/40 px-2 py-1 font-mono text-xs text-amber-50">
                  orbitdesk-user create admin
                </code>
              </span>
            </p>
          </div>
        )}

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="border-white/10 bg-white/5"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-white/10 bg-white/5"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-rose-300" role="alert">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300"
          >
            <KeyRound className="size-4" />
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <p className="mt-5 text-xs leading-relaxed text-slate-500">
          Forgot password? Recover from the LXC CLI:
          <code className="mt-1 block rounded-lg bg-black/30 px-2 py-1 font-mono text-[11px] text-slate-300">
            orbitdesk-user reset-password &lt;username&gt;
          </code>
        </p>
      </div>
    </div>
  );
}
