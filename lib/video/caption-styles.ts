export type CaptionStyleId = "bold-impact" | "classic-yellow" | "clean-minimal";
export type CaptionChoice = CaptionStyleId | "none";

export interface CaptionStyleConfig {
  id: CaptionStyleId;
  label: string;
  description: string;
  fontName: string;
  allCaps: boolean;
  baseColor: string;
  highlightColor: string;
  fontSizeRatio: number;
  outlineRatio: number;
  posYRatio: number;
  wordsPerPage: number;
}

export const CAPTION_STYLES: Record<CaptionStyleId, CaptionStyleConfig> = {
  "bold-impact": {
    id: "bold-impact",
    label: "Bold Impact",
    description: "Big chunky all-caps text with a gold highlight word",
    fontName: "Impact",
    allCaps: true,
    baseColor: "&H00FFFFFF",
    highlightColor: "&H0000C8FF",
    fontSizeRatio: 0.072,
    outlineRatio: 0.11,
    posYRatio: 0.56,
    wordsPerPage: 3,
  },
  "classic-yellow": {
    id: "classic-yellow",
    label: "Classic Yellow",
    description: "Solid yellow all-caps text, no per-word highlight",
    fontName: "Impact",
    allCaps: true,
    baseColor: "&H0000FFFF",
    highlightColor: "&H0000FFFF",
    fontSizeRatio: 0.062,
    outlineRatio: 0.1,
    posYRatio: 0.56,
    wordsPerPage: 3,
  },
  "clean-minimal": {
    id: "clean-minimal",
    label: "Clean Minimal",
    description: "Smaller sentence-case subtitles near the bottom",
    fontName: "Arial",
    allCaps: false,
    baseColor: "&H00FFFFFF",
    highlightColor: "&H00FFFFFF",
    fontSizeRatio: 0.04,
    outlineRatio: 0.09,
    posYRatio: 0.8,
    wordsPerPage: 6,
  },
};

export const CAPTION_STYLE_ORDER: CaptionStyleId[] = ["bold-impact", "classic-yellow", "clean-minimal"];

export const DEFAULT_CAPTION_CHOICE: CaptionChoice = "bold-impact";

export function isCaptionStyleId(value: string): value is CaptionStyleId {
  return value in CAPTION_STYLES;
}
