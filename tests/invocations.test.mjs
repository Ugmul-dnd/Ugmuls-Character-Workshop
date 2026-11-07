import test from "node:test";
import assert from "node:assert/strict";
import { characterFeats, importFeats } from "../scripts/feats.mjs";
import { matchLoadout } from "../scripts/loadout.mjs";
import { scopeForItem, selectAdvancement } from "../scripts/advancement-choices.mjs";

const character = {
  classes: [{ definition: { name: "Warlock", classFeatures: [{ id: 10, name: "Eldritch Invocations", requiredLevel: 1 }] } }],
  options: { class: [
    { componentId: 10, definition: { id: 101, name: "Pact of the Blade" } },
    { componentId: 10, definition: { id: 102, name: "Agonizing Blast (Eldritch Blast)" } },
    { componentId: 10, definition: { id: 103, name: "Lessons of the First Ones" } },
    { componentId: 99, definition: { id: 104, name: "Unrelated Option" } }
  ] },
  choices: { class: [
    { id: "blade", componentId: 10, optionValue: 101, label: "Choose a Level 1 Option" },
    { id: "blast", componentId: 10, optionValue: 102, label: "Choose a Level 2 Option" },
    { id: "lessons", componentId: 10, optionValue: 103, label: "Choose a Level 2 Option" },
    { id: "tough", parentChoiceId: "lessons", componentId: 10, optionValue: 201, label: "Choose a Feat" }
  ] },
  feats: [{ definition: { id: 201, name: "Tough" } }]
};
const entries = ["Pact of the Blade", "Agonizing Blast", "Lessons of the First Ones", "Tough"].map((name, index) => ({
  name, type: "feat", uuid: `Compendium.test.invocations.Item.entry${index}`
}));
const source = { type: "feat", testUserPermission: () => true, system: { assertPrerequisites: () => true } };
function advancement() {
  return { type: "ItemChoice", title: "Eldritch Invocations", item: { type: "class", name: "Warlock" }, actor: { items: [], system: { details: { level: 3 } } },
    getCounts: level => ({ current: 0, max: level === 1 ? 1 : 2 }),
    configuration: { type: "feat", choices: { 1: {}, 2: {} }, pool: entries.slice(0,3).map(entry => ({ uuid: entry.uuid })), allowDrops: false } };
}

test("selected invocation options appear in preview with their level and qualified name", () => {
  const rows = characterFeats(character).filter(row => row.invocation);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.level), [1, 2, 2]);
  const matched = matchLoadout(rows, entries);
  assert.equal(matched[1].name, "Agonizing Blast (Eldritch Blast)");
  assert.equal(matched[1].selectedUuid, entries[1].uuid);
  assert.equal(matched[1].handledBy, "class-invocation");
});

test("native invocation selections are level-specific and exclude the nested feat choice", async () => {
  const context = { character, entries, user: {}, featTasks: [], tasks: [], resolve: async () => source };
  const a = advancement();
  assert.deepEqual(await selectAdvancement({ advancement: a, level: 1 }, context), { selected: [entries[0].uuid] });
  assert.deepEqual(await selectAdvancement({ advancement: a, level: 2 }, context), { selected: [entries[1].uuid, entries[2].uuid] });
  a.configuration.pool = a.configuration.pool.filter(entry => entry.uuid !== entries[1].uuid);
  assert.equal(await selectAdvancement({ advancement: a, level: 2 }, context), null);
});

test("Lessons scopes its nested feat by parent choice and selects through the native pool", async () => {
  const scope = scopeForItem(character, { type: "feat", name: "Lessons of the First Ones" }, 3);
  assert.deepEqual(scope.choices.map(choice => choice.id), ["tough"]);
  const a = advancement();
  a.item = { type: "feat", name: "Lessons of the First Ones" };
  a.title = "Origin Feat";
  a.getCounts = () => ({ current: 0, max: 1 });
  a.configuration.pool = [{ uuid: entries[3].uuid }];
  assert.deepEqual(await selectAdvancement({ advancement: a, level: 0 }, { character, entries, user: {}, tasks: [], resolve: async () => source }), { selected: [entries[3].uuid] });
});

test("missing invocation advancement results are reported without adding bonus feats", async () => {
  const rows = characterFeats(character).filter(row => row.invocation);
  const report = new Map();
  await importFeats({ isOwner: true, items: [] }, rows, { character, report, applySource: () => assert.fail("must remain a native class choice") });
  assert.equal(report.size, 3);
  assert.ok([...report.values()].every(entry => entry.status === "review"));
});
