#!/usr/bin/env node

import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

const environmentFile = resolve(".env");
if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);

const DEFAULT_REMOTE = process.env.AZURE_DEVOPS_WIKI_REMOTE;
const DEFAULT_PARENT = process.env.AZURE_DEVOPS_WIKI_PARENT;

function usage() {
  console.log(`Usage: node scripts/publish-to-azure-devops-wiki.mjs [options] <article-folder> [...article-folder]

Publishes only the article folders explicitly named on the command line.

Options:
  --dry-run                 Validate sources and show the proposed Wiki paths.
  --remote <url>            Azure DevOps Wiki Git remote. Defaults to AZURE_DEVOPS_WIKI_REMOTE.
  --parent <directory>      Wiki parent directory. Defaults to AZURE_DEVOPS_WIKI_PARENT.
  --message <text>          Git commit message.
  --help                    Show this help message.

Example:
  node scripts/publish-to-azure-devops-wiki.mjs --dry-run kb-articles/my-new-article
`);
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function parseArgs(args) {
  const options = {
    dryRun: false,
    remote: DEFAULT_REMOTE,
    parent: DEFAULT_PARENT,
    message: "Publish generated KB articles"
  };
  const sources = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (["--remote", "--parent", "--message"].includes(argument)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) fail(`${argument} requires a value.`);
      options[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) fail(`Unknown option: ${argument}`);
    sources.push(resolve(argument));
  }

  if (!sources.length) fail("Provide at least one generated article folder.");
  if (!options.remote) fail("Set AZURE_DEVOPS_WIKI_REMOTE in .env or provide --remote.");
  if (!options.parent) fail("Set AZURE_DEVOPS_WIKI_PARENT in .env or provide --parent.");
  return { options, sources };
}

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim() || "Unknown Git error.";
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
  return result.stdout.trim();
}

async function findArticleFile(source) {
  const entries = await readdir(source, { withFileTypes: true });
  const markdown = entries
    .filter((entry) => entry.isFile() && /^KB-.*\.md$/i.test(entry.name))
    .map((entry) => join(source, entry.name));
  if (markdown.length !== 1) {
    throw new Error(`${source} must contain exactly one KB-*.md article file.`);
  }
  return markdown[0];
}

async function validateArticleSource(source) {
  const info = await stat(source).catch(() => null);
  if (!info?.isDirectory()) throw new Error(`${source} is not an article folder.`);

  const articleFile = await findArticleFile(source);
  const markdown = await readFile(articleFile, "utf8");
  const mediaLinks = [...markdown.matchAll(/!\[([^\]]*)\]\(\.\/(screenshots|gifs)\/([^\)\s]+)\)/g)];
  for (const match of mediaLinks) {
    const asset = join(source, match[2], match[3]);
    const assetInfo = await stat(asset).catch(() => null);
    if (!assetInfo?.isFile()) throw new Error(`${articleFile} references missing media: ${asset}`);
  }

  return { source, articleFile, markdown, mediaLinks, slug: basename(source) };
}

function wikiPageName(markdown, fallbackSlug) {
  const title = markdown.match(/^#\s+(.+)$/m)?.[1].trim();
  if (!title) return fallbackSlug;
  return title.replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, "-");
}

function attachmentName(slug, folder, filename) {
  return `${slug}--${folder}--${basename(filename)}`;
}

function rewriteMediaPaths(markdown, slug) {
  return markdown.replace(/!\[([^\]]*)\]\(\.\/(screenshots|gifs)\/([^\)\s]+)\)/g, (_, description, folder, filename) => {
    return `![${description}](/.attachments/${attachmentName(slug, folder, filename)})`;
  });
}

async function relatedArticleLinkMap(article, repo) {
  const links = [...article.markdown.matchAll(/\[[^\]]+\]\(\.\.\/([^/]+)\/KB-[^)]+\.md\)/g)];
  const mappings = new Map();
  for (const match of links) {
    const localFolder = match[1];
    if (mappings.has(localFolder)) continue;
    const relatedFolder = resolve(article.source, "..", localFolder);
    const relatedFile = await findArticleFile(relatedFolder).catch(() => null);
    if (!relatedFile) continue;
    const relatedMarkdown = await readFile(relatedFile, "utf8");
    const wikiPath = await findWikiPagePath(repo, wikiPageName(relatedMarkdown, localFolder));
    if (wikiPath) mappings.set(localFolder, wikiPath);
  }
  return mappings;
}

async function findWikiPagePath(directory, pageName) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name === `${pageName}.md`) {
      return relative(directoryRoot, join(directory, entry.name)).replace(/\\/g, "/").replace(/\.md$/, "");
    }
    if (entry.isDirectory() && ![".git", ".attachments"].includes(entry.name)) {
      const result = await findWikiPagePath(join(directory, entry.name), pageName);
      if (result) return result;
    }
  }
  return "";
}

let directoryRoot = "";

function rewriteRelatedArticleLinks(markdown, mappings) {
  return markdown.replace(/\[([^\]]+)\]\(\.\.\/([^/]+)\/KB-[^)]+\.md\)/g, (link, label, localFolder) => {
    const wikiPath = mappings.get(localFolder);
    return wikiPath ? `[${label}](/${wikiPath})` : link;
  });
}

function removeWikiChrome(markdown) {
  return markdown
    .replace(/^#\s+[^\r\n]+\r?\n+/, "")
    .replace(/^(?:> \*\*(?:Article ID|Last Updated|Author|Status):\*\*.*\r?\n)+\r?\n?/m, "");
}

function destinationFor(repo, parent, pageName) {
  const parentPath = resolve(repo, parent);
  if (!relative(repo, parentPath) || relative(repo, parentPath).startsWith(`..${sep}`)) {
    throw new Error("The Wiki parent directory must be inside the cloned repository.");
  }
  return { markdown: join(parentPath, `${pageName}.md`) };
}

async function syncArticle(article, repo, parent) {
  const destination = destinationFor(repo, parent, wikiPageName(article.markdown, article.slug));
  const attachmentsDirectory = join(repo, ".attachments");
  await mkdir(attachmentsDirectory, { recursive: true });
  const attachments = [];
  for (const match of article.mediaLinks) {
    const attachment = attachmentName(article.slug, match[2], match[3]);
    await copyFile(join(article.source, match[2], match[3]), join(attachmentsDirectory, attachment));
    attachments.push(join(".attachments", attachment));
  }
  directoryRoot = repo;
  const relatedLinks = await relatedArticleLinkMap(article, repo);
  const publishedMarkdown = rewriteRelatedArticleLinks(rewriteMediaPaths(removeWikiChrome(article.markdown), article.slug), relatedLinks);
  await writeFile(destination.markdown, publishedMarkdown, "utf8");
  return { markdown: relative(repo, destination.markdown), attachments };
}

function requireGitIdentity(repo) {
  const name = gitConfigValue("user.name", repo);
  const email = gitConfigValue("user.email", repo);
  if (!name || !email) {
    throw new Error("Configure Git user.name and user.email before publishing. Run: git config --global user.name \"Your Name\"; git config --global user.email \"your.work.email@example.com\"");
  }
}

function gitConfigValue(key, cwd) {
  const result = spawnSync("git", ["config", "--get", key], { cwd, encoding: "utf8", stdio: "pipe" });
  return result.status === 0 ? result.stdout.trim() : "";
}

async function main() {
  const { options, sources } = parseArgs(process.argv.slice(2));
  const articles = await Promise.all(sources.map(validateArticleSource));
  const duplicates = articles.filter((article, index) => articles.findIndex((item) => wikiPageName(item.markdown, item.slug) === wikiPageName(article.markdown, article.slug)) !== index);
  if (duplicates.length) fail("Each selected article folder must have a unique folder name.");

  console.log("Selected articles:");
  for (const article of articles) {
    console.log(`- ${article.source} -> /${options.parent}/${wikiPageName(article.markdown, article.slug)}`);
  }

  if (options.dryRun) {
    console.log("Dry run complete. No Wiki repository was cloned or changed.");
    return;
  }

  const workspace = await mkdtemp(join(tmpdir(), "kb-wiki-publish-"));
  const repo = join(workspace, "wiki");
  try {
    console.log("Cloning Azure DevOps Wiki repository. Git Credential Manager may prompt you to sign in.");
    runGit(["clone", "--quiet", options.remote, repo], workspace);
    requireGitIdentity(repo);

    const changedPaths = [];
    for (const article of articles) {
      const destination = await syncArticle(article, repo, options.parent);
      changedPaths.push(destination.markdown, ...destination.attachments);
    }

    runGit(["add", "--", ...changedPaths], repo);
    const status = runGit(["status", "--porcelain"], repo);
    if (!status) {
      console.log("Wiki already matches the selected article content. Nothing to publish.");
      return;
    }

    runGit(["commit", "-m", options.message], repo);
    runGit(["push", "origin", "HEAD"], repo);
    console.log(`Published ${articles.length} article(s) beneath /${options.parent}/.`);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}

main().catch((error) => fail(error.message));