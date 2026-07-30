import fs from "node:fs/promises";
import path from "node:path";

import { analyzeAutomations, RULES, shouldFail } from "./analyze.js";
import { buildMermaidGraph } from "./graph.js";
import {
  collectAutomationFiles,
  loadAutomationFile,
  loadEntityRegistry,
  loadReplayEvents,
} from "./parse.js";
import { replayAutomations } from "./replay.js";
import {
  renderConsole,
  renderHtml,
  renderJson,
  renderSarif,
} from "./reports.js";
import { stableStringify } from "./utils.js";
import { VERSION } from "./version.js";

export async function runCli(
  argv,
  io = {
    cwd: process.cwd(),
    stdout: (value) => process.stdout.write(value),
    stderr: (value) => process.stderr.write(value),
  },
) {
  try {
    if (argv.includes("--version") || argv[0] === "version") {
      io.stdout(`${VERSION}\n`);
      return 0;
    }
    const command =
      argv.length === 0 || argv[0].startsWith("-")
        ? "help"
        : ["scan", "replay", "rules", "help"].includes(argv[0])
          ? argv[0]
          : "scan";
    const args = command === "scan" && argv[0] !== "scan" ? argv : argv.slice(1);

    if (command === "help") {
      io.stdout(helpText());
      return 0;
    }
    if (command === "rules") {
      const options = parseArguments(args, new Set(["format"]), new Set());
      if ((options.values.format ?? "console") === "json") {
        io.stdout(stableStringify(RULES));
      } else {
        io.stdout(renderRulesConsole());
      }
      return 0;
    }
    if (command === "scan") return await runScan(args, io);
    if (command === "replay") return await runReplay(args, io);
    throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    io.stderr(`HassTangle: ${error.message}\n`);
    return 2;
  }
}

async function runScan(args, io) {
  const options = parseArguments(
    args,
    new Set(["entities", "format", "output", "graph", "fail-on"]),
    new Set(["quiet"]),
  );
  if (options.positionals.length === 0) {
    throw new Error("scan needs at least one automation YAML/JSON file or directory");
  }
  const fileInputs = options.positionals.map((input) =>
    path.resolve(io.cwd, input),
  );
  const explicitFiles = new Set();
  for (const fileInput of fileInputs) {
    const stat = await fs.stat(fileInput);
    if (stat.isFile()) explicitFiles.add(fileInput);
  }
  const files = await collectAutomationFiles(fileInputs);
  const documents = (
    await Promise.all(
      files.map((file) =>
        loadAutomationFile(file, { allowEmpty: !explicitFiles.has(file) }),
      ),
    )
  ).filter((document) => document.automations.length > 0);
  if (documents.length === 0) {
    throw new Error("No inline automations found in the supplied inputs");
  }
  const entityRegistry = options.values.entities
    ? await loadEntityRegistry(path.resolve(io.cwd, options.values.entities))
    : undefined;
  const report = analyzeAutomations(documents, entityRegistry);
  const format = options.values.format ?? "console";
  const rendered = renderByFormat(report, format);

  if (options.values.output) {
    await writeText(path.resolve(io.cwd, options.values.output), rendered);
    if (!options.flags.quiet) {
      io.stdout(`Wrote ${format} report to ${options.values.output}\n`);
    }
  } else {
    io.stdout(rendered);
  }

  if (options.values.graph) {
    const graph = buildMermaidGraph(documents.flatMap((item) => item.automations));
    await writeText(path.resolve(io.cwd, options.values.graph), graph);
    if (!options.flags.quiet) {
      io.stdout(`Wrote Mermaid graph to ${options.values.graph}\n`);
    }
  }

  const threshold = options.values["fail-on"] ?? "error";
  if (!["error", "warning", "note", "none"].includes(threshold)) {
    throw new Error("--fail-on must be error, warning, note, or none");
  }
  return shouldFail(report, threshold) ? 1 : 0;
}

async function runReplay(args, io) {
  const options = parseArguments(
    args,
    new Set(["events", "entities", "output", "max-steps"]),
    new Set(),
  );
  if (options.positionals.length !== 1) {
    throw new Error("replay needs exactly one automation file");
  }
  if (!options.values.events) {
    throw new Error("replay needs --events <events.json>");
  }
  const document = await loadAutomationFile(
    path.resolve(io.cwd, options.positionals[0]),
  );
  const events = await loadReplayEvents(
    path.resolve(io.cwd, options.values.events),
  );
  const registry = options.values.entities
    ? await loadEntityRegistry(path.resolve(io.cwd, options.values.entities))
    : undefined;
  const maxSteps = Number(options.values["max-steps"] ?? 100);
  if (!Number.isInteger(maxSteps) || maxSteps < 1 || maxSteps > 10_000) {
    throw new Error("--max-steps must be an integer between 1 and 10000");
  }
  const replay = replayAutomations(
    document.automations,
    events,
    registry,
    { maxSteps },
  );
  const rendered = stableStringify(replay);
  if (options.values.output) {
    await writeText(path.resolve(io.cwd, options.values.output), rendered);
    io.stdout(`Wrote replay trace to ${options.values.output}\n`);
  } else {
    io.stdout(rendered);
  }
  return replay.summary.loopDetected ? 1 : 0;
}

function renderByFormat(report, format) {
  if (format === "console") return renderConsole(report);
  if (format === "json") return renderJson(report);
  if (format === "sarif") return renderSarif(report);
  if (format === "html") return renderHtml(report);
  throw new Error("--format must be console, json, sarif, or html");
}

function parseArguments(args, valueOptions, flagOptions) {
  const values = {};
  const flags = {};
  const positionals = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--") {
      positionals.push(...args.slice(index + 1));
      break;
    }
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const [name, inline] = argument.slice(2).split("=", 2);
    if (flagOptions.has(name)) {
      flags[name] = true;
      continue;
    }
    if (!valueOptions.has(name)) {
      throw new Error(`Unknown option: --${name}`);
    }
    const value = inline ?? args[index + 1];
    if (value === undefined || (inline === undefined && value.startsWith("--"))) {
      throw new Error(`--${name} needs a value`);
    }
    values[name] = value;
    if (inline === undefined) index += 1;
  }
  return { values, flags, positionals };
}

async function writeText(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
}

function renderRulesConsole() {
  const lines = ["HassTangle rules", ""];
  for (const [ruleId, rule] of Object.entries(RULES)) {
    lines.push(
      `${ruleId} [${rule.defaultSeverity}] ${rule.title}`,
      `  ${rule.description}`,
      `  Fix: ${rule.repair}`,
      "",
    );
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

function helpText() {
  return `HassTangle ${VERSION}
Deterministic static analysis for Home Assistant automations.

Usage:
  hasstangle scan <file|directory>... [options]
  hasstangle replay <file> --events <events.json> [options]
  hasstangle rules [--format console|json]
  hasstangle --version

Scan options:
  --entities <json>       Entity registry or state snapshot
  --format <format>       console, json, sarif, or html (default: console)
  --output <path>         Write the report instead of stdout
  --graph <path>          Write a Mermaid entity/automation graph
  --fail-on <severity>    error, warning, note, or none (default: error)
  --quiet                 Suppress write confirmations

Replay options:
  --events <json>         State-change events to replay
  --entities <json>       Initial entity states
  --max-steps <number>    Stop runaway traces (default: 100)
  --output <path>         Write JSON trace instead of stdout

Examples:
  hasstangle scan automations.yaml --entities entities.json
  hasstangle scan config/ --format sarif --output hasstangle.sarif
  hasstangle replay automations.yaml --events events.json --max-steps 50
`;
}
