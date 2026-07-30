import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeAutomations } from "../src/analyze.js";
import { runCli } from "../src/cli.js";
import {
  collectAutomationFiles,
  loadAutomationFile,
  loadEntityRegistry,
  loadReplayEvents,
} from "../src/parse.js";
import { replayAutomations } from "../src/replay.js";

async function fixture(t, name, content) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "hasstangle-robust-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, name);
  await fs.writeFile(target, content, "utf8");
  return target;
}

function captureIo(cwd = process.cwd()) {
  const output = { stdout: "", stderr: "" };
  return {
    output,
    io: {
      cwd,
      stdout: (value) => {
        output.stdout += value;
      },
      stderr: (value) => {
        output.stderr += value;
      },
    },
  };
}

test("explicit JSON automation files are supported", async (t) => {
  const target = await fixture(
    t,
    "automations.json",
    `${JSON.stringify({
      automation: [
        {
          id: "json_rule",
          trigger: {
            platform: "state",
            entity_id: "input_boolean.source",
          },
          action: {
            service: "light.turn_on",
            target: { entity_id: "light.target" },
          },
        },
      ],
    })}\n`,
  );
  const files = await collectAutomationFiles([target]);
  const document = await loadAutomationFile(files[0]);
  assert.equal(document.automations[0].id, "json_rule");
  assert.equal(document.automations[0].writes[0].effect, "on");
});

test("invalid YAML is a usage error with source context", async (t) => {
  const target = await fixture(t, "bad.yaml", "- id: [\n");
  const capture = captureIo(path.dirname(target));
  const code = await runCli(["scan", path.basename(target)], capture.io);
  assert.equal(code, 2);
  assert.match(capture.output.stderr, /invalid YAML/);
  assert.match(capture.output.stderr, /bad\.yaml/);
});

test("include-only configuration tells users to scan the included file", async (t) => {
  const target = await fixture(
    t,
    "configuration.yaml",
    "automation: !include automations.yaml\n",
  );
  await assert.rejects(
    loadAutomationFile(target),
    /Pass the included automations file directly/,
  );
});

test("directory mode tolerates YAML that is not an automation", async (t) => {
  const target = await fixture(t, "scripts.yaml", "welcome:\n  sequence: []\n");
  const document = await loadAutomationFile(target, { allowEmpty: true });
  assert.equal(document.automations.length, 0);
});

test("invalid registry and replay inputs fail closed", async (t) => {
  const registry = await fixture(t, "registry.json", "{not-json}\n");
  await assert.rejects(loadEntityRegistry(registry), /invalid entity registry/);

  const events = await fixture(t, "events.json", '[{"to":"on"}]\n');
  await assert.rejects(loadReplayEvents(events), /needs entity_id/);
});

test("help, version, and rule catalog are stable CLI contracts", async () => {
  const version = captureIo();
  assert.equal(await runCli(["--version"], version.io), 0);
  assert.equal(version.output.stdout, "0.1.0\n");

  const help = captureIo();
  assert.equal(await runCli([], help.io), 0);
  assert.match(help.output.stdout, /Usage:/);

  const rules = captureIo();
  assert.equal(await runCli(["rules", "--format", "json"], rules.io), 0);
  assert.equal(Object.keys(JSON.parse(rules.output.stdout)).length, 14);
});

test("SOURCE_DATE_EPOCH makes reports and replay deterministic", async (t) => {
  const target = await fixture(
    t,
    "automation.yaml",
    [
      "- id: deterministic",
      "  trigger:",
      "    - platform: state",
      "      entity_id: input_boolean.source",
      "  action: []",
      "",
    ].join("\n"),
  );
  const previous = process.env.SOURCE_DATE_EPOCH;
  process.env.SOURCE_DATE_EPOCH = "1785398400";
  t.after(() => {
    if (previous === undefined) delete process.env.SOURCE_DATE_EPOCH;
    else process.env.SOURCE_DATE_EPOCH = previous;
  });
  const document = await loadAutomationFile(target);
  const report = analyzeAutomations([document]);
  const replay = replayAutomations(document.automations, [], undefined);
  assert.equal(report.generatedAt, "2026-07-30T08:00:00.000Z");
  assert.equal(replay.generatedAt, report.generatedAt);
});
