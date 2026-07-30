import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(process.argv[2] ?? "release-checksums");
const checksumFiles = [];
await collect(root);

if (checksumFiles.length < 2) {
  throw new Error(
    `Expected at least two SHA256SUMS.txt files under ${root}; found ${checksumFiles.length}`,
  );
}
checksumFiles.sort();
const baseline = await fs.readFile(checksumFiles[0], "utf8");
for (const file of checksumFiles.slice(1)) {
  const candidate = await fs.readFile(file, "utf8");
  if (candidate !== baseline) {
    throw new Error(
      `Release hashes differ between ${path.relative(root, checksumFiles[0])} ` +
        `and ${path.relative(root, file)}`,
    );
  }
}
const assetCount = baseline.trim().split(/\r?\n/).length;
console.log(
  `Cross-platform reproducibility passed: ${checksumFiles.length} builds, ` +
    `${assetCount} signed assets each.`,
);

async function collect(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(target);
    else if (entry.name === "SHA256SUMS.txt") checksumFiles.push(target);
  }
}
