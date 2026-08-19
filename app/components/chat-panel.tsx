"use client";

import { useRef, useState, type FormEvent } from "react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// Fired whenever a tool call changes a job's clips (create_clip), so any
// mounted page showing that job's clip list (currently just the studio page)
// can refetch — this panel can be mounted anywhere in the app (see
// ChatWidget), not necessarily inside the page that owns the job's state.
export const CLIPS_CHANGED_EVENT = "clip-studio:clips-changed";

export default function ChatPanel({
  jobId,
  contextLabel,
}: {
  jobId: string | null;
  contextLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || sending || !jobId) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    setError(null);
    scrollToBottom();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId, messages: nextMessages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat request failed.");

      setMessages([...nextMessages, { role: "assistant", content: data.reply || "(no reply)" }]);
      if (data.clipsChanged) {
        window.dispatchEvent(new CustomEvent(CLIPS_CHANGED_EVENT, { detail: { jobId } }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat request failed.");
    } finally {
      setSending(false);
      scrollToBottom();
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-gray-900 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-gray-700"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-amber-400">
          <path d="M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9 12 2Z" fill="currentColor" />
        </svg>
        Ask Clip Studio
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-20 flex h-[32rem] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 shrink-0 text-amber-500">
              <path d="M12 2 14 9 21 12 14 15 12 22 10 15 3 12 10 9 12 2Z" fill="currentColor" />
            </svg>
            <p className="text-sm font-semibold text-gray-900">Clip Studio assistant</p>
          </div>
          {contextLabel && <p className="mt-0.5 truncate text-xs text-gray-500">Talking about: {contextLabel}</p>}
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="shrink-0 text-sm text-gray-500 hover:text-gray-900"
          aria-label="Close chat"
        >
          Close
        </button>
      </div>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {!jobId && (
          <p className="text-sm text-gray-500">
            I don&apos;t have a video to talk about yet — upload one and come back once it&apos;s
            done processing, then I can find moments, explain scores, or cut new clips for you.
          </p>
        )}
        {jobId && messages.length === 0 && (
          <p className="text-sm text-gray-500">
            Ask about this video — &quot;what&apos;s the most quotable moment?&quot;, &quot;why did clip 2
            score higher?&quot;, or &quot;cut a clip from 1:20 to 1:45&quot;.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
              m.role === "user"
                ? "ml-auto max-w-[85%] bg-gray-900 text-white"
                : "mr-auto max-w-[85%] bg-gray-100 text-gray-900"
            }`}
          >
            {m.content}
          </div>
        ))}
        {sending && <div className="mr-auto max-w-[85%] rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-500">Thinking...</div>}
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-gray-200 p-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!jobId}
          placeholder={jobId ? "Ask something..." : "Upload a video first"}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="submit"
          disabled={sending || !input.trim() || !jobId}
          className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  );
}
