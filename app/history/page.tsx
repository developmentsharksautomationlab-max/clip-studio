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

function EmptyState() {
  return (
    <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10 text-gray-300">
        <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 9.5 15 12 10 14.5V9.5Z" fill="currentColor" />
      </svg>
      <p className="text-sm font-medium text-gray-900">No videos processed yet</p>
      <p className="text-sm text-gray-500">Your rendered jobs will show up here once you generate some clips.</p>
      <Link
        href="/"
        className="mt-2 rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
      >
        Upload a video
      </Link>
    </div>
  );
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
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Job history</h1>
            <p className="mt-1 text-sm text-gray-500">Every video you&apos;ve sent through Clip Studio.</p>
          </div>
          <Link
            href="/"
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            New video
          </Link>
        </div>

        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        {!error && jobs === null && (
          <div className="mt-6 flex flex-col divide-y divide-gray-200 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="h-4 w-40 animate-pulse rounded bg-gray-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
              </div>
            ))}
          </div>
        )}

        {jobs !== null && jobs.length === 0 && <EmptyState />}

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
