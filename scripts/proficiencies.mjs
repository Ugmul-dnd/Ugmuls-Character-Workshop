const key = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const groupProficiencies = {
  "simple-weapons": ["weapon:sim", "Simple Weapons"],
  "martial-weapons": ["weapon:mar", "Martial Weapons"],
  "light-armor": ["armor:lgt", "Light Armor"],
  "medium-armor": ["armor:med", "Medium Armor"],
  "heavy-armor": ["armor:hvy", "Heavy Armor"],
  shields: ["armor:shl", "Shields"]
};

export async function proficiencyOptions(traitApi) {
  const options = [];
  for (const type of ["skills", "tool", "saves", "armor", "weapon"]) options.push(...(await traitApi.choices(type, { prefixed: true })).asOptions());
  // asOptions flattens category trees into leaves, omitting these broad grants.
  for (const [value, label] of Object.values(groupProficiencies)) {
    if (!options.some(option => option.value === value)) options.push({ value, label });
  }
  return options;
}

export function matchProficiency(modifier, options) {
  const group = groupProficiencies[modifier.subType];
  if (group) return options.filter(option => option.value === group[0]);
  const name = modifier.friendlySubtypeName ?? modifier.subType?.replaceAll("-", " ") ?? "";
  const names = [key(name.replace(/ saving throws$/i, "")), key(modifier.subType?.replaceAll("-", " ").replace(/ saving throws$/i, ""))];
  const candidates = options.filter(option => !option.disabled && [key(option.label),
    ...(option.value.startsWith("tool:game:") ? [key(`${option.label} Set`)] : [])].some(label => names.includes(label)));
  return [...new Map(candidates.map(option => [option.value, option])).values()];
}

/** Add missing exported proficiencies; never remove or downgrade native grants. */
export async function reconcileProficiencies(actor, character, traitApi = globalThis.dnd5e.documents.Trait) {
  if (!actor.isOwner) throw new Error("You no longer own this character.");
  const options = await proficiencyOptions(traitApi);
  const updates = {}, log = [];
  const read = path => path.split(".").reduce((value, part) => value?.[part], actor);
  const modifiers = Object.values(character.modifiers ?? {}).filter(Array.isArray).flat().filter(Boolean);
  const seen = new Set();
  for (const modifier of modifiers) {
    if (!["proficiency", "expertise"].includes(modifier.type)) continue;
    const name = modifier.friendlySubtypeName ?? modifier.subType?.replaceAll("-", " ");
    if (!name) continue;
    const unique = matchProficiency(modifier, options);
    if (unique.length !== 1) {
      if (!seen.has(key(name))) log.push({ name, detail: "Needs GM Review: no unique native proficiency key; no substitute was invented." });
      seen.add(key(name));
      continue;
    }
    const option = unique[0];
    if (modifier.type === "expertise" && !/^(skills|tool):/.test(option.value)) continue;
    const path = traitApi.changeKeyPath(option.value);
    if (!path?.startsWith("system.")) continue;
    const desired = modifier.type === "expertise" ? 2 : 1;
    const current = updates[path] ?? read(path);
    if (/^(skills|tool|saves):/.test(option.value)) {
      if (Number(current ?? 0) >= desired) continue;
      updates[path] = desired;
      if (option.value.startsWith("tool:")) {
        const tool = option.value.split(":").pop();
        const abilityPath = `system.tools.${tool}.ability`;
        const ability = globalThis.CONFIG?.DND5E?.tools?.[tool]?.ability;
        if (!read(abilityPath) && ability) updates[abilityPath] = ability;
      }
    } else {
      const values = new Set(current ?? []);
      const value = option.value.split(":").pop();
      if (values.has(value)) continue;
      values.add(value);
      updates[path] = [...values];
    }
    log.push({ name, detail: `Added missing JSON ${modifier.type} directly to the sheet after native advancements.` });
  }
  if (Object.keys(updates).length) {
    if (!actor.isOwner) throw new Error("You no longer own this character.");
    await actor.update(updates);
  }
  return log;
}
