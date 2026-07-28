import { spawn } from "node:child_process";
import { ROOT_DIR } from "./paths";

export interface RunResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  onStderrLine?: (line: string) => void;
}

function run(bin: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, cwd: ROOT_DIR });
    let stdout = "";
    let stderr = "";
    let lineBuffer = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;

      if (options.onStderrLine) {
        // ffmpeg uses bare '\r' for in-place progress updates, not just '\n'.
        lineBuffer += text;
        const lines = lineBuffer.split(/\r\n|\r|\n/);
        lineBuffer = lines.pop() ?? "";
        for (const line of lines) options.onStderrLine(line);
      }
    });

    child.on("error", (err) => {
      reject(new Error(`Failed to start ${bin}: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const tail = stderr.split("\n").slice(-25).join("\n");
        reject(new Error(`${bin} exited with code ${code}\n${tail}`));
      }
    });
  });
}

export function runFfmpeg(args: string[], options?: RunOptions): Promise<RunResult> {
  return run("ffmpeg", ["-y", "-hide_banner", ...args], options);
}

export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function runFfprobe(args: string[]): Promise<RunResult> {
  return run("ffprobe", ["-hide_banner", ...args]);
}

export interface ProbeInfo {
  durationSeconds: number;
  width: number;
  height: number;
}

export async function probeVideo(filePath: string): Promise<ProbeInfo> {
  const { stdout } = await runFfprobe([
    "-print_format",
    "json",
    "-show_entries",
    "format=duration:stream=width,height,codec_type",
    filePath,
  ]);

  const data = JSON.parse(stdout) as {
    format?: { duration?: string };
    streams?: Array<{
      codec_type?: string;
      width?: number;
      height?: number;
    }>;
  };

  const videoStream = data.streams?.find((s) => s.codec_type === "video");
  const durationSeconds = Number(data.format?.duration ?? 0);

  if (!videoStream || !durationSeconds) {
    throw new Error(`Could not probe video info for ${filePath}`);
  }

  return {
    durationSeconds,
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
  };
}
