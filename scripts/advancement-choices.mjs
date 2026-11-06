import { canonicalItemUuid } from "./compendium-matcher.mjs";

// Selection data only: all changes are still applied by native advancements.
export const choiceName = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const groupRecords = groups => Object.values(groups ?? {}).filter(Array.isArray).flat().filter(Boolean);
const definitions = entries => (entries ?? []).filter(Boolean).map(entry => entry.definition ?? entry);
const sameName = (a, b) => choiceName(a) === choiceName(b);
const abilityKeys = { strength: "str", dexterity: "dex", constitution: "con", intelligence: "int", wisdom: "wis", charisma: "cha" };

/** Keep class, subclass, species, background, and granted-feat choices separate. */
export function scopeForItem(character, item, level) {
  let group;
  let ids = new Set();
  let kind = item.type;
  if (["class", "subclass"].includes(item.type)) {
    const found = character.classes.filter(cls => sameName((item.type === "class" ? cls.definition : cls.subclassDefinition)?.name, item.name));
    if (found.length !== 1) return null;
    const definition = item.type === "class" ? found[0].definition : found[0].subclassDefinition;
    ids = new Set(definitions(definition.classFeatures).filter(feature => (feature.requiredLevel ?? 0) <= level).map(feature => feature.id));
    group = "class";
  } else if (item.type === "race") {
    if (![character.race?.fullName, character.race?.baseRaceName].some(name => name && sameName(name, item.name))) return null;
    group = "race";
  } else if (item.type === "background") {
    const background = character.background?.hasCustomBackground ? character.background.customBackground : character.background?.definition;
    if (!background?.name || !sameName(background.name, item.name)) return null;
    ids.add(background.id);
    group = "background";
  } else if (item.type === "feat") {
    const feats = (character.feats ?? []).filter(feat => sameName(feat.definition?.name, item.name));
    if (feats.length === 1) {
      ids.add(feats[0].definition.id);
      group = "feat";
    } else {
      // Granted class and species features have independent native choice flows.
      const features = [
        ...character.classes.flatMap(cls => definitions(cls.classFeatures)).map(definition => ({ definition, group: "class" })),
        ...definitions(character.race?.racialTraits).map(definition => ({ definition, group: "race" }))
      ].filter(({ definition }) => sameName(definition.name, item.name) && (definition.requiredLevel ?? 0) <= level);
      const matches = new Map(features.map(feature => [`${feature.group}:${feature.definition.id}`, feature]));
      if (matches.size !== 1) return null;
      const match = [...matches.values()][0];
      ids.add(match.definition.id);
      group = match.group;
      kind = "feature";
    }
  } else return null;
  const inScope = entry => (group === "race" && kind === "race") || ids.has(entry.componentId);
  const modifiers = (character.modifiers?.[group] ?? []).filter(inScope);
  const choices = (character.choices?.[group] ?? []).filter(inScope);
  if (group === "background") {
    // DDB stores 2024 background ability increases on an associated synthetic feat.
    const abilityFeats = (character.feats ?? []).filter(feat => sameName(feat.definition?.name, `${item.name} Ability Score Improvements`));
    if (abilityFeats.length === 1) modifiers.push(...(character.modifiers?.feat ?? []).filter(modifier => modifier.componentId === abilityFeats[0].definition.id));
  }
  return { group, kind, modifiers, choices };
}

export function selectedChoiceNames(character, choices) {
  const names = new Set();
  for (const choice of choices) {
    if (choice?.optionValue == null) continue;
    const definitions = (character.choices?.choiceDefinitions ?? []).filter(definition => definition?.id === `${choice.componentTypeId}-${choice.type}`);
    for (const definition of definitions) for (const option of definition.options ?? []) {
      if (option?.id === choice.optionValue && option.label) names.add(option.label);
    }
    for (const feat of character.feats ?? []) if (feat?.definition?.id === choice.optionValue) names.add(feat.definition.name);
    for (const option of groupRecords(character.options)) {
      if (option.definition?.id === choice.optionValue && option.definition.name) names.add(option.definition.name);
    }
    for (const cls of character.classes) if (cls.subclassDefinition?.id === choice.optionValue) names.add(cls.subclassDefinition.name);
  }
  return [...names];
}

/** Return one unique selected set satisfying all slots; permutations are equivalent. */
export function uniqueSlotSelection(slots, desired) {
  const pools = slots.map(slot => [...new Set(slot.keys)].filter(key => slot.fixed || desired.has(key)));
  if (pools.some(pool => !pool.length)) return null;
  pools.sort((a, b) => a.length - b.length);
  const solutions = new Map();
  let visits = 0;
  function visit(index, chosen) {
    if (++visits > 2000 || solutions.size > 1) return;
    if (index === pools.length) {
      const selection = [...chosen].sort();
      solutions.set(JSON.stringify(selection), selection);
      return;
    }
    for (const key of pools[index]) {
      if (chosen.has(key)) continue;
      chosen.add(key); visit(index + 1, chosen); chosen.delete(key);
    }
  }
  visit(0, new Set());
  return solutions.size === 1 && visits <= 2000 ? [...solutions.values()][0] : null;
}

function modifierNames(modifier) {
  const names = [modifier.friendlySubtypeName, modifier.subType?.replaceAll("-", " ")];
  return names.filter(Boolean).map(name => choiceName(name.replace(/ saving throws$/i, "")));
}

export function characterMasteryNames(character) {
  const names = new Set();
  for (const modifier of groupRecords(character.modifiers)) {
    if (modifier.type !== "weapon-mastery") continue;
    // DDB emits mastery modifiers for silver/wooden variants too. Keep the full
    // weapon name so those variants cannot become extra selections of the base weapon.
    const weapon = modifier.friendlySubtypeName?.match(/^[^()]+\(([^()]+)\)$/)?.[1];
    if (weapon) names.add(weapon);
  }
  const feats = (character.feats ?? []).filter(feat => sameName(feat.definition?.name, "Weapon Mastery"));
  const ids = new Set(feats.map(feat => feat.definition.id));
  const choices = (character.choices?.feat ?? []).filter(choice => ids.has(choice.componentId));
  const explicit = new Set();
  for (const name of selectedChoiceNames(character, choices)) {
    const weapon = name.match(/^(.+?)\s*\((?:Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex)\)$/i)?.[1];
    if (weapon) explicit.add(weapon);
  }
  return [...(explicit.size ? explicit : names)];
}

/** Reference selections are shown even when no compatible native step exists. */
export function jsonSelectionInventory(character) {
  const rows = [];
  const add = (label, values) => { const unique = [...new Set(values.filter(Boolean))]; if (unique.length) rows.push({ label, values: unique }); };
  add("Classes", character.classes.map(cls => `${cls.definition?.name ?? "Unknown"} ${cls.level ?? "?"}`));
  add("Subclasses", character.classes.map(cls => cls.subclassDefinition?.name));
  add("Species traits", definitions(character.race?.racialTraits).map(definition => definition.name));
  add("Languages", groupRecords(character.modifiers).filter(modifier => modifier.type === "language").map(modifier => modifier.friendlySubtypeName ?? modifier.subType));
  add("Recorded feats", (character.feats ?? []).map(feat => feat.definition?.name));
  for (const group of ["class", "race", "background", "feat", "item"]) {
    for (const choice of character.choices?.[group] ?? []) {
      if (choice?.optionValue == null) continue;
      const names = selectedChoiceNames(character, [choice]);
      add(`${group === "race" ? "Species" : group[0].toUpperCase() + group.slice(1)}: ${choice.label || "Selected option"}`,
        names.length ? names : ["Selected in JSON; readable option name unavailable."]);
    }
  }
  return rows;
}

async function traitChoiceState(advancement, scope, character = null) {
  const mode = advancement.configuration.mode;
  if (!["default", "expertise", "upgrade", "mastery"].includes(mode)) return null;
  const { available, choices } = await advancement.unfulfilledChoices();
  const options = choices.asOptions();
  const slotKeys = available.flatMap(slot => [...slot.choices.asSet()]);
  // Languages moved between species and backgrounds in source books. Reconcile
  // only language slots against the character's known languages; leave all other
  // proficiencies scoped to the specific granting feature.
  const languageOnly = slotKeys.length > 0 && slotKeys.every(key => key.startsWith("languages:"));
  const modifiers = character && languageOnly ? groupRecords(character.modifiers).filter(modifier => modifier.type === "language") : scope.modifiers;
  const desiredNames = mode === "mastery" ? new Set(characterMasteryNames(character ?? { modifiers: { source: scope.modifiers } }).map(choiceName))
    : new Set(modifiers.filter(modifier =>
    ["proficiency", "language", "expertise"].includes(modifier.type)
    && (mode !== "expertise" || modifier.type === "expertise"))
    .flatMap(modifierNames));
  const desired = new Set(options.filter(option => !option.disabled && desiredNames.has(choiceName(option.label))).map(option => option.value));
  const slots = available.map(slot => ({ keys: [...slot.choices.asSet()],
    fixed: slot.type === "grant" && slot.choices.asSet().size === 1 }));
  return { desired, slots, options };
}

export async function traitSelection(advancement, scope, character = null) {
  const state = await traitChoiceState(advancement, scope, character);
  if (!state) return null;
  const chosen = uniqueSlotSelection(state.slots, state.desired);
  return chosen ? { chosen } : null;
}

/** Prefill supported proficiencies on the manager's clone, leaving unknown slots manual. */
export async function prefillTraitSelection(flow, context) {
  const advancement = flow.advancement;
  if (advancement.type !== "Trait" || advancement.configuration.mode !== "default") return null;
  const level = advancement.item.type === "feat" ? Math.max(flow.level, advancement.actor.system.details.level ?? 0) : flow.level;
  const scope = scopeForItem(context.character, advancement.item, level);
  if (!scope) return null;
  const { desired, slots, options } = await traitChoiceState(advancement, scope, context.character);
  if (!desired.size) return null;
  const fixed = new Map();
  for (const [index, slot] of slots.entries()) {
    if (!slot.fixed) continue;
    const key = slot.keys[0];
    if (fixed.has(key)) return null;
    fixed.set(key, index);
  }
  const keys = [...new Set([...desired, ...fixed.keys()])];
  if (keys.length >= slots.length) return null;
  const pools = keys.map(key => fixed.has(key) ? [fixed.get(key)] : slots.flatMap((slot, index) => !slot.fixed && slot.keys.includes(key) ? [index] : []));
  pools.sort((a, b) => a.length - b.length);
  let visits = 0;
  const used = new Set();
  function fits(index) {
    if (++visits > 2000) return false;
    if (index === pools.length) return true;
    for (const slot of pools[index]) {
      if (used.has(slot)) continue;
      used.add(slot);
      if (fits(index + 1)) return true;
      used.delete(slot);
    }
    return false;
  }
  if (!fits(0)) return null;
  const availableNames = new Set(options.map(option => choiceName(option.label)));
  const missing = [...new Set(scope.modifiers.filter(modifier => ["proficiency", "language"].includes(modifier.type))
    .map(modifier => modifier.friendlySubtypeName ?? modifier.subType?.replaceAll("-", " "))
    .filter(name => name && !availableNames.has(choiceName(name))))];
  return { data: { chosen: keys }, missing };
}

export function abilitySelection(advancement, scope) {
  // Class ASIs need per-level attribution, not a sum of all historical increases.
  if (scope.kind === "class") return null;
  const siblings = advancement.item.advancement?.byType?.AbilityScoreImprovement ?? [];
  if (siblings.length > 1) return null;
  const assignments = {};
  const seen = new Set();
  for (const modifier of scope.modifiers) {
    if (modifier.type !== "bonus" || !modifier.subType?.endsWith("-score")) continue;
    const key = abilityKeys[modifier.subType.slice(0, -6)];
    const identity = `${modifier.componentTypeId}:${modifier.componentId}:${modifier.subType}:${modifier.value}`;
    if (!key || seen.has(identity)) continue;
    seen.add(identity);
    if (!Number.isInteger(modifier.value) || modifier.value < 0) return null;
    assignments[key] = (assignments[key] ?? 0) + modifier.value;
  }
  if (!Object.keys(assignments).length) return null;
  const config = advancement.configuration;
  let flexible = 0;
  for (const key of Object.values(abilityKeys)) {
    const delta = assignments[key] ?? 0;
    const fixed = config.fixed[key] ?? 0;
    const extra = delta - fixed;
    const ability = advancement.actor.system.abilities[key];
    if (extra < 0 || extra > (config.cap ?? Infinity) || (extra && config.locked.has(key))) return null;
    if (delta && (!advancement.canImprove(key) || !ability || ability.value + delta > Math.max(ability.max, config.max ?? -Infinity))) return null;
    flexible += extra;
  }
  if (flexible !== config.points) return null;
  return { type: "asi", assignments };
}

async function itemChoiceSelection(advancement, level, scope, context) {
  const config = advancement.configuration;
  const counts = advancement.getCounts(level);
  if (!config.choices[level]?.replacement && counts.current >= counts.max) return { selected: [] };
  if (counts.replacement || counts.current || !counts.max || config.spell?.ability?.size > 1) return null;
  // Spell selection is a separate import phase.
  if (config.type && !["feat", "subclass"].includes(config.type)) return null;
  const names = selectedChoiceNames(context.character, scope.choices);
  const pool = new Set(config.pool.map(entry => canonicalItemUuid(entry.uuid)));
  const selected = [];
  for (const name of names) {
    let candidates = context.entries.filter(entry => (config.type ? entry.type === config.type : ["feat", "subclass"].includes(entry.type)) && sameName(entry.name, name));
    const preferred = candidates.filter(entry => pool.has(canonicalItemUuid(entry.uuid)));
    if (preferred.length || !config.allowDrops) candidates = preferred;
    if (config.type === "subclass") candidates = candidates.filter(entry => context.tasks.some(task => task.type === "subclass" && canonicalItemUuid(task.uuid) === canonicalItemUuid(entry.uuid)));
    const eligible = [];
    for (const entry of candidates) {
      const item = await context.resolve(entry.uuid);
      if (!item || !item.testUserPermission(context.user, "OBSERVER")) continue;
      // Native pool checkboxes validate prerequisites. Additional type/category
      // filters apply to external drops, not to items explicitly authored in the pool.
      if (!pool.has(canonicalItemUuid(entry.uuid)) && !advancement._validateItemType(item, { strict: false, type: config.type ?? item.type })) continue;
      try {
        const valid = item.system.assertPrerequisites?.(advancement.actor, { level: level || advancement.actor.system.details.level, throwError: true });
        if (valid !== undefined && valid !== true) continue;
      } catch { continue; }
      eligible.push(entry.uuid);
    }
    if (eligible.length > 1) return null;
    if (eligible.length === 1) selected.push(eligible[0]);
  }
  const unique = [...new Set(selected)];
  const identities = new Set(unique.map(canonicalItemUuid));
  if ([...(advancement.actor.items ?? [])].some(item => [item._stats?.compendiumSource, item.flags?.dnd5e?.sourceId].some(uuid => uuid && identities.has(canonicalItemUuid(uuid))))) return null;
  return unique.length === counts.max ? { selected: unique } : null;
}

/** The caller falls back to native fixed grants or a manual prompt if this returns null. */
export async function selectAdvancement(flow, context) {
  const advancement = flow.advancement;
  const type = advancement.type;
  if (type === "HitPoints") {
    if (!Number.isInteger(flow.level) || flow.level < 1) return null;
    const previous = advancement.value?.toObject?.() ?? { ...advancement.value };
    return { ...previous, [flow.level]: flow.level === 1 && advancement.item.isOriginalClass ? "max" : "avg" };
  }
  if (type === "Subclass") {
    const classIdentifier = advancement.item.system.identifier;
    const tasks = context.tasks.filter(task => task.type === "subclass" && task.source.system.classIdentifier === classIdentifier);
    if (tasks.length !== 1) return null;
    const selected = await context.resolve(tasks[0].uuid);
    if (!selected || selected.type !== "subclass" || selected.system.classIdentifier !== classIdentifier
      || !selected.testUserPermission(context.user, "OBSERVER")) return null;
    if (advancement.value?.document || advancement.item.subclass) return null;
    return { uuid: tasks[0].uuid };
  }
  if (!["Trait", "Size", "AbilityScoreImprovement", "ItemChoice"].includes(type)) return null;
  const scopeLevel = advancement.item.type === "feat" ? Math.max(flow.level, advancement.actor.system.details.level ?? 0) : flow.level;
  const scope = scopeForItem(context.character, advancement.item, scopeLevel);
  if (!scope) {
    if (type === "Size" && advancement.configuration.sizes.size === 1) return { size: [...advancement.configuration.sizes][0] };
    return null;
  }
  if (type === "Trait") return traitSelection(advancement, scope, context.character);
  if (type === "AbilityScoreImprovement") return abilitySelection(advancement, scope);
  if (type === "ItemChoice") return itemChoiceSelection(advancement, flow.level, scope, context);
  const sizes = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
  const chosen = new Set(scope.modifiers.filter(modifier => modifier.type === "size").map(modifier => sizes[modifier.subType]).filter(Boolean));
  const allowed = advancement.configuration.sizes;
  return chosen.size === 1 && allowed.has([...chosen][0]) ? { size: [...chosen][0] }
    : allowed.size === 1 ? { size: [...allowed][0] } : null;
}

export async function describeSelection(flow, data, context) {
  if (flow.advancement.type === "HitPoints") return data[flow.level] === "max" ? "Maximum HP at first character level." : "Average HP; no roll.";
  if (data.chosen) {
    const { choices, available } = await flow.advancement.unfulfilledChoices();
    const labels = new Map([choices, ...available.map(slot => slot.choices)].flatMap(pool => pool.asOptions()).map(option => [option.value, option.label]));
    return data.chosen.map(key => labels.get(key) ?? globalThis.dnd5e?.documents?.Trait?.keyLabel(key) ?? "Source trait").join(", ") || "Already satisfied.";
  }
  if (data.assignments) return Object.entries(data.assignments).map(([key, delta]) => `${key.toUpperCase()} +${delta}`).join(", ");
  if (data.size) return ({ tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" })[data.size];
  if (data.selected) return data.selected.map(uuid => {
    const entry = context.entries.find(entry => entry.uuid === uuid);
    return entry ? `${entry.name} (${entry.packLabel})` : "Selected source item";
  }).join(", ");
  if (data.uuid) return context.tasks.find(task => task.uuid === data.uuid)?.name ?? "Selected subclass source.";
  return "JSON selection applied.";
}
