import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  analyzeAutomations,
  buildMermaidGraph,
  loadAutomationFile,
  loadEntityRegistry,
  loadReplayEvents,
  renderConsole,
  renderHtml,
  renderJson,
  renderSarif,
  replayAutomations,
} from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDirectory = path.join(root, "artifacts", "demo");

export async function buildDemo() {
  assertChildPath(artifactDirectory);
  await fs.rm(artifactDirectory, { recursive: true, force: true });
  await fs.mkdir(artifactDirectory, { recursive: true });

  const tangledFile = path.join(
    root,
    "examples",
    "tangled-home",
    "automations.yaml",
  );
  const tangled = await loadAutomationFile(tangledFile);
  const tangledRegistry = await loadEntityRegistry(
    path.join(root, "examples", "tangled-home", "entities.json"),
  );
  const tangledReport = analyzeAutomations([tangled], tangledRegistry);
  if (
    tangledReport.summary.counts.error === 0 ||
    tangledReport.summary.counts.warning === 0
  ) {
    throw new Error("The tangled fixture did not exercise both errors and warnings");
  }

  const safe = await loadAutomationFile(
    path.join(root, "examples", "safe-home", "automations.yaml"),
  );
  const safeRegistry = await loadEntityRegistry(
    path.join(root, "examples", "safe-home", "entities.json"),
  );
  const safeReport = analyzeAutomations([safe], safeRegistry);
  if (safeReport.findings.length !== 0) {
    throw new Error("The safe fixture unexpectedly produced findings");
  }

  const events = await loadReplayEvents(
    path.join(root, "examples", "tangled-home", "events.json"),
  );
  const replay = replayAutomations(
    tangled.automations,
    events,
    tangledRegistry,
    { maxSteps: 40 },
  );
  if (!replay.summary.loopDetected || !replay.summary.truncated) {
    throw new Error("The replay fixture did not prove its bounded loop");
  }

  const outputs = new Map([
    ["tangled-report.txt", renderConsole(tangledReport)],
    ["tangled-report.json", renderJson(tangledReport)],
    ["tangled-report.sarif", renderSarif(tangledReport)],
    ["tangled-report.html", renderHtml(tangledReport)],
    [
      "tangled-graph.mmd",
      buildMermaidGraph(tangled.automations),
    ],
    ["tangled-replay.json", `${JSON.stringify(replay, null, 2)}\n`],
    ["safe-report.txt", renderConsole(safeReport)],
  ]);
  for (const [name, content] of outputs) {
    await fs.writeFile(path.join(artifactDirectory, name), content, "utf8");
  }

  const summary = {
    tangled: tangledReport.summary,
    safe: safeReport.summary,
    replay: replay.summary,
    files: [...outputs.keys()].sort(),
  };
  await fs.writeFile(
    path.join(artifactDirectory, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8",
  );
  console.log(
    `Demo passed: ${tangledReport.summary.findings} findings, ` +
      `${replay.summary.traceSteps} replay steps, safe fixture clean.`,
  );
  return { artifactDirectory, summary };
}

function assertChildPath(target) {
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to modify path outside the repository: ${target}`);
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  await buildDemo();
}
