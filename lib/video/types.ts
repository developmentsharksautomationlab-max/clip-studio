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
}

export type ClipFormat = "vertical" | "original";

export interface RenderedClip {
  index: number;
  start: number;
  end: number;
  format: ClipFormat;
  filename: string;
  url: string;
}

export type ClipMode = "clips" | "caption-only";

export interface Job {
  id: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  sourceFilename: string;
  sourceExt: string;
  captionStyle: CaptionChoice;
  mode: ClipMode;
  clipCount?: number;
  languageId: string;
  progressMessage?: string;
  error?: string;
  clips: RenderedClip[];
}
