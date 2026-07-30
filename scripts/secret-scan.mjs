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
const self = "scripts/secret-scan.mjs";
const patterns = [
  ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ["GitHub token", new RegExp(`gh${"[pousr]"}_[A-Za-z0-9]{30,}`)],
  ["AWS access key", /AKIA[0-9A-Z]{16}/],
  [
    "assigned credential",
    /\b(?:api[_-]?key|password|secret|token)\b\s*[:=]\s*["'][^"' \n]{12,}["']/i,
  ],
];
const findings = [];

await collect(root);

if (findings.length > 0) {
  process.stderr.write(
    `${findings
      .map((finding) => `${finding.file}:${finding.line}: ${finding.kind}`)
      .join("\n")}\n`,
  );
  process.exit(1);
}
console.log("Secret scan passed.");

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(target);
      continue;
    }
    const relative = path.relative(root, target).replaceAll("\\", "/");
    if (relative === self) continue;
    const stat = await fs.stat(target);
    if (stat.size > 2_000_000) continue;
    const source = await fs.readFile(target, "utf8").catch(() => undefined);
    if (source === undefined || source.includes("\u0000")) continue;
    source.split(/\r?\n/).forEach((line, index) => {
      for (const [kind, pattern] of patterns) {
        if (pattern.test(line)) {
          findings.push({ file: relative, line: index + 1, kind });
        }
      }
    });
  }
}
