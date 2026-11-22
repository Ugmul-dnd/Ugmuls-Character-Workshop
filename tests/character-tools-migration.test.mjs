import assert from "node:assert/strict";
import test from "node:test";

const workshop = "ugmuls-character-workshop";
const automation = "ugmuls-5-5e-automation";
const browse = "sheetAddCompendiumBrowser";
const load = "sheetLoadUnpreparedSpells";

globalThis.foundry = {
  applications: { api: { ApplicationV2: class {} } },
  utils: { deepClone: structuredClone }
};

test("Workshop startup registers each moved control once and preserves world preferences", async () => {
  for (const mode of ["standalone", "legacy", "upgraded"]) {
    const hooks = new Map(), registered = [], writes = [];
    const subscribe = (name, fn) => hooks.set(name, [...hooks.get(name) ?? [], fn]);
    globalThis.Hooks = { on: subscribe, once: subscribe };
    const modules = new Map([[workshop, {}]]);
    if (mode !== "standalone") modules.set(automation, {active: true, esmodules: mode === "legacy"
      ? ["scripts/create-player.js", "scripts/sheet-compendium-browser.js"] : []});
    const records = [
      {key: automation + "." + browse, value: "false"},
      {key: automation + "." + load, value: true},
      {key: workshop + "." + load, value: false}
    ];
    globalThis.game = {
      modules, user: {id: "gm", isGM: true}, users: {activeGM: {id: "gm"}}, system: {id: "dnd5e"},
      settings: {
        registerMenu() {}, register: (id, key) => registered.push([id, key]),
        storage: new Map([["world", records]]),
        async set(id, key, value) {writes.push([id, key, value]); records.push({key: id + "." + key, value});}
      }
    };
    let clicks = 0;
    globalThis.document = {addEventListener(name) {if (name === "click") clicks++;}};
    await import("../scripts/main.js?" + mode);
    for (const callback of hooks.get("init")) await callback();
    for (const callback of hooks.get("ready")) await callback();
    const active = mode !== "legacy";
    assert.equal(hooks.get("getActorContextOptions")?.length ?? 0, Number(active));
    assert.equal(clicks, Number(active));
    assert.deepEqual(registered, active ? [[workshop, browse], [workshop, load]] : []);
    assert.deepEqual(writes, active ? [[workshop, browse, false]] : []);
  }
});

test("legacy wizard progress and class spell associations survive the move", async () => {
  const { PlayerCreationWizard } = await import("../scripts/pc-creator.js");
  const { classSpells } = await import("../scripts/pc-spells.js");
  const actor = {
    flags: {[automation]: {pcCreation: {step: 5}}, [workshop]: {}},
    getFlag(id, key) {return this.flags[id]?.[key];},
    async setFlag(id, key, value) {this.flags[id][key] = value;}
  };
  const wizard = new PlayerCreationWizard(actor);
  assert.equal(wizard.progress.step, 5);
  wizard.progress.step++;
  await wizard.save();
  assert.equal(new PlayerCreationWizard(actor).progress.step, 6);
  assert.equal(actor.flags[automation].pcCreation.step, 5);
  const spell = {system: {}, flags: {[automation]: {creatorSpellClass: "wizard"}}};
  assert.deepEqual(classSpells({itemTypes: {spell: [spell]}}, {identifier: "wizard"}), [spell]);
});
