import { generatedTimestamp } from "./utils.js";
import { VERSION } from "./version.js";

export function replayAutomations(
  automations,
  events,
  entityRegistry,
  { maxSteps = 100 } = {},
) {
  const states = new Map();
  for (const [entity, record] of entityRegistry?.records ?? []) {
    if (record.state !== undefined) states.set(entity, String(record.state));
  }
  const queue = events.map((event) => ({ ...event }));
  const trace = [];
  const transitionCounts = new Map();
  let processedEvents = 0;
  let loopDetected = false;
  let hitStepLimit = false;

  while (queue.length > 0 && trace.length < maxSteps) {
    const event = queue.shift();
    processedEvents += 1;
    const previous = states.get(event.entity_id);
    const from = event.from === undefined ? previous : String(event.from);
    const to = event.to === undefined ? previous : String(event.to);
    if (to !== undefined) states.set(event.entity_id, to);

    trace.push({
      step: trace.length + 1,
      type: "state",
      entity_id: event.entity_id,
      from,
      to,
      source: event.source ?? "external",
    });
    if (trace.length >= maxSteps) {
      hitStepLimit = true;
      break;
    }

    for (const automation of automations) {
      if (!automation.enabled) continue;
      const matchingTriggers = automation.triggers.filter((trigger) =>
        matchesTrigger(trigger, event),
      );
      if (
        matchingTriggers.length === 0 ||
        !simpleConditionsPass(automation.conditions.constraints, states)
      ) {
        continue;
      }
      trace.push({
        step: trace.length + 1,
        type: "automation",
        automationId: automation.id,
        alias: automation.alias,
        triggerIds: matchingTriggers.map((trigger) => trigger.id),
      });
      if (trace.length >= maxSteps) {
        hitStepLimit = true;
        break;
      }

      for (const write of automation.writes.filter(
        (candidate) => !candidate.conditional,
      )) {
        const current = states.get(write.entity);
        const next = applyEffect(current, write.effect);
        if (next === undefined || next === current) continue;
        const signature = `${automation.id}:${write.entity}:${current}->${next}`;
        transitionCounts.set(
          signature,
          (transitionCounts.get(signature) ?? 0) + 1,
        );
        if (transitionCounts.get(signature) > 3) loopDetected = true;
        queue.push({
          entity_id: write.entity,
          from: current,
          to: next,
          source: automation.id,
        });
      }
    }
  }

  const truncated = hitStepLimit || queue.length > 0;
  if (truncated) loopDetected = true;
  return {
    tool: { name: "HassTangle", version: VERSION },
    generatedAt: generatedTimestamp(),
    summary: {
      inputEvents: events.length,
      processedEvents,
      traceSteps: trace.length,
      pendingEvents: queue.length,
      maxSteps,
      truncated,
      loopDetected,
    },
    finalStates: Object.fromEntries([...states].sort()),
    trace,
  };
}

function matchesTrigger(trigger, event) {
  if (!trigger.enabled || trigger.kind !== "state") return false;
  if (!trigger.entities.includes(event.entity_id)) return false;
  if (trigger.from !== undefined && String(event.from) !== trigger.from) {
    return false;
  }
  if (trigger.to !== undefined && String(event.to) !== trigger.to) return false;
  return event.from !== event.to;
}

function simpleConditionsPass(constraints, states) {
  for (const [entity, requiredSets] of constraints.requiredStates) {
    const state = states.get(entity);
    if (requiredSets.some((required) => !required.has(state))) return false;
  }
  for (const [entity, excludedSets] of constraints.excludedStates) {
    const state = states.get(entity);
    if (excludedSets.some((excluded) => excluded.has(state))) return false;
  }
  for (const [entity, ranges] of constraints.numericRanges) {
    const numeric = Number(states.get(entity));
    if (!Number.isFinite(numeric)) return false;
    for (const range of ranges) {
      if (range.above !== undefined && !(numeric > range.above)) return false;
      if (range.below !== undefined && !(numeric < range.below)) return false;
    }
  }
  return true;
}

function applyEffect(current, effect) {
  if (effect === "toggle") {
    if (current === "on") return "off";
    if (current === "off") return "on";
    return undefined;
  }
  if (effect === "unknown") return undefined;
  return effect;
}
