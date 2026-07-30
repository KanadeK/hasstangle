import path from "node:path";

export const SEVERITY_RANK = Object.freeze({
  error: 3,
  warning: 2,
  note: 1,
  none: 0,
});

export function toArray(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function unique(values) {
  return [...new Set(values)];
}

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function entityStrings(value) {
  return unique(
    toArray(value)
      .flatMap((item) => {
        if (typeof item === "string") {
          return item
            .split(",")
            .map((part) => part.trim())
            .filter(Boolean);
        }
        return [];
      })
      .filter(isEntityId),
  );
}

export function isEntityId(value) {
  return /^[a-z_][a-z0-9_]*\.[a-z0-9_]+$/i.test(value);
}

export function extractTemplateEntityIds(value) {
  if (typeof value !== "string") return [];
  if (!value.includes("{{") && !value.includes("{%")) return [];

  const matches = [];
  const patterns = [
    /\b(?:is_state|is_state_attr|state_attr|states|expand)\(\s*["']([a-z_][a-z0-9_]*\.[a-z0-9_]+)["']/gi,
    /\bstates\.([a-z_][a-z0-9_]*)\.([a-z0-9_]+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      matches.push(
        match.length === 3 ? `${match[1]}.${match[2]}` : match[1],
      );
    }
  }
  return unique(matches);
}

export function collectTemplateEntityIds(value) {
  const found = [];
  walkValue(value, (item) => {
    if (typeof item === "string") {
      found.push(...extractTemplateEntityIds(item));
    }
  });
  return unique(found);
}

export function walkValue(value, visitor) {
  visitor(value);
  if (Array.isArray(value)) {
    for (const item of value) walkValue(item, visitor);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) walkValue(item, visitor);
  }
}

export function slugify(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

export function displayPath(filePath, cwd = process.cwd()) {
  const relative = path.relative(cwd, filePath);
  const selected =
    relative && !relative.startsWith("..") ? relative : filePath;
  return String(selected).replaceAll("\\", "/");
}

export function stableSortObject(value) {
  if (Array.isArray(value)) return value.map(stableSortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableSortObject(value[key])]),
  );
}

export function stableStringify(value, spaces = 2) {
  return `${JSON.stringify(stableSortObject(value), null, spaces)}\n`;
}

export function generatedTimestamp() {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  if (epoch !== undefined && /^\d+$/.test(epoch)) {
    const milliseconds = Number(epoch) * 1000;
    if (Number.isFinite(milliseconds)) {
      const timestamp = new Date(milliseconds);
      if (!Number.isNaN(timestamp.valueOf())) return timestamp.toISOString();
    }
  }
  return new Date().toISOString();
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function oppositeEffects(left, right) {
  const pairs = new Set([
    "off:on",
    "on:off",
    "locked:unlocked",
    "unlocked:locked",
    "closed:open",
    "open:closed",
    "home:away",
    "away:home",
    "paused:playing",
    "playing:paused",
  ]);
  return pairs.has(`${left}:${right}`);
}

export function effectFromService(service) {
  const normalized = String(service ?? "").toLowerCase();
  const action = normalized.split(".").at(-1);
  const mapping = {
    turn_on: "on",
    turn_off: "off",
    toggle: "toggle",
    lock: "locked",
    unlock: "unlocked",
    open_cover: "open",
    close_cover: "closed",
    media_play: "playing",
    media_pause: "paused",
    media_stop: "paused",
  };
  return mapping[action] ?? "unknown";
}

export function severityAtLeast(actual, threshold) {
  return (SEVERITY_RANK[actual] ?? 0) >= (SEVERITY_RANK[threshold] ?? 0);
}

export function parseNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function compareFindings(left, right) {
  const severity =
    (SEVERITY_RANK[right.severity] ?? 0) -
    (SEVERITY_RANK[left.severity] ?? 0);
  if (severity !== 0) return severity;
  return (
    left.ruleId.localeCompare(right.ruleId) ||
    left.location.file.localeCompare(right.location.file) ||
    left.location.line - right.location.line ||
    left.message.localeCompare(right.message)
  );
}
