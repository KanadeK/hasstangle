import fs from "node:fs/promises";
import path from "node:path";
import YAML from "yaml";

import { displayPath, isPlainObject, toArray } from "./utils.js";
import { normalizeAutomation } from "./model.js";

const AUTOMATION_EXTENSIONS = new Set([".yaml", ".yml", ".json"]);
const DIRECTORY_AUTOMATION_EXTENSIONS = new Set([".yaml", ".yml"]);

export async function collectAutomationFiles(inputs) {
  const found = [];
  for (const input of inputs) {
    const resolved = path.resolve(input);
    const stat = await fs.stat(resolved).catch(() => undefined);
    if (!stat) {
      throw new Error(`Input does not exist: ${input}`);
    }
    if (stat.isDirectory()) {
      await collectDirectory(resolved, found);
    } else if (AUTOMATION_EXTENSIONS.has(path.extname(resolved).toLowerCase())) {
      found.push(resolved);
    } else {
      throw new Error(`Unsupported input type: ${input}`);
    }
  }
  return [...new Set(found)].sort();
}

async function collectDirectory(directory, output) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (
      entry.name === ".git" ||
      entry.name === "node_modules" ||
      entry.name.startsWith(".")
    ) {
      continue;
    }
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectDirectory(fullPath, output);
    } else if (
      DIRECTORY_AUTOMATION_EXTENSIONS.has(
        path.extname(entry.name).toLowerCase(),
      )
    ) {
      output.push(fullPath);
    }
  }
}

export async function loadAutomationFile(filePath, { allowEmpty = false } = {}) {
  const resolved = path.resolve(filePath);
  const source = await fs.readFile(resolved, "utf8");
  let root;
  const parserWarnings = [];

  if (path.extname(resolved).toLowerCase() === ".json") {
    try {
      root = JSON.parse(source);
    } catch (error) {
      throw new Error(`${resolved}: invalid JSON: ${error.message}`);
    }
  } else {
    const document = YAML.parseDocument(source, {
      prettyErrors: true,
      strict: false,
      uniqueKeys: false,
    });
    if (document.errors.length > 0) {
      throw new Error(
        `${resolved}: invalid YAML: ${document.errors
          .map((error) => error.message)
          .join("; ")}`,
      );
    }
    parserWarnings.push(...document.warnings.map((warning) => warning.message));
    root = document.toJS({ maxAliasCount: 100 });
  }

  const entries = extractAutomationEntries(root);
  if (entries.length === 0) {
    if (allowEmpty) {
      return {
        file: resolved,
        displayFile: displayPath(resolved),
        source,
        parserWarnings,
        automations: [],
      };
    }
    throw new Error(
      `${resolved}: no inline automations found. Pass the included automations file directly when configuration.yaml uses !include.`,
    );
  }

  const automations = entries.map(({ raw, key }, index) =>
    normalizeAutomation(raw, {
      file: resolved,
      displayFile: displayPath(resolved),
      index,
      key,
      line: findAutomationLine(source, raw, key),
    }),
  );

  return {
    file: resolved,
    displayFile: displayPath(resolved),
    source,
    parserWarnings,
    automations,
  };
}

function extractAutomationEntries(root) {
  if (Array.isArray(root)) {
    return root
      .filter(isPlainObject)
      .map((raw) => ({ raw, key: undefined }));
  }
  if (!isPlainObject(root)) return [];

  for (const key of ["automation", "automations"]) {
    if (root[key] !== undefined) {
      return entriesFromContainer(root[key]);
    }
  }

  if (looksLikeAutomation(root)) {
    return [{ raw: root, key: undefined }];
  }
  return entriesFromContainer(root);
}

function entriesFromContainer(container) {
  if (Array.isArray(container)) {
    return container
      .filter(isPlainObject)
      .map((raw) => ({ raw, key: undefined }));
  }
  if (!isPlainObject(container)) return [];
  return Object.entries(container)
    .filter(([, value]) => isPlainObject(value) && looksLikeAutomation(value))
    .map(([key, raw]) => ({ raw, key }));
}

function looksLikeAutomation(value) {
  return (
    isPlainObject(value) &&
    [
      "trigger",
      "triggers",
      "action",
      "actions",
      "condition",
      "conditions",
    ].some((key) => key in value)
  );
}

function findAutomationLine(source, raw, key) {
  const lines = source.split(/\r?\n/);
  const candidates = [
    key ? new RegExp(`^\\s*${escapeRegex(key)}\\s*:`) : undefined,
    raw.id
      ? new RegExp(`^\\s*-?\\s*id\\s*:\\s*["']?${escapeRegex(raw.id)}["']?`)
      : undefined,
    raw.alias
      ? new RegExp(
          `^\\s*-?\\s*alias\\s*:\\s*["']?${escapeRegex(raw.alias)}["']?`,
        )
      : undefined,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const index = lines.findIndex((line) => candidate.test(line));
    if (index >= 0) return index + 1;
  }
  return 1;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function loadEntityRegistry(filePath) {
  if (!filePath) return undefined;
  const resolved = path.resolve(filePath);
  const source = await fs.readFile(resolved, "utf8");
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`${resolved}: invalid entity registry JSON: ${error.message}`);
  }

  const records = new Map();
  const candidates = Array.isArray(value)
    ? value
    : Array.isArray(value?.data?.entities)
      ? value.data.entities
      : Array.isArray(value?.entities)
        ? value.entities
        : isPlainObject(value)
          ? Object.entries(value).map(([entity_id, details]) => ({
              entity_id,
              ...(isPlainObject(details) ? details : {}),
            }))
          : [];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      records.set(candidate, { entity_id: candidate, state: undefined });
    } else if (isPlainObject(candidate)) {
      const entityId = candidate.entity_id ?? candidate.id;
      if (typeof entityId === "string") {
        records.set(entityId, {
          entity_id: entityId,
          state: candidate.state,
          disabled_by: candidate.disabled_by,
        });
      }
    }
  }
  return {
    file: resolved,
    displayFile: displayPath(resolved),
    records,
  };
}

export async function loadReplayEvents(filePath) {
  const resolved = path.resolve(filePath);
  const source = await fs.readFile(resolved, "utf8");
  let value;
  try {
    value = JSON.parse(source);
  } catch (error) {
    throw new Error(`${resolved}: invalid replay event JSON: ${error.message}`);
  }
  const events = Array.isArray(value) ? value : toArray(value.events);
  return events.map((event, index) => {
    if (!isPlainObject(event) || typeof event.entity_id !== "string") {
      throw new Error(`${resolved}: event ${index + 1} needs entity_id`);
    }
    return {
      entity_id: event.entity_id,
      from: event.from,
      to: event.to,
      at: event.at,
      source: event.source ?? "external",
    };
  });
}
