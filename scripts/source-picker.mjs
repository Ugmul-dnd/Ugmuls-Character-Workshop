/** Validate a browser-selected source without creating or changing documents. */
export function replacementEntry(row, source, pack, user) {
  if (!source?.uuid?.startsWith("Compendium.") || !pack?.visible || pack.documentName !== "Item"
    || !source.testUserPermission(user, "OBSERVER")) throw new Error("Choose an accessible compendium Item.");
  if (!(row.types ?? [row.type]).includes(source.type)) throw new Error("Choose a compatible item type for this entry.");
  if (row.kind === "spell" && row.level !== undefined && source.system.level !== row.level) throw new Error(`Choose a level ${row.level} spell.`);
  return { uuid: source.uuid, name: source.name, type: source.type, pack: pack.collection,
    packLabel: pack.metadata.label, book: source.system?.source?.book ?? "", rules: source.system?.source?.rules ?? "",
    classIdentifier: source.system?.classIdentifier ?? "", level: source.system?.level };
}
