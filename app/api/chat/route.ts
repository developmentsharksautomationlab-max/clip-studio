import path from "node:path";
import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { readJob, updateJob } from "@/lib/video/job-store";
import { uploadDirFor, generatedDirFor, WATERMARK_LOGO_PATH } from "@/lib/video/paths";
import { buildCandidateFromRange, explainScore } from "@/lib/video/segment";
import { renderAndPersistClip } from "@/lib/video/render-and-persist";
import { isCaptionStyleId, type CaptionChoice } from "@/lib/video/caption-styles";
import type { ClipFormat } from "@/lib/video/types";

export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the in-app assistant for Clip Studio, a tool that turns long videos into
short, captioned clips. You're grounded in one specific video the user just processed. Use your tools —
never guess at the transcript, existing clips, or scores. Keep replies short and concrete. Formats are
"vertical" (9:16), "square" (1:1), or "original". Caption styles are "bold-impact", "classic-yellow",
"clean-minimal", or "none". When asked to cut a clip from "the part where X", use get_transcript to find
the matching moment's timestamps before calling create_clip.`;

const TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "get_transcript",
      description: "Get the full transcript of the current video, with per-segment timestamps.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "list_clips",
      description: "List the clips already rendered for the current job.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "explain_clip_score",
      description: "Explain in plain language why a rendered clip got the shareability score it did.",
      parameters: {
        type: "object",
        properties: {
          clipIndex: { type: "number", description: "0-based clip index, from list_clips." },
        },
        required: ["clipIndex"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_clip",
      description: "Render a brand-new clip from a specific time range of the source video.",
      parameters: {
        type: "object",
        properties: {
          startSeconds: { type: "number", description: "Clip start time in seconds." },
          endSeconds: { type: "number", description: "Clip end time in seconds." },
          format: { type: "string", enum: ["vertical", "original", "square"] },
          captionStyle: { type: "string", enum: ["bold-impact", "classic-yellow", "clean-minimal", "none"] },
        },
        required: ["startSeconds", "endSeconds"],
      },
    },
  },
];

async function handleCreateClip(
  jobId: string,
  args: { startSeconds?: number; endSeconds?: number; format?: string; captionStyle?: string }
): Promise<unknown> {
  if (process.env.POSTGRES_URL) {
    return {
      error:
        "Custom clip rendering from chat isn't available in this deployment mode yet (it needs a worker-queue extension — see docs/ARCHITECTURE.md). Works in local dev.",
    };
  }

  const job = await readJob(jobId);
  if (!job?.transcript) return { error: "No transcript available yet — wait for the job to finish transcribing." };

  const start = Number(args.startSeconds);
  const end = Number(args.endSeconds);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { error: "endSeconds must be a number greater than startSeconds." };
  }

  const format: ClipFormat =
    args.format === "original" || args.format === "square" ? args.format : "vertical";
  const captionStyle: CaptionChoice =
    typeof args.captionStyle === "string" && (args.captionStyle === "none" || isCaptionStyleId(args.captionStyle))
      ? args.captionStyle
      : job.captionStyle;

  const nextIndex = job.clips.reduce((max, c) => Math.max(max, c.index), -1) + 1;
  const candidate = buildCandidateFromRange(job.transcript.segments, nextIndex, start, end);
  if (candidate.segments.length === 0) {
    return { error: "No speech found in that time range — check the timestamps against get_transcript." };
  }

  const sourcePath = path.join(uploadDirFor(jobId), `source.${job.sourceExt}`);
  const rendered = await renderAndPersistClip(
    jobId,
    sourcePath,
    candidate,
    uploadDirFor(jobId),
    generatedDirFor(jobId),
    format,
    { captionStyle, removeFillers: job.removeFillers, watermarkPath: WATERMARK_LOGO_PATH }
  );

  await updateJob(jobId, { clips: [...job.clips, rendered] });
  return { ok: true, clip: { index: rendered.index, format: rendered.format, title: rendered.title, url: rendered.url } };
}

async function executeTool(name: string, args: Record<string, unknown>, jobId: string): Promise<unknown> {
  switch (name) {
    case "get_transcript": {
      const job = await readJob(jobId);
      if (!job?.transcript) return { error: "No transcript available yet." };
      return {
        language: job.transcript.language,
        segments: job.transcript.segments.map((s) => ({ start: s.start, end: s.end, text: s.text })),
      };
    }
    case "list_clips": {
      const job = await readJob(jobId);
      if (!job) return { error: "Job not found." };
      return {
        clips: job.clips.map((c) => ({
          index: c.index,
          format: c.format,
          start: c.start,
          end: c.end,
          title: c.title,
          score: c.score,
        })),
      };
    }
    case "explain_clip_score": {
      const job = await readJob(jobId);
      if (!job?.transcript) return { error: "No transcript available yet." };
      const clip = job.clips.find((c) => c.index === args.clipIndex);
      if (!clip) return { error: `No clip with index ${String(args.clipIndex)}. Call list_clips first.` };
      const segments = job.transcript.segments.filter((s) => s.end > clip.start && s.start < clip.end);
      return { explanation: explainScore(segments) };
    }
    case "create_clip":
      return handleCreateClip(jobId, args);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "GROQ_API_KEY is not configured on the server." }, { status: 500 });
  }

  const { jobId, messages } = (await request.json()) as {
    jobId?: string;
    messages?: ChatCompletionMessageParam[];
  };
  if (!jobId || !Array.isArray(messages)) {
    return Response.json({ error: "Missing jobId or messages." }, { status: 400 });
  }

  const job = await readJob(jobId);
  if (!job) {
    return Response.json({ error: "Job not found." }, { status: 404 });
  }

  const client = new OpenAI({
    apiKey,
    baseURL: process.env.GROQ_API_BASE_URL || "https://api.groq.com/openai/v1",
  });
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";

  const conversation: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  let clipsChanged = false;
  const MAX_TOOL_ROUNDS = 6;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages: conversation,
        tools: TOOLS,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Chat model request failed.";
      return Response.json({ error: message }, { status: 502 });
    }

    const message = completion.choices[0]?.message;
    if (!message) break;
    conversation.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return Response.json({ reply: message.content ?? "", clipsChanged });
    }

    for (const toolCall of message.tool_calls) {
      if (toolCall.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || "{}");
      } catch {
        // Malformed args from the model — let the tool see an empty object
        // rather than failing the whole turn.
      }
      let result: unknown;
      try {
        result = await executeTool(toolCall.function.name, args, jobId);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : "Tool call failed." };
      }
      if (toolCall.function.name === "create_clip" && (result as { ok?: boolean }).ok) {
        clipsChanged = true;
      }
      conversation.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      });
    }
  }

  return Response.json({
    reply: "I wasn't able to finish that in a reasonable number of steps — try rephrasing?",
    clipsChanged,
  });
}
