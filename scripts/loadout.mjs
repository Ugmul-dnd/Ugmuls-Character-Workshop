import { canonicalItemUuid, featSourceNames } from "./compendium-matcher.mjs";

const ID = "ugmuls-character-workshop";
export const PHYSICAL_TYPES = ["weapon", "equipment", "consumable", "tool", "loot", "container"];
const records = value => Array.isArray(value) ? value.filter(Boolean) : [];
const nameKey = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();
const abilities = ["", "str", "dex", "con", "int", "wis", "cha"];

/** DDB's learned-spell casters leave prepared=false even for ready spells. */
export function usesKnownSpellReadiness(definition) {
  return definition?.spellPrepareType === null && definition.spellCastingLearningStyle === 1
    && definition.knowsAllSpells === false
    && Array.isArray(definition.spellRules?.levelPreparedSpellMaxes)
    && definition.spellRules.levelPreparedSpellMaxes.length === 0;
}

export function characterLoadout(character) {
  const rows = [];
  const inventoryIds = new Set(records(character.inventory).map(item => String(item.id)));
  for (const [index, item] of records(character.inventory).entries()) {
    const definition = item.definition ?? {};
    const types = definition.filterType === "Weapon" ? ["weapon"] : definition.filterType === "Armor" ? ["equipment"]
      : definition.isContainer ? ["container"] : [...PHYSICAL_TYPES];
    rows.push({ key: `equipment:${item.id ?? index}`, kind: "equipment", label: "Equipment", name: definition.name ?? "Unnamed item", types,
      inventoryId: String(item.id ?? `index-${index}`), quantity: item.quantity ?? 1,
      equipped: Boolean(item.equipped), attuned: Boolean(item.isAttuned), sourceIds: [],
      parentId: inventoryIds.has(String(item.containerEntityId)) ? String(item.containerEntityId) : null,
      notes: [`Quantity: ${item.quantity ?? 1}`, item.equipped ? "Equipped" : "Unequipped", item.isAttuned ? "Attuned" : "Not attuned"].join("; ") });
  }
  for (const [index, item] of records(character.customItems).entries()) rows.push({
    key: `custom:${item.id ?? index}`, kind: "equipment", label: "Custom equipment", name: item.name ?? "Unnamed custom item",
    types: [...PHYSICAL_TYPES], inventoryId: `custom-${item.id ?? index}`, quantity: item.quantity ?? 1,
    equipped: Boolean(item.equipped), attuned: false, sourceIds: [], parentId: null,
    notes: "Custom JSON item: choose an existing source item to import; no rules content will be generated."
  });
  const spells = new Map();
  function addSpell(spell, origin, classIndex, componentId) {
    if (!spell?.definition?.name) return;
    const definition = spell.definition;
    const key = `spell:${origin}:${classIndex ?? componentId ?? "unknown"}:${definition.id ?? nameKey(definition.name)}`;
    const row = spells.get(key) ?? { key, kind: "spell", label: "Spell", types: ["spell"], name: definition.name,
      level: definition.level, origin, classIndex, sourceIds: [], prepared: false, alwaysPrepared: false,
      ability: abilities[spell.spellCastingAbilityId] ?? "", notes: "" };
    const knownReady = origin === "class" && spell.countsAsKnownSpell === true
      && usesKnownSpellReadiness(character.classes[classIndex]?.definition);
    row.knownCasterReady ||= knownReady;
    row.countsAsKnownSpell ||= spell.countsAsKnownSpell === true;
    row.prepared ||= Boolean(spell.prepared) || knownReady;
    row.alwaysPrepared ||= Boolean(spell.alwaysPrepared);
    row.notes = `${origin === "class" ? "Class spell" : "Feature/item spell — native grant retained when present"}; level ${definition.level ?? "?"}; ${row.alwaysPrepared || definition.level === 0 ? "always prepared" : row.knownCasterReady ? "known class spell — ready to cast" : row.prepared ? "prepared" : "unprepared"}`;
    spells.set(key, row);
  }
  for (const group of records(character.classSpells)) {
    const index = character.classes.findIndex(cls => cls.id === group.characterClassId);
    for (const spell of records(group.spells)) addSpell(spell, "class", index >= 0 ? index : null, group.characterClassId);
  }
  for (const [group, values] of Object.entries(character.spells ?? {})) {
    for (const spell of records(values)) {
      const classIndex = group === "class" ? character.classes.findIndex(cls =>
        [...records(cls.definition?.classFeatures), ...records(cls.subclassDefinition?.classFeatures)]
          .some(feature => (feature.definition ?? feature).id === spell.componentId)) : -1;
      addSpell(spell, `grant-${group}`, classIndex >= 0 ? classIndex : null, spell.componentId);
    }
  }
  return [...rows, ...spells.values()];
}

export function matchLoadout(rows, entries) {
  return rows.map(row => {
    if (row.nativeOnly) return { ...row, candidates: [], selectedUuid: null, status: "native" };
    const exact = entries.filter(entry => nameKey(entry.name) === nameKey(row.name));
    const names = !exact.some(entry => row.types.includes(entry.type))
      ? row.invocation ? [row.name, ...(row.matchNames ?? [])] : row.kind === "feat" ? featSourceNames(row.name) : [row.name]
      : [row.name];
    const candidates = entries.filter(entry => row.types.includes(entry.type) && names.some(name => nameKey(entry.name) === nameKey(name))
      && (row.kind !== "spell" || row.level === undefined || entry.level === row.level));
    const autoSelect = candidates.length === 1 || (row.kind === "equipment" && candidates.length > 0);
    return { ...row, candidates, selectedUuid: autoSelect ? candidates[0].uuid : null,
      status: candidates.length === 0 ? "missing" : autoSelect ? "review" : "ambiguous" };
  });
}

export async function prepareLoadoutPlan(rows, entries, resolve) {
  const tasks = [];
  for (const row of rows ?? []) {
    let source = null;
    if (row.selectedUuid) {
      if (!entries.some(entry => entry.uuid === row.selectedUuid && row.types.includes(entry.type))) throw new Error(`Source outside preview: ${row.name}.`);
      source = await resolve(row.selectedUuid);
      if (!source || !row.types.includes(source.type)) throw new Error(`Unavailable or incompatible source: ${row.name}.`);
      if (row.kind === "spell" && row.level !== undefined && source.system.level !== row.level) throw new Error(`Wrong spell level: ${row.name}.`);
    }
    tasks.push({ ...row, source });
  }
  return tasks;
}

const identities = item => [item._stats?.compendiumSource, item.flags?.dnd5e?.sourceId].filter(Boolean).map(canonicalItemUuid);
const fromSource = (item, uuid) => uuid && identities(item).includes(canonicalItemUuid(uuid));
const rowKeys = item => item.flags?.[ID]?.loadoutKeys ?? [];
const nativeGrant = item => Boolean(item.flags?.dnd5e?.advancementOrigin || item.flags?.dnd5e?.advancementRoot);

function spellClass(actor, row, character) {
  const name = character.classes[row.classIndex]?.definition?.name;
  const matches = [...actor.items].filter(item => item.type === "class" && nameKey(item.name) === nameKey(name));
  return name && matches.length === 1 ? matches[0] : null;
}

function matchingGrant(actor, row, cls) {
  return [...actor.items].filter(item => item.type === "spell" && nativeGrant(item)
    && (fromSource(item, row.selectedUuid) || (nameKey(item.name) === nameKey(row.name) && item.system.level === row.level))
    && (row.origin !== "class" || (cls && (item.system.sourceItem === `class:${cls.system.identifier}`
      || item.flags?.dnd5e?.advancementRoot?.split(".")[0] === cls.id))));
}

/** Apply character state only. Source activities, effects, uses, and rule fields are preserved. */
export function loadoutItemData(row, sourceData, cls, character) {
  const data = structuredClone(sourceData);
  delete data._id;
  data.system ??= {};
  if (row.kind === "equipment") {
    if (!Number.isInteger(row.quantity) || row.quantity < 0 || (data.type === "container" && row.quantity !== 1)) throw new Error("Quantity needs manual review.");
    data.system.quantity = row.quantity;
    data.system.container = null;
    if ("equipped" in data.system) data.system.equipped = row.equipped;
    if ("attuned" in data.system) data.system.attuned = row.attuned;
  } else {
    if (!cls) throw new Error("Spellcasting class could not be linked.");
    data.system.method = cls.system.spellcasting?.type ?? (cls.system.spellcasting?.progression === "pact" ? "pact" : "spell");
    data.system.sourceItem = `class:${cls.system.identifier}`;
    data.system.prepared = row.alwaysPrepared || row.level === 0 ? 2 : row.prepared ? 1 : 0;
    const ability = row.ability || abilities[character.classes[row.classIndex]?.definition?.spellCastingAbilityId];
    if (ability) data.system.ability = ability;
  }
  data.flags ??= {};
  data.flags[ID] = { ...data.flags[ID], loadoutKeys: [row.key] };
  return data;
}

/** Add after origin advancements so native grants can satisfy exported spell entries. */
export async function importLoadout(actor, tasks, { character, fromCompendium, report, onReport = () => {} }) {
  const claimed = new Set();
  const equipment = new Map();
  const record = (row, status, detail) => { report.set(row.key, { name: row.name, status, detail }); onReport(); };
  for (const row of tasks) {
    if (!actor.isOwner) throw new Error("You no longer own this character.");
    let existing = [...actor.items].find(item => rowKeys(item).includes(row.key));
    const cls = row.kind === "spell" ? spellClass(actor, row, character) : null;
    if (row.kind === "spell") {
      const grants = matchingGrant(actor, row, cls);
      if (grants.length) { record(row, "retained", "Native spell grant retained, including preparation, activities, and limited uses."); continue; }
      if (row.origin !== "class") { record(row, "review", "No matching native spell grant. Review the granting feature; special casting/resources were not recreated."); continue; }
    }
    if (!row.source) { record(row, "review", "No source selected; not imported."); continue; }
    if (!row.source.testUserPermission(globalThis.game.user, "OBSERVER")) throw new Error(`Source permission lost: ${row.name}.`);
    if (!existing && row.kind === "equipment") {
      const candidates = [...actor.items].filter(item => !claimed.has(item.id) && item.type === row.source.type
        && fromSource(item, row.selectedUuid) && rowKeys(item).length === 0);
      if (candidates.length === 1) existing = candidates[0];
    }
    if (!existing && row.kind === "spell" && cls) existing = [...actor.items].find(item => item.type === "spell"
      && !nativeGrant(item) && fromSource(item, row.selectedUuid) && item.system.sourceItem === `class:${cls.system.identifier}`);
    let data;
    try { data = loadoutItemData(row, fromCompendium(row.source), cls, character); }
    catch (error) { record(row, "review", error.message); continue; }
    if (existing) {
      const updates = { _id: existing.id, [`flags.${ID}.loadoutKeys`]: [...new Set([...rowKeys(existing), row.key])] };
      for (const key of row.kind === "equipment" ? ["quantity", "equipped", "attuned", "container"] : ["prepared", "method", "sourceItem", "ability"]) {
        if (key in data.system) updates[`system.${key}`] = key === "prepared" ? Math.max(existing.system.prepared ?? 0, data.system.prepared) : data.system[key];
      }
      await actor.updateEmbeddedDocuments("Item", [updates]);
      record(row, "updated", "Existing source item reused; JSON character state applied.");
    } else {
      [existing] = await actor.createEmbeddedDocuments("Item", [data]);
      if (!existing) throw new Error(`Could not create ${row.name}.`);
      record(row, "imported", row.kind === "equipment" ? `Quantity ${row.quantity}; equipment state copied.` : `Class spell imported ${data.system.prepared ? "prepared" : "unprepared"}.`);
    }
    claimed.add(existing.id);
    if (row.kind === "equipment") equipment.set(row.inventoryId, existing);
  }
  // Resolve JSON inventory IDs to newly created Foundry container IDs, never compendium IDs.
  const byId = new Map(tasks.filter(row => row.kind === "equipment").map(row => [row.inventoryId, row]));
  for (const row of tasks.filter(row => row.kind === "equipment" && row.parentId)) {
    const item = equipment.get(row.inventoryId), parent = equipment.get(row.parentId);
    if (!item) continue;
    const seen = new Set([row.inventoryId]);
    let current = row;
    let invalid = false;
    while (current?.parentId) {
      if (seen.has(current.parentId) || seen.size > 5) { invalid = true; break; }
      seen.add(current.parentId); current = byId.get(current.parentId);
    }
    if (invalid || !parent || parent.type !== "container") { record(row, "review", "Imported at top level; JSON container is missing, invalid, or not a Foundry container."); continue; }
    if (!actor.isOwner) throw new Error("You no longer own this character.");
    await actor.updateEmbeddedDocuments("Item", [{ _id: item.id, "system.container": parent.id }]);
  }
}
