import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  loadAutomationFile,
  loadEntityRegistry,
  loadReplayEvents,
} from "../src/parse.js";
import { replayAutomations } from "../src/replay.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("bounded replay proves a two-automation toggle loop", async () => {
  const document = await loadAutomationFile(
    path.join(root, "examples/tangled-home/automations.yaml"),
  );
  const registry = await loadEntityRegistry(
    path.join(root, "examples/tangled-home/entities.json"),
  );
  const events = await loadReplayEvents(
    path.join(root, "examples/tangled-home/events.json"),
  );
  const replay = replayAutomations(document.automations, events, registry, {
    maxSteps: 40,
  });
  assert.equal(replay.summary.loopDetected, true);
  assert.equal(replay.summary.truncated, true);
  assert.equal(replay.summary.traceSteps, 40);
  assert.ok(
    replay.trace.some(
      (item) => item.type === "automation" && item.automationId === "mirror_b_to_a",
    ),
  );
});

test("replay ignores unchanged state events", async () => {
  const document = await loadAutomationFile(
    path.join(root, "examples/safe-home/automations.yaml"),
  );
  const registry = await loadEntityRegistry(
    path.join(root, "examples/safe-home/entities.json"),
  );
  const replay = replayAutomations(
    document.automations,
    [
      {
        entity_id: "binary_sensor.office_motion",
        from: "off",
        to: "off",
      },
    ],
    registry,
  );
  assert.equal(replay.summary.loopDetected, false);
  assert.equal(
    replay.trace.filter((item) => item.type === "automation").length,
    0,
  );
});
