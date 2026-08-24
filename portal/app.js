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
  fHowTo: document.getElementById("fHowTo"),
  fKT: document.getElementById("fKT"),
  fAutoSplit: document.getElementById("fAutoSplit"),
  fManualReview: document.getElementById("fManualReview"),
  fInternalOnly: document.getElementById("fInternalOnly"),
  fProductionData: document.getElementById("fProductionData")
};

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
    productionData: dom.fProductionData.checked
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
