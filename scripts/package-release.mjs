import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

import { buildDemo } from "./demo.mjs";
import { generatedTimestamp } from "../src/utils.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "release");
const packageJson = JSON.parse(
  await fs.readFile(path.join(root, "package.json"), "utf8"),
);
const packageLock = JSON.parse(
  await fs.readFile(path.join(root, "package-lock.json"), "utf8"),
);

assertChildPath(releaseDirectory);
await fs.rm(releaseDirectory, { recursive: true, force: true });
await fs.mkdir(releaseDirectory, { recursive: true });
const { artifactDirectory } = await buildDemo();

for (const name of [
  "tangled-graph.mmd",
  "tangled-report.html",
  "tangled-report.sarif",
  "tangled-replay.json",
]) {
  await fs.copyFile(
    path.join(artifactDirectory, name),
    path.join(releaseDirectory, name),
  );
}
const yamlPackage = packageLock.packages["node_modules/yaml"];
const rootPurl = `pkg:npm/${packageJson.name}@${packageJson.version}`;
const yamlPurl = `pkg:npm/yaml@${yamlPackage.version}`;
const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  version: 1,
  metadata: {
    timestamp: generatedTimestamp(),
    component: {
      type: "application",
      "bom-ref": rootPurl,
      name: packageJson.name,
      version: packageJson.version,
      purl: rootPurl,
      licenses: [{ license: { id: "MIT" } }],
    },
  },
  components: [
    {
      type: "library",
      "bom-ref": yamlPurl,
      name: "yaml",
      version: yamlPackage.version,
      purl: yamlPurl,
      licenses: [{ license: { id: yamlPackage.license } }],
    },
  ],
  dependencies: [
    { ref: rootPurl, dependsOn: [yamlPurl] },
    { ref: yamlPurl, dependsOn: [] },
  ],
};
await fs.writeFile(
  path.join(releaseDirectory, "hasstangle-sbom.cdx.json"),
  `${JSON.stringify(sbom, null, 2)}\n`,
  "utf8",
);

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  throw new Error(
    "npm_execpath is missing. Run this through `npm run release:build`.",
  );
}
const packed = spawnSync(
  process.execPath,
  [npmExecPath, "pack", "--pack-destination", releaseDirectory],
  {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  },
);
if (packed.status !== 0) {
  process.stderr.write(packed.stdout);
  process.stderr.write(packed.stderr);
  process.exit(packed.status ?? 1);
}
const packageArchive = path.join(
  releaseDirectory,
  `${packageJson.name}-${packageJson.version}.tgz`,
);
await normalizePackageArchive(packageArchive);

const assetNames = (await fs.readdir(releaseDirectory)).sort();
const manifest = {
  name: packageJson.name,
  version: packageJson.version,
  generatedAt: generatedTimestamp(),
  sourceDateEpoch: process.env.SOURCE_DATE_EPOCH ?? null,
  runtimeRequirements: packageJson.engines,
  assets: [],
};
for (const name of assetNames) {
  const buffer = await fs.readFile(path.join(releaseDirectory, name));
  manifest.assets.push({
    name,
    bytes: buffer.length,
    sha256: sha256(buffer),
  });
}
await fs.writeFile(
  path.join(releaseDirectory, "release-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

const finalNames = (await fs.readdir(releaseDirectory)).sort();
const checksumLines = [];
for (const name of finalNames) {
  const buffer = await fs.readFile(path.join(releaseDirectory, name));
  checksumLines.push(`${sha256(buffer)}  ${name}`);
}
await fs.writeFile(
  path.join(releaseDirectory, "SHA256SUMS.txt"),
  `${checksumLines.join("\n")}\n`,
  "utf8",
);
console.log(`Release bundle built with ${finalNames.length + 1} files.`);

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function normalizePackageArchive(archivePath) {
  const compressed = await fs.readFile(archivePath);
  const tar = zlib.gunzipSync(compressed);
  let offset = 0;
  let executableSeen = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((value) => value === 0)) break;
    const name = readTarText(header, 0, 100);
    const prefix = readTarText(header, 345, 155);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const size = readTarOctal(header, 124, 12);
    const type = readTarText(header, 156, 1);
    const mode =
      fullName === "package/bin/hasstangle.js"
        ? 0o755
        : type === "5"
          ? 0o755
          : 0o644;
    if (fullName === "package/bin/hasstangle.js") executableSeen = true;
    writeTarOctal(header, 100, 8, mode);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    header.fill(0x20, 148, 156);
    const checksum = header.reduce((sum, value) => sum + value, 0);
    const encodedChecksum = `${checksum.toString(8).padStart(6, "0")}\0 `;
    header.write(encodedChecksum, 148, 8, "ascii");
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (!executableSeen) {
    throw new Error("Packed archive is missing package/bin/hasstangle.js");
  }
  const normalized = zlib.gzipSync(tar, { level: 9, mtime: 0 });
  normalized.fill(0, 4, 8);
  normalized[9] = 255;
  await fs.writeFile(archivePath, normalized);
}

function readTarText(header, offset, length) {
  const end = header.indexOf(0, offset);
  const limit = end >= offset && end < offset + length ? end : offset + length;
  return header.toString("utf8", offset, limit).trim();
}

function readTarOctal(header, offset, length) {
  const value = readTarText(header, offset, length).replace(/\0/g, "").trim();
  const parsed = Number.parseInt(value || "0", 8);
  if (!Number.isFinite(parsed)) throw new Error("Invalid tar size field");
  return parsed;
}

function writeTarOctal(header, offset, length, value) {
  const encoded = `${value.toString(8).padStart(length - 1, "0")}\0`;
  header.write(encoded, offset, length, "ascii");
}

function assertChildPath(target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify path outside the repository: ${target}`);
  }
}
