const ID = "ugmuls-character-workshop";
const nameKey = value => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const previewRows = preview => [...(preview?.rows ?? []), ...(preview?.feats ?? []), ...(preview?.loadout ?? [])];
export const needsReview = row => !row.nativeOnly && !row.selectedUuid;

/** A marker only: no exported rules, activities, effects, grants, or advancements. */
export function reviewItemData(row) {
  const type = row.kind === "equipment" ? (row.types.length === 1 ? row.types[0] : "loot")
    : row.kind === "spell" ? "spell" : "feat";
  return { name: row.name || row.label || "Unknown feature", type,
    system: { description: { value: "Needs GM Review" }, activities: {}, advancement: [],
      ...(type === "spell" ? { level: row.level ?? 0, prepared: 0 } : {}) },
    effects: [], flags: { [ID]: { reviewKey: row.key, needsGmReview: true } } };
}

export async function createReviewItems(actor, rows) {
  const log = [];
  for (const row of rows.filter(row => needsReview(row) && !row.nativeOnly)) {
    if (!actor.isOwner) throw new Error("You no longer own this character.");
    const data = reviewItemData(row);
    const marker = [...actor.items].find(item => item.flags?.[ID]?.reviewKey === row.key);
    if (marker) { log.push({ name: row.name, detail: "Needs GM Review placeholder retained." }); continue; }
    const granted = [...actor.items].find(item => !item.flags?.[ID]?.needsGmReview
      && (item.type === data.type || item.type === row.type)
      && [row.name, ...(row.invocation ? row.matchNames ?? [] : [])].some(name => nameKey(item.name) === nameKey(name)));
    if (granted) { log.push({ name: row.name, detail: "Existing native item retained; placeholder unnecessary." }); continue; }
    const [created] = await actor.createEmbeddedDocuments("Item", [data]);
    if (!created) throw new Error(`Could not create review placeholder: ${row.name}.`);
    log.push({ name: row.name, detail: "Created name-only placeholder: Needs GM Review." });
  }
  return log;
}
