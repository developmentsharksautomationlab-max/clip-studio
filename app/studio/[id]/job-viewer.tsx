"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ClipFormat = "vertical" | "original";

interface RenderedClip {
  index: number;
  start: number;
  end: number;
  format: ClipFormat;
  filename: string;
  url: string;
}

type JobStatus = "queued" | "transcribing" | "segmenting" | "rendering" | "done" | "error";
type ClipMode = "clips" | "caption-only";

interface Job {
  id: string;
  status: JobStatus;
  mode: ClipMode;
  progressMessage?: string;
  error?: string;
  clips: RenderedClip[];
}

function groupClipsByIndex(clips: RenderedClip[]) {
  const byIndex = new Map<number, { index: number; vertical?: RenderedClip; original?: RenderedClip }>();

  for (const clip of clips) {
    const group = byIndex.get(clip.index) ?? { index: clip.index };
    group[clip.format] = clip;
    byIndex.set(clip.index, group);
  }

  return [...byIndex.values()].sort((a, b) => a.index - b.index);
}

const STAGE_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  transcribing: "Transcribing audio",
  segmenting: "Finding clip-worthy moments",
  rendering: "Rendering clips",
  done: "Done",
  error: "Error",
};

function Spinner() {
  return (
    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gray-300 border-t-gray-900" />
  );
}

function DownloadButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      download
      className="rounded-lg border border-gray-300 bg-white py-1.5 text-center text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
    >
      {label}
    </a>
  );
}

function StatusScreen({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 p-8">
      {children}
    </main>
  );
}

export default function JobViewer({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const interval = setInterval(poll, 2000);

    async function poll() {
      if (cancelled) return;
      const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setLoadError("Job not found.");
        clearInterval(interval);
        return;
      }
      const data = await res.json();
      setJob(data.job);
      if (data.job.status === "done" || data.job.status === "error") {
        clearInterval(interval);
      }
    }

    poll();

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId]);

  if (loadError) {
    return (
      <StatusScreen>
        <p className="font-medium text-red-600">{loadError}</p>
        <Link href="/" className="text-sm font-medium text-gray-900 underline underline-offset-2">
          Try another video
        </Link>
      </StatusScreen>
    );
  }

  if (!job) {
    return (
      <StatusScreen>
        <Spinner />
        <p className="text-gray-500">Loading...</p>
      </StatusScreen>
    );
  }

  if (job.status === "error") {
    return (
      <StatusScreen>
        <p className="max-w-md text-center font-medium text-red-600">
          {job.error || "Something went wrong."}
        </p>
        <Link href="/" className="text-sm font-medium text-gray-900 underline underline-offset-2">
          Try another video
        </Link>
      </StatusScreen>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          {job.mode === "caption-only" ? "Your video" : "Your clips"}
        </h1>

        {job.status !== "done" && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
            <Spinner />
            <div>
              <p className="text-sm font-medium text-gray-900">{STAGE_LABELS[job.status]}</p>
              {job.progressMessage && <p className="text-sm text-gray-500">{job.progressMessage}</p>}
            </div>
          </div>
        )}

        {job.clips.length > 0 && (
          <div className="mt-8 flex flex-col gap-5">
            {groupClipsByIndex(job.clips).map(({ index, vertical, original }) => (
              <div
                key={index}
                className="flex flex-wrap items-start gap-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
              >
                <span className="w-16 shrink-0 pt-1 text-sm font-medium text-gray-500">
                  {job.mode === "caption-only" ? "Video" : `Clip ${index + 1}`}
                </span>

                {vertical && (
                  <div className="flex w-40 flex-col gap-2">
                    <video
                      src={vertical.url}
                      controls
                      className="w-full aspect-[9/16] rounded-lg bg-black object-cover"
                    />
                    <DownloadButton href={vertical.url} label="Download 9:16" />
                  </div>
                )}

                {original && (
                  <div className="flex w-72 flex-col gap-2">
                    <video src={original.url} controls className="w-full rounded-lg bg-black" />
                    <DownloadButton href={original.url} label="Download original" />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {job.status === "done" && (
          <Link
            href="/"
            className="mt-8 inline-block rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-gray-700"
          >
            Make more clips
          </Link>
        )}
      </div>
    </main>
  );
}
