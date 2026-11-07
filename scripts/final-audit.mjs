import { proficiencyOptions, matchProficiency } from "./proficiencies.mjs";

const abilities = ["str", "dex", "con", "int", "wis", "cha"];
const fullNames = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];
const records = character => Object.values(character.modifiers ?? {}).filter(Array.isArray).flat().filter(Boolean);
const read = (actor, path) => path.split(".").reduce((value, part) => value?.[part], actor);

/** Read-only comparison of final sheet values; no automatic corrections here. */
export async function finalCharacterAudit(actor, character, traitApi = globalThis.dnd5e.documents.Trait) {
  const log = [], modifiers = records(character);
  for (const [index, ability] of abilities.entries()) {
    const id = index + 1;
    const base = character.stats?.find(stat => stat.id === id)?.value;
    const bonus = character.bonusStats?.find(stat => stat.id === id)?.value ?? 0;
    const override = character.overrideStats?.find(stat => stat.id === id)?.value;
    const increases = modifiers.filter(modifier => modifier.subType === `${fullNames[index]}-score`);
    const seen = new Set();
    let expected = base + bonus;
    let uncertain = !Number.isFinite(expected);
    for (const modifier of increases) {
      const identity = modifier.id == null ? null : `${modifier.componentTypeId}:${modifier.componentId}:${modifier.id}`;
      if (identity && seen.has(identity)) continue;
      if (identity) seen.add(identity);
      if (modifier.type !== "bonus" || !Number.isFinite(modifier.value) || modifier.restriction) { uncertain = true; continue; }
      expected += modifier.value;
    }
    if (override != null && Number.isFinite(override)) { expected = override; uncertain = false; }
    const actual = actor.system.abilities?.[ability]?.value;
    if (uncertain) log.push({ name: `Final check: ${ability.toUpperCase()}`, detail: `Foundry ${actual ?? "unavailable"}; JSON contains conditional or unsupported ability data. Compare with D&D Beyond manually.` });
    else if (actual !== expected) log.push({ name: `Final check: ${ability.toUpperCase()}`, detail: `JSON expected ${expected}; Foundry ${actual ?? "unavailable"}. Review ability increases, overrides, items, and effects. No value changed by this check.` });
  }
  const options = await proficiencyOptions(traitApi);
  const expected = new Map();
  const unknown = new Set();
  for (const modifier of modifiers.filter(modifier => ["proficiency", "expertise"].includes(modifier.type))) {
    const matches = matchProficiency(modifier, options);
    const name = modifier.friendlySubtypeName ?? modifier.subType;
    if (matches.length !== 1) {
      if (!unknown.has(name)) log.push({ name: `Final check: ${name}`, detail: "JSON proficiency has no unique native mapping; verify this skill/tool/proficiency manually." });
      unknown.add(name); continue;
    }
    const option = matches[0];
    expected.set(option.value, Math.max(expected.get(option.value) ?? 0, modifier.type === "expertise" ? 2 : 1));
  }
  for (const [value, desired] of expected) {
    const option = options.find(option => option.value === value);
    const actual = read(actor, traitApi.changeKeyPath(value));
    const numeric = /^(skills|tool|saves):/.test(value);
    const found = numeric ? Number(actual ?? 0) : new Set(actual ?? []).has(value.split(":").pop()) ? 1 : 0;
    if (found !== desired) log.push({ name: `Final check: ${option.label}`, detail: `JSON ${desired === 2 ? "expertise" : "proficient"}; Foundry ${found === 2 ? "expertise" : found >= 1 ? "proficient" : found > 0 ? "partial proficiency" : "not proficient"}. Review difference; existing grants retained.` });
  }
  const checked = new Set();
  for (const option of options.filter(option => /^(skills|tool):/.test(option.value))) {
    if (expected.has(option.value) || checked.has(option.value)) continue;
    checked.add(option.value);
    const actual = Number(read(actor, traitApi.changeKeyPath(option.value)) ?? 0);
    if (actual > 0) log.push({ name: `Final check: ${option.label}`, detail: `Foundry has ${actual >= 2 ? "expertise" : "proficiency/partial proficiency"}; no matching proficiency is recorded in JSON. Retained for GM review.` });
  }
  const nativeTools = new Set(options.filter(option => option.value.startsWith("tool:")).map(option => option.value.split(":").pop()));
  for (const [tool, data] of Object.entries(actor.system.tools ?? {})) {
    if (data.value > 0 && !nativeTools.has(tool)) log.push({ name: `Final check: tool ${tool}`, detail: "Foundry has a custom/unmapped tool proficiency. Compare with JSON manually; retained unchanged." });
  }
  if (!log.length) log.push({ name: "Final comparison", detail: "Ability scores and mapped proficiencies/tools match the JSON. No differences found in the checked fields." });
  return log;
}
