import { canonicalItemUuid } from "./compendium-matcher.mjs";

const keyName = name => String(name ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
const records = values => Array.isArray(values) ? values.filter(Boolean) : [];
export const isAbilityScoreFeat = name => keyName(name) === "abilityscoreimprovement";
export const isBackgroundAbilityFeat = (name, background) => Boolean(background) && [
  "Ability Score Improvement", "Ability Score Improvements", "Ability Score Increase", "Ability Score Increases"
].some(suffix => keyName(name) === keyName(`${background} ${suffix}`));
export const isHiddenFeat = feat => records(feat?.definition?.categories).some(category => category.tagName === "__DISGUISE_FEAT");

export function characterInvocations(character) {
  const rows = [];
  for (const [classIndex, cls] of character.classes.entries()) {
    const features = [...records(cls.definition?.classFeatures), ...records(cls.classFeatures)].map(entry => entry.definition ?? entry);
    const ids = new Set(features.filter(feature => keyName(feature.name) === "eldritchinvocations").map(feature => feature.id));
    for (const option of records(character.options?.class).filter(option => ids.has(option.componentId))) {
      const definition = option.definition;
      if (!definition?.name) continue;
      const selected = records(character.choices?.class).filter(choice => choice.componentId === option.componentId && choice.optionValue === definition.id);
      if (selected.length !== 1) continue;
      const level = Number(selected[0].label?.match(/^Choose a Level (\d+) Option$/i)?.[1]) || undefined;
      rows.push({ key: `invocation:${classIndex}:${selected[0].id ?? definition.id}`, kind: "feat", label: "Invocation", types: ["feat"],
        name: definition.name, matchNames: [definition.name.replace(/\s*\([^()]+\)$/, "")], invocation: true,
        definitionId: definition.id, componentId: option.componentId, classIndex, level,
        handledBy: "class-invocation", sourceIds: records(definition.sources).map(source => source.sourceId),
        notes: `Selected Warlock invocation${level ? ` at level ${level}` : ""}. Applied through native invocation advancements; spell-specific choices remain subject to native prompts.` });
    }
  }
  return rows;
}

export function characterFeats(character) {
  const backgroundName = character.background?.definition?.name ?? character.background?.customBackground?.name;
  const feats = records(character.feats).filter(feat => !isHiddenFeat(feat)).map((feat, index) => {
    const definition = feat.definition ?? {};
    let classIndex = -1;
    let feature;
    for (const [candidateIndex, cls] of character.classes.entries()) {
      const found = records(cls.definition?.classFeatures).find(entry => (entry.definition ?? entry).id === feat.componentId);
      if (found) { classIndex = candidateIndex; feature = found.definition ?? found; break; }
    }
    const classAsi = feature && /ability\s*score\s*improvement|epic\s*boon/i.test(feature.name ?? "");
    const backgroundAsi = isBackgroundAbilityFeat(definition.name, backgroundName);
    return { key: `feat:${definition.id ?? index}:${feat.componentTypeId ?? "none"}:${feat.componentId ?? index}`,
      kind: "feat", label: "Feat", types: ["feat"], name: definition.name ?? "Unnamed feat",
      definitionId: definition.id, componentId: feat.componentId, classIndex: classIndex >= 0 ? classIndex : null,
      level: classAsi ? feature.requiredLevel : undefined,
      nativeOnly: Boolean(backgroundAsi || (classAsi && isAbilityScoreFeat(definition.name))),
      handledBy: classAsi ? "class-asi" : backgroundAsi ? "background-asi" : "source",
      sourceIds: records(definition.sources).map(source => source.sourceId),
      notes: classAsi ? `Chosen at ${character.classes[classIndex].definition.name} level ${feature.requiredLevel}. Applied through that native class advancement.`
        : backgroundAsi ? "Represented by the native background ability increase; no replacement feat will be created."
          : "Native grants are retained. Otherwise, the selected source feat is added using native advancements." };
  });
  return [...feats, ...characterInvocations(character)];
}

export async function importFeats(actor, tasks, { character, applySource, report, onReport = () => {} }) {
  const record = (row, status, detail) => { report.set(row.key, { name: row.name, status, detail }); onReport(); };
  for (const row of tasks) {
    if (!actor.isOwner) throw new Error("You no longer own this character.");
    const existing = [...actor.items].filter(item => item.type === "feat" && (
      (row.selectedUuid && [item._stats?.compendiumSource, item.flags?.dnd5e?.sourceId].some(uuid => uuid && canonicalItemUuid(uuid) === canonicalItemUuid(row.selectedUuid)))
      || keyName(item.name) === keyName(row.name)));
    if (existing.length) { record(row, "retained", "Existing feat retained; its advancements and bonuses were not applied again."); continue; }
    if (row.handledBy === "background-asi" || (row.handledBy === "class-asi" && isAbilityScoreFeat(row.name))) {
      const type = row.handledBy === "background-asi" ? "background" : "class";
      const expectedName = type === "class" ? character?.classes[row.classIndex]?.definition?.name
        : character?.background?.hasCustomBackground ? character.background.customBackground?.name : character?.background?.definition?.name;
      const applied = expectedName && [...actor.items].filter(item => item.type === type && keyName(item.name) === keyName(expectedName)).some(item =>
        (item.advancement?.byType?.AbilityScoreImprovement ?? []).some(advancement =>
          (row.level === undefined || advancement.level === row.level) && advancement.value?.type === "asi"
          && Object.keys(advancement.value?.assignments ?? {}).length));
      record(row, applied ? "retained" : "review", applied ? "Ability increases are recorded on the native origin advancement; no extra feat created." : "Check the native ability-score advancement; no extra feat created.");
      continue;
    }
    if (["class-asi", "class-invocation"].includes(row.handledBy)) { record(row, "review", "This selection belongs to a class advancement but was not found on the actor. Review that level's choice; no bonus feat was added."); continue; }
    if (!row.source) { record(row, "review", "No source selected; feat not imported."); continue; }
    if (!row.source.testUserPermission(globalThis.game.user, "OBSERVER")) throw new Error(`Source permission lost: ${row.name}.`);
    try {
      const valid = row.source.system.assertPrerequisites?.(actor, { level: actor.system.details.level, throwError: true });
      if (valid !== undefined && valid !== true) throw new Error("Prerequisites are not satisfied.");
    } catch (error) { record(row, "review", `Prerequisites need review: ${error.message}`); continue; }
    if (!await applySource(actor, { ...row, type: "feat", name: row.source.name })) {
      record(row, "review", "Feat advancement paused. Continue Character resumes this draft.");
      return false;
    }
    record(row, "imported", "Source feat added through native advancements.");
  }
  return true;
}
