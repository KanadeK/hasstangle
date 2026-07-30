import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { runCli } from "../src/cli.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function captureIo(cwd = root) {
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

test("scan uses meaningful exit codes", async () => {
  const tangled = captureIo();
  const tangledCode = await runCli(
    [
      "scan",
      "examples/tangled-home/automations.yaml",
      "--entities",
      "examples/tangled-home/entities.json",
    ],
    tangled.io,
  );
  assert.equal(tangledCode, 1);
  assert.match(tangled.output.stdout, /HassTangle 0.1.0/);

  const safe = captureIo();
  const safeCode = await runCli(
    [
      "scan",
      "examples/safe-home/automations.yaml",
      "--entities",
      "examples/safe-home/entities.json",
    ],
    safe.io,
  );
  assert.equal(safeCode, 0);
  assert.match(safe.output.stdout, /No findings/);
});

test("directory scans ignore non-automation YAML and helper JSON", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "hasstangle-dir-"));
  await fs.writeFile(
    path.join(temporary, "notes.yaml"),
    "title: not an automation\n",
  );
  await fs.writeFile(path.join(temporary, "entities.json"), "{}\n");
  await fs.copyFile(
    path.join(root, "examples/safe-home/automations.yaml"),
    path.join(temporary, "automations.yaml"),
  );
  const capture = captureIo(root);
  const code = await runCli(["scan", temporary], capture.io);
  assert.equal(code, 0);
  assert.match(capture.output.stdout, /3 automations/);
});

test("scan writes HTML and Mermaid artifacts", async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "hasstangle-test-"));
  const capture = captureIo(root);
  const code = await runCli(
    [
      "scan",
      "examples/tangled-home/automations.yaml",
      "--format",
      "html",
      "--output",
      path.join(temporary, "report.html"),
      "--graph",
      path.join(temporary, "graph.mmd"),
      "--fail-on",
      "none",
    ],
    capture.io,
  );
  assert.equal(code, 0);
  assert.match(await fs.readFile(path.join(temporary, "report.html"), "utf8"), /<!doctype html>/);
  assert.match(await fs.readFile(path.join(temporary, "graph.mmd"), "utf8"), /flowchart LR/);
});

test("invalid options return usage errors without throwing", async () => {
  const capture = captureIo();
  const code = await runCli(["scan", "x.yaml", "--wat"], capture.io);
  assert.equal(code, 2);
  assert.match(capture.output.stderr, /Unknown option/);
});
