import test from "node:test";
import assert from "node:assert/strict";
import { characterLoadout, matchLoadout, prepareLoadoutPlan, loadoutItemData, importLoadout } from "../scripts/loadout.mjs";

const ID = "ugmuls-character-workshop";
const character = { id: 100, classes: [{ id: 200, definition: { name: "Paladin", spellCastingAbilityId: 6, classFeatures: [{ id: 300 }] } }],
  inventory: [{ id: 1, quantity: 10, equipped: true, isAttuned: false, containerEntityId: 100, definition: { name: "Torch", filterType: "Other Gear" } }],
  classSpells: [{ characterClassId: 200, spells: [{ id: 400, definition: { id: 401, name: "Bless", level: 1 }, prepared: true }] }],
  spells: { class: [{ definition: { id: 402, name: "Divine Smite", level: 1 }, componentId: 300, alwaysPrepared: true, limitedUse: { maxUses: 1 } },
    { definition: { id: 402, name: "Divine Smite", level: 1 }, componentId: 300, alwaysPrepared: true, usesSpellSlot: true }], race: null }, customItems: null };

test("normalizes nullable export groups and combines multiple casting entries of the same feature spell", () => {
  const rows = characterLoadout(character);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].quantity, 10);
  assert.equal(rows[1].classIndex, 0);
  assert.equal(rows[1].prepared, true);
  assert.equal(rows[2].origin, "grant-class");
  assert.equal(rows[2].alwaysPrepared, true);
});

test("spell matching checks level and equipment matching never offers feats or spells", () => {
  const rows = characterLoadout(character);
  const entries = [{ uuid: "a", name: "Torch", type: "loot" }, { uuid: "wrong", name: "Torch", type: "feat" },
    { uuid: "b", name: "Bless", type: "spell", level: 1 }, { uuid: "c", name: "Bless", type: "spell", level: 1 },
    { uuid: "wrong-level", name: "Bless", type: "spell", level: 2 }];
  const matches = matchLoadout(rows, entries);
  assert.equal(matches[0].selectedUuid, "a");
  assert.equal(matches[1].candidates.length, 2);
  assert.equal(matches[1].selectedUuid, null);
  assert.equal(matches[2].status, "missing");
});

test("preflight validates selected source types and levels but permits unresolved rows", async () => {
  const row = { ...characterLoadout(character)[1], selectedUuid: "spell" };
  await assert.rejects(prepareLoadoutPlan([row], [{ uuid: "spell", type: "spell" }], async () => ({ type: "spell", system: { level: 2 } })), /Wrong spell level/);
  const tasks = await prepareLoadoutPlan([{ ...row, selectedUuid: null }], [], async () => { throw new Error("Must not resolve"); });
  assert.equal(tasks[0].source, null);
});

test("equipment import changes character state without rebuilding effects, activities, uses, or attunement rules", () => {
  const row = { ...characterLoadout(character)[0], attuned: true };
  const source = { _id: "book-id", type: "equipment", name: "Torch", system: { equipped: false, attuned: false, attunement: "required", uses: { max: "3" }, activities: { native: { type: "utility" } } }, effects: [{ name: "Native effect" }] };
  const data = loadoutItemData(row, source, null, character);
  assert.equal(data._id, undefined);
  assert.equal(data.system.quantity, 10);
  assert.equal(data.system.equipped, true);
  assert.equal(data.system.attuned, true);
  assert.equal(data.system.attunement, "required");
  assert.deepEqual(data.system.activities, source.system.activities);
  assert.deepEqual(data.effects, source.effects);
  assert.deepEqual(data.system.uses, source.system.uses);
  assert.equal(source.system.equipped, false);
});

function mockActor(items = []) {
  let serial = 0;
  const actor = { isOwner: true, items, created: 0,
    async createEmbeddedDocuments(_type, data) {
      return data.map(item => { const created = { ...structuredClone(item), id: `new-${++serial}` }; this.items.push(created); this.created++; return created; });
    },
    async updateEmbeddedDocuments(_type, updates) {
      for (const update of updates) {
        const item = this.items.find(item => item.id === update._id);
        for (const [key, value] of Object.entries(update)) {
          if (key === "_id") continue;
          const path = key.split("."); let target = item;
          for (const part of path.slice(0, -1)) target = target[part] ??= {};
          target[path.at(-1)] = structuredClone(value);
        }
      }
    }
  };
  return actor;
}
const classItem = () => ({ id: "class", name: "Paladin", type: "class", system: { identifier: "paladin", spellcasting: { type: "spell" } } });
function source(name, type, system = {}) {
  return { name, type, system, testUserPermission: () => true, data: { name, type, system: structuredClone(system), _stats: { compendiumSource: `Compendium.test.items.Item.${name.replaceAll(" ", "")}` } } };
}
test.before(() => { globalThis.game = { user: {} }; });
test.after(() => { delete globalThis.game; });

test("native spell grants are retained without duplicating or overwriting free-use casting", async () => {
  const granted = { id: "grant", name: "Divine Smite", type: "spell", system: { level: 1, prepared: 2, uses: { max: "1" }, activities: { original: {} } }, flags: { dnd5e: { advancementRoot: "class.advancement" } } };
  const before = structuredClone(granted);
  const actor = mockActor([classItem(), granted]);
  const report = new Map();
  await importLoadout(actor, [{ ...characterLoadout(character)[2], source: null }], { character, report, fromCompendium: () => { throw new Error("No new source needed"); } });
  assert.deepEqual(granted, before);
  assert.equal(actor.created, 0);
  assert.equal([...report.values()][0].status, "retained");
});

test("class spells copy preparation and class association; retry reuses items rather than duplicating them", async () => {
  const book = source("Bless", "spell", { level: 1, activities: { native: {} }, uses: { max: "" } });
  const row = { ...characterLoadout(character)[1], selectedUuid: "Compendium.test.items.Item.Bless", source: book };
  const actor = mockActor([classItem()]);
  const report = new Map();
  const deps = { character, report, fromCompendium: source => source.data };
  await importLoadout(actor, [row], deps);
  await importLoadout(actor, [row], deps);
  assert.equal(actor.created, 1);
  const item = actor.items.find(item => item.type === "spell");
  assert.equal(item.system.prepared, 1);
  assert.equal(item.system.sourceItem, "class:paladin");
  assert.equal(item.system.ability, "cha");
  assert.deepEqual(item.system.activities, book.data.system.activities);
  assert.deepEqual(item.flags[ID].loadoutKeys, [row.key]);
});

test("container IDs map to actor items, quantities remain JSON quantities, and separate inventory rows stay separate", async () => {
  const input = { ...character, classSpells: [], spells: {}, inventory: [
    { id: 1, quantity: 1, definition: { name: "Backpack", isContainer: true } },
    { id: 2, quantity: 10, containerEntityId: 1, definition: { name: "Torch" } },
    { id: 3, quantity: 1, definition: { name: "Torch" } }
  ] };
  const books = { Backpack: source("Backpack", "container", { quantity: 1 }), Torch: source("Torch", "consumable", { quantity: 1 }) };
  const tasks = characterLoadout(input).map(row => ({ ...row, selectedUuid: books[row.name].data._stats.compendiumSource, source: books[row.name] }));
  const actor = mockActor();
  const deps = { character: input, report: new Map(), fromCompendium: source => source.data };
  await importLoadout(actor, tasks, deps);
  const bag = actor.items.find(item => item.type === "container");
  const torches = actor.items.filter(item => item.name === "Torch");
  assert.deepEqual(torches.map(item => item.system.quantity), [10, 1]);
  assert.equal(torches[0].system.container, bag.id);
  await importLoadout(actor, tasks, deps);
  assert.equal(actor.created, 3);
  assert.equal(torches[0].system.container, bag.id);
});

test("unmatched sources and missing special spell grants are reported without fabricating content", async () => {
  const actor = mockActor([classItem()]);
  const tasks = characterLoadout(character).map(row => ({ ...row, source: null }));
  const report = new Map();
  await importLoadout(actor, tasks, { character, report, fromCompendium: () => { throw new Error("No sources selected"); } });
  assert.equal(actor.created, 0);
  assert.equal(report.size, 3);
  assert([...report.values()].every(row => row.status === "review"));
});

test("pre-existing native equipment is reconciled rather than added again", async () => {
  const book = source("Torch", "consumable", { quantity: 1 });
  const native = { id: "native", ...structuredClone(book.data), system: { quantity: 20, container: null, activities: { grant: {} } }, flags: { dnd5e: { advancementRoot: "class.grant" } } };
  const actor = mockActor([native]);
  const row = { ...characterLoadout(character)[0], source: book, selectedUuid: book.data._stats.compendiumSource };
  await importLoadout(actor, [row], { character, report: new Map(), fromCompendium: source => source.data });
  assert.equal(actor.created, 0);
  assert.equal(native.system.quantity, 10);
  assert.deepEqual(native.system.activities, { grant: {} });
  assert.equal(native.flags.dnd5e.advancementRoot, "class.grant");
});

test("cyclic JSON containers stay at top level and are reported", async () => {
  const input = { ...character, classSpells: [], spells: {}, inventory: [
    { id: 1, quantity: 1, containerEntityId: 2, definition: { name: "Bag One", isContainer: true } },
    { id: 2, quantity: 1, containerEntityId: 1, definition: { name: "Bag Two", isContainer: true } }
  ] };
  const tasks = characterLoadout(input).map(row => {
    const book = source(row.name, "container", { quantity: 1 });
    return { ...row, source: book, selectedUuid: book.data._stats.compendiumSource };
  });
  const actor = mockActor();
  const report = new Map();
  await importLoadout(actor, tasks, { character: input, report, fromCompendium: source => source.data });
  assert(actor.items.every(item => item.system.container === null));
  assert([...report.values()].every(entry => entry.status === "review"));
});
