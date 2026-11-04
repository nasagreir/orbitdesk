"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Copy, LoaderCircle, Shield, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  RemoteSitePublic,
  SiteConfigPayload,
  SiteProbeResult,
} from "@/lib/types";

const fieldClass =
  "h-9 border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500";

const emptyForm = {
  name: "",
  haUrl: "",
  haToken: "",
  entityPrefix: "",
  interfaceName: "wg-orbit",
  address: "10.77.0.1/24",
  listenPort: "51820",
  endpoint: "",
  peerPublicKey: "",
  allowedIps: "10.77.0.2/32",
  persistentKeepalive: "25",
};

type FormState = typeof emptyForm;

export function RemoteSitesPanel() {
  const [sites, setSites] = useState<RemoteSitePublic[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [config, setConfig] = useState<
    (SiteConfigPayload & { siteName: string }) | null
  >(null);
  const [copied, setCopied] = useState<"host" | "peer" | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [probes, setProbes] = useState<Record<string, SiteProbeResult>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/sites", { cache: "no-store" });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? `HTTP ${res.status}`);
    }
    const body = (await res.json()) as { sites: RemoteSitePublic[] };
    setSites(body.sites);
    setError(null);
  }, []);

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof Error ? err.message : "Failed to load sites");
    });
  }, [load]);

  function setField(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onCreate(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const listenPort = form.listenPort.trim()
        ? Number(form.listenPort)
        : undefined;
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          haUrl: form.haUrl,
          haToken: form.haToken,
          entityPrefix: form.entityPrefix || undefined,
          interfaceName: form.interfaceName || undefined,
          address: form.address,
          listenPort: Number.isInteger(listenPort) ? listenPort : undefined,
          endpoint: form.endpoint,
          peerPublicKey: form.peerPublicKey,
          allowedIps: form.allowedIps,
          persistentKeepalive: Number.isInteger(Number(form.persistentKeepalive))
            ? Number(form.persistentKeepalive)
            : 25,
        }),
      });
      const body = (await res.json()) as SiteConfigPayload & {
        site?: RemoteSitePublic;
        error?: string;
      };
      if (!res.ok || !body.site) {
        throw new Error(body.error ?? "Could not save site");
      }
      setConfig({
        siteName: body.site.name,
        interfaceConf: body.interfaceConf,
        remotePeerSnippet: body.remotePeerSnippet,
        warning: body.warning,
      });
      setForm({ ...emptyForm, haToken: "" });
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save site");
    } finally {
      setSaving(false);
    }
  }

  async function showConfig(site: RemoteSitePublic) {
    setPendingId(site.id);
    try {
      const res = await fetch(`/api/sites/${site.id}/config`, {
        cache: "no-store",
      });
      const body = (await res.json()) as SiteConfigPayload & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load config");
      setConfig({ siteName: site.name, ...body });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not load config");
    } finally {
      setPendingId(null);
    }
  }

  async function probe(site: RemoteSitePublic) {
    setPendingId(site.id);
    try {
      const res = await fetch(`/api/sites/${site.id}/probe`, { method: "POST" });
      const body = (await res.json()) as SiteProbeResult & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Probe failed");
      setProbes((current) => ({ ...current, [site.id]: body }));
    } catch (err) {
      setProbes((current) => ({
        ...current,
        [site.id]: {
          siteId: site.id,
          haReachable: false,
          haMessage: err instanceof Error ? err.message : "Probe failed",
          deviceCount: 0,
          tunnel: {
            available: false,
            up: false,
            latestHandshake: null,
            message: "Probe failed",
          },
        },
      }));
    } finally {
      setPendingId(null);
    }
  }

  async function remove(site: RemoteSitePublic) {
    setPendingId(site.id);
    try {
      const res = await fetch(`/api/sites/${site.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Could not delete site");
      }
      if (config?.siteName === site.name) setConfig(null);
      setConfirmDelete(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not delete site");
    } finally {
      setPendingId(null);
    }
  }

  async function copyText(which: "host" | "peer", value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80 sm:text-sm">
          WireGuard
        </p>
        <h2 className="mt-1 font-heading text-2xl text-white sm:text-3xl">
          Remote sites
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-400 sm:text-base">
          Add each cabin or shop you reach over WireGuard. OrbitDesk polls that
          site&apos;s Home Assistant and folds its dishes into the fleet. The
          tunnel itself runs on the Proxmox host; this page stores the peer and
          prints a config you can install there.
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 p-4 text-sm text-rose-100">
          {error}
        </div>
      )}

      {sites === null && !error && (
        <div className="h-40 animate-pulse rounded-2xl bg-white/5" />
      )}

      {sites && sites.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.03] p-5 text-sm text-slate-400">
          No remote sites yet. Add one below and the fleet will show it next to
          this host, including a down site that never answers.
        </div>
      )}

      {sites && sites.length > 0 && (
        <div className="grid gap-3">
          {sites.map((site) => {
            const probeResult = probes[site.id];
            const busy = pendingId === site.id;
            return (
              <article
                key={site.id}
                className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-4 sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading text-lg text-white">
                        {site.name}
                      </h3>
                      <Badge
                        variant="outline"
                        className="border-cyan-400/30 text-cyan-200"
                      >
                        <Shield className="mr-1 size-3" />
                        {site.wireguard.interfaceName}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate font-mono text-xs text-slate-400">
                      {site.haUrl}
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-slate-500">
                      peer {site.wireguard.peerPublicKey.slice(0, 16)}…
                      {" · "}
                      {site.wireguard.endpoint}
                      {" · "}
                      {site.wireguard.allowedIps}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void probe(site)}
                      className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    >
                      {busy ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : null}
                      Test connection
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void showConfig(site)}
                      className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                    >
                      WireGuard config
                    </Button>
                    {confirmDelete === site.id ? (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => void remove(site)}
                      >
                        <Trash2 className="size-4" />
                        Confirm delete
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setConfirmDelete(site.id)}
                        className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
                      >
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
                {probeResult && (
                  <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <p
                      className={
                        probeResult.haReachable
                          ? "text-emerald-300"
                          : "text-amber-200"
                      }
                    >
                      Home Assistant: {probeResult.haMessage}
                    </p>
                    <p
                      className={
                        probeResult.tunnel.up
                          ? "text-emerald-300"
                          : "text-slate-400"
                      }
                    >
                      Tunnel: {probeResult.tunnel.message}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      {config && (
        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-heading text-lg text-white">
                {config.siteName} WireGuard
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-300">
                {config.warning} Install the interface block on the Proxmox host
                (or merge the peer into an existing interface). Install the peer
                block on the remote site. Several sites can share one interface
                by combining their peer blocks.
              </p>
            </div>
          </div>
          <ConfigBlock
            title="This host"
            value={config.interfaceConf}
            copied={copied === "host"}
            onCopy={() => void copyText("host", config.interfaceConf)}
          />
          <ConfigBlock
            title="Remote peer"
            value={config.remotePeerSnippet}
            copied={copied === "peer"}
            onCopy={() => void copyText("peer", config.remotePeerSnippet)}
          />
        </div>
      )}

      <form
        onSubmit={(event) => void onCreate(event)}
        className="rounded-2xl border border-white/10 bg-[#0c1622]/80 p-4 sm:p-5"
      >
        <h3 className="font-heading text-lg text-white">Add a site</h3>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Site name" htmlFor="site-name">
            <Input
              id="site-name"
              required
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="North barn"
              className={fieldClass}
            />
          </Field>
          <Field label="Home Assistant URL" htmlFor="site-ha-url">
            <Input
              id="site-ha-url"
              required
              value={form.haUrl}
              onChange={(event) => setField("haUrl", event.target.value)}
              placeholder="http://10.77.0.2:8123"
              className={fieldClass}
            />
          </Field>
          <Field label="Long-lived token" htmlFor="site-token">
            <Input
              id="site-token"
              required
              type="password"
              autoComplete="off"
              value={form.haToken}
              onChange={(event) => setField("haToken", event.target.value)}
              placeholder="Stored on this server"
              className={fieldClass}
            />
          </Field>
          <Field label="Entity prefix (optional)" htmlFor="site-prefix">
            <Input
              id="site-prefix"
              value={form.entityPrefix}
              onChange={(event) => setField("entityPrefix", event.target.value)}
              placeholder="sensor.starlink"
              className={fieldClass}
            />
          </Field>
          <Field label="Peer public key" htmlFor="site-peer">
            <Input
              id="site-peer"
              required
              value={form.peerPublicKey}
              onChange={(event) => setField("peerPublicKey", event.target.value)}
              placeholder="Base64 WireGuard public key"
              className={`${fieldClass} font-mono text-xs`}
            />
          </Field>
          <Field label="Remote endpoint" htmlFor="site-endpoint">
            <Input
              id="site-endpoint"
              required
              value={form.endpoint}
              onChange={(event) => setField("endpoint", event.target.value)}
              placeholder="barn.example.com:51820"
              className={fieldClass}
            />
          </Field>
          <Field label="Allowed IPs" htmlFor="site-allowed">
            <Input
              id="site-allowed"
              required
              value={form.allowedIps}
              onChange={(event) => setField("allowedIps", event.target.value)}
              placeholder="10.77.0.2/32, 192.168.50.0/24"
              className={fieldClass}
            />
          </Field>
          <Field label="Tunnel address on this host" htmlFor="site-address">
            <Input
              id="site-address"
              required
              value={form.address}
              onChange={(event) => setField("address", event.target.value)}
              placeholder="10.77.0.1/24"
              className={fieldClass}
            />
          </Field>
          <Field label="Interface" htmlFor="site-iface">
            <Input
              id="site-iface"
              value={form.interfaceName}
              onChange={(event) => setField("interfaceName", event.target.value)}
              className={fieldClass}
            />
          </Field>
          <Field label="Listen port" htmlFor="site-port">
            <Input
              id="site-port"
              inputMode="numeric"
              value={form.listenPort}
              onChange={(event) => setField("listenPort", event.target.value)}
              className={fieldClass}
            />
          </Field>
        </div>
        {formError && (
          <p className="mt-3 text-sm text-rose-300">{formError}</p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? <LoaderCircle className="size-4 animate-spin" /> : null}
            Save site and generate keys
          </Button>
          <p className="text-xs text-slate-500">
            The token and private key stay in the data directory. The fleet
            list only shows the public peer.
          </p>
        </div>
      </form>
    </section>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-slate-400">
        {label}
      </Label>
      {children}
    </div>
  );
}

function ConfigBlock({
  title,
  value,
  copied,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-400">{title}</p>
        <Button
          type="button"
          variant="outline"
          onClick={onCopy}
          className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10"
        >
          {copied ? (
            <CheckCircle2 className="size-4 text-emerald-400" />
          ) : (
            <Copy className="size-4" />
          )}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/40 p-3 font-mono text-xs leading-relaxed text-slate-200">
        {value}
      </pre>
    </div>
  );
}
