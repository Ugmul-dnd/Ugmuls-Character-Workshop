const normalize = value => String(value ?? "").normalize("NFKC").toLowerCase()
  .replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim();

export function speciesMatchNames(character) {
  const race = character.race;
  const base = race?.baseRaceName ?? race?.fullName;
  if (race?.isLegacy || !["elf", "tiefling"].includes(normalize(base))) return [];
  const traitIds = new Set((race?.racialTraits ?? []).filter(Boolean).map(entry => entry.definition ?? entry)
    .filter(trait => /^(Elven Lineage|Fiendish Legacy)$/i.test(trait.name)).map(trait => trait.id));
  const selected = (character.options?.race ?? []).filter(option => traitIds.has(option?.componentId)
    && (character.choices?.race ?? []).some(choice => choice?.componentId === option.componentId && choice.optionValue === option.definition?.id));
  const lineages = new Set(selected.map(option => {
    const name = normalize(option.definition?.name);
    const allowed = normalize(base) === "elf" ? ["high", "wood", "drow"] : ["abyssal", "chthonic", "infernal"];
    return allowed.find(lineage => [lineage, `${lineage} ${base}`, `${lineage} lineage`, `${lineage} legacy`, `${lineage} ${base} lineage`].some(alias => normalize(alias) === name));
  }).filter(Boolean));
  if (lineages.size !== 1) return [];
  const lineage = [...lineages][0];
  return [`${base}, ${lineage}`, `${lineage} ${base}`];
}

export function featSourceNames(name) {
  return /^Magic Initiate \((Wizard|Cleric|Druid)\)$/i.test(name ?? "") ? [name, "Magic Initiate"] : [name];
}

export function featureSourceNames(name) {
  return normalize(name) === "enchanting conversationalist" ? [name, "Enchanting Conversation"] : [name];
}

/** Foundry accepts shortened UUIDs, but source pools use the explicit Item segment. */
export function canonicalItemUuid(uuid) {
  if (typeof uuid !== "string") return uuid;
  const parts = uuid.split(".");
  if (parts[0] === "Compendium" && parts.length === 4) parts.splice(3, 0, "Item");
  return parts.join(".");
}

export function characterOrigins(character) {
  const rows = [];
  for (const [index, cls] of character.classes.entries()) {
    rows.push({ key: `class-${index}`, type: "class", label: "Class", name: cls.definition?.name ?? "",
      level: cls.level, definition: cls.definition });
    if (cls.subclassDefinition?.name) rows.push({ key: `subclass-${index}`, type: "subclass",
      label: "Subclass", name: cls.subclassDefinition.name, parent: cls.definition?.name,
      definition: cls.subclassDefinition });
  }
  rows.push({ key: "species", type: "race", label: "Species",
    name: character.race?.fullName ?? character.race?.baseRaceName ?? "", matchNames: speciesMatchNames(character), definition: character.race });
  const background = character.background;
  rows.push({ key: "background", type: "background", label: "Background",
    name: background?.hasCustomBackground ? background.customBackground?.name ?? "Custom background"
      : background?.definition?.name ?? "",
    definition: background?.hasCustomBackground ? background.customBackground : background?.definition,
    custom: Boolean(background?.hasCustomBackground) });
  return rows.map(({ definition, ...row }) => ({ ...row,
    legacy: definition?.isLegacy,
    sourceIds: [...new Set((definition?.sources ?? []).map(source => source.sourceId).filter(id => id != null))]
  }));
}

export function accessibleItemPacks(packs) {
  return [...packs].filter(pack => pack.documentName === "Item" && pack.visible);
}

/** Mirror D&D5e Configure Sources: a pack is enabled unless explicitly false. */
export function worldSourceItemPacks(packs, configuration) {
  return accessibleItemPacks(packs).filter(pack => configuration[pack.collection] !== false);
}

/** Index reads only; failures are reported individually rather than hidden as missing matches. */
export async function indexOriginPacks(packs) {
  const entries = [];
  const errors = [];
  // Bound work to one pack at a time; do not load entire compendium documents.
  for (const pack of packs) {
    try {
      const index = await pack.getIndex({ fields: ["type", "system.source", "system.classIdentifier", "system.level"] });
      for (const item of index) {
        if (!["class", "subclass", "race", "background", "feat", "weapon", "equipment", "consumable", "tool", "loot", "container", "spell"].includes(item.type)) continue;
        entries.push({ uuid: `Compendium.${pack.collection}.Item.${item._id}`, name: item.name,
          type: item.type, pack: pack.collection, packLabel: pack.metadata.label,
          book: item.system?.source?.book ?? "", rules: item.system?.source?.rules ?? "",
          classIdentifier: item.system?.classIdentifier ?? "", level: item.system?.level });
      }
    } catch (error) {
      errors.push({ pack: pack.collection, label: pack.metadata.label, message: error.message });
    }
  }
  return { entries, errors };
}

export function matchOrigins(origins, entries) {
  return origins.map(origin => {
    const names = origin.matchNames?.length ? origin.matchNames : [origin.name];
    const candidates = origin.name ? entries.filter(entry => entry.type === origin.type
      && names.some(name => normalize(entry.name) === normalize(name))) : [];
    return { ...origin, candidates, selectedUuid: candidates.length === 1 ? candidates[0].uuid : null,
      status: candidates.length > 1 ? "ambiguous" : candidates.length === 1 ? "review" : "missing" };
  });
}

export function searchOriginEntries(origin, entries, query) {
  const term = normalize(query);
  return entries.filter(entry => (origin.types ?? [origin.type]).includes(entry.type)
    && (!term || normalize(entry.name).includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name) || a.packLabel.localeCompare(b.packLabel));
}
