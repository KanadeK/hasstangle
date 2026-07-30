import fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = ["bin", "scripts", "src", "test"];
const files = [];

for (const directory of roots) {
  await collect(path.join(root, directory));
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
}

console.log(`Syntax check passed for ${files.length} JavaScript files.`);

async function collect(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collect(target);
    } else if (/\.(?:js|mjs)$/i.test(entry.name)) {
      files.push(target);
    }
  }
}
