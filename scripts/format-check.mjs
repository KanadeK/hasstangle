import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ignored = new Set([
  ".git",
  ".npm-cache",
  "artifacts",
  "coverage",
  "node_modules",
  "release",
]);
const textExtensions = new Set([
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".txt",
  ".yaml",
  ".yml",
]);
const files = [];
const failures = [];

await collect(root);

for (const file of files.sort()) {
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const source = await fs.readFile(file, "utf8");
  if (!source.endsWith("\n")) failures.push(`${relative}: missing final newline`);
  source.split(/\r?\n/).forEach((line, index) => {
    if (/[ \t]+$/.test(line)) {
      failures.push(`${relative}:${index + 1}: trailing whitespace`);
    }
  });
  if (path.extname(file).toLowerCase() === ".json") {
    try {
      JSON.parse(source);
    } catch (error) {
      failures.push(`${relative}: invalid JSON: ${error.message}`);
    }
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}
console.log(`Text hygiene passed for ${files.length} files.`);

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(target);
      continue;
    }
    if (
      textExtensions.has(path.extname(entry.name).toLowerCase()) ||
      [".gitattributes", ".gitignore", ".npmrc"].includes(entry.name)
    ) {
      files.push(target);
    }
  }
}
