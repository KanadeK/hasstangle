import {
  compareFindings,
  generatedTimestamp,
  oppositeEffects,
  severityAtLeast,
  unique,
} from "./utils.js";
import { VERSION } from "./version.js";

export const RULES = Object.freeze({
  HT000: {
    title: "Parser warning",
    defaultSeverity: "note",
    description:
      "The YAML parser recovered from a non-fatal construct such as a custom Home Assistant tag.",
    repair:
      "Review the warning. Pass included automation files directly instead of relying on unresolved !include values.",
  },
  HT001: {
    title: "Self-trigger feedback",
    defaultSeverity: "error",
    description:
      "An automation writes a state that can satisfy one of its own state triggers.",
    repair:
      "Add a from/to guard, make the write idempotent, or split command and observed-state entities.",
  },
  HT002: {
    title: "Cross-automation feedback cycle",
    defaultSeverity: "error",
    description:
      "State writes and triggers form a cycle across two or more automations.",
    repair:
      "Break the cycle with a guard helper, explicit trigger states, or a single owner automation.",
  },
  HT003: {
    title: "Conflicting writers",
    defaultSeverity: "warning",
    description:
      "Different automations can drive the same entity toward opposite states.",
    repair:
      "Choose one owner, add mutually exclusive conditions, or serialize through a helper/script.",
  },
  HT004: {
    title: "Automation control cycle",
    defaultSeverity: "error",
    description:
      "Automations enable, disable, or toggle each other in a cycle.",
    repair:
      "Replace mutual control with one coordinator or a neutral input_boolean state.",
  },
  HT005: {
    title: "Dropped trigger risk",
    defaultSeverity: "warning",
    description:
      "A single-mode automation waits while new triggers are ignored.",
    repair:
      "Use restart or queued mode if every new trigger matters, or document intentional dropping.",
  },
  HT006: {
    title: "Restart tail cancellation",
    defaultSeverity: "warning",
    description:
      "A restart-mode automation has writes after a delay or wait that a retrigger can cancel.",
    repair:
      "Move cleanup into a separate script, use queued mode, or make cancellation intentional and documented.",
  },
  HT007: {
    title: "Parallel write race",
    defaultSeverity: "warning",
    description:
      "Parallel runs can write the same entity from overlapping executions.",
    repair:
      "Use queued mode, cap concurrency, or make the target operation idempotent.",
  },
  HT008: {
    title: "Contradictory conditions",
    defaultSeverity: "error",
    description:
      "Conjunctive state or numeric conditions cannot all be true.",
    repair:
      "Use an OR group where alternatives are intended, or correct the state/range boundary.",
  },
  HT009: {
    title: "Missing or disabled entity",
    defaultSeverity: "warning",
    description:
      "An entity reference is absent from the supplied registry snapshot or is disabled.",
    repair:
      "Correct stale entity IDs, enable the entity, or refresh the registry snapshot.",
  },
  HT010: {
    title: "Duplicate automation ID",
    defaultSeverity: "error",
    description: "Two or more automations share the same stable ID.",
    repair: "Give every automation a unique id before reloading Home Assistant.",
  },
  HT011: {
    title: "No enabled trigger",
    defaultSeverity: "warning",
    description:
      "The automation itself or every trigger is disabled, so it cannot start normally.",
    repair: "Enable the intended trigger or remove the dead automation.",
  },
  HT012: {
    title: "Unbounded tight repeat",
    defaultSeverity: "error",
    description:
      "A while/until repeat has no delay or wait in its sequence.",
    repair:
      "Add a bounded count, timeout, delay, or wait so the loop cannot spin continuously.",
  },
  HT013: {
    title: "Trigger-condition contradiction",
    defaultSeverity: "error",
    description:
      "A state trigger's destination state contradicts a required top-level state condition.",
    repair:
      "Align the trigger and condition states, or move the condition to the intended entity.",
  },
});

export function analyzeAutomations(documents, entityRegistry) {
  const automations = documents.flatMap((document) => document.automations);
  const findings = [];

  for (const document of documents) {
    for (const warning of document.parserWarnings ?? []) {
      findings.push(
        makeFinding("HT000", document.automations[0], {
          severity: "note",
          message: warning,
          location: {
            file: document.displayFile ?? document.file,
            line: 1,
          },
        }),
      );
    }
  }

  detectDuplicateIds(automations, findings);
  detectLocalRules(automations, findings);
  detectFeedbackCycles(automations, findings);
  detectControlCycles(automations, findings);
  detectConflictingWriters(automations, findings);
  if (entityRegistry) {
    detectRegistryProblems(automations, entityRegistry, findings);
  }

  findings.sort(compareFindings);
  const counts = {
    error: findings.filter((finding) => finding.severity === "error").length,
    warning: findings.filter((finding) => finding.severity === "warning").length,
    note: findings.filter((finding) => finding.severity === "note").length,
  };
  const riskScore = Math.max(
    0,
    100 - counts.error * 25 - counts.warning * 8 - counts.note * 2,
  );

  return {
    tool: {
      name: "HassTangle",
      version: VERSION,
    },
    generatedAt: generatedTimestamp(),
    summary: {
      files: documents.length,
      automations: automations.length,
      entitiesReferenced: unique(
        automations.flatMap((automation) => automation.references),
      ).length,
      findings: findings.length,
      counts,
      riskScore,
    },
    files: documents.map((document) => ({
      path: document.displayFile ?? document.file,
      automations: document.automations.length,
      parserWarnings: document.parserWarnings?.length ?? 0,
    })),
    findings,
    automations: automations.map(publicAutomation),
  };
}

function detectDuplicateIds(automations, findings) {
  const groups = groupBy(automations, (automation) => automation.id);
  for (const [id, matches] of groups) {
    if (matches.length < 2) continue;
    for (const automation of matches) {
      findings.push(
        makeFinding("HT010", automation, {
          message: `Automation ID "${id}" appears ${matches.length} times.`,
          automationIds: matches.map((match) => match.id),
          evidence: matches.map((match) => ({
            file: match.file,
            line: match.line,
            alias: match.alias,
          })),
        }),
      );
    }
  }
}

function detectLocalRules(automations, findings) {
  for (const automation of automations) {
    const enabledTriggers = automation.triggers.filter(
      (trigger) => trigger.enabled,
    );
    if (!automation.enabled || enabledTriggers.length === 0) {
      findings.push(
        makeFinding("HT011", automation, {
          message: !automation.enabled
            ? `"${automation.alias}" is disabled.`
            : `"${automation.alias}" has no enabled triggers.`,
        }),
      );
    }

    for (const contradiction of automation.conditions.contradictions) {
      findings.push(
        makeFinding("HT008", automation, {
          message: `Conditions for ${contradiction.entity} are contradictory (${contradiction.kind}).`,
          entities: [contradiction.entity],
          evidence: contradiction.details,
        }),
      );
    }

    for (const repeat of automation.unboundedRepeats) {
      findings.push(
        makeFinding("HT012", automation, {
          message: `${repeat.kind} repeat at ${repeat.path} has no delay or wait.`,
          evidence: repeat,
        }),
      );
    }

    if (
      automation.mode === "single" &&
      automation.hasWait &&
      enabledTriggers.length > 0
    ) {
      findings.push(
        makeFinding("HT005", automation, {
          message: `"${automation.alias}" uses mode: single and waits; retriggers are ignored${automation.maxExceeded === "silent" ? " silently" : ""}.`,
          evidence: {
            mode: automation.mode,
            max_exceeded: automation.maxExceeded,
          },
        }),
      );
    }

    if (
      automation.mode === "restart" &&
      automation.hasWriteAfterWait &&
      enabledTriggers.length > 0
    ) {
      findings.push(
        makeFinding("HT006", automation, {
          message: `"${automation.alias}" can cancel state writes after a wait when it restarts.`,
          entities: unique(
            automation.writes
              .filter((write) => write.afterWait)
              .map((write) => write.entity),
          ),
        }),
      );
    }

    if (automation.mode === "parallel") {
      const writesByEntity = groupBy(
        automation.writes,
        (write) => write.entity,
      );
      for (const [entity, writes] of writesByEntity) {
        if (
          writes.length > 1 ||
          writes.some((write) => write.effect === "toggle")
        ) {
          findings.push(
            makeFinding("HT007", automation, {
              message: `Parallel runs of "${automation.alias}" can race while writing ${entity}.`,
              entities: [entity],
              evidence: writes.map((write) => ({
                service: write.service,
                effect: write.effect,
                path: write.path,
              })),
            }),
          );
        }
      }
    }

    detectSelfTrigger(automation, findings);
    detectTriggerConditionContradictions(automation, findings);
  }
}

function detectSelfTrigger(automation, findings) {
  const seen = new Set();
  for (const trigger of automation.triggers.filter((item) => item.enabled)) {
    if (!["state", "numeric_state", "template"].includes(trigger.kind)) continue;
    for (const write of automation.writes) {
      if (!trigger.entities.includes(write.entity)) continue;
      if (
        trigger.kind === "state" &&
        trigger.to !== undefined &&
        !["unknown", "toggle", trigger.to].includes(write.effect)
      ) {
        continue;
      }
      const key = `${trigger.index}:${write.entity}:${write.effect}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push(
        makeFinding("HT001", automation, {
          severity:
            write.conditional || write.effect === "unknown" ? "warning" : "error",
          message: `"${automation.alias}" writes ${write.entity} (${write.effect}) and can satisfy its own ${trigger.kind} trigger.`,
          entities: [write.entity],
          evidence: {
            trigger: {
              kind: trigger.kind,
              from: trigger.from,
              to: trigger.to,
            },
            write: {
              service: write.service,
              effect: write.effect,
              path: write.path,
            },
          },
        }),
      );
    }
  }
}

function detectTriggerConditionContradictions(automation, findings) {
  for (const trigger of automation.triggers.filter(
    (item) => item.enabled && item.kind === "state" && item.to !== undefined,
  )) {
    for (const entity of trigger.entities) {
      const requiredSets =
        automation.conditions.constraints.requiredStates.get(entity) ?? [];
      if (
        requiredSets.length > 0 &&
        requiredSets.some((states) => !states.has(trigger.to))
      ) {
        findings.push(
          makeFinding("HT013", automation, {
            message: `"${automation.alias}" triggers when ${entity} becomes "${trigger.to}" but requires ${formatRequiredSets(requiredSets)}.`,
            entities: [entity],
            evidence: {
              triggerTo: trigger.to,
              requiredStates: requiredSets.map((states) => [...states].sort()),
            },
          }),
        );
      }
    }
  }
}

function detectFeedbackCycles(automations, findings) {
  const edges = [];
  for (const source of automations) {
    for (const write of source.writes) {
      for (const target of automations) {
        if (source.key === target.key) continue;
        const matchingTriggers = target.triggers.filter(
          (trigger) =>
            trigger.enabled &&
            trigger.entities.includes(write.entity) &&
            writeCanSatisfyTrigger(write, trigger),
        );
        if (matchingTriggers.length > 0) {
          edges.push({
            from: source.key,
            to: target.key,
            entity: write.entity,
            effect: write.effect,
            triggerKinds: unique(
              matchingTriggers.map((trigger) => trigger.kind),
            ),
          });
        }
      }
    }
  }

  const components = stronglyConnectedComponents(
    automations.map((automation) => automation.key),
    edges,
  );
  const byKey = new Map(
    automations.map((automation) => [automation.key, automation]),
  );
  for (const component of components.filter((items) => items.length > 1)) {
    const componentEdges = edges.filter(
      (edge) =>
        component.includes(edge.from) && component.includes(edge.to),
    );
    const members = component.map((key) => byKey.get(key));
    const primary = [...members].sort((a, b) =>
      a.alias.localeCompare(b.alias),
    )[0];
    findings.push(
      makeFinding("HT002", primary, {
        severity: componentEdges.some((edge) => edge.effect === "unknown")
          ? "warning"
          : "error",
        message: `Feedback cycle: ${members
          .map((member) => member.alias)
          .sort()
          .join(" → ")} → …`,
        automationIds: members.map((member) => member.id).sort(),
        entities: unique(componentEdges.map((edge) => edge.entity)).sort(),
        evidence: componentEdges.map((edge) => ({
          from: byKey.get(edge.from).alias,
          to: byKey.get(edge.to).alias,
          entity: edge.entity,
          effect: edge.effect,
          triggerKinds: edge.triggerKinds,
        })),
      }),
    );
  }
}

function detectControlCycles(automations, findings) {
  const entityToAutomation = new Map();
  for (const automation of automations) {
    for (const candidate of automation.automationEntityCandidates) {
      entityToAutomation.set(candidate, automation.key);
    }
  }
  const edges = [];
  for (const automation of automations) {
    for (const write of automation.writes) {
      if (!write.service.startsWith("automation.")) continue;
      const target = entityToAutomation.get(write.entity);
      if (target) {
        edges.push({
          from: automation.key,
          to: target,
          entity: write.entity,
          effect: write.effect,
        });
      }
    }
  }
  const byKey = new Map(
    automations.map((automation) => [automation.key, automation]),
  );
  const components = stronglyConnectedComponents(
    automations.map((automation) => automation.key),
    edges,
  );
  for (const component of components.filter((items) => items.length > 1)) {
    const members = component.map((key) => byKey.get(key));
    const primary = [...members].sort((a, b) =>
      a.alias.localeCompare(b.alias),
    )[0];
    findings.push(
      makeFinding("HT004", primary, {
        message: `Automation control cycle: ${members
          .map((member) => member.alias)
          .sort()
          .join(" ↔ ")}.`,
        automationIds: members.map((member) => member.id).sort(),
        entities: unique(
          edges
            .filter(
              (edge) =>
                component.includes(edge.from) && component.includes(edge.to),
            )
            .map((edge) => edge.entity),
        ),
      }),
    );
  }
}

function detectConflictingWriters(automations, findings) {
  const writes = [];
  for (const automation of automations) {
    for (const write of automation.writes) {
      if (write.effect !== "unknown") writes.push({ automation, write });
    }
  }
  const byEntity = groupBy(writes, (entry) => entry.write.entity);
  const seen = new Set();
  for (const [entity, entries] of byEntity) {
    for (let leftIndex = 0; leftIndex < entries.length; leftIndex += 1) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < entries.length;
        rightIndex += 1
      ) {
        const left = entries[leftIndex];
        const right = entries[rightIndex];
        if (left.automation.key === right.automation.key) continue;
        if (!oppositeEffects(left.write.effect, right.write.effect)) continue;
        if (
          !left.automation.hasWait &&
          !right.automation.hasWait &&
          triggersClearlyExclusive(left.automation, right.automation)
        ) {
          continue;
        }
        const pair = [left.automation.key, right.automation.key].sort();
        const key = `${entity}:${pair.join(":")}`;
        if (seen.has(key)) continue;
        seen.add(key);
        findings.push(
          makeFinding("HT003", left.automation, {
            severity:
              left.write.conditional || right.write.conditional
                ? "note"
                : "warning",
            message: `"${left.automation.alias}" writes ${entity}=${left.write.effect}, while "${right.automation.alias}" writes ${entity}=${right.write.effect}.`,
            automationIds: [
              left.automation.id,
              right.automation.id,
            ].sort(),
            entities: [entity],
            evidence: [
              {
                automation: left.automation.alias,
                service: left.write.service,
                effect: left.write.effect,
                conditional: left.write.conditional,
              },
              {
                automation: right.automation.alias,
                service: right.write.service,
                effect: right.write.effect,
                conditional: right.write.conditional,
              },
            ],
          }),
        );
      }
    }
  }
}

function detectRegistryProblems(automations, entityRegistry, findings) {
  const knownAutomationEntities = new Set(
    automations.flatMap((automation) => automation.automationEntityCandidates),
  );
  for (const automation of automations) {
    for (const entity of automation.references) {
      if (entity === "sun.sun" || entity.startsWith("zone.")) continue;
      const record = entityRegistry.records.get(entity);
      if (!record && !knownAutomationEntities.has(entity)) {
        findings.push(
          makeFinding("HT009", automation, {
            message: `${entity} is absent from ${entityRegistry.displayFile ?? entityRegistry.file}.`,
            entities: [entity],
            evidence: {
              registry: entityRegistry.displayFile ?? entityRegistry.file,
              status: "missing",
            },
          }),
        );
      } else if (record?.disabled_by) {
        findings.push(
          makeFinding("HT009", automation, {
            message: `${entity} is disabled by "${record.disabled_by}".`,
            entities: [entity],
            evidence: {
              registry: entityRegistry.displayFile ?? entityRegistry.file,
              status: "disabled",
              disabled_by: record.disabled_by,
            },
          }),
        );
      }
    }
  }
}

function makeFinding(ruleId, automation, overrides = {}) {
  const rule = RULES[ruleId];
  const location = overrides.location ?? {
    file: automation?.displayFile ?? automation?.file ?? "",
    line: automation?.line ?? 1,
  };
  return {
    ruleId,
    severity: overrides.severity ?? rule.defaultSeverity,
    title: rule.title,
    message: overrides.message ?? rule.description,
    repair: overrides.repair ?? rule.repair,
    automationIds:
      overrides.automationIds ?? (automation ? [automation.id] : []),
    entities: overrides.entities ?? [],
    location,
    evidence: overrides.evidence,
  };
}

function writeCanSatisfyTrigger(write, trigger) {
  if (trigger.kind !== "state") return true;
  if (trigger.to === undefined) return true;
  return (
    write.effect === "unknown" ||
    write.effect === "toggle" ||
    write.effect === trigger.to
  );
}

function triggersClearlyExclusive(left, right) {
  const leftTriggers = left.triggers.filter(
    (trigger) => trigger.enabled && trigger.kind === "state",
  );
  const rightTriggers = right.triggers.filter(
    (trigger) => trigger.enabled && trigger.kind === "state",
  );
  if (leftTriggers.length !== 1 || rightTriggers.length !== 1) return false;
  const leftTrigger = leftTriggers[0];
  const rightTrigger = rightTriggers[0];
  return (
    leftTrigger.entities.length === 1 &&
    rightTrigger.entities.length === 1 &&
    leftTrigger.entities[0] === rightTrigger.entities[0] &&
    leftTrigger.to !== undefined &&
    rightTrigger.to !== undefined &&
    leftTrigger.to !== rightTrigger.to
  );
}

function stronglyConnectedComponents(nodes, edges) {
  const adjacency = new Map(nodes.map((node) => [node, []]));
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
  }
  const indexByNode = new Map();
  const lowLink = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];
  let index = 0;

  const visit = (node) => {
    indexByNode.set(node, index);
    lowLink.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!indexByNode.has(neighbor)) {
        visit(neighbor);
        lowLink.set(
          node,
          Math.min(lowLink.get(node), lowLink.get(neighbor)),
        );
      } else if (onStack.has(neighbor)) {
        lowLink.set(
          node,
          Math.min(lowLink.get(node), indexByNode.get(neighbor)),
        );
      }
    }

    if (lowLink.get(node) === indexByNode.get(node)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== node);
      components.push(component);
    }
  };

  for (const node of nodes) {
    if (!indexByNode.has(node)) visit(node);
  }
  return components;
}

function groupBy(values, selector) {
  const result = new Map();
  for (const value of values) {
    const key = selector(value);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push(value);
  }
  return result;
}

function publicAutomation(automation) {
  return {
    id: automation.id,
    alias: automation.alias,
    file: automation.file,
    line: automation.line,
    enabled: automation.enabled,
    mode: automation.mode,
    triggers: automation.triggers.map((trigger) => ({
      kind: trigger.kind,
      entities: trigger.entities,
      from: trigger.from,
      to: trigger.to,
      enabled: trigger.enabled,
    })),
    writes: automation.writes,
    reads: automation.reads,
    references: automation.references,
  };
}

function formatRequiredSets(requiredSets) {
  return requiredSets
    .map((states) => [...states].sort().map((state) => `"${state}"`).join(" or "))
    .join(" and ");
}

export function shouldFail(report, threshold) {
  if (threshold === "none") return false;
  return report.findings.some((finding) =>
    severityAtLeast(finding.severity, threshold),
  );
}
