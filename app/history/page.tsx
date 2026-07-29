"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ClipMode, JobStatus } from "@/lib/video/types";

interface JobSummary {
  id: string;
  status: JobStatus;
  mode: ClipMode;
  sourceFilename: string;
  createdAt: string;
  updatedAt: string;
  clipCount: number;
}

const STATUS_STYLES: Record<JobStatus, string> = {
  queued: "bg-gray-100 text-gray-600",
  transcribing: "bg-blue-100 text-blue-700",
  segmenting: "bg-blue-100 text-blue-700",
  rendering: "bg-blue-100 text-blue-700",
  done: "bg-emerald-100 text-emerald-700",
  error: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  transcribing: "Transcribing",
  segmenting: "Segmenting",
  rendering: "Rendering",
  done: "Done",
  error: "Error",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/jobs", { cache: "no-store" });
        if (!res.ok) throw new Error("Could not load job history.");
        const data = await res.json();
        if (!cancelled) setJobs(data.jobs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load job history.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="flex flex-1 flex-col bg-gray-50">
      <div className="mx-auto w-full max-w-3xl px-6 py-12">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Job history</h1>
          <Link
            href="/"
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            New video
          </Link>
        </div>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        {!error && jobs === null && <p className="mt-6 text-sm text-gray-500">Loading...</p>}

        {jobs !== null && jobs.length === 0 && (
          <p className="mt-6 text-sm text-gray-500">No videos processed yet.</p>
        )}

        {jobs !== null && jobs.length > 0 && (
          <div className="mt-6 flex flex-col divide-y divide-gray-200 rounded-2xl border border-gray-200 bg-white shadow-sm">
            {jobs.map((job) => (
              <Link
                key={job.id}
                href={`/studio/${job.id}`}
                className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900">{job.sourceFilename}</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {formatDate(job.createdAt)} · {job.mode === "caption-only" ? "Caption only" : `${job.clipCount} clips`}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLES[job.status]}`}
                >
                  {STATUS_LABELS[job.status]}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
