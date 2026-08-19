# Clip Studio

Turn a long video into short, captioned clips automatically: upload a video, it's transcribed,
split into scored/titled clip candidates, and rendered with burned-in captions (multiple styles),
optional filler-word/silence trimming, the Clip Studio watermark (always on, automatic, branded to
the app — see `public/logo.svg` / `public/watermark.png`), and multiple output formats (vertical/
square/original) — plus a per-clip `.srt` export and an in-app AI assistant that can answer questions
about the transcript, explain why a clip scored the way it did, and cut new custom clips on request.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it's put together and why it's deployed
as two separate services (a Next.js web app + a worker with real ffmpeg).

## Local development

No cloud accounts needed. Requirements:

- Node 20+
- An `ffmpeg`/`ffprobe` build with the `whisper` audio filter compiled in (e.g. the
  [gyan.dev "full" Windows builds](https://www.gyan.dev/ffmpeg/builds/)), on your `PATH`

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), upload a short video, and it'll walk through
transcribing, scoring clip candidates, and rendering — all on local disk, tracked in
`storage/jobs/*.json`. Nothing else to configure.

```bash
npm test        # vitest — pure-logic unit tests (scoring, trim-plan computation)
npm run lint
npx tsc --noEmit
```

## The AI chatbot

Once a job has a transcript, an "Ask Clip Studio" panel appears in the studio view. It's grounded
with real tool calls against that job's transcript/clips (`app/api/chat`) — ask what the most
quotable moment is, why a clip scored the way it did, or to cut a new clip from a specific moment.
Runs on [Groq](https://console.groq.com)'s free tier; set `GROQ_API_KEY` in `.env.local` to enable
it locally (see `.env.example`).

## Deploying

Deployment is a two-part setup — a Vercel web app plus a separately hosted worker for the ffmpeg
pipeline — because Vercel's serverless functions can't run ffmpeg or hold a persistent disk. Full
walkthrough (database, blob storage, Groq key, both deploy targets) is in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md#deploying).
