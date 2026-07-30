import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import {
  analyzeAutomations,
  loadAutomationFile,
  loadEntityRegistry,
} from "../src/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const document = await loadAutomationFile(
  path.join(root, "examples", "tangled-home", "automations.yaml"),
);
const registry = await loadEntityRegistry(
  path.join(root, "examples", "tangled-home", "entities.json"),
);
const iterations = 500;
const started = performance.now();
let findings = 0;

for (let index = 0; index < iterations; index += 1) {
  findings += analyzeAutomations([document], registry).summary.findings;
}

const elapsed = performance.now() - started;
if (findings === 0 || elapsed > 15_000) {
  throw new Error(
    `Benchmark sanity gate failed (${findings} findings, ${elapsed.toFixed(1)} ms)`,
  );
}
console.log(
  `${iterations} analyses in ${elapsed.toFixed(1)} ms ` +
    `(${(elapsed / iterations).toFixed(2)} ms/scan).`,
);
