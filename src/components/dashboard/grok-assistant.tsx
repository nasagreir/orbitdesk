"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, LoaderCircle, SendHorizontal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { GrokMessage, StarlinkDevice } from "@/lib/types";

const starters = [
  "Which dish needs attention first?",
  "How do I clear high obstruction on the shop dish?",
  "Should I reboot the offline RV unit?",
];

export function GrokAssistant({
  devices,
  grokConfigured,
}: {
  devices: StarlinkDevice[];
  grokConfigured: boolean;
}) {
  const [messages, setMessages] = useState<GrokMessage[]>([
    {
      role: "assistant",
      content: grokConfigured
        ? "Grok is connected. Ask about dish health, obstruction, or recovery steps — I’ll use the current fleet snapshot."
        : "Running in local demo mode. Add GROK_API_KEY to talk to live Grok; until then I’ll answer from the current dish snapshot.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;

    const nextMessages: GrokMessage[] = [
      ...messages.filter((m) => m.role !== "system"),
      { role: "user", content },
    ];
    setMessages(nextMessages);
    setInput("");
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/grok", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.filter((m) => m.role !== "system"),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: body.content as string },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Grok request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full min-h-[28rem] flex-col rounded-2xl border border-white/10 bg-[#0c1622]/80">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <Bot className="size-4" />
          </span>
          <div>
            <h2 className="font-heading text-base text-white">Grok Ops</h2>
            <p className="text-xs text-slate-400">
              {devices.length} dish snapshot ·{" "}
              {grokConfigured ? "xAI key ready" : "demo replies"}
            </p>
          </div>
        </div>
        <Sparkles className="size-4 text-cyan-300/70" />
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
              message.role === "user"
                ? "ml-auto bg-cyan-400/15 text-cyan-50"
                : "bg-white/5 text-slate-200"
            }`}
          >
            {message.content}
          </div>
        ))}
        {busy && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-sm text-slate-400">
            <LoaderCircle className="size-4 animate-spin" />
            Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      {error && (
        <p className="px-4 pb-2 text-xs text-rose-300">{error}</p>
      )}

      <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
        {starters.map((starter) => (
          <button
            key={starter}
            type="button"
            onClick={() => void send(starter)}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 transition hover:border-cyan-400/30 hover:text-cyan-100"
          >
            {starter}
          </button>
        ))}
      </div>

      <form
        className="flex items-end gap-2 border-t border-white/10 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Grok about your Starlink fleet…"
          rows={2}
          className="min-h-[2.75rem] resize-none border-white/10 bg-white/5 text-slate-100 placeholder:text-slate-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(input);
            }
          }}
        />
        <Button
          type="submit"
          disabled={busy || !input.trim()}
          className="bg-cyan-400 text-slate-950 hover:bg-cyan-300"
        >
          <SendHorizontal className="size-4" />
        </Button>
      </form>
    </section>
  );
}
