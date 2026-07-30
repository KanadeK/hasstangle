import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const assetNames = (await fs.readdir(releaseDirectory)).sort();
const manifest = {
  name: packageJson.name,
  version: packageJson.version,
  generatedAt: generatedTimestamp(),
  sourceDateEpoch: process.env.SOURCE_DATE_EPOCH ?? null,
  node: process.version,
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

function assertChildPath(target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify path outside the repository: ${target}`);
  }
}
