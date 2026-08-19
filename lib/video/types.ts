import type { CaptionChoice } from "./caption-styles";

export type JobStatus =
  | "queued"
  | "transcribing"
  | "segmenting"
  | "rendering"
  | "done"
  | "error";

export interface TranscriptWord {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
  words: TranscriptWord[];
}

export interface Transcript {
  language: string;
  segments: TranscriptSegment[];
}

export interface ClipCandidate {
  index: number;
  start: number;
  end: number;
  segments: TranscriptSegment[];
  title?: string;
  score?: number;
}

export type ClipFormat = "vertical" | "original" | "square";

export interface RenderedClip {
  index: number;
  start: number;
  end: number;
  format: ClipFormat;
  filename: string;
  url: string;
  title?: string;
  score?: number;
  srtUrl?: string;
}

export type ClipMode = "clips" | "caption-only";

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  sourceFilename: string;
  sourceExt: string;
  // Set only in blob-storage mode: where the worker (a separate process/
  // machine) can fetch the uploaded source video down from. In local dev
  // this stays undefined — the pipeline just reads the convention-based
  // local path from lib/video/paths.ts directly.
  sourceUrl?: string;
  captionStyle: CaptionChoice;
  mode: ClipMode;
  clipCount?: number;
  targetDurationSeconds?: number;
  languageId: string;
  // Target language for the burned-in captions/SRT — "same" (default) or
  // missing means keep the spoken language as-is. See lib/video/translate.ts.
  captionLanguageId?: string;
  formats: ClipFormat[];
  removeFillers: boolean;
  progressMessage?: string;
  error?: string;
  // Persisted once transcription finishes so the AI assistant can reason
  // about the video's content after the pipeline has moved on (it would
  // otherwise be discarded once clips are rendered).
  transcript?: Transcript;
  clips: RenderedClip[];
}
