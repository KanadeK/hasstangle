import path from "node:path";

import { RULES } from "./analyze.js";
import { escapeHtml, stableStringify } from "./utils.js";

export function renderJson(report) {
  return stableStringify(report);
}

export function renderConsole(report) {
  const lines = [
    `HassTangle ${report.tool.version}`,
    `${report.summary.automations} automations · ${report.summary.entitiesReferenced} entities · risk ${report.summary.riskScore}/100`,
    `${report.summary.counts.error} errors · ${report.summary.counts.warning} warnings · ${report.summary.counts.note} notes`,
    "",
  ];
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `[${finding.severity.toUpperCase()}] ${finding.ruleId} ${finding.title}`,
        `  ${finding.location.file}:${finding.location.line}`,
        `  ${finding.message}`,
        `  Fix: ${finding.repair}`,
        "",
      );
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function renderSarif(report) {
  const rulesUsed = [...new Set(report.findings.map((finding) => finding.ruleId))];
  return stableStringify({
    $schema:
      "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "HassTangle",
            version: report.tool.version,
            informationUri: "https://github.com/KanadeK/hasstangle",
            rules: rulesUsed.map((ruleId) => ({
              id: ruleId,
              name: RULES[ruleId].title.replaceAll(" ", ""),
              shortDescription: { text: RULES[ruleId].title },
              fullDescription: { text: RULES[ruleId].description },
              help: { text: RULES[ruleId].repair },
              defaultConfiguration: {
                level: sarifLevel(RULES[ruleId].defaultSeverity),
              },
            })),
          },
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding.severity),
          message: { text: finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: pathToSarifUri(finding.location.file),
                },
                region: {
                  startLine: Math.max(1, finding.location.line),
                },
              },
            },
          ],
          properties: {
            automationIds: finding.automationIds,
            entities: finding.entities,
            repair: finding.repair,
          },
        })),
      },
    ],
  });
}

export function renderHtml(report) {
  const findings = report.findings
    .map(
      (finding) => `
        <article class="finding ${escapeHtml(finding.severity)}">
          <div class="finding-head">
            <span class="badge">${escapeHtml(finding.severity)}</span>
            <strong>${escapeHtml(finding.ruleId)} · ${escapeHtml(finding.title)}</strong>
          </div>
          <p>${escapeHtml(finding.message)}</p>
          <dl>
            <div><dt>Location</dt><dd>${escapeHtml(finding.location.file)}:${finding.location.line}</dd></div>
            <div><dt>Automations</dt><dd>${escapeHtml(finding.automationIds.join(", ") || "—")}</dd></div>
            <div><dt>Entities</dt><dd>${escapeHtml(finding.entities.join(", ") || "—")}</dd></div>
          </dl>
          <p class="repair"><span>Repair</span>${escapeHtml(finding.repair)}</p>
        </article>`,
    )
    .join("");
  const empty =
    report.findings.length === 0
      ? '<div class="empty">No findings. The scanned model passed every enabled rule.</div>'
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>HassTangle report</title>
  <style>
    :root { color-scheme: light; --ink:#10243e; --muted:#5d6b7b; --paper:#f5f3ed; --card:#fff; --blue:#1167b1; --error:#c5283d; --warn:#d97706; --note:#3b82f6; }
    * { box-sizing:border-box; }
    body { margin:0; font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; color:var(--ink); background:var(--paper); }
    main { width:min(1060px,calc(100% - 32px)); margin:40px auto 72px; }
    header { display:grid; grid-template-columns:1fr auto; gap:24px; align-items:end; padding:28px; background:var(--ink); color:#fff; border-radius:18px; box-shadow:0 16px 45px #10243e22; }
    h1 { margin:0 0 6px; font-size:clamp(32px,6vw,56px); line-height:1; letter-spacing:-.04em; }
    header p { margin:0; color:#c7d7e8; }
    .score { font-size:38px; font-weight:800; white-space:nowrap; }
    .score small { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.16em; color:#87c8ff; }
    .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin:18px 0 28px; }
    .stat { padding:16px 18px; background:var(--card); border:1px solid #dce2e8; border-radius:12px; }
    .stat b { display:block; font-size:28px; }
    .stat span { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    .finding { margin:12px 0; padding:20px; background:var(--card); border:1px solid #dce2e8; border-left:6px solid var(--note); border-radius:12px; }
    .finding.error { border-left-color:var(--error); } .finding.warning { border-left-color:var(--warn); }
    .finding-head { display:flex; gap:10px; align-items:center; }
    .badge { padding:3px 8px; border-radius:999px; background:#eaf2fb; font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    .error .badge { color:var(--error); background:#fdecef; } .warning .badge { color:#9a5200; background:#fff1d6; }
    .finding p { margin:12px 0; }
    dl { display:grid; gap:5px; margin:12px 0; }
    dl div { display:grid; grid-template-columns:100px 1fr; gap:12px; }
    dt { color:var(--muted); } dd { margin:0; overflow-wrap:anywhere; }
    .repair { display:grid; grid-template-columns:100px 1fr; gap:12px; padding-top:12px; border-top:1px solid #e8ebee; }
    .repair span { color:var(--blue); font-weight:700; }
    .empty { padding:48px; text-align:center; background:#fff; border:1px solid #dce2e8; border-radius:12px; }
    footer { margin-top:28px; color:var(--muted); font-size:12px; }
    @media (max-width:680px) { header { grid-template-columns:1fr; } .stats { grid-template-columns:repeat(2,1fr); } dl div,.repair { grid-template-columns:1fr; gap:2px; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div><h1>HassTangle</h1><p>Deterministic Home Assistant automation analysis</p></div>
      <div class="score"><small>Risk score</small>${report.summary.riskScore}/100</div>
    </header>
    <section class="stats" aria-label="Scan summary">
      <div class="stat"><b>${report.summary.automations}</b><span>Automations</span></div>
      <div class="stat"><b>${report.summary.counts.error}</b><span>Errors</span></div>
      <div class="stat"><b>${report.summary.counts.warning}</b><span>Warnings</span></div>
      <div class="stat"><b>${report.summary.entitiesReferenced}</b><span>Entities</span></div>
    </section>
    <section aria-label="Findings">${empty}${findings}</section>
    <footer>Generated ${escapeHtml(report.generatedAt)} · HassTangle ${escapeHtml(report.tool.version)} · Analysis is conservative and never changes Home Assistant.</footer>
  </main>
</body>
</html>
`;
}

function sarifLevel(severity) {
  if (severity === "error") return "error";
  if (severity === "warning") return "warning";
  return "note";
}

function pathToSarifUri(filePath) {
  return String(filePath).replaceAll("\\", "/");
}
