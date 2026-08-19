"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ChatPanel from "./chat-panel";
import type { JobStatus } from "@/lib/video/types";

interface JobSummary {
  id: string;
  status: JobStatus;
  sourceFilename: string;
}

// Mounted once in the root layout so the assistant is reachable from every
// page, not just a specific video's studio view. On a /studio/[id] page it's
// grounded in that job; everywhere else it falls back to the most recently
// finished job, so there's still something for it to talk about.
export default function ChatWidget() {
  const pathname = usePathname();
  const studioJobId = pathname?.match(/^\/studio\/([^/]+)/)?.[1];

  const [fallbackJob, setFallbackJob] = useState<JobSummary | null>(null);
  const [checkedFallback, setCheckedFallback] = useState(false);

  useEffect(() => {
    if (studioJobId) return;
    let cancelled = false;

    fetch("/api/jobs", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { jobs?: JobSummary[] }) => {
        if (cancelled) return;
        const latestDone = (data.jobs ?? []).find((j) => j.status === "done");
        setFallbackJob(latestDone ?? null);
      })
      .catch(() => {
        if (!cancelled) setFallbackJob(null);
      })
      .finally(() => {
        if (!cancelled) setCheckedFallback(true);
      });

    return () => {
      cancelled = true;
    };
  }, [studioJobId]);

  if (studioJobId) {
    return <ChatPanel key={studioJobId} jobId={studioJobId} />;
  }

  if (!checkedFallback || !fallbackJob) return null;

  return <ChatPanel key={fallbackJob.id} jobId={fallbackJob.id} contextLabel={fallbackJob.sourceFilename} />;
}
