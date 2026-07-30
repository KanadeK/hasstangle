import assert from "node:assert/strict";
import test from "node:test";

import {
  renderConsole,
  renderHtml,
  renderJson,
  renderSarif,
} from "../src/reports.js";
import { VERSION } from "../src/version.js";

const report = {
  tool: { name: "HassTangle", version: VERSION },
  generatedAt: "2026-07-30T00:00:00.000Z",
  summary: {
    automations: 1,
    entitiesReferenced: 1,
    riskScore: 75,
    counts: { error: 1, warning: 0, note: 0 },
  },
  findings: [
    {
      ruleId: "HT001",
      severity: "error",
      title: "Self-trigger feedback",
      message: "<unsafe> writes itself",
      repair: "Add a guard.",
      automationIds: ["loop"],
      entities: ["input_boolean.loop"],
      location: { file: "automations.yaml", line: 2 },
    },
  ],
};

test("renders machine and human report formats", () => {
  assert.match(renderConsole(report), /HT001/);
  assert.equal(JSON.parse(renderJson(report)).summary.riskScore, 75);
  const sarif = JSON.parse(renderSarif(report));
  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].level, "error");
});

test("HTML report escapes untrusted automation text", () => {
  const html = renderHtml(report);
  assert.match(html, /&lt;unsafe&gt;/);
  assert.doesNotMatch(html, /<unsafe>/);
  assert.match(html, /Risk score/);
});
