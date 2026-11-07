import { canonicalItemUuid, speciesMatchNames, featSourceNames, featureSourceNames } from "./compendium-matcher.mjs";
import { isAbilityScoreFeat, isBackgroundAbilityFeat, isHiddenFeat } from "./feats.mjs";

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
    if (![character.race?.fullName, character.race?.baseRaceName, ...speciesMatchNames(character)].some(name => name && sameName(name, item.name))) return null;
    group = "race";
  } else if (item.type === "background") {
    const background = character.background?.hasCustomBackground ? character.background.customBackground : character.background?.definition;
    if (!background?.name || !sameName(background.name, item.name)) return null;
    ids.add(background.id);
    group = "background";
  } else if (item.type === "feat") {
    const feats = (character.feats ?? []).filter(feat => featSourceNames(feat.definition?.name).some(name => sameName(name, item.name)));
    if (feats.length === 1) {
      ids.add(feats[0].definition.id);
      group = "feat";
    } else {
      // Invocation choices such as Lessons of the First Ones own nested choices
      // through parentChoiceId rather than a standalone feat record.
      const classFeatures = character.classes.flatMap(cls => definitions(cls.classFeatures));
      const options = (character.options?.class ?? []).filter(option => sameName(option?.definition?.name, item.name)
        || classFeatures.some(feature => feature.id === option.componentId
          && sameName(`${feature.name}: ${option.definition?.name}`, item.name)));
      if (options.length === 1) {
        const option = options[0];
        const parents = (character.choices?.class ?? []).filter(choice => choice.componentId === option.componentId && choice.optionValue === option.definition.id);
        if (parents.length === 1) return { group: "class", kind: "feature",
          modifiers: (character.modifiers?.class ?? []).filter(modifier => modifier.componentId === option.definition.id),
          choices: (character.choices?.class ?? []).filter(choice => choice.parentChoiceId === parents[0].id) };
      }
      // Granted class and species features have independent native choice flows.
      const features = [
        ...character.classes.flatMap(cls => definitions(cls.classFeatures)).map(definition => ({ definition, group: "class" })),
        ...definitions(character.race?.racialTraits).map(definition => ({ definition, group: "race" }))
      ].filter(({ definition }) => featureSourceNames(definition.name).some(name => sameName(name, item.name)) && (definition.requiredLevel ?? 0) <= level);
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
    const abilityFeats = (character.feats ?? []).filter(feat => isBackgroundAbilityFeat(feat.definition?.name, item.name));
    if (abilityFeats.length === 1) modifiers.push(...(character.modifiers?.feat ?? []).filter(modifier => modifier.componentId === abilityFeats[0].definition.id));
  }
  return { group, kind, modifiers, choices, componentIds: [...ids] };
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

export function characterMasteryNames(character, level = Infinity) {
  const masteryFeats = (character.feats ?? []).filter(feat => /^(?:\d+\s*:\s*)?Weapon Mastery$/i.test(feat.definition?.name ?? ""));
  const feats = masteryFeats.filter(feat => Number(feat.definition.name.match(/^(\d+)\s*:/)?.[1] ?? 1) <= level);
  const ids = new Set(feats.map(feat => feat.definition.id));
  const names = new Set();
  for (const modifier of groupRecords(character.modifiers)) {
    if (modifier.type !== "weapon-mastery") continue;
    if (masteryFeats.some(feat => feat.definition.id === modifier.componentId) && !ids.has(modifier.componentId)) continue;
    // DDB emits mastery modifiers for silver/wooden variants too. Keep the full
    // weapon name so those variants cannot become extra selections of the base weapon.
    const weapon = modifier.friendlySubtypeName?.match(/^[^()]+\(([^()]+)\)$/)?.[1];
    if (weapon) names.add(weapon);
  }
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
  add("Recorded feats", (character.feats ?? []).filter(feat => !isHiddenFeat(feat)).map(feat => feat.definition?.name));
  add("Hidden D&D Beyond entries (not imported as feats)", (character.feats ?? []).filter(isHiddenFeat).map(feat => feat.definition?.name));
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
  let modifiers = scope.modifiers;
  // A class advancement can be named for a specific granting feature. Keep its
  // expertise/languages separate from other features and species languages.
  if (character && ["class", "subclass"].includes(advancement.item?.type)) {
    const features = character.classes.filter(cls => sameName(
      (advancement.item.type === "class" ? cls.definition : cls.subclassDefinition)?.name, advancement.item.name
    )).flatMap(cls => definitions(cls.classFeatures));
    const ids = new Set(features.filter(feature => sameName(feature.name, advancement.title)).map(feature => feature.id));
    if (ids.size === 1) modifiers = modifiers.filter(modifier => ids.has(modifier.componentId));
  }
  if (character && languageOnly && ["race", "background"].includes(scope.kind)) {
    modifiers = groupRecords(character.modifiers).filter(modifier => modifier.type === "language");
  }
  const desiredNames = mode === "mastery" ? new Set(characterMasteryNames(character ?? { modifiers: { source: scope.modifiers } }, advancement.level ?? Infinity).map(choiceName))
    : new Set(modifiers.filter(modifier =>
    ["proficiency", "language", "expertise"].includes(modifier.type)
    && (!["expertise", "upgrade"].includes(mode) || modifier.type === "expertise"))
    .flatMap(modifierNames));
  const desired = new Set(options.filter(option => !option.disabled && slotKeys.includes(option.value)
    && desiredNames.has(choiceName(option.label))).map(option => option.value));
  const damageTypes = { resistance: "dr:", immunity: "di:", vulnerability: "dv:" };
  if (mode === "default") for (const option of options) {
    if (option.disabled || !slotKeys.includes(option.value)) continue;
    if (modifiers.some(modifier => damageTypes[modifier.type] && option.value.startsWith(damageTypes[modifier.type])
      && modifierNames(modifier).includes(choiceName(option.label)))) desired.add(option.value);
  }
  const slots = available.map(slot => ({ keys: [...slot.choices.asSet()],
    fixed: slot.type === "grant" && slot.choices.asSet().size === 1 }));
  // Source books can allocate the same final proficiencies differently. If an
  // exported class skill is already granted, fill only from other exported
  // proficiencies that this native class step actually permits.
  if (character && mode === "default" && scope.kind === "class"
    && slotKeys.length && slotKeys.every(key => key.startsWith("skills:")) && desired.size < slots.length) {
    const configSkills = globalThis.CONFIG?.DND5E?.skills ?? {};
    const knownNames = new Set(Object.entries(advancement.actor?.system.skills ?? {}).filter(([, skill]) => skill.value >= 1)
      .map(([key]) => choiceName(configSkills[key]?.label ?? key)));
    const blocked = modifiers.filter(modifier => modifier.type === "proficiency"
      && modifierNames(modifier).some(name => knownNames.has(name)));
    if (blocked.length) {
      const earlier = [...(advancement.actor?.items ?? [])];
      const earlierGroups = {
        background: earlier.some(item => item.type === "background") ? character.modifiers?.background : [],
        race: earlier.some(item => item.type === "race") ? character.modifiers?.race : []
      };
      const allNames = new Set(groupRecords(earlierGroups).filter(modifier => modifier.type === "proficiency").flatMap(modifierNames));
      for (const option of options) if (!option.disabled && slotKeys.includes(option.value)
        && allNames.has(choiceName(option.label))) desired.add(option.value);
    }
  }
  return { desired, slots, options, modifiers, languageOnly };
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
  const { desired, slots, options, modifiers, languageOnly } = await traitChoiceState(advancement, scope, context.character);
  const availableNames = new Set(options.filter(option => !option.disabled && slots.some(slot => slot.keys.includes(option.value))).map(option => choiceName(option.label)));
  const missing = [...new Set(modifiers.filter(modifier => (languageOnly ? ["language"] : ["proficiency", "language", "resistance"]).includes(modifier.type))
    .map(modifier => modifier.friendlySubtypeName ?? modifier.subType?.replaceAll("-", " "))
    .filter(name => name && !availableNames.has(choiceName(name))))];
  if (!desired.size) return missing.length ? { data: null, missing } : null;
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
  return { data: { chosen: keys }, missing };
}

export function abilitySelection(advancement, scope, { attributed = false } = {}) {
  // Class ASIs need per-level attribution, not a sum of all historical increases.
  if (scope.kind === "class" && !attributed) return null;
  const siblings = advancement.item.advancement?.byType?.AbilityScoreImprovement ?? [];
  if (siblings.length > 1 && !attributed) return null;
  const assignments = {};
  const seen = new Set();
  for (const modifier of scope.modifiers) {
    if (modifier.type !== "bonus" || !modifier.subType?.endsWith("-score")) continue;
    const key = abilityKeys[modifier.subType.slice(0, -6)];
    const identity = modifier.id == null ? null : `${modifier.componentTypeId}:${modifier.componentId}:${modifier.id}`;
    if (!key || (identity && seen.has(identity))) continue;
    if (identity) seen.add(identity);
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

async function itemChoiceSelection(advancement, level, scope, context, flow) {
  const config = advancement.configuration;
  const counts = advancement.getCounts(level);
  if (!counts.replacement && counts.current >= counts.max) return { selected: [] };
  if (counts.replacement || counts.current || !counts.max) return null;
  if (config.type === "spell") return spellChoiceSelection(advancement, level, scope, context, flow);
  if (config.spell?.ability?.size > 1) return null;
  if (config.type && !["feat", "subclass"].includes(config.type)) return null;
  const invocationFlow = /eldritch\s*invocations?/i.test(advancement.title ?? "")
    || (advancement.item.type === "feat" && /eldritch\s*invocations?/i.test(advancement.item.name));
  let choices = scope.choices;
  if (invocationFlow) {
    choices = choices.filter(choice => (context.character.options?.class ?? []).some(option =>
      option.componentId === choice.componentId && option.definition?.id === choice.optionValue));
    choices = choices.filter(choice => {
      const selectedLevel = Number(choice.label?.match(/^Choose a Level (\d+) Option$/i)?.[1]);
      return !selectedLevel || selectedLevel === level;
    });
  }
  const names = selectedChoiceNames(context.character, choices);
  const pool = new Set(config.pool.map(entry => canonicalItemUuid(entry.uuid)));
  const selected = [];
  for (const name of names) {
    let candidates = context.entries.filter(entry => (config.type ? entry.type === config.type : ["feat", "subclass"].includes(entry.type)) && sameName(entry.name, name));
    if (!candidates.some(entry => pool.has(canonicalItemUuid(entry.uuid))) && featSourceNames(name).length > 1) {
      const aliases = context.entries.filter(entry => entry.type === "feat" && pool.has(canonicalItemUuid(entry.uuid))
        && featSourceNames(name).some(alias => sameName(alias, entry.name)));
      if (aliases.length) candidates = aliases;
    }
    if (scope.group === "class" && !candidates.some(entry => pool.has(canonicalItemUuid(entry.uuid)))) {
      // Sources can prefix an option with its granting feature, e.g.
      // Thaumaturge -> Divine Order: Thaumaturge. Only use the authored pool.
      const grantingFeatures = context.character.classes.flatMap(cls => definitions(cls.classFeatures));
      const parents = grantingFeatures.filter(feature => choices.some(choice => choice.componentId === feature.id
        && (context.character.options?.class ?? []).some(option => option.componentId === feature.id
          && option.definition?.id === choice.optionValue && sameName(option.definition.name, name))));
      const aliases = context.entries.filter(entry => entry.type === "feat" && pool.has(canonicalItemUuid(entry.uuid))
        && parents.some(feature => featureSourceNames(feature.name).some(prefix =>
          sameName(entry.name, `${prefix}: ${name}`) || sameName(entry.name, `${prefix} (${name})`))));
      if (aliases.length) candidates = aliases;
    }
    if (scope.group === "class" && [advancement.item.name, advancement.title].some(title => sameName(title, "Vestige Spells"))
      && !candidates.some(entry => pool.has(canonicalItemUuid(entry.uuid)))) {
      const domain = name.match(/^(.+?) Domain Spells$/i)?.[1];
      if (domain) candidates = context.entries.filter(entry => entry.type === "feat"
        && pool.has(canonicalItemUuid(entry.uuid)) && sameName(entry.name, `Vestige Spells (${domain})`));
    }
    if (!candidates.length && invocationFlow) {
      const unqualified = name.match(/^(.+?)\s*\([^()]+\)$/)?.[1];
      if (unqualified) candidates = context.entries.filter(entry => entry.type === "feat"
        && pool.has(canonicalItemUuid(entry.uuid)) && sameName(entry.name, unqualified));
    }
    if (!candidates.some(entry => pool.has(canonicalItemUuid(entry.uuid))) && scope.group === "race") {
      // DDB appends ancestry labels such as "(Hill Giant)". Only accept the
      // unqualified name from the selected species' authored native pool.
      const unqualified = name.match(/^(.+?)\s*\([^()]+\)$/)?.[1];
      if (unqualified) {
        const aliases = context.entries.filter(entry => entry.type === "feat"
          && pool.has(canonicalItemUuid(entry.uuid)) && sameName(entry.name, unqualified));
        if (aliases.length) candidates = aliases;
      }
    }
    const explicit = (context.featTasks ?? []).filter(task => task.selectedUuid && sameName(task.name, name));
    if (explicit.length > 1) return null;
    if (explicit.length === 1) {
      candidates = candidates.filter(entry => canonicalItemUuid(entry.uuid) === canonicalItemUuid(explicit[0].selectedUuid)
        && (config.allowDrops || pool.has(canonicalItemUuid(entry.uuid))));
    } else {
      const preferred = candidates.filter(entry => pool.has(canonicalItemUuid(entry.uuid)));
      if (preferred.length || !config.allowDrops) candidates = preferred;
    }
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

async function classAbilitySelection(flow, context) {
  const advancement = flow.advancement;
  const cls = context.character.classes.filter(cls => sameName(cls.definition?.name, advancement.item.name));
  if (cls.length !== 1) return null;
  const features = definitions(cls[0].definition.classFeatures).filter(feature => feature.requiredLevel === flow.level
    && /ability\s*score\s*improvement|epic\s*boon/i.test(feature.name ?? ""));
  const featureIds = new Set(features.map(feature => feature.id));
  const feats = (context.character.feats ?? []).filter(feat => feat?.definition && featureIds.has(feat.componentId));
  if (feats.length !== 1) return null;
  const feat = feats[0];
  // Repeated definitions can aggregate modifiers from several levels; do not guess.
  if (context.character.feats.filter(entry => entry?.definition?.id === feat.definition.id).length !== 1) return null;
  if (isAbilityScoreFeat(feat.definition.name)) {
    const modifiers = (context.character.modifiers?.feat ?? []).filter(modifier => modifier?.componentId === feat.definition.id);
    return abilitySelection(advancement, { kind: "attributed-class", modifiers }, { attributed: true });
  }
  if (!advancement.allowFeat) return null;
  const chosen = (context.featTasks ?? []).filter(task => task.definitionId === feat.definition.id && task.componentId === feat.componentId);
  if (chosen.length !== 1 || !chosen[0].source) return null;
  const source = chosen[0].source;
  if (source.type !== "feat" || !source.testUserPermission(context.user, "OBSERVER")) return null;
  try {
    const valid = source.system.assertPrerequisites?.(advancement.actor, { level: advancement.actor.system.details.level, throwError: true });
    if (valid !== undefined && valid !== true) return null;
  } catch { return null; }
  return { type: "feat", uuid: chosen[0].selectedUuid };
}

/** The caller falls back to native fixed grants or a manual prompt if this returns null. */
async function spellGrantSelection(advancement, character, scope, context) {
  const config = advancement.configuration;
  if (!config.spell?.ability || config.spell.ability.size <= 1 || config.optional
    || !config.items?.length || config.items.some(item => item.optional)) return null;
  const exported = (character.spells?.[scope.group] ?? []).filter(Boolean);
  const selected = [];
  const abilities = new Set();
  for (const grant of config.items) {
    const source = await context.resolve(grant.uuid);
    if (!source || source.type !== "spell" || !source.testUserPermission(context.user, "OBSERVER")) return null;
    const matches = exported.filter(spell => sameName(spell.definition?.name, source.name));
    for (const spell of matches) {
      const ability = Object.values(abilityKeys)[spell.spellCastingAbilityId - 1];
      if (!ability || !config.spell.ability.has(ability)) return null;
      abilities.add(ability);
    }
    selected.push(grant.uuid);
  }
  if (abilities.size > 1) return null;
  const ability = abilities.size === 1 ? [...abilities][0] : fallbackSpellAbility(advancement, character, scope);
  return ability ? { ability, selected } : null;
}

function fallbackSpellAbility(advancement, character, scope) {
  const allowed = advancement.configuration.spell?.ability;
  const prior = new Set((advancement.item.advancement?.byType?.ItemGrant ?? [])
    .map(grant => grant.value?.ability).filter(ability => allowed?.has(ability)));
  if (prior.size) return prior.size === 1 ? [...prior][0] : null;
  if (scope.group === "race") {
    const recorded = new Set((character.options?.race ?? []).filter(option =>
      (character.choices?.race ?? []).some(choice => choice.componentId === option?.componentId && choice.optionValue === option.definition?.id))
      .map(option => Object.entries(abilityKeys).find(([name]) => new RegExp(`(?:^|[-\\s])${name}$`, "i").test(option.definition?.name ?? ""))?.[1]).filter(Boolean));
    if (recorded.size) return recorded.size === 1 && allowed.has([...recorded][0]) ? [...recorded][0] : null;
  }
  const classes = new Set(character.classes.map(cls => Object.values(abilityKeys)[cls.definition?.spellCastingAbilityId - 1]).filter(ability => allowed?.has(ability)));
  return classes.size === 1 ? [...classes][0] : null;
}

export async function prefillSpellSelection(flow, context) {
  const advancement = flow.advancement;
  if (advancement.type !== "ItemChoice" || advancement.configuration.type !== "spell"
    || advancement.getCounts(flow.level).replacement || advancement.getCounts(flow.level).current) return null;
  const scope = scopeForItem(context.character, advancement.item, Math.max(flow.level, advancement.actor.system.details.level ?? 0));
  return scope ? spellChoiceSelection(advancement, flow.level, scope, context, flow, true) : null;
}

async function spellChoiceSelection(advancement, level, scope, context, flow, partial = false) {
  const config = advancement.configuration;
  // Feature selections only. Ordinary class spellbook choices remain in the
  // loadout phase, since the export does not establish their acquisition level.
  if (advancement.item.type !== "feat") return null;
  const ids = new Set(scope.componentIds ?? []);
  const choiceIds = new Set(scope.choices.filter(choice => choice.optionValue != null).map(choice => choice.optionValue));
  const spells = (context.character.spells?.[scope.group] ?? []).filter(spell => spell
    && (ids.has(spell.componentId) || choiceIds.has(spell.definition?.id)));
  const pool = new Set(config.pool.map(entry => canonicalItemUuid(entry.uuid)));
  const selected = [], abilities = new Set(), missing = [];
  for (const spell of spells) {
    const spellLevel = spell.definition?.level;
    const restriction = config.restriction?.level;
    if (restriction != null && restriction !== "" && /^\d+$/.test(String(restriction)) && spellLevel !== Number(restriction)) continue;
    // Dynamic level restrictions require the native flow's slot calculation.
    if (["available", "availableNoCantrips"].includes(restriction)) {
      const max = flow?._maxSpellSlotLevel?.();
      if (!Number.isInteger(max)) return null;
      if (spellLevel > max || (restriction === "availableNoCantrips" && spellLevel < 1)) continue;
    }
    let candidates = context.entries.filter(entry => entry.type === "spell" && sameName(entry.name, spell.definition?.name) && entry.level === spellLevel);
    const explicit = (context.loadoutTasks ?? []).filter(row => row.origin === `grant-${scope.group}` && sameName(row.name, spell.definition?.name) && row.selectedUuid);
    if (explicit.length === 1) candidates = candidates.filter(entry => canonicalItemUuid(entry.uuid) === canonicalItemUuid(explicit[0].selectedUuid));
    else {
      const preferred = candidates.filter(entry => pool.has(canonicalItemUuid(entry.uuid)));
      if (preferred.length || !config.allowDrops) candidates = preferred;
    }
    const eligible = [];
    for (const entry of candidates) {
      const source = await context.resolve(entry.uuid);
      if (!source?.testUserPermission(context.user, "OBSERVER") || source.type !== "spell") continue;
      if (!advancement._validateItemType(source, { strict: false, type: "spell" })) continue;
      eligible.push(entry.uuid);
    }
    if (eligible.length > 1) {
      if (!partial) return null;
      missing.push(`${spell.definition.name} (multiple eligible sources)`);
      continue;
    }
    if (!eligible.length) {
      missing.push(`${spell.definition.name} (source missing or not eligible for this native spell choice)`);
      continue;
    }
    selected.push(eligible[0]);
    if (spell.spellCastingAbilityId) abilities.add(Object.values(abilityKeys)[spell.spellCastingAbilityId - 1]);
  }
  const unique = [...new Set(selected)];
  const max = advancement.getCounts(level).max;
  if ((!partial && unique.length !== max) || unique.length > max || abilities.size > 1) return null;
  let ability = abilities.size === 1 ? [...abilities][0] : undefined;
  if (config.spell?.ability?.size > 1) ability ??= fallbackSpellAbility(advancement, context.character, scope);
  if (config.spell?.ability?.size && (!ability || !config.spell.ability.has(ability))) {
    if (config.spell.ability.size === 1) ability = [...config.spell.ability][0];
    else return null;
  }
  const data = { selected: unique, ...(ability ? { ability } : {}) };
  return partial ? { data: unique.length || ability ? data : null, missing } : data;
}

export async function selectAdvancement(flow, context) {
  const advancement = flow.advancement;
  const type = advancement.type;
  if (type === "ItemChoice" && advancement.configuration.choices[flow.level]?.replacement) {
    const counts = advancement.getCounts(flow.level);
    // No replacement is the import policy. Still require any new selections,
    // and never undo a replacement already performed in a manual prompt.
    if (!counts.replacement && counts.current >= counts.max) return { selected: [] };
  }
  if (type === "AbilityScoreImprovement" && advancement.item.type === "class") return classAbilitySelection(flow, context);
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
  if (!["Trait", "Size", "AbilityScoreImprovement", "ItemChoice", "ItemGrant"].includes(type)) return null;
  const scopeLevel = advancement.item.type === "feat" ? Math.max(flow.level, advancement.actor.system.details.level ?? 0) : flow.level;
  const scope = scopeForItem(context.character, advancement.item, scopeLevel);
  if (!scope) {
    if (type === "Size" && advancement.configuration.sizes.size === 1) return { size: [...advancement.configuration.sizes][0] };
    return null;
  }
  if (type === "Trait") return traitSelection(advancement, scope, context.character);
  if (type === "ItemGrant") return spellGrantSelection(advancement, context.character, scope, context);
  if (type === "AbilityScoreImprovement") return abilitySelection(advancement, scope);
  if (type === "ItemChoice") return itemChoiceSelection(advancement, flow.level, scope, context, flow);
  const sizes = { tiny: "tiny", small: "sm", medium: "med", large: "lg", huge: "huge", gargantuan: "grg" };
  const chosen = new Set(scope.modifiers.filter(modifier => modifier.type === "size").map(modifier => sizes[modifier.subType]).filter(Boolean));
  const allowed = advancement.configuration.sizes;
  return chosen.size === 1 && allowed.has([...chosen][0]) ? { size: [...chosen][0] }
    : allowed.size === 1 ? { size: [...allowed][0] } : null;
}

export async function describeSelection(flow, data, context) {
  if (flow.advancement.type === "ItemChoice" && data.selected?.length === 0
    && flow.advancement.configuration.choices[flow.level]?.replacement) return "No replacement; existing selections retained.";
  if (flow.advancement.type === "HitPoints") return data[flow.level] === "max" ? "Maximum HP at first character level." : "Average HP; no roll.";
  if (data.chosen) {
    const { choices, available } = await flow.advancement.unfulfilledChoices();
    const labels = new Map([choices, ...available.map(slot => slot.choices)].flatMap(pool => pool.asOptions()).map(option => [option.value, option.label]));
    const names = data.chosen.map(key => labels.get(key) ?? globalThis.dnd5e?.documents?.Trait?.keyLabel(key) ?? "Source trait");
    let detail = names.join(", ") || "Already satisfied.";
    if (flow.advancement.item.type === "class" && data.chosen.length && data.chosen.every(key => key.startsWith("skills:"))) {
      const scope = scopeForItem(context.character, flow.advancement.item, flow.level);
      const own = new Set((scope?.modifiers ?? []).filter(modifier => modifier.type === "proficiency").flatMap(modifierNames));
      if (names.some(name => !own.has(choiceName(name)))) detail += ". Reconciled exported skills across native sources because an original class choice was already granted.";
    }
    return detail;
  }
  if (data.assignments) return Object.entries(data.assignments).map(([key, delta]) => `${key.toUpperCase()} +${delta}`).join(", ");
  if (data.size) return ({ tiny: "Tiny", sm: "Small", med: "Medium", lg: "Large", huge: "Huge", grg: "Gargantuan" })[data.size];
  if (data.selected) return (data.ability ? `Spellcasting ability: ${data.ability.toUpperCase()}. ` : "") + data.selected.map(uuid => {
    const entry = context.entries.find(entry => entry.uuid === uuid);
    return entry ? `${entry.name} (${entry.packLabel})` : "Selected source item";
  }).join(", ");
  if (data.uuid) return [...context.tasks, ...(context.featTasks ?? [])].find(task => task.uuid === data.uuid || task.selectedUuid === data.uuid)?.name ?? "Selected source item.";
  return "JSON selection applied.";
}
