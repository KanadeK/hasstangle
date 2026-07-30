import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

import { VERSION } from "../src/version.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);

if (packageJson.version !== VERSION) {
  failures.push(
    `package.json version ${packageJson.version} does not match ${VERSION}`,
  );
}
for (const file of ["CHANGELOG.md", "RELEASE_NOTES.md"]) {
  const source = await fs.readFile(path.join(root, file), "utf8");
  if (!source.includes(VERSION)) failures.push(`${file} does not mention ${VERSION}`);
}
const binary = await fs.readFile(path.join(root, "bin", "hasstangle.js"), "utf8");
if (!binary.startsWith("#!/usr/bin/env node\n")) {
  failures.push("bin/hasstangle.js needs a portable Node.js shebang");
}

const workflowDirectory = path.join(root, ".github", "workflows");
for (const entry of await fs.readdir(workflowDirectory)) {
  if (!/\.ya?ml$/i.test(entry)) continue;
  const target = path.join(workflowDirectory, entry);
  let workflow;
  try {
    workflow = YAML.parse(await fs.readFile(target, "utf8"));
  } catch (error) {
    failures.push(`${entry}: invalid workflow YAML: ${error.message}`);
    continue;
  }
  if (!workflow?.name || !workflow?.on || !workflow?.jobs) {
    failures.push(`${entry}: workflow needs name, on, and jobs`);
  }
  walk(workflow, (key, value) => {
    if (key !== "uses" || typeof value !== "string") return;
    if (!/@v\d+$/.test(value)) {
      failures.push(`${entry}: action is not pinned to a major tag: ${value}`);
    }
  });
}

const markdownFiles = [];
await collectMarkdown(root, markdownFiles);
for (const file of markdownFiles) {
  const source = await fs.readFile(file, "utf8");
  for (const match of source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    let link = match[1].trim().replace(/^<|>$/g, "");
    if (
      !link ||
      link.startsWith("#") ||
      /^[a-z][a-z0-9+.-]*:/i.test(link)
    ) {
      continue;
    }
    link = decodeURIComponent(link.split("#", 1)[0]);
    const target = path.resolve(path.dirname(file), link);
    if (!(await fs.stat(target).catch(() => undefined))) {
      failures.push(
        `${path.relative(root, file)}: missing local link target ${link}`,
      );
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
console.log(
  `Repository contract passed for ${markdownFiles.length} Markdown files and ` +
    `${(await fs.readdir(workflowDirectory)).length} workflows.`,
);

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    visitor(key, item);
    walk(item, visitor);
  }
}

async function collectMarkdown(directory, output) {
  const ignored = new Set([
    ".git",
    ".npm-cache",
    "artifacts",
    "node_modules",
    "release",
  ]);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectMarkdown(target, output);
    else if (entry.name.endsWith(".md")) output.push(target);
  }
}
