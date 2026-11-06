import test from "node:test";
import assert from "node:assert/strict";
import { baseActorData, prepareActorPlan, buildActor, runAdvancement, applyNativeSource } from "../scripts/actor-builder.mjs";

const character = { id: 123, name: "Test Character", stats: [15, 14, 13, 12, 10, 8].map((value, index) => ({ id: index + 1, value })) };

test("copies base scores without applying final-score overrides or inferred bonuses", () => {
  const data = baseActorData({ ...character, bonusStats: [{ id: 1, value: 2 }], overrideStats: [{ id: 1, value: 20 }] }, "owner");
  assert.equal(data.system.abilities.str.value, 15);
  assert.equal(data.ownership.owner, 3);
  assert.equal(data.type, "character");
  assert.throws(() => baseActorData({ ...character, stats: [] }, "owner"), /Invalid base/);
});

test("preflight rejects unresolved selections before resolving documents", async () => {
  let calls = 0;
  await assert.rejects(prepareActorPlan(character, { rows: [{ name: "Missing", selectedUuid: null }] }, () => { calls++; }), /Select sources/);
  assert.equal(calls, 0);
});

test("plan honors starting class and rejects incompatible subclass sources", async () => {
  const rows = [
    { key: "class-0", type: "class", selectedUuid: "fighter", level: 1 },
    { key: "class-1", type: "class", selectedUuid: "warlock", level: 3 },
    { key: "subclass-1", type: "subclass", selectedUuid: "patron" }
  ];
  const entries = rows.map(row => ({ type: row.type, uuid: row.selectedUuid }));
  const sources = { fighter: { type: "class", name: "Fighter", system: { identifier: "fighter" } },
    warlock: { type: "class", name: "Warlock", system: { identifier: "warlock" } },
    patron: { type: "subclass", name: "Patron", system: { classIdentifier: "warlock" } } };
  const input = { ...character, classes: [{ isStartingClass: false }, { isStartingClass: true }] };
  const plan = await prepareActorPlan(input, { rows, entries }, uuid => sources[uuid]);
  assert.deepEqual(plan.map(task => task.uuid), ["warlock", "fighter", "patron"]);
  sources.patron.system.classIdentifier = "fighter";
  await assert.rejects(prepareActorPlan(input, { rows, entries }, uuid => sources[uuid]), /compatible subclass/);
});

test("cancel and retry continue one actor without repeating completed origins", async () => {
  const session = { data: {}, characterId: 123, tasks: [{ key: "class" }, { key: "race" }], completed: [] };
  let created = 0;
  let cancel = true;
  const applied = [];
  const actor = { async setFlag() {} };
  const dependencies = { createActor: async () => { created++; return actor; }, applySource: async (_actor, task) => {
    applied.push(task.key);
    return task.key !== "race" || !cancel;
  } };
  await buildActor(session, dependencies);
  assert.equal(session.actor, actor);
  assert.equal(session.complete, undefined);
  assert.deepEqual(session.completed, ["class"]);
  cancel = false;
  await buildActor(session, dependencies);
  await buildActor(session, dependencies);
  assert.equal(created, 1);
  assert.deepEqual(applied, ["class", "race", "race"]);
  assert.equal(session.complete, true);
});

test("a failed origin retains the draft and releases the in-flight guard", async () => {
  const session = { tasks: [{ key: "class" }], completed: [] };
  const actor = { async setFlag() {} };
  await assert.rejects(buildActor(session, { createActor: async () => actor, applySource: async () => { throw new Error("failed"); } }), /failed/);
  assert.equal(session.actor, actor);
  assert.equal(session.busy, false);
  assert.deepEqual(session.completed, []);
  await assert.rejects(buildActor({ busy: true }, {}), /already running/);
});

test("equipment/spell phase runs after origins and retries the same actor without reapplying origins", async () => {
  const events = [];
  const actor = { async setFlag() {} };
  const session = { characterId: 1, tasks: [{ key: "class", name: "Test Class" }], completed: [] };
  let fail = true;
  const dependencies = {
    createActor: async () => { events.push("create"); return actor; },
    applySource: async () => { events.push("origin"); return true; },
    applyLoadout: async () => { events.push("loadout"); if (fail) throw new Error("Temporary item failure"); }
  };
  await assert.rejects(buildActor(session, dependencies), /Temporary item failure/);
  assert.equal(session.complete, undefined);
  assert.equal(session.actor, actor);
  fail = false;
  await buildActor(session, dependencies);
  assert.deepEqual(events, ["create", "origin", "loadout", "loadout"]);
  assert.equal(session.complete, true);
});

test("native manager completion is scoped, cancel settles, and render failure removes hooks", async () => {
  const callbacks = new Map();
  const hooks = { on: (key, fn) => { callbacks.set(key, fn); return fn; }, off: key => callbacks.delete(key) };
  const key = "dnd5e.advancementManagerComplete";
  const manager = { rendered: true, render() {}, async close() { this.rendered = false; } };
  const original = manager.close;
  const complete = runAdvancement(manager, hooks);
  callbacks.get(key)({});
  assert.equal(callbacks.size, 1);
  callbacks.get(key)(manager);
  assert.equal(await complete, true);
  assert.equal(callbacks.size, 0);
  assert.equal(manager.close, original);
  const canceled = runAdvancement(manager, hooks);
  await manager.close();
  assert.equal(await canceled, false);
  const broken = { ...manager, render() { throw new Error("render failure"); } };
  await assert.rejects(runAdvancement(broken, hooks), /render failure/);
  assert.equal(callbacks.size, 0);
});

test("JSON automation handles synthesized flows and restores instance methods and hooks after completion", async () => {
  const callbacks = new Map();
  const hooks = { on: (key, callback) => { callbacks.set(key, callback); return callback; }, off: key => callbacks.delete(key) };
  const options = [{ value: "skills:per", label: "Persuasion" }];
  const availableChoices = { asSet: () => new Set(["skills:per"]), asOptions: () => options };
  const prototype = { async getAutomaticApplicationValue() { return false; } };
  const flow = Object.assign(Object.create(prototype), {
    level: 1, advancement: { type: "Trait", id: "trait1", item: { id: "class1", type: "class", name: "Paladin" },
      configuration: { mode: "default" }, async unfulfilledChoices() { return { available: [{ type: "choice", choices: availableChoices }], choices: availableChoices }; } }
  });
  const synthesized = Object.assign(Object.create(prototype), { level: 0, advancement: {
    type: "Trait", id: "trait2", item: { id: "feat1", type: "feat", name: "Test Feat" },
    actor: { system: { details: { level: 3 } } }, configuration: { mode: "default" },
    async unfulfilledChoices() { return { available: [{ type: "choice", choices: availableChoices }], choices: availableChoices }; }
  } });
  const data = { classes: [{ definition: { name: "Paladin", classFeatures: [{ id: 1, requiredLevel: 1 }] } }],
    feats: [{ definition: { id: 2, name: "Test Feat" } }],
    modifiers: { class: [{ componentId: 1, type: "proficiency", friendlySubtypeName: "Persuasion" }],
      feat: [{ componentId: 2, type: "proficiency", friendlySubtypeName: "Persuasion" }] } };
  const selected = [];
  const context = { character: data, report: new Map() };
  const manager = { step: { type: "forward", flow }, rendered: true,
    async close() { this.rendered = false; },
    async render() {
      callbacks.get("dnd5e.preAdvancementManagerRender")(this);
      selected.push(await this.step.flow.getAutomaticApplicationValue());
      this.step.flow = synthesized;
      callbacks.get("dnd5e.preAdvancementManagerRender")(this);
      selected.push(await this.step.flow.getAutomaticApplicationValue());
      callbacks.get("dnd5e.advancementManagerComplete")(this);
    }
  };
  assert.equal(await runAdvancement(manager, hooks, context), true);
  assert.deepEqual(selected, [{ chosen: ["skills:per"] }, { chosen: ["skills:per"] }]);
  assert.equal(context.report.size, 2);
  assert([...context.report.values()].every(entry => entry.kind === "json"));
  assert.equal(callbacks.size, 0);
  assert.equal(Object.hasOwn(flow, "getAutomaticApplicationValue"), false);
  assert.equal(Object.hasOwn(synthesized, "getAutomaticApplicationValue"), false);
});

test("an origin already granted by advancements is not added a second time", async () => {
  globalThis.game = { user: {} };
  const actor = { isOwner: true, items: [{ type: "subclass", _stats: { compendiumSource: "Compendium.test.patron" } }] };
  const task = { type: "subclass", uuid: "Compendium.test.patron", source: { testUserPermission: () => true } };
  assert.equal(await applyNativeSource(actor, task), true);
  actor.items[0]._stats.compendiumSource = "Compendium.test.feats.Item.patron";
  task.uuid = "Compendium.test.feats.patron";
  assert.equal(await applyNativeSource(actor, task), true);
  delete globalThis.game;
});

test("native source addition preserves the compendium data and requests JSON class levels", async () => {
  const source = { type: "class", name: "Fighter", system: { identifier: "fighter" }, testUserPermission: () => true };
  const data = { type: "class", system: { levels: 1, advancement: { native: true } }, effects: [{ name: "Source effect" }] };
  let added;
  const manager = { steps: [] };
  globalThis.game = { user: {}, items: { fromCompendium: selected => { assert.equal(selected, source); return structuredClone(data); } } };
  globalThis.dnd5e = { applications: { advancement: { AdvancementManager: { forNewItem: (_actor, incoming) => {
    assert.equal(incoming.system.levels, 5);
    assert.deepEqual(incoming.effects, data.effects);
    assert.deepEqual(incoming.system.advancement, data.system.advancement);
    return manager;
  } } } } };
  globalThis.CONFIG = { Item: { dataModels: {} } };
  const actor = { isOwner: true, items: [], async createEmbeddedDocuments(type, documents) { assert.equal(type, "Item"); added = documents; } };
  try {
    await applyNativeSource(actor, { type: "class", name: "Fighter", source, level: 5 });
    assert.equal(added.length, 1);
    assert.equal(added[0].system.levels, 5);
    await assert.rejects(applyNativeSource({ ...actor, isOwner: false }, { source }), /no longer own/);
  } finally {
    delete globalThis.game;
    delete globalThis.dnd5e;
    delete globalThis.CONFIG;
  }
});
