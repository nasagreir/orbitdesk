"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Orbit, Settings2, Satellite } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Fleet", icon: Satellite },
  { href: "/settings", label: "Connections", icon: Settings2 },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
        const body = await res.json();
        if (body.needsSetup) {
          router.replace("/setup");
          return;
        }
        setUsername(body.username ?? null);
      } catch {
        setUsername(null);
      }
    })();
  }, [pathname, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="relative min-h-full flex flex-col">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="starfield absolute inset-0 opacity-70" />
        <div className="atmosphere-glow absolute -top-32 left-1/2 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.18),transparent_65%)] blur-2xl" />
        <div className="atmosphere-glow absolute bottom-0 right-0 h-72 w-72 rounded-full bg-[radial-gradient(circle,rgba(16,185,129,0.12),transparent_70%)] blur-3xl" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-[color:var(--background)]/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 shadow-[0_0_24px_rgba(34,211,238,0.15)] transition group-hover:border-cyan-300/50">
              <Orbit className="size-5 animate-[spin_12s_linear_infinite]" />
            </span>
            <span>
              <span className="block font-heading text-lg tracking-tight text-white sm:text-xl">
                OrbitDesk
              </span>
              <span className="block text-xs text-slate-400">
                Starlink · Home Assistant · Grok
              </span>
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1">
              {links.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition",
                      active
                        ? "bg-cyan-400/15 text-cyan-200"
                        : "text-slate-400 hover:text-slate-200",
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="hidden sm:inline">{label}</span>
                  </Link>
                );
              })}
            </nav>

            <ThemeToggle />

            {username && (
              <div className="hidden items-center gap-2 sm:flex">
                <span className="max-w-[8rem] truncate text-xs text-slate-400">
                  {username}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void logout()}
                  className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                >
                  <LogOut className="size-4" />
                  Log out
                </Button>
              </div>
            )}
            {username && (
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                onClick={() => void logout()}
                className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10 sm:hidden"
                title="Log out"
              >
                <LogOut className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
