import test from "node:test";
import assert from "node:assert/strict";
import { characterFeats, importFeats } from "../scripts/feats.mjs";
import { selectAdvancement, abilitySelection } from "../scripts/advancement-choices.mjs";
import { matchLoadout } from "../scripts/loadout.mjs";

const character = {
  classes: [{ definition: { name: "Monk", classFeatures: [
    { id: 10, name: "Ability Score Improvement", requiredLevel: 4 },
    { id: 11, name: "8: Ability Score Improvement", requiredLevel: 8 }
  ] } }],
  background: { definition: { name: "Sailor" } },
  feats: [
    { componentId: 10, definition: { id: 20, name: "Grappler" } },
    { componentId: 11, definition: { id: 21, name: "Ability Score Improvement" } },
    { componentId: 50, definition: { id: 22, name: "Sailor Ability Score Improvements" } },
    { componentId: 51, definition: { id: 23, name: "Tavern Brawler" } },
    { componentId: 52, definition: { id: 24, name: "Extra Feat" } }
  ],
  modifiers: { feat: [
    { id: "point-one", componentId: 21, type: "bonus", subType: "dexterity-score", value: 1 },
    { id: "point-two", componentId: 21, type: "bonus", subType: "dexterity-score", value: 1 }
  ] }
};
const book = name => ({ type: "feat", name, system: { assertPrerequisites: () => true }, testUserPermission: () => true });

test("feat preview distinguishes class-level feats, synthetic background ASIs, and other feats", () => {
  const rows = characterFeats(character);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].handledBy, "class-asi");
  assert.equal(rows[0].level, 4);
  assert.equal(rows[1].level, 8);
  assert.equal(rows[2].handledBy, "background-asi");
  assert.equal(rows[4].handledBy, "source");
  const matches = matchLoadout(rows, []);
  assert.equal(matches[1].status, "native");
  assert.equal(matches[2].status, "native");
  assert.equal(matches[4].status, "missing");
});

function classAsi() {
  return { type: "AbilityScoreImprovement", allowFeat: true,
    item: { type: "class", name: "Monk", advancement: { byType: { AbilityScoreImprovement: [{ level: 4 }, { level: 8 }] } } },
    actor: { system: { details: { level: 8 }, abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, { value: 12, max: 20 }])) } },
    configuration: { fixed: {}, cap: 2, points: 2, locked: new Set() }, canImprove: () => true };
}

test("class ASIs select the level-specific feat or apply both exported Dexterity points", async () => {
  const tasks = characterFeats(character).map(row => ({ ...row, selectedUuid: `Compendium.test.feats.Item.${row.definitionId}`, source: book(row.name) }));
  const context = { character, featTasks: tasks, user: {} };
  const advancement = classAsi();
  assert.deepEqual(await selectAdvancement({ advancement, level: 4 }, context), { type: "feat", uuid: tasks[0].selectedUuid });
  assert.deepEqual(await selectAdvancement({ advancement, level: 8 }, context), { type: "asi", assignments: { dex: 2 } });
  advancement.allowFeat = false;
  assert.equal(await selectAdvancement({ advancement, level: 4 }, context), null);
});

test("modifier identities preserve separate +1 assignments while repeated records are not counted twice", () => {
  const advancement = classAsi();
  const scope = { kind: "feat", modifiers: character.modifiers.feat };
  assert.deepEqual(abilitySelection(advancement, scope, { attributed: true }), { type: "asi", assignments: { dex: 2 } });
  const repeated = { kind: "feat", modifiers: [character.modifiers.feat[0], character.modifiers.feat[0]] };
  assert.equal(abilitySelection(advancement, repeated, { attributed: true }), null);
});

test("a repeated feat definition across class levels remains manual when its modifiers cannot be attributed", async () => {
  const input = structuredClone(character);
  input.feats.push({ componentId: 10, definition: { id: 21, name: "Ability Score Improvement" } });
  assert.equal(await selectAdvancement({ advancement: classAsi(), level: 8 }, { character: input }), null);
});

test("Goliath ancestry strips the DDB descriptor only for an option in the selected species pool", async () => {
  const input = { classes: [], race: { fullName: "Goliath" }, feats: [], modifiers: {}, choices: {
    race: [{ componentId: 1, componentTypeId: 2, type: 3, optionValue: 3 }],
    choiceDefinitions: [{ id: "2-3", options: [{ id: 3, label: "Hill’s Tumble (Hill Giant)" }] }]
  } };
  const advancement = { type: "ItemChoice", item: { type: "race", name: "Goliath" }, actor: { items: [], system: { details: { level: 1 } } },
    configuration: { choices: { 0: { count: 1 } }, type: "feat", allowDrops: false, pool: [{ uuid: "Compendium.test.origins.Item.hill" }] },
    getCounts: () => ({ current: 0, max: 1 }), _validateItemType: () => false };
  const context = { character: input, tasks: [], user: {}, resolve: async () => book("Hill's Tumble"), entries: [
    { type: "feat", name: "Hill's Tumble", uuid: "Compendium.test.origins.Item.hill" },
    { type: "feat", name: "Hill’s Tumble (Hill Giant)", uuid: "Compendium.other.origins.Item.hill" }
  ] };
  assert.deepEqual(await selectAdvancement({ advancement, level: 0 }, context), { selected: ["Compendium.test.origins.Item.hill"] });
  advancement.configuration.pool = [];
  assert.equal(await selectAdvancement({ advancement, level: 0 }, context), null);
});

test("generic feat choice honors an explicitly selected source instead of silently substituting its pool entry", async () => {
  const input = { classes: [{ definition: { name: "Fighter", classFeatures: [{ id: 1, requiredLevel: 1 }] } }],
    feats: [{ definition: { id: 2, name: "Test Feat" } }], choices: { class: [{ componentId: 1, type: 6, optionValue: 2 }] } };
  const advancement = { type: "ItemChoice", item: { type: "class", name: "Fighter" }, actor: { items: [], system: { details: { level: 1 } } },
    configuration: { choices: { 1: { count: 1 } }, type: "feat", allowDrops: true, pool: [{ uuid: "pool" }] },
    getCounts: () => ({ current: 0, max: 1 }), _validateItemType: () => true };
  const context = { character: input, tasks: [], user: {}, resolve: async () => book("Test Feat"),
    featTasks: [{ name: "Test Feat", selectedUuid: "chosen" }],
    entries: [{ type: "feat", name: "Test Feat", uuid: "pool" }, { type: "feat", name: "Test Feat", uuid: "chosen" }] };
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, context), { selected: ["chosen"] });
  advancement.configuration.allowDrops = false;
  assert.equal(await selectAdvancement({ advancement, level: 1 }, context), null);
});

test.before(() => { globalThis.game = { user: {} }; });
test.after(() => { delete globalThis.game; });

test("native feats and origin ASIs are retained without adding duplicate feats or bonuses", async () => {
  const actor = { isOwner: true, items: [
    { type: "feat", name: "Grappler", _stats: { compendiumSource: "Compendium.test.feats.Item.grappler" } },
    { type: "feat", name: "Tavern Brawler" },
    { type: "class", name: "Monk", advancement: { byType: { AbilityScoreImprovement: [{ level: 8, value: { type: "asi", assignments: { dex: 2 } } }] } } },
    { type: "background", name: "Sailor", advancement: { byType: { AbilityScoreImprovement: [{ level: 0, value: { type: "asi", assignments: { dex: 2, wis: 1 } } }] } } }
  ] };
  const rows = characterFeats(character).slice(0, 4);
  const report = new Map();
  await importFeats(actor, rows, { character, report, applySource: async () => { throw new Error("Must not duplicate native feat"); } });
  assert([...report.values()].every(row => row.status === "retained"));
});

test("extra feats use native addition, unresolved class choices do not become bonus feats, and cancel pauses", async () => {
  const actor = { isOwner: true, items: [], system: { details: { level: 9 } } };
  const rows = characterFeats(character);
  const extra = { ...rows[4], source: book("Extra Feat") };
  let calls = 0;
  const report = new Map();
  assert.equal(await importFeats(actor, [rows[0], extra], { character, report, applySource: async () => { calls++; return false; } }), false);
  assert.equal(calls, 1);
  assert.equal(report.get(rows[0].key).status, "review");
  assert.equal(await importFeats(actor, [extra], { character, report, applySource: async () => true }), true);
  assert.equal(report.get(extra.key).status, "imported");
});
