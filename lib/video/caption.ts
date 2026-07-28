import { promises as fs } from "node:fs";
import type { ClipCandidate, TranscriptWord } from "./types";
import { CAPTION_STYLES, type CaptionStyleConfig, type CaptionStyleId } from "./caption-styles";

export interface CaptionCanvas {
  width: number;
  height: number;
}

function formatAssTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = Math.floor(clamped % 60);
  const cs = Math.round((clamped - Math.floor(clamped)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAssText(text: string, allCaps: boolean): string {
  const escaped = text.replace(/\{/g, "(").replace(/\}/g, ")");
  return allCaps ? escaped.toUpperCase() : escaped;
}

function buildPages(words: TranscriptWord[], wordsPerPage: number): TranscriptWord[][] {
  const pages: TranscriptWord[][] = [];
  for (let i = 0; i < words.length; i += wordsPerPage) {
    pages.push(words.slice(i, i + wordsPerPage));
  }
  return pages;
}

// One dialogue event per word so the active word can be highlighted while
// the rest of the on-screen page stays in the base color, matching the
// "current word pops, others stay put" look rather than an accumulating fill.
// Each line carries its own \an5\pos override rather than relying on the
// style's Alignment/MarginV, since margin-based positioning only measures
// from an edge and can't reliably land "slightly below center".
function pageDialogueLines(
  page: TranscriptWord[],
  clipStart: number,
  style: CaptionStyleConfig,
  posX: number,
  posY: number
): string[] {
  const lines: string[] = [];
  const hasHighlight = style.highlightColor !== style.baseColor;

  for (let i = 0; i < page.length; i++) {
    const start = page[i].start - clipStart;
    const end = (i + 1 < page.length ? page[i + 1].start : page[i].end) - clipStart;
    if (end <= start) continue;

    const text = page
      .map((w, idx) => {
        const word = escapeAssText(w.text, style.allCaps);
        return hasHighlight && idx === i
          ? `{\\c${style.highlightColor}}${word}{\\c${style.baseColor}}`
          : word;
      })
      .join(" ");

    lines.push(
      `Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Default,,0,0,0,,{\\an5\\pos(${posX},${posY})}${text}`
    );
  }

  return lines;
}

export function buildAssSubtitles(
  candidate: ClipCandidate,
  canvas: CaptionCanvas,
  styleId: CaptionStyleId,
  posYOverride?: number
): string {
  const style = CAPTION_STYLES[styleId];
  const fontSize = Math.round(canvas.height * style.fontSizeRatio);
  const outline = Math.max(2, Math.round(fontSize * style.outlineRatio));
  const shadow = Math.max(1, Math.round(fontSize * 0.035));
  const posX = Math.round(canvas.width / 2);
  const posY = posYOverride ?? Math.round(canvas.height * style.posYRatio);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${canvas.width}
PlayResY: ${canvas.height}
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontName},${fontSize},${style.baseColor},${style.baseColor},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${outline},${shadow},5,40,40,40,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const dialogueLines: string[] = [];
  for (const segment of candidate.segments) {
    for (const page of buildPages(segment.words, style.wordsPerPage)) {
      dialogueLines.push(...pageDialogueLines(page, candidate.start, style, posX, posY));
    }
  }

  return header + dialogueLines.join("\n") + "\n";
}

export async function writeAssFile(
  candidate: ClipCandidate,
  filePath: string,
  canvas: CaptionCanvas,
  styleId: CaptionStyleId,
  posYOverride?: number
): Promise<void> {
  await fs.writeFile(filePath, buildAssSubtitles(candidate, canvas, styleId, posYOverride), "utf8");
}
