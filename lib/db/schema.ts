import { pgTable, text, timestamp, jsonb, boolean, integer } from "drizzle-orm/pg-core";
import type { CaptionChoice } from "../video/caption-styles";
import type { ClipFormat, ClipMode, JobStatus, RenderedClip, Transcript } from "../video/types";

// One table, mirroring lib/video/types.ts's Job shape closely: scalar fields
// that the worker's polling query needs (status, createdAt) are real
// columns; the rest is jsonb. Deliberately not normalized into a separate
// clips table — this stays a thin persistence layer for the existing Job
// type, not a new data model.
export const jobs = pgTable("jobs", {
  id: text("id").primaryKey(),
  status: text("status").$type<JobStatus>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  sourceFilename: text("source_filename").notNull(),
  sourceExt: text("source_ext").notNull(),
  sourceUrl: text("source_url"),
  captionStyle: text("caption_style").$type<CaptionChoice>().notNull(),
  mode: text("mode").$type<ClipMode>().notNull(),
  clipCount: integer("clip_count"),
  targetDurationSeconds: integer("target_duration_seconds"),
  languageId: text("language_id").notNull(),
  captionLanguageId: text("caption_language_id"),
  formats: jsonb("formats").$type<ClipFormat[]>().notNull(),
  removeFillers: boolean("remove_fillers").notNull(),
  progressMessage: text("progress_message"),
  error: text("error"),
  transcript: jsonb("transcript").$type<Transcript>(),
  clips: jsonb("clips").$type<RenderedClip[]>().notNull().default([]),
});
