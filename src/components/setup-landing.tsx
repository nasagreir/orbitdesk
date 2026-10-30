"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Orbit, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/theme-toggle";

export function SetupLanding() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json();
        if (body.authenticated) {
          router.replace("/");
          return;
        }
        if (!body.needsSetup) {
          router.replace("/login");
          return;
        }
      } catch {
        /* stay on setup */
      } finally {
        setChecking(false);
      }
    })();
  }, [router]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, confirmPassword }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Setup failed");
      }
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Setup failed");
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center text-slate-400">
        Preparing OrbitDesk…
      </div>
    );
  }

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="starfield absolute inset-0 opacity-80" />
        <div className="absolute -top-24 left-1/2 h-[34rem] w-[52rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.22),transparent_62%)] blur-2xl" />
        <div className="absolute bottom-0 right-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.14),transparent_70%)] blur-3xl" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_top,rgba(7,16,24,0.92),transparent)]" />
      </div>

      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-10 px-4 py-12 lg:flex-row lg:items-center lg:gap-16 lg:px-8">
        <div className="max-w-xl lg:flex-1">
          <p className="text-sm uppercase tracking-[0.28em] text-cyan-300/80">
            First start
          </p>
          <h1 className="mt-3 font-heading text-5xl tracking-tight text-white sm:text-6xl">
            OrbitDesk
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-slate-300 sm:text-lg">
            Create the operator account that unlocks your Starlink control
            plane. You’ll use this username and password every time you sign
            in.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-slate-400">
            <li className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-cyan-300" />
              Stored locally on this host — credentials never leave your LXC.
            </li>
            <li className="flex items-start gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-cyan-300" />
              Recover later with{" "}
              <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                orbitdesk-user reset-password
              </code>
            </li>
          </ul>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[color:var(--card)]/90 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
              <Orbit className="size-5" />
            </span>
            <div>
              <h2 className="font-heading text-xl text-white">
                Choose your login
              </h2>
              <p className="text-sm text-slate-400">
                Username and password for this install
              </p>
            </div>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="setup-username">Username</Label>
              <Input
                id="setup-username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border-white/10 bg-white/5"
                placeholder="admin"
                minLength={3}
                maxLength={32}
                pattern="[a-zA-Z0-9._\-]+"
                title="3–32 characters: letters, numbers, . _ -"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-password">Password</Label>
              <Input
                id="setup-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="border-white/10 bg-white/5"
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="setup-confirm">Confirm password</Label>
              <Input
                id="setup-confirm"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="border-white/10 bg-white/5"
                minLength={8}
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
              {busy ? "Creating account…" : "Create account & continue"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
