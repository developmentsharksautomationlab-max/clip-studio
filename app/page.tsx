"use client";

import { useState, type DragEvent, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import {
  CAPTION_STYLES,
  CAPTION_STYLE_ORDER,
  type CaptionStyleId,
} from "@/lib/video/caption-styles";
import { LANGUAGE_OPTIONS, DEFAULT_LANGUAGE_ID } from "@/lib/video/languages";
import type { ClipFormat, ClipMode } from "@/lib/video/types";

const FORMAT_OPTIONS: { id: ClipFormat; label: string; hint: string }[] = [
  { id: "vertical", label: "Vertical", hint: "9:16" },
  { id: "original", label: "Original", hint: "source ratio" },
  { id: "square", label: "Square", hint: "1:1" },
];

const OUTLINE_SHADOW = "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000";

function StylePreview({ styleId }: { styleId: CaptionStyleId }) {
  const style = CAPTION_STYLES[styleId];
  const solidColor = style.id === "classic-yellow" ? "#facc15" : "#ffffff";

  return (
    <div className="flex h-16 items-center justify-center rounded-lg bg-slate-800 px-2">
      <span
        style={{
          fontFamily: style.fontName === "Impact" ? "Impact, 'Arial Narrow', sans-serif" : "Arial, sans-serif",
          color: solidColor,
          textTransform: style.allCaps ? "uppercase" : "none",
          textShadow: OUTLINE_SHADOW,
          fontSize: style.id === "clean-minimal" ? 11 : 15,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: "center",
        }}
      >
        {style.id === "bold-impact" ? (
          <>
            <span style={{ color: "#ffc800" }}>Sample</span> text
          </>
        ) : (
          "Sample text"
        )}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-medium text-gray-900">{children}</span>;
}

export default function Home() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState<ClipMode>("clips");
  const [clipCount, setClipCount] = useState("");
  const [language, setLanguage] = useState(DEFAULT_LANGUAGE_ID);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyleId>("bold-impact");
  const [formats, setFormats] = useState<Set<ClipFormat>>(new Set(["vertical", "original"]));
  const [removeFillers, setRemoveFillers] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(false);
  const [watermarkFile, setWatermarkFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleFormat(id: ClipFormat) {
    setFormats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // keep at least one format selected
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFile(dropped);
  }

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!file) return;

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("mode", mode);
      if (mode === "clips" && clipCount.trim() !== "") {
        formData.append("clipCount", clipCount.trim());
      }
      formData.append("language", language);
      formData.append("captionStyle", captionsEnabled ? captionStyle : "none");
      for (const format of formats) formData.append("formats", format);
      formData.append("removeFillers", String(removeFillers));
      if (watermarkEnabled && watermarkFile) {
        formData.append("watermark", watermarkFile);
      }

      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed.");
      }

      router.push(`/studio/${data.jobId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
      setUploading(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-gray-50">
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <div className="mb-10 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            Turn long videos into scroll-stopping clips
          </h1>
          <p className="mt-3 text-gray-600">
            Upload a video and get short, captioned clips — ready in vertical or original size.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              isDragging ? "border-gray-900 bg-gray-50" : "border-gray-300 hover:border-gray-400"
            }`}
          >
            <input
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <span className="text-sm font-medium text-gray-900">
              {file ? file.name : "Click to choose a video, or drag one here"}
            </span>
            <span className="text-xs text-gray-500">MP4, MOV, WEBM, MKV, or M4V</span>
          </label>

          <div className="mt-8">
            <SectionLabel>Output</SectionLabel>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode("clips")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  mode === "clips" ? "border-gray-900 ring-1 ring-gray-900" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Split into clips</p>
                <p className="text-[11px] leading-snug text-gray-500">
                  Cut the video into several short, captioned pieces.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("caption-only")}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  mode === "caption-only"
                    ? "border-gray-900 ring-1 ring-gray-900"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <p className="text-sm font-medium text-gray-900">Caption whole video</p>
                <p className="text-[11px] leading-snug text-gray-500">
                  Keep it as one video, just add captions.
                </p>
              </button>
            </div>

            {mode === "clips" && (
              <div className="mt-3 flex items-center gap-3">
                <label htmlFor="clipCount" className="text-sm text-gray-600">
                  Number of clips
                </label>
                <input
                  id="clipCount"
                  type="number"
                  min={1}
                  max={20}
                  placeholder="Auto"
                  value={clipCount}
                  onChange={(e) => setClipCount(e.target.value)}
                  className="w-24 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
                />
              </div>
            )}
          </div>

          <div className="mt-8">
            <SectionLabel>Formats</SectionLabel>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {FORMAT_OPTIONS.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  onClick={() => toggleFormat(option.id)}
                  className={`rounded-xl border p-3 text-left transition-colors ${
                    formats.has(option.id)
                      ? "border-gray-900 ring-1 ring-gray-900"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="text-[11px] text-gray-500">{option.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8">
            <label className="flex cursor-pointer items-center justify-between">
              <div>
                <SectionLabel>Remove filler words &amp; silences</SectionLabel>
                <p className="text-[11px] leading-snug text-gray-500">
                  Auto-cuts &quot;um&quot;/&quot;uh&quot; and long dead-air pauses for a tighter edit.
                </p>
              </div>
              <input
                type="checkbox"
                checked={removeFillers}
                onChange={(e) => setRemoveFillers(e.target.checked)}
                className="h-4 w-4 shrink-0 rounded border-gray-300 accent-gray-900"
              />
            </label>
          </div>

          <div className="mt-8">
            <label htmlFor="language" className="block">
              <SectionLabel>Language</SectionLabel>
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-900 focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            {(language === "hi-roman" || language === "ur-roman") && (
              <p className="mt-2 text-[11px] leading-snug text-gray-500">
                Best-effort: there&apos;s no dedicated transliteration mode, so this nudges the
                model to write it phonetically in Latin script. Quality can vary.
              </p>
            )}
          </div>

          <div className="mt-8">
            <label className="flex cursor-pointer items-center justify-between">
              <SectionLabel>Add captions</SectionLabel>
              <input
                type="checkbox"
                checked={captionsEnabled}
                onChange={(e) => setCaptionsEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-gray-900"
              />
            </label>

            {captionsEnabled && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {CAPTION_STYLE_ORDER.map((id) => (
                  <button
                    type="button"
                    key={id}
                    onClick={() => setCaptionStyle(id)}
                    className={`rounded-xl border p-2 text-left transition-colors ${
                      captionStyle === id
                        ? "border-gray-900 ring-1 ring-gray-900"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <StylePreview styleId={id} />
                    <p className="mt-2 text-xs font-medium text-gray-900">{CAPTION_STYLES[id].label}</p>
                    <p className="text-[11px] leading-snug text-gray-500">{CAPTION_STYLES[id].description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="mt-8">
            <label className="flex cursor-pointer items-center justify-between">
              <SectionLabel>Add watermark</SectionLabel>
              <input
                type="checkbox"
                checked={watermarkEnabled}
                onChange={(e) => setWatermarkEnabled(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-gray-900"
              />
            </label>

            {watermarkEnabled && (
              <label className="mt-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-gray-300 px-6 py-6 text-center transition-colors hover:border-gray-400">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => setWatermarkFile(e.target.files?.[0] ?? null)}
                />
                <span className="text-sm font-medium text-gray-900">
                  {watermarkFile ? watermarkFile.name : "Click to choose a logo image"}
                </span>
                <span className="text-xs text-gray-500">PNG, JPG, or WEBP — placed bottom-right</span>
              </label>
            )}
          </div>

          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={!file || uploading}
            className="mt-8 w-full rounded-xl bg-gray-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
          >
            {uploading ? "Uploading..." : "Generate clips"}
          </button>
        </form>
      </div>
    </main>
  );
}
