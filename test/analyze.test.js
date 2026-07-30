import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { analyzeAutomations, shouldFail } from "../src/analyze.js";
import { loadAutomationFile, loadEntityRegistry } from "../src/parse.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("finds independent high-value failure classes in tangled fixture", async () => {
  const document = await loadAutomationFile(
    path.join(root, "examples/tangled-home/automations.yaml"),
  );
  const registry = await loadEntityRegistry(
    path.join(root, "examples/tangled-home/entities.json"),
  );
  const report = analyzeAutomations([document], registry);
  const ruleIds = new Set(report.findings.map((finding) => finding.ruleId));

  for (const expected of [
    "HT001",
    "HT002",
    "HT003",
    "HT004",
    "HT005",
    "HT006",
    "HT007",
    "HT008",
    "HT009",
    "HT012",
    "HT013",
  ]) {
    assert.ok(ruleIds.has(expected), `expected ${expected}`);
  }
  assert.ok(report.summary.counts.error >= 5);
  assert.ok(report.summary.riskScore < 50);
  assert.equal(shouldFail(report, "error"), true);
  assert.equal(shouldFail(report, "none"), false);
});

test("safe fixture produces no findings with a current registry", async () => {
  const document = await loadAutomationFile(
    path.join(root, "examples/safe-home/automations.yaml"),
  );
  const registry = await loadEntityRegistry(
    path.join(root, "examples/safe-home/entities.json"),
  );
  const report = analyzeAutomations([document], registry);
  assert.deepEqual(report.summary.counts, {
    error: 0,
    warning: 0,
    note: 0,
  });
  assert.equal(report.summary.riskScore, 100);
});

test("reports duplicate IDs across files without merging identities", async () => {
  const first = await loadAutomationFile(
    path.join(root, "examples/safe-home/automations.yaml"),
  );
  const second = structuredClone(first);
  second.file = `${first.file}.copy`;
  second.automations = second.automations.map((automation) => ({
    ...automation,
    key: `${automation.key}.copy`,
    file: `${automation.file}.copy`,
  }));
  const report = analyzeAutomations([first, second]);
  assert.ok(report.findings.some((finding) => finding.ruleId === "HT010"));
});
