# Meeting Recordings -> KB Article Pipeline

Automatically convert any meeting or screen recording into one or more fully structured, Azure DevOps Wiki-ready Knowledge Base articles with screenshots and animated GIFs using GitHub Copilot agents.

This repository now includes a lightweight local portal in `portal/` that orchestrates the existing agent workflow by helping you:
- pair recording/transcript files,
- set conversion flags,
- choose output prompt variants,
- generate a ready-to-run orchestration prompt,
- export a job manifest JSON for audit tracking.

---

## How It Works

```
recordings/          <- you drop video + .vtt here
    └── MyRecording.mp4
    └── MyRecording.vtt
         |
         v  portal/ (orchestrator UI)
         |   |- pairs files
         |   |- applies conversion flags
         |   |- builds KB Article Generator prompt
         |   \- exports job manifest JSON
         |
         v  KB Article Generator agent
         |   |- parses transcript -> detects topics, steps, timestamps
         |   |- Screenshot Extractor -> saves PNGs for navigation steps
         |   \- GIF Creator -> saves GIFs for lengthy operations
         v
kb-articles/
    |- my-recording-topic-1/
    |   |- KB-my-recording-topic-1.md
    |   |- screenshots/
    |   \- gifs/
    \- my-recording-topic-2/
        |- KB-my-recording-topic-2.md
        |- screenshots/
        \- gifs/
```

---

## Folder Structure

```
Meetings recordings/
├── README.md                          ← this file
├── recordings/                        ← source files go here
│   ├── MyRecording.mp4
│   └── MyRecording.vtt
├── kb-articles/                       ← generated articles go here
│   ├── <article-slug>/                ← single-scenario recording
│   │   ├── KB-<article-slug>.md
│   │   ├── screenshots/
│   │   └── gifs/
│   └── <article-slug-2>/              ← additional topic from a long recording
│       ├── KB-<article-slug-2>.md
│       ├── screenshots/
│       └── gifs/
├── portal/                            ← local orchestration UI
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── .github/
    ├── copilot-instructions.md        ← documentation standards
    └── agents/
        ├── kb-article-generator.agent.md    ← orchestrator
        ├── screenshot-extractor.agent.md    ← PNG extractor
        └── gif-creator.agent.md             ← GIF creator
```

---

## Prerequisites

| Requirement | How to get it |
|---|---|
| VS Code | [code.visualstudio.com](https://code.visualstudio.com) |
| GitHub Copilot extension | Install from VS Code Extensions panel |
| Copilot Chat in Agent mode | Available with Copilot subscription |
| FFmpeg | Run: `winget install ffmpeg` |
| `.mp4`, `.webm`, or `.mov` video recording | Export from Microsoft Teams, Stream, or another recorder |
| `.vtt` transcript | Download alongside recording from Teams/Stream |

---

## Step-by-Step Usage

### Option A — Use the Portal (Recommended)

### Step 1 — Open the portal

Open `portal/index.html` in VS Code Live Preview or browser.

### Step 2 — Select recording and transcript files

Upload one or many:
- recording files (`.mp4`, `.webm`, `.mov`)
- transcript files (`.vtt`, `.srt`)

### Step 3 — Pair files

Click **Pair Files**. Pairing is based on normalized base filename.

Important:
- Prompt generation is blocked if any file is unpaired.
- Every recording must have a matching transcript.

### Step 4 — Set conversion flags

Available flags:
- How-To Article
- Knowledge Transfer Article
- Auto-split long recordings into multiple topics
- Require topic approval before article creation
- Internal-only output

### Step 5 — Choose Prompt Variant

Select one:
- Auto (based on selected flags)
- How-To only
- Knowledge Transfer only
- How-To and Knowledge Transfer

### Step 6 — Build prompt and copy

Click **Build Prompt**, then **Copy Prompt**.

### Step 7 — Export audit manifest (optional but recommended)

Click **Download Job Manifest** and save the JSON file in `recordings/` for tracking.

### Step 8 — Run with existing agents

1. Open Copilot Chat in **Agent** mode.
2. Select **KB Article Generator**.
3. Paste the generated prompt.
4. Review detected topics and approve.
5. Allow article/media generation to complete.

---

### Option B — Manual Agent Prompt (Without Portal)

### Step 1 — Get your recording files

Download the recording and transcript from Microsoft Teams or SharePoint Stream:
- Right-click the recording → **Download**
- Right-click the transcript → **Download** (`.vtt` format)

### Step 2 — Add files to the recordings folder

Place both files in the `recordings/` folder. The names do not need to match exactly, but both must be in the same folder.

```
recordings/
├── How to Create a Service Request.mp4
└── How to Create a Service Request.vtt
```

### Step 3 — Open Copilot Chat in Agent mode

In VS Code:
1. Open the Copilot Chat panel (`Ctrl+Alt+I`)
2. Switch to **Agent** mode using the mode selector at the top of the chat

### Step 4 — Select the KB Article Generator

Click the agent picker and select **KB Article Generator**.

### Step 5 — Run one command

```
Document this recording: recordings/How to Create a Service Request.mp4
```

### Step 6 — Review the article index and step tables

For a short recording with one scenario, the agent will usually show one article candidate and one step table.

For a long recording with multiple scenarios, the agent will first show an article index, then a step table for each detected topic.

Example article index:

```
Topic | Article Slug              | Start     | End       | Steps | Summary
1     | create-service-request    | 00:00:08  | 00:08:12  | 7     | Create a new service request
2     | update-service-request    | 00:08:13  | 00:17:44  | 6     | Modify an existing request
3     | close-service-request     | 00:17:45  | 00:24:19  | 5     | Close and validate the request
```

Example step table:

```
Step | Slug              | Timestamp | Duration | Media | Description
1    | login-staging     | 00:00:05  | —        | PNG   | Log in to source environment
2    | navigate-library  | 00:00:26  | —        | PNG   | Go to Module Manager > Library
3    | export-form       | 00:00:46  | 11s      | GIF   | Click Export — JSON downloads
4    | import-form       | 00:01:14  | 15s      | GIF   | Click Import and select file
5    | publish-form      | 00:02:13  | 15s      | GIF   | Publish the imported form
```

Confirm to proceed, or adjust any step before media is extracted.

### Step 7 — Wait for output

The agent extracts screenshots and GIFs for each topic, then writes one or more complete articles. Output appears in `kb-articles/<slug>/` for each detected topic.

---

## Prompt Examples

If you use the portal, prompt text is generated for you from selected files and flags. The examples below are mainly for manual usage.

Use short, direct prompts. The agent reads the transcript and derives timestamps, topics, steps, and media automatically, so extra narration usually increases token usage without improving results.

### Short video, single scenario

Use when the recording covers one workflow from start to finish.

```text
Create KB article from recordings/How to Create a Service Request.mp4
```

```text
Document this recording as one how-to article: recordings/Reset Password Demo.webm
```

### Long video, multiple scenarios

Use when the recording covers several workflows, environments, or topic changes.

```text
Create KB articles from recordings/Service Request Training Session.mp4. Detect all workflows/topics and create a separate article for each.
```

```text
Document recordings/Module Manager Deep Dive.mp4. Segment the transcript into distinct how-to topics and generate one KB article per topic with screenshots and GIFs as needed.
```

### Lowest-token prompt style

Use this when you want the fewest prompt tokens while still being explicit:

```text
KB Article Generator: recordings/Module Manager Deep Dive.mp4
```

```text
KB Article Generator: recordings/Quick User Setup.mov
```

### Effective prompt guidance

For better results with lower token usage:

- Provide only the recording path unless you need to force a behavior.
- Mention `separate article for each topic` only for long recordings with multiple scenarios.
- Do not include timestamps, step counts, or manual media instructions unless you are correcting a prior run.
- Do not restate what is already in the transcript, such as menu names or workflow steps.
- If the recording contains mixed discussion and demo content, mention `segment into distinct how-to topics` once and stop there.

Recommended prompt patterns:

```text
Create KB article from recordings/<file>.mp4
```

```text
Create KB articles from recordings/<file>.mp4. Detect all workflows/topics and create a separate article for each.
```

---

## Media Classification

The agent automatically decides the media type for each step based on the action verb in the transcript. No manual classification needed.

| Action | Media | Why |
|---|---|---|
| insert, create, add | GIF | Multi-step form interaction |
| update, edit, modify | GIF | Shows before/after state change |
| delete, remove, archive | GIF | Confirms destructive action visually |
| import, export, upload, download | GIF | File operation with progress |
| publish, submit, save, apply | GIF | Shows confirmation message |
| login, navigate, open, go to | PNG | Single action, static result |
| search, filter, view, select | PNG | Static result state |

---

## Publishing to Azure DevOps Wiki

1. Open your Azure DevOps Wiki page editor
2. Paste the contents of `KB-<slug>.md`
3. Upload all files from `screenshots/` and `gifs/` as page attachments
4. Azure Wiki generates `/.attachments/<filename>.png` paths — replace the relative paths in the article with these
5. If the recording produced multiple articles, publish each article separately and preserve the cross-links between related articles

---

## Updating Documentation Standards

All articles follow the rules in `.github/copilot-instructions.md`. Edit that file to change:
- Required article sections
- Writing style rules
- Step format
- Troubleshooting table format

Changes apply automatically to every future article — no agent updates needed.

---

## Adding a New Recording

Repeat from Step 1. No configuration changes required between recordings.

For a long recording, you do not need to split the video first. The agent is expected to detect all workflow boundaries from the transcript and create separate article folders automatically.

---

## Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| Portal shows unpaired files | Recording and transcript base names do not match | Rename files to matching base names and click **Pair Files** again |
| Build Prompt is blocked | Missing upload pair or no output variant selected | Ensure all files are paired and at least one output type is active |
| Manifest not downloaded | Browser blocked download prompt | Allow downloads for local file page and retry |
| Agent not visible in picker | Copilot not in Agent mode | Switch from Ask/Edit to Agent mode in the chat panel |
| FFmpeg not found | FFmpeg not installed or not on PATH | Run `winget install ffmpeg`, then restart VS Code |
| No `.vtt` found | Transcript not downloaded or wrong folder | Download the `.vtt` from Teams and place it in `recordings/` |
| GIF file is too large (>5 MB) | Long operation or high resolution | Ask the GIF Creator agent to re-render with `fps=8,scale=800:-1` |
| Screenshot shows a transition frame | Timestamp falls mid-animation | Ask the Screenshot Extractor to re-extract at timestamp +0.5s |
