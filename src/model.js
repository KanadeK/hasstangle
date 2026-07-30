import path from "node:path";

import {
  collectTemplateEntityIds,
  effectFromService,
  entityStrings,
  isPlainObject,
  parseNumber,
  slugify,
  toArray,
  unique,
} from "./utils.js";

export function normalizeAutomation(raw, context) {
  const id =
    String(raw.id ?? context.key ?? "").trim() ||
    slugify(raw.alias) ||
    `automation_${context.index + 1}`;
  const alias = String(raw.alias ?? context.key ?? id);
  const triggers = normalizeTriggers(raw.triggers ?? raw.trigger ?? []);
  const conditionInput = raw.conditions ?? raw.condition ?? [];
  const conditions = normalizeConditions(conditionInput);
  const actionInput = raw.actions ?? raw.action ?? raw.sequence ?? [];
  const actionSummary = summarizeActions(actionInput);

  const references = unique([
    ...triggers.flatMap((trigger) => trigger.entities),
    ...conditions.references,
    ...actionSummary.reads,
    ...actionSummary.writes.map((write) => write.entity),
  ]).sort();

  const automationEntityCandidates = unique(
    [slugify(id), slugify(alias)]
      .filter(Boolean)
      .map((candidate) => `automation.${candidate}`),
  );

  return {
    key: `${context.file}#${context.index}`,
    id,
    alias,
    description: String(raw.description ?? ""),
    enabled: raw.enabled !== false && raw.initial_state !== false,
    mode: String(raw.mode ?? "single").toLowerCase(),
    max: parseNumber(raw.max),
    maxExceeded: String(raw.max_exceeded ?? "warning").toLowerCase(),
    file: context.file,
    displayFile: context.displayFile ?? path.basename(context.file),
    line: context.line,
    index: context.index,
    raw,
    triggers,
    conditions,
    writes: actionSummary.writes,
    reads: unique([...conditions.references, ...actionSummary.reads]).sort(),
    references,
    hasWait: actionSummary.hasWait,
    hasWriteAfterWait: actionSummary.writes.some((write) => write.afterWait),
    unboundedRepeats: actionSummary.unboundedRepeats,
    automationEntityCandidates,
  };
}

function normalizeTriggers(value) {
  return toArray(value)
    .filter(isPlainObject)
    .map((trigger, index) => {
      const kind = String(trigger.trigger ?? trigger.platform ?? "unknown");
      const entities = unique([
        ...entityStrings(trigger.entity_id),
        ...collectTemplateEntityIds(trigger),
      ]).sort();
      return {
        index,
        id: String(trigger.id ?? index),
        kind,
        enabled: trigger.enabled !== false,
        entities,
        from: scalarOrUndefined(trigger.from),
        to: scalarOrUndefined(trigger.to),
        above: parseNumber(trigger.above),
        below: parseNumber(trigger.below),
        eventType: scalarOrUndefined(trigger.event_type),
        hasFor: trigger.for !== undefined,
        raw: trigger,
      };
    });
}

function normalizeConditions(value) {
  const references = unique([
    ...collectExplicitEntityFields(value),
    ...collectTemplateEntityIds(value),
  ]).sort();
  const constraints = {
    requiredStates: new Map(),
    excludedStates: new Map(),
    numericRanges: new Map(),
  };
  collectConjunctiveConstraints(value, constraints, false);
  const contradictions = findConstraintContradictions(constraints);

  return {
    raw: value,
    references,
    constraints,
    contradictions,
  };
}

function collectConjunctiveConstraints(value, output, negated) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectConjunctiveConstraints(item, output, negated);
    }
    return;
  }
  if (!isPlainObject(value)) return;

  const conditionKind = String(value.condition ?? "").toLowerCase();
  if (conditionKind === "or" || value.or !== undefined) return;
  if (conditionKind === "not" || value.not !== undefined) {
    const nested = value.conditions ?? value.not;
    const items = toArray(nested);
    if (items.length === 1) {
      collectConjunctiveConstraints(items[0], output, !negated);
    }
    return;
  }
  if (conditionKind === "and" || value.and !== undefined) {
    collectConjunctiveConstraints(value.conditions ?? value.and, output, negated);
    return;
  }

  if (conditionKind === "state") {
    const states = toArray(value.state)
      .map(String)
      .filter(Boolean);
    for (const entity of entityStrings(value.entity_id)) {
      const targetMap = negated
        ? output.excludedStates
        : output.requiredStates;
      if (!targetMap.has(entity)) targetMap.set(entity, []);
      targetMap.get(entity).push(new Set(states));
    }
    return;
  }

  if (conditionKind === "numeric_state" && !negated) {
    for (const entity of entityStrings(value.entity_id)) {
      if (!output.numericRanges.has(entity)) output.numericRanges.set(entity, []);
      output.numericRanges.get(entity).push({
        above: parseNumber(value.above),
        below: parseNumber(value.below),
      });
    }
  }
}

function findConstraintContradictions(constraints) {
  const contradictions = [];
  for (const [entity, requiredSets] of constraints.requiredStates) {
    if (requiredSets.length > 1) {
      let intersection = new Set(requiredSets[0]);
      for (const states of requiredSets.slice(1)) {
        intersection = new Set([...intersection].filter((state) => states.has(state)));
      }
      if (intersection.size === 0) {
        contradictions.push({
          entity,
          kind: "required-state-intersection",
          details: requiredSets.map((states) => [...states].sort()),
        });
      }
    }
    const excludedSets = constraints.excludedStates.get(entity) ?? [];
    const required = new Set(requiredSets.flatMap((states) => [...states]));
    const excluded = new Set(excludedSets.flatMap((states) => [...states]));
    if (
      required.size > 0 &&
      [...required].every((state) => excluded.has(state))
    ) {
      contradictions.push({
        entity,
        kind: "required-and-excluded",
        details: {
          required: [...required].sort(),
          excluded: [...excluded].sort(),
        },
      });
    }
  }

  for (const [entity, ranges] of constraints.numericRanges) {
    const lowerBounds = ranges
      .map((range) => range.above)
      .filter((value) => value !== undefined);
    const upperBounds = ranges
      .map((range) => range.below)
      .filter((value) => value !== undefined);
    const lower = lowerBounds.length > 0 ? Math.max(...lowerBounds) : undefined;
    const upper = upperBounds.length > 0 ? Math.min(...upperBounds) : undefined;
    if (lower !== undefined && upper !== undefined && lower >= upper) {
      contradictions.push({
        entity,
        kind: "numeric-range",
        details: { above: lower, below: upper },
      });
    }
  }
  return contradictions;
}

function summarizeActions(value) {
  const summary = {
    writes: [],
    reads: [],
    hasWait: false,
    unboundedRepeats: [],
  };
  walkSequence(toArray(value), summary, {
    path: "actions",
    conditional: false,
    afterWait: false,
  });
  summary.reads = unique(summary.reads).sort();
  return summary;
}

function walkSequence(actions, summary, context) {
  let afterWait = context.afterWait;
  for (const [index, action] of actions.entries()) {
    if (!isPlainObject(action)) {
      summary.reads.push(...collectTemplateEntityIds(action));
      continue;
    }
    const actionPath = `${context.path}[${index}]`;
    summary.reads.push(...collectTemplateEntityIds(action));

    const waitLike =
      action.delay !== undefined ||
      action.wait_template !== undefined ||
      action.wait_for_trigger !== undefined;
    if (waitLike) {
      summary.hasWait = true;
      afterWait = true;
    }

    const service =
      typeof action.action === "string"
        ? action.action
        : typeof action.service === "string"
          ? action.service
          : undefined;
    if (service?.includes(".")) {
      const targets = unique([
        ...entityStrings(action.entity_id),
        ...entityStrings(action.target?.entity_id),
        ...entityStrings(action.data?.entity_id),
        ...entityStrings(action.data?.target?.entity_id),
      ]);
      for (const entity of targets) {
        summary.writes.push({
          entity,
          effect: effectFromService(service),
          service,
          path: actionPath,
          conditional: context.conditional,
          afterWait,
        });
      }
    }

    if (action.choose !== undefined) {
      for (const [choiceIndex, choice] of toArray(action.choose).entries()) {
        summary.reads.push(
          ...collectExplicitEntityFields(choice?.conditions),
          ...collectTemplateEntityIds(choice?.conditions),
        );
        walkSequence(toArray(choice?.sequence), summary, {
          path: `${actionPath}.choose[${choiceIndex}].sequence`,
          conditional: true,
          afterWait,
        });
      }
      walkSequence(toArray(action.default), summary, {
        path: `${actionPath}.default`,
        conditional: true,
        afterWait,
      });
    }

    if (action.if !== undefined) {
      summary.reads.push(
        ...collectExplicitEntityFields(action.if),
        ...collectTemplateEntityIds(action.if),
      );
      walkSequence(toArray(action.then), summary, {
        path: `${actionPath}.then`,
        conditional: true,
        afterWait,
      });
      walkSequence(toArray(action.else), summary, {
        path: `${actionPath}.else`,
        conditional: true,
        afterWait,
      });
    }

    if (isPlainObject(action.repeat)) {
      const sequence = toArray(action.repeat.sequence);
      const isPotentiallyUnbounded =
        action.repeat.while !== undefined || action.repeat.until !== undefined;
      if (isPotentiallyUnbounded && !sequenceContainsWait(sequence)) {
        summary.unboundedRepeats.push({
          path: `${actionPath}.repeat`,
          kind: action.repeat.while !== undefined ? "while" : "until",
        });
      }
      summary.reads.push(
        ...collectExplicitEntityFields(action.repeat.while),
        ...collectExplicitEntityFields(action.repeat.until),
        ...collectTemplateEntityIds(action.repeat),
      );
      walkSequence(sequence, summary, {
        path: `${actionPath}.repeat.sequence`,
        conditional: true,
        afterWait,
      });
    }

    for (const nestedKey of ["parallel", "sequence"]) {
      if (action[nestedKey] !== undefined) {
        walkSequence(toArray(action[nestedKey]), summary, {
          path: `${actionPath}.${nestedKey}`,
          conditional: context.conditional,
          afterWait,
        });
      }
    }

    if (action.wait_for_trigger !== undefined) {
      summary.reads.push(
        ...normalizeTriggers(action.wait_for_trigger).flatMap(
          (trigger) => trigger.entities,
        ),
      );
    }
  }
}

function sequenceContainsWait(sequence) {
  let hasWait = false;
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (
      value.delay !== undefined ||
      value.wait_template !== undefined ||
      value.wait_for_trigger !== undefined
    ) {
      hasWait = true;
      return;
    }
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else if (isPlainObject(child)) visit(child);
    }
  };
  sequence.forEach(visit);
  return hasWait;
}

function collectExplicitEntityFields(value) {
  const found = [];
  const visit = (item) => {
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (!isPlainObject(item)) return;
    for (const [key, child] of Object.entries(item)) {
      if (key === "entity_id") found.push(...entityStrings(child));
      if (Array.isArray(child) || isPlainObject(child)) visit(child);
    }
  };
  visit(value);
  return unique(found);
}

function scalarOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return undefined;
}
