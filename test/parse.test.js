import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectAutomationFiles,
  loadAutomationFile,
  loadEntityRegistry,
  loadReplayEvents,
} from "../src/parse.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("loads modern and legacy Home Assistant automation syntax", async () => {
  const document = await loadAutomationFile(
    path.join(root, "examples/tangled-home/automations.yaml"),
  );
  assert.equal(document.automations.length, 11);
  assert.equal(document.automations[0].triggers[0].kind, "state");
  assert.equal(document.automations[2].triggers[0].kind, "state");
  assert.equal(document.automations[2].writes[0].service, "input_boolean.toggle");
  assert.ok(document.automations[3].hasWait);
  assert.ok(document.automations[4].hasWriteAfterWait);
});

test("loads object and array entity snapshots", async () => {
  const tangled = await loadEntityRegistry(
    path.join(root, "examples/tangled-home/entities.json"),
  );
  const safe = await loadEntityRegistry(
    path.join(root, "examples/safe-home/entities.json"),
  );
  assert.equal(tangled.records.get("input_boolean.loop_a").state, "off");
  assert.equal(safe.records.get("light.office").state, "off");
});

test("collects supported automation files recursively", async () => {
  const files = await collectAutomationFiles([path.join(root, "examples")]);
  assert.ok(
    files.some((file) => file.endsWith("safe-home\\automations.yaml") || file.endsWith("safe-home/automations.yaml")),
  );
  assert.ok(files.every((file) => /\.ya?ml$/i.test(file)));
  assert.ok(files.every((file) => !file.endsWith("entities.json")));
});

test("loads replay events with source defaults", async () => {
  const events = await loadReplayEvents(
    path.join(root, "examples/tangled-home/events.json"),
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].entity_id, "input_boolean.loop_a");
  assert.equal(events[0].source, "external");
});
