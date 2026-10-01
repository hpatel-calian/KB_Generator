const state = {
  recordings: [],
  transcripts: [],
  pairs: [],
  unpairedRecordings: [],
  unpairedTranscripts: [],
  recordingsFolder: null  // FileSystemDirectoryHandle when granted
};

const dom = {
  workflowMode: document.getElementById("workflowMode"),
  workflowHint: document.getElementById("workflowHint"),
  primaryAgentLabel: document.getElementById("primaryAgentLabel"),
  outputFolderLabel: document.getElementById("outputFolderLabel"),
  runAgentLabel: document.getElementById("runAgentLabel"),
  kbOnlyFlags: document.getElementById("kbOnlyFlags"),
  promptVariantLabel: document.getElementById("promptVariantLabel"),
  recordingInput: document.getElementById("recordingInput"),
  transcriptInput: document.getElementById("transcriptInput"),
  pairBtn: document.getElementById("pairBtn"),
  clearBtn: document.getElementById("clearBtn"),
  buildPromptBtn: document.getElementById("buildPromptBtn"),
  copyPromptBtn: document.getElementById("copyPromptBtn"),
  downloadManifestBtn: document.getElementById("downloadManifestBtn"),
  selectFolderBtn: document.getElementById("selectFolderBtn"),
  folderStatus: document.getElementById("folderStatus"),
  saveStatus: document.getElementById("saveStatus"),
  promptVariant: document.getElementById("promptVariant"),
  pairsList: document.getElementById("pairsList"),
  unpairedList: document.getElementById("unpairedList"),
  promptOutput: document.getElementById("promptOutput"),
  validationMsg: document.getElementById("validationMsg"),
  previewMarkdownInput: document.getElementById("previewMarkdownInput"),
  previewFolderInput: document.getElementById("previewFolderInput"),
  previewMarkdownBtn: document.getElementById("previewMarkdownBtn"),
  previewArticleBtn: document.getElementById("previewArticleBtn"),
  previewStatus: document.getElementById("previewStatus"),
  previewArticleSelect: document.getElementById("previewArticleSelect"),
  previewArticleSelectLabel: document.getElementById("previewArticleSelectLabel"),
  articlePreviewDialog: document.getElementById("articlePreviewDialog"),
  previewTitle: document.getElementById("previewTitle"),
  previewContent: document.getElementById("previewContent"),
  closePreviewBtn: document.getElementById("closePreviewBtn"),
  fHowTo: document.getElementById("fHowTo"),
  fKT: document.getElementById("fKT"),
  fAutoSplit: document.getElementById("fAutoSplit"),
  fManualReview: document.getElementById("fManualReview"),
  fInternalOnly: document.getElementById("fInternalOnly"),
  fProductionData: document.getElementById("fProductionData"),
  fPublishWiki: document.getElementById("fPublishWiki")
};

let previewObjectUrls = [];
let previewArticles = [];

bind();
renderAll();

function bind() {
  dom.workflowMode.addEventListener("change", () => {
    applyWorkflowUI();
    dom.validationMsg.textContent = "";
    dom.promptOutput.value = "";
  });

  dom.recordingInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    state.recordings = await enrichVideos(files);
    await saveFilesToFolder(files);
    renderAll();
  });

  dom.transcriptInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files || []);
    state.transcripts = files;
    await saveFilesToFolder(files);
    renderAll();
  });

  dom.selectFolderBtn.addEventListener("click", selectRecordingsFolder);
  dom.pairBtn.addEventListener("click", pairFiles);
  dom.clearBtn.addEventListener("click", clearAll);
  dom.buildPromptBtn.addEventListener("click", buildPrompt);
  dom.copyPromptBtn.addEventListener("click", copyPrompt);
  dom.downloadManifestBtn.addEventListener("click", downloadManifest);
  dom.previewMarkdownBtn.addEventListener("click", () => dom.previewMarkdownInput.click());
  dom.previewMarkdownInput.addEventListener("change", previewMarkdownFile);
  dom.previewArticleBtn.addEventListener("click", () => dom.previewFolderInput.click());
  dom.previewFolderInput.addEventListener("change", previewArticleFolder);
  dom.previewArticleSelect.addEventListener("change", previewSelectedArticle);
  dom.closePreviewBtn.addEventListener("click", closeArticlePreview);
}

function workflowMode() {
  return dom.workflowMode.value === "config" ? "config" : "kb";
}

function workflowMeta() {
  if (workflowMode() === "config") {
    return {
      agent: "Configuration Setup Generator",
      outputFolder: "configuration-articles/",
      hint: "Uses Configuration Setup Generator and writes to configuration-articles/."
    };
  }

  return {
    agent: "KB Article Generator",
    outputFolder: "kb-articles/",
    hint: "Uses KB Article Generator and writes to kb-articles/."
  };
}

function applyWorkflowUI() {
  const mode = workflowMode();
  const meta = workflowMeta();
  dom.workflowHint.textContent = meta.hint;
  dom.primaryAgentLabel.textContent = meta.agent;
  dom.outputFolderLabel.textContent = meta.outputFolder;
  dom.runAgentLabel.textContent = meta.agent;

  const kbVisible = mode === "kb";
  dom.kbOnlyFlags.style.display = kbVisible ? "grid" : "none";
  dom.promptVariantLabel.style.display = kbVisible ? "grid" : "none";
}

async function selectRecordingsFolder() {
  if (!window.showDirectoryPicker) {
    dom.folderStatus.textContent = "Your browser does not support folder access. Please copy files manually into recordings/.";
    return;
  }
  try {
    state.recordingsFolder = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
    dom.folderStatus.textContent = `✓ Folder selected: ${state.recordingsFolder.name} — uploaded files will be saved here automatically.`;
    dom.folderStatus.style.color = "var(--green, #2e7d32)";
  } catch (err) {
    if (err.name !== "AbortError") {
      dom.folderStatus.textContent = "Folder access was denied or an error occurred.";
    }
  }
}

async function saveFilesToFolder(files) {
  if (!state.recordingsFolder || !files.length) return;
  const saved = [];
  const failed = [];
  for (const file of files) {
    try {
      const handle = await state.recordingsFolder.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(file);
      await writable.close();
      saved.push(file.name);
    } catch {
      failed.push(file.name);
    }
  }
  const parts = [];
  if (saved.length) parts.push(`✓ Saved: ${saved.join(", ")}`);
  if (failed.length) parts.push(`⚠ Failed: ${failed.join(", ")}`);
  if (dom.saveStatus) dom.saveStatus.textContent = parts.join(" | ");
}

function clearAll() {
  state.recordings = [];
  state.transcripts = [];
  state.pairs = [];
  state.unpairedRecordings = [];
  state.unpairedTranscripts = [];
  dom.recordingInput.value = "";
  dom.transcriptInput.value = "";
  dom.promptOutput.value = "";
  dom.validationMsg.textContent = "";
  if (dom.saveStatus) dom.saveStatus.textContent = "";
  renderAll();
}

function normalizeBase(filename) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function durationText(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "unknown";
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
}

function durationBand(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "unknown";
  }
  if (seconds < 15 * 60) return "short";
  if (seconds < 40 * 60) return "medium";
  return "long";
}

async function enrichVideos(files) {
  const result = [];
  for (const file of files) {
    const sec = await detectDuration(file);
    result.push({
      file,
      seconds: sec,
      pretty: durationText(sec),
      band: durationBand(sec)
    });
  }
  return result;
}

function detectDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    const url = URL.createObjectURL(file);
    v.preload = "metadata";
    v.src = url;

    v.onloadedmetadata = () => {
      const seconds = Number(v.duration);
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(seconds) ? seconds : 0);
    };

    v.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
  });
}

function pairFiles() {
  const transcriptMap = new Map();
  for (const t of state.transcripts) {
    transcriptMap.set(normalizeBase(t.name), t);
  }

  const pairs = [];
  const usedT = new Set();
  const unpairedR = [];

  for (const r of state.recordings) {
    const key = normalizeBase(r.file.name);
    const t = transcriptMap.get(key);
    if (t) {
      pairs.push({ key, recording: r, transcript: t });
      usedT.add(t.name);
    } else {
      unpairedR.push(r);
    }
  }

  const unpairedT = state.transcripts.filter((t) => !usedT.has(t.name));

  state.pairs = pairs;
  state.unpairedRecordings = unpairedR;
  state.unpairedTranscripts = unpairedT;
  renderAll();
}

function selectedFlags() {
  return {
    howTo: dom.fHowTo.checked,
    knowledgeTransfer: dom.fKT.checked,
    autoSplit: dom.fAutoSplit.checked,
    manualReview: dom.fManualReview.checked,
    internalOnly: dom.fInternalOnly.checked,
    productionData: dom.fProductionData.checked,
    publishWiki: dom.fPublishWiki.checked
  };
}

function resolvedOutputs(flags, variant) {
  if (variant === "howto") {
    return { howTo: true, knowledgeTransfer: false };
  }
  if (variant === "kt") {
    return { howTo: false, knowledgeTransfer: true };
  }
  if (variant === "both") {
    return { howTo: true, knowledgeTransfer: true };
  }
  return {
    howTo: flags.howTo,
    knowledgeTransfer: flags.knowledgeTransfer
  };
}

function pairingHealth() {
  return {
    recordingCount: state.recordings.length,
    transcriptCount: state.transcripts.length,
    pairCount: state.pairs.length,
    unpairedRecordingCount: state.unpairedRecordings.length,
    unpairedTranscriptCount: state.unpairedTranscripts.length
  };
}

function validateForPrompt(outputs) {
  const health = pairingHealth();
  const mode = workflowMode();
  if (!health.recordingCount || !health.transcriptCount) {
    return "Upload at least one recording and one transcript.";
  }
  if (!health.pairCount) {
    return "No matched recording/transcript pairs found. File names must match by base name.";
  }
  if (health.unpairedRecordingCount || health.unpairedTranscriptCount) {
    return "All files must be paired before building prompt. Resolve unpaired files first.";
  }
  if (mode === "kb" && !outputs.howTo && !outputs.knowledgeTransfer) {
    return "Select at least one article output type (How-To or Knowledge Transfer).";
  }
  return "";
}

function buildPrompt() {
  const flags = selectedFlags();
  const variant = dom.promptVariant.value;
  const outputs = resolvedOutputs(flags, variant);
  const mode = workflowMode();
  const meta = workflowMeta();
  const validationError = validateForPrompt(outputs);
  if (validationError) {
    dom.validationMsg.textContent = validationError;
    dom.promptOutput.value = "";
    return;
  }

  dom.validationMsg.textContent = "";

  const lines = [];
  if (mode === "config") {
    lines.push("Use Configuration Setup Generator with the existing setup in this repo.");
    lines.push("Before creating articles, detect all configuration domains and show the domain list for approval.");
  } else {
    lines.push("Use KB Article Generator with the existing setup in this repo.");
    lines.push("Before creating articles, detect all workflows/topics and show the topic list for approval.");
  }
  lines.push("");
  lines.push("Input pairs in recordings/:");

  state.pairs.forEach((p) => {
    lines.push(`- Recording: recordings/${p.recording.file.name}`);
    lines.push(`  Transcript: recordings/${p.transcript.name}`);
    lines.push(`  Duration: ${p.recording.pretty} (${p.recording.band})`);
  });

  lines.push("");
  lines.push("Flags:");
  lines.push(`- Workflow mode: ${mode === "config" ? "Configuration Setup Documentation" : "Procedural KB Article"}`);
  lines.push(`- Primary agent: ${meta.agent}`);
  if (mode === "kb") {
    lines.push(`- Prompt variant: ${variant}`);
    lines.push(`- How-To output: ${yesNo(outputs.howTo)}`);
    lines.push(`- Knowledge Transfer output: ${yesNo(outputs.knowledgeTransfer)}`);
  }
  lines.push(`- Auto-split long video into multiple topics/articles: ${yesNo(flags.autoSplit)}`);
  lines.push(`- Manual review required before article creation: ${yesNo(flags.manualReview)}`);
  lines.push(`- Internal-only article: ${yesNo(flags.internalOnly)}`);
  lines.push(`- Recording source: ${flags.productionData ? "Production (blur sensitive client data)" : "Test/QA/Staging (no blur)"}`);
  lines.push(`- Direct Wiki publishing: ${yesNo(flags.publishWiki)}`);

  lines.push("");
  lines.push("Constraints:");
  lines.push("- If one recording contains multiple topics/domains, create separate articles per topic/domain.");
  lines.push("- If multiple recordings are provided, process each pair separately.");
  lines.push("- Use Screenshot Extractor and GIF Creator through existing orchestration.");
  lines.push("- Capture browser content only — exclude Teams webcam thumbnails, participant panel, toolbar, and invite banners.");
  if (flags.productionData) {
    lines.push("- Recording is Production: blur actual values for FirstName, LastName, Name, Address, Client ID, Health Card Number, PhoneNumber, Phone Number, Email, Fax Number, the value entered in the View Client input field, and copay number within the Client Details dashlet, Client Address section, View Client input, and visible copay fields. Never blur field labels or placeholders.");
  } else {
    lines.push("- Recording is Test/QA/Staging: do not blur any information in screenshots or GIFs.");
  }
  if (flags.publishWiki) {
    lines.push("- After topic approval and article generation, do not publish yet. List only the newly created article folders and direct me to review each selected output in the Portal Preview Generated Article section.");
    lines.push("- After I review the preview, ask which exact article folders I approve for Azure DevOps Wiki publication. Publish only the folders I explicitly approve in a later reply using node scripts/publish-to-azure-devops-wiki.mjs. Do not publish, backfill, or modify pre-existing article folders.");
  }

  if (mode === "config") {
    lines.push("- Output must be Azure DevOps Wiki-compatible configuration setup documentation.");
    lines.push("- Keep KB-style section layout with configuration-focused content.");
    lines.push("- Do not force Step X procedural format unless explicitly requested.");
    lines.push("- Save all output under configuration-articles/<article-slug>/.");
    lines.push("- Always include two configuration UI screenshots per generated article.");
    lines.push("- Use GIF only when motion is required and static screenshots are insufficient.");
  } else if (variant === "howto") {
    lines.push("- Generate only How-To style articles.");
  } else if (variant === "kt") {
    lines.push("- Generate only Knowledge Transfer style articles.");
  } else if (variant === "both") {
    lines.push("- For each approved topic, generate both How-To and Knowledge Transfer variants.");
  }

  dom.promptOutput.value = lines.join("\n");
}

function makeManifestPayload() {
  const flags = selectedFlags();
  const variant = dom.promptVariant.value;
  const outputs = resolvedOutputs(flags, variant);
  const mode = workflowMode();
  const meta = workflowMeta();
  return {
    manifestVersion: "1.0",
    generatedAt: new Date().toISOString(),
    sourceWorkflow: "KB Portal (Agent Orchestrator)",
    workflowMode: mode,
    primaryAgent: meta.agent,
    inputFolder: "recordings/",
    outputFolder: meta.outputFolder,
    promptVariant: mode === "kb" ? variant : "config",
    outputs: mode === "kb" ? outputs : null,
    flags,
    pairing: pairingHealth(),
    pairs: state.pairs.map((p) => ({
      recording: p.recording.file.name,
      transcript: p.transcript.name,
      durationSeconds: p.recording.seconds,
      durationPretty: p.recording.pretty,
      durationBand: p.recording.band,
      suggestedAutoSplit: p.recording.band === "long"
    }))
  };
}

function downloadManifest() {
  const flags = selectedFlags();
  const variant = dom.promptVariant.value;
  const outputs = resolvedOutputs(flags, variant);
  const mode = workflowMode();
  const validationError = validateForPrompt(outputs);
  if (validationError) {
    dom.validationMsg.textContent = validationError;
    return;
  }

  dom.validationMsg.textContent = "";
  const payload = makeManifestPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `${mode === "config" ? "configuration-setup" : "kb"}-job-manifest-${stamp}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function yesNo(v) {
  return v ? "Yes" : "No";
}

async function copyPrompt() {
  if (!dom.promptOutput.value) return;
  try {
    await navigator.clipboard.writeText(dom.promptOutput.value);
    alert("Prompt copied.");
  } catch {
    alert("Copy failed. Please copy manually.");
  }
}

async function previewArticleFolder(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = "";
  const markdownFiles = files.filter((file) => /\.md$/i.test(file.name));
  if (!markdownFiles.length) {
    dom.previewStatus.textContent = "No Markdown article found in the selected folder.";
    return;
  }

  // Supports a single article folder or a root such as kb-articles/ containing many articles.
  previewArticles = markdownFiles
    .map((file) => {
      const path = file.webkitRelativePath || file.name;
      const folder = path.slice(0, path.lastIndexOf("/") + 1);
      return { file, folder, media: files.filter((f) => isMediaFile(f) && (f.webkitRelativePath || "").startsWith(folder)) };
    })
    .sort((a, b) => a.folder.localeCompare(b.folder));

  dom.previewArticleSelect.replaceChildren();
  if (previewArticles.length === 1) {
    dom.previewArticleSelectLabel.hidden = true;
    await openFolderArticle(previewArticles[0]);
    return;
  }

  const placeholder = new Option(`Select an article (${previewArticles.length} found)`, "");
  dom.previewArticleSelect.appendChild(placeholder);
  previewArticles.forEach((article, index) => {
    const label = article.folder.replace(/\/$/, "").split("/").pop() || article.file.name;
    dom.previewArticleSelect.appendChild(new Option(label, String(index)));
  });
  dom.previewArticleSelectLabel.hidden = false;
  dom.previewStatus.textContent = "Choose an article from the list to preview it with its screenshots and GIFs.";
}

async function previewSelectedArticle() {
  const article = previewArticles[Number(dom.previewArticleSelect.value)];
  if (dom.previewArticleSelect.value === "" || !article) return;
  await openFolderArticle(article);
}

async function openFolderArticle(article) {
  resetArticlePreview();
  const mediaUrls = new Map();
  for (const file of article.media) {
    const url = URL.createObjectURL(file);
    previewObjectUrls.push(url);
    mediaUrls.set(normalizeMediaPath(file.webkitRelativePath || file.name), url);
    mediaUrls.set(file.name, url);
  }
  const folderName = article.folder.replace(/\/$/, "").split("/").pop() || "article folder";
  const markdown = await article.file.text();
  openArticlePreview(markdown, article.file.name, { urls: mediaUrls, bases: [] }, `Previewing ${folderName} with ${article.media.length} local media file(s).`);
}

async function previewMarkdownFile(event) {
  const [file] = Array.from(event.target.files || []);
  event.target.value = "";
  if (!file) return;

  resetArticlePreview();
  const markdown = await file.text();
  openArticlePreview(
    markdown,
    file.name,
    { urls: new Map(), bases: repositoryArticleBases(file.name) },
    `Previewing ${file.name}. Media is loaded from the matching kb-articles/ or configuration-articles/ folder.`
  );
}

// The file picker only exposes the .md file, so media is resolved from the repo folder matching the article slug.
function repositoryArticleBases(fileName) {
  const base = fileName.replace(/\.md$/i, "");
  const slugs = [...new Set([base.replace(/^(KB|KT)-/i, ""), base])].map(encodeURIComponent);
  const roots = ["kb-articles", "configuration-articles"];
  return slugs.flatMap((slug) => roots.map((root) => `../${root}/${slug}/`));
}

function isMediaFile(file) {
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

function openArticlePreview(markdown, fileName, media, status) {
  dom.previewTitle.textContent = fileName.replace(/\.md$/i, "");
  renderArticlePreview(markdown, media);
  dom.previewStatus.textContent = status;
  if (!dom.articlePreviewDialog.open) dom.articlePreviewDialog.showModal();
}

function renderArticlePreview(markdown, media) {
  dom.previewContent.replaceChildren();
  const lines = markdown.replace(/\r/g, "").split("\n");
  let list = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const listMatch = line.match(/^\s*(-|\*|\d+\.)\s+(.*)$/);
    if (!listMatch) list = null;

    if (line.startsWith("```")) {
      const codeLines = [];
      while (++i < lines.length && !lines[i].startsWith("```")) codeLines.push(lines[i]);
      appendPreviewCode(codeLines.join("\n"));
      continue;
    }

    const imageMatch = line.trim().match(/^!\[([^\]]*)\]\(([^\s)]+)\)$/);
    if (imageMatch) {
      appendPreviewMedia(imageMatch[1], imageMatch[2], media);
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const heading = document.createElement(`h${headingMatch[1].length}`);
      appendInline(heading, headingMatch[2]);
      dom.previewContent.appendChild(heading);
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) tableLines.push(lines[i++]);
      i--;
      appendPreviewTable(tableLines);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      dom.previewContent.appendChild(document.createElement("hr"));
      continue;
    }

    if (line.startsWith(">")) {
      const quote = document.createElement("blockquote");
      appendInline(quote, line.replace(/^>\s?/, ""));
      dom.previewContent.appendChild(quote);
      continue;
    }

    if (listMatch) {
      const ordered = /\d/.test(listMatch[1]);
      const tag = ordered ? "OL" : "UL";
      if (!list || list.tagName !== tag) {
        list = document.createElement(tag.toLowerCase());
        dom.previewContent.appendChild(list);
      }
      const item = document.createElement("li");
      appendInline(item, listMatch[2].replace(/^\[( |x)\]\s*/i, (m, c) => (c.trim() ? "\u2611 " : "\u2610 ")));
      list.appendChild(item);
      continue;
    }

    if (!line.trim()) continue;

    const paragraph = document.createElement("p");
    appendInline(paragraph, line);
    dom.previewContent.appendChild(paragraph);
  }
}

function appendInline(parent, text) {
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*]+)\*/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)));
    let node;
    if (match[1] !== undefined) {
      node = document.createElement("strong");
      appendInline(node, match[1]);
    } else if (match[2] !== undefined) {
      node = document.createElement("code");
      node.textContent = match[2];
    } else if (match[3] !== undefined) {
      if (/^(https?:\/\/|\.{0,2}\/|#)/i.test(match[4])) {
        node = document.createElement("a");
        node.href = match[4];
        node.target = "_blank";
        node.rel = "noopener noreferrer";
        node.textContent = match[3];
      } else {
        node = document.createTextNode(match[3]);
      }
    } else {
      node = document.createElement("em");
      node.textContent = match[5];
    }
    parent.appendChild(node);
    last = match.index + match[0].length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function appendPreviewTable(tableLines) {
  const splitRow = (row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  const table = document.createElement("table");
  const hasHeader = tableLines.length > 1 && /^\s*\|?\s*:?-+/.test(tableLines[1]);
  tableLines.forEach((row, index) => {
    if (hasHeader && index === 1) return;
    const tr = document.createElement("tr");
    splitRow(row).forEach((cell) => {
      const td = document.createElement(hasHeader && index === 0 ? "th" : "td");
      appendInline(td, cell);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  dom.previewContent.appendChild(table);
}

function appendPreviewCode(content) {
  const code = document.createElement("pre");
  code.textContent = content;
  dom.previewContent.appendChild(code);
}

function appendPreviewMedia(description, path, media) {
  const figure = document.createElement("figure");
  const normalizedPath = normalizeMediaPath(path);
  const mediaUrl = media.urls.get(normalizedPath) || media.urls.get(normalizedPath.split("/").pop());
  const relativePath = path.replace(/^\.\//, "");
  const candidates = mediaUrl
    ? [mediaUrl]
    : /^https:\/\//i.test(path)
      ? [path]
      : media.bases.map((base) => base + relativePath);

  const showMissing = () => {
    const missing = document.createElement("p");
    missing.className = "preview-missing-media";
    missing.textContent = `Media unavailable: ${path}. Use "Select article folder with media" if the article is outside this repository.`;
    figure.replaceChildren(missing, caption);
  };

  const caption = document.createElement("figcaption");
  caption.textContent = description || path;

  if (candidates.length) {
    const image = document.createElement("img");
    image.alt = description;
    let attempt = 0;
    image.onerror = () => {
      attempt += 1;
      if (attempt < candidates.length) image.src = candidates[attempt];
      else showMissing();
    };
    image.src = candidates[0];
    figure.append(image, caption);
  } else {
    showMissing();
  }
  dom.previewContent.appendChild(figure);
}

function normalizeMediaPath(path) {
  const segments = decodeURIComponent(path).replace(/\\/g, "/").replace(/^\.\//, "").split("/");
  const mediaRoot = segments.findIndex((segment) => /^(screenshots|gifs)$/i.test(segment));
  return (mediaRoot >= 0 ? segments.slice(mediaRoot) : segments).join("/");
}

function closeArticlePreview() {
  resetArticlePreview();
}

function resetArticlePreview() {
  if (dom.articlePreviewDialog.open) dom.articlePreviewDialog.close();
  previewObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  previewObjectUrls = [];
  dom.previewContent.replaceChildren();
}

function renderPairs() {
  dom.pairsList.innerHTML = "";
  if (!state.pairs.length) {
    dom.pairsList.innerHTML = "<li>No pairs yet. Click Pair Files after selecting inputs.</li>";
    return;
  }
  for (const p of state.pairs) {
    const li = document.createElement("li");
    li.innerHTML = `${p.recording.file.name} + ${p.transcript.name} <span class=\"badge\">${p.recording.pretty}</span> <span class=\"badge\">${p.recording.band}</span>`;
    dom.pairsList.appendChild(li);
  }
}

function renderUnpaired() {
  dom.unpairedList.innerHTML = "";
  const items = [];
  state.unpairedRecordings.forEach((r) => items.push(`Recording missing transcript: ${r.file.name}`));
  state.unpairedTranscripts.forEach((t) => items.push(`Transcript missing recording: ${t.name}`));

  if (!items.length) {
    dom.unpairedList.innerHTML = "<li>No unpaired files.</li>";
    return;
  }

  items.forEach((txt) => {
    const li = document.createElement("li");
    li.textContent = txt;
    dom.unpairedList.appendChild(li);
  });
}

function renderAll() {
  applyWorkflowUI();
  renderPairs();
  renderUnpaired();
}
