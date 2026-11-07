import test from "node:test";
import assert from "node:assert/strict";
import { scopeForItem, selectedChoiceNames, uniqueSlotSelection, traitSelection, abilitySelection, selectAdvancement, characterMasteryNames, jsonSelectionInventory, prefillTraitSelection } from "../scripts/advancement-choices.mjs";

const character = {
  classes: [{ definition: { name: "Paladin", classFeatures: [{ id: 10, name: "Core Traits", requiredLevel: 1 }, { id: 11, name: "Fighting Style", requiredLevel: 2 }] },
    subclassDefinition: { id: 20, name: "Test Oath", classFeatures: [{ id: 21, requiredLevel: 3 }] },
    classFeatures: [{ definition: { id: 11, name: "Fighting Style", requiredLevel: 2 } }] }],
  race: { fullName: "Test Species" }, background: { definition: { id: 30, name: "Charlatan" } },
  feats: [{ definition: { id: 40, name: "Charlatan Ability Score Improvements" } }, { definition: { id: 41, name: "Two-Weapon Fighting" } }],
  modifiers: {
    class: [{ componentId: 10, type: "proficiency", friendlySubtypeName: "Persuasion" },
      { componentId: 21, type: "proficiency", friendlySubtypeName: "Acrobatics" }],
    race: [{ type: "language", friendlySubtypeName: "Elvish" }], background: [],
    feat: [{ componentId: 40, type: "bonus", subType: "dexterity-score", value: 2 },
      { componentId: 40, type: "bonus", subType: "charisma-score", value: 1 }]
  },
  choices: { class: [{ componentId: 11, componentTypeId: 100, type: 6, optionValue: 41 }],
    choiceDefinitions: [{ id: "100-6", options: [] }, { id: "999-6", options: [{ id: 41, label: "Wrong group label" }] }] }
};

test("class, subclass, background ASI, and feature scopes do not borrow unrelated selections", () => {
  assert.deepEqual(scopeForItem(character, { type: "class", name: "Paladin" }, 3).modifiers.map(m => m.componentId), [10]);
  assert.deepEqual(scopeForItem(character, { type: "subclass", name: "Test Oath" }, 3).modifiers.map(m => m.componentId), [21]);
  assert.equal(scopeForItem(character, { type: "background", name: "Charlatan" }, 0).modifiers.length, 2);
  assert.equal(scopeForItem(character, { type: "feat", name: "Fighting Style" }, 3).choices[0].optionValue, 41);
  assert.equal(scopeForItem(character, { type: "background", name: "Different Background" }, 0), null);
});

test("choice IDs resolve feats within their own definition group", () => {
  assert.deepEqual(selectedChoiceNames(character, character.choices.class), ["Two-Weapon Fighting"]);
});

test("nullable DDB option groups do not prevent JSON loading or selected-option resolution", () => {
  const input = { ...character, options: {
    race: null, class: [null, { definition: { id: 91, name: "Selected Class Option" } }],
    background: null, item: null, feat: []
  }, choices: { ...character.choices, class: [null, { componentTypeId: 100, type: 3, optionValue: 91 }],
    choiceDefinitions: [null, { id: "100-3", options: [null] }] },
    modifiers: { ...character.modifiers, item: null, condition: null } };
  const snapshot = structuredClone(input);
  assert.deepEqual(selectedChoiceNames(input, input.choices.class), ["Selected Class Option"]);
  const rows = jsonSelectionInventory(input);
  assert(rows.some(row => row.values.includes("Selected Class Option")));
  assert(rows.some(row => row.label === "Languages" && row.values.includes("Elvish")));
  assert.deepEqual(input, snapshot);
});

test("slot solver treats identical slot permutations as one selection and refuses actual ambiguity", () => {
  const slots = [{ keys: ["a", "b", "c"] }, { keys: ["a", "b", "c"] }];
  assert.deepEqual(uniqueSlotSelection(slots, new Set(["a", "b"])), ["a", "b"]);
  assert.equal(uniqueSlotSelection(slots, new Set(["a", "b", "c"])), null);
  assert.equal(uniqueSlotSelection([{ keys: ["a"] }, { keys: ["a"] }], new Set(["a"])), null);
  assert.deepEqual(uniqueSlotSelection([{ keys: ["fixed"], fixed: true }, { keys: ["chosen"] }], new Set(["chosen"])), ["chosen", "fixed"]);
});

const choices = options => ({ asSet: () => new Set(options.map(option => option.value)), asOptions: () => options });
test("trait automation satisfies native available slots and leaves unrecognized selections manual", async () => {
  const options = [{ value: "skills:per", label: "Persuasion" }, { value: "skills:acr", label: "Acrobatics" }];
  const advancement = { configuration: { mode: "default" }, unfulfilledChoices: async () => ({
    choices: choices(options), available: [{ type: "choice", choices: choices(options) }]
  }) };
  const scope = scopeForItem(character, { type: "class", name: "Paladin" }, 3);
  assert.deepEqual(await traitSelection(advancement, scope), { chosen: ["skills:per"] });
  assert.equal(await traitSelection(advancement, { modifiers: [{ type: "proficiency", friendlySubtypeName: "Unknown Skill" }] }), null);
  advancement.configuration.mode = "expertise";
  assert.equal(await traitSelection(advancement, scope), null);
});

test("granted species features receive only their own JSON skill and tool choices", async () => {
  const input = { ...character, race: { fullName: "Test Species", racialTraits: [
    { definition: { id: 51, name: "Specialized Design" } }, { definition: { id: 52, name: "Languages" } }
  ] }, modifiers: { ...character.modifiers, race: [
    { componentId: 51, type: "proficiency", friendlySubtypeName: "Stealth" },
    { componentId: 51, type: "proficiency", friendlySubtypeName: "Tinker's Tools" },
    { componentId: 52, type: "language", friendlySubtypeName: "Elvish" }
  ] } };
  const scope = scopeForItem(input, { type: "feat", name: "Specialized Design" }, 3);
  assert.equal(scope.group, "race");
  assert.equal(scope.modifiers.length, 2);
  const skills = choices([{ value: "skills:ste", label: "Stealth" }, { value: "skills:prc", label: "Perception" }]);
  const tools = choices([{ value: "tool:art:tinker", label: "Tinker’s Tools" }, { value: "tool:art:smith", label: "Smith's Tools" }]);
  const advancement = { configuration: { mode: "default" }, unfulfilledChoices: async () => ({
    available: [{ type: "choice", choices: skills }, { type: "choice", choices: tools }],
    choices: choices([...skills.asOptions(), ...tools.asOptions()])
  }) };
  assert.deepEqual(await traitSelection(advancement, scope, input), { chosen: ["skills:ste", "tool:art:tinker"] });
});

test("native background language slots can use species JSON languages without borrowing skills", async () => {
  const options = [{ value: "languages:standard:elvish", label: "Elvish" }, { value: "languages:standard:giant", label: "Giant" },
    { value: "languages:standard:dwarvish", label: "Dwarvish" }];
  const input = { ...character, modifiers: { ...character.modifiers, race: [
    { type: "language", friendlySubtypeName: "Common" }, { type: "language", friendlySubtypeName: "Elvish" },
    { type: "language", friendlySubtypeName: "Giant" }, { type: "proficiency", friendlySubtypeName: "Persuasion" }
  ] } };
  // Common already exists; native availability excludes it.
  const nativeChoices = choices(options);
  const advancement = { configuration: { mode: "default" }, unfulfilledChoices: async () => ({
    available: [{ type: "choice", choices: nativeChoices }, { type: "choice", choices: nativeChoices }], choices: nativeChoices
  }) };
  assert.deepEqual(await traitSelection(advancement, { kind: "background", modifiers: [] }, input), {
    chosen: ["languages:standard:elvish", "languages:standard:giant"]
  });
  const skills = choices([{ value: "skills:per", label: "Persuasion" }]);
  advancement.unfulfilledChoices = async () => ({ available: [{ type: "choice", choices: skills }], choices: skills });
  assert.equal(await traitSelection(advancement, { kind: "background", modifiers: [] }, input), null);
});

test("more known languages than available slots stays ambiguous", async () => {
  const languages = choices([{ value: "languages:elvish", label: "Elvish" }, { value: "languages:giant", label: "Giant" }]);
  const input = { ...character, modifiers: { race: [{ type: "language", friendlySubtypeName: "Elvish" }, { type: "language", friendlySubtypeName: "Giant" }] } };
  const advancement = { configuration: { mode: "default" }, unfulfilledChoices: async () => ({
    available: [{ type: "choice", choices: languages }], choices: languages
  }) };
  assert.equal(await traitSelection(advancement, { modifiers: [] }, input), null);
});

test("weapon mastery is read from feat choices/modifiers, without counting material variants twice", async () => {
  const input = { ...character, modifiers: { ...character.modifiers, feat: [
    { type: "weapon-mastery", friendlySubtypeName: "Vex (Shortsword)" },
    { type: "weapon-mastery", friendlySubtypeName: "Vex (Shortsword, Silver)" },
    { type: "weapon-mastery", friendlySubtypeName: "Vex (Shortsword, Wooden)" },
    { type: "weapon-mastery", friendlySubtypeName: "Nick (Scimitar)" },
    { type: "weapon-mastery", friendlySubtypeName: "Nick (Scimitar, Silver)" }
  ] } };
  const weapons = choices([{ value: "weapon:mar:shortsword", label: "Shortsword" }, { value: "weapon:mar:scimitar", label: "Scimitar" },
    { value: "weapon:mar:longsword", label: "Longsword" }]);
  const advancement = { configuration: { mode: "mastery" }, unfulfilledChoices: async () => ({
    available: [{ type: "choice", choices: weapons }, { type: "choice", choices: weapons }], choices: weapons
  }) };
  assert.deepEqual(await traitSelection(advancement, { modifiers: [] }, input), { chosen: ["weapon:mar:scimitar", "weapon:mar:shortsword"] });
  const choicesOnly = { ...input, modifiers: {}, feats: [{ definition: { id: 70, name: "Weapon Mastery" } }], choices: {
    feat: [{ componentId: 70, componentTypeId: 101, type: 3, optionValue: 71 }],
    choiceDefinitions: [{ id: "101-3", options: [{ id: 71, label: "Scimitar (Nick)" }] }]
  } };
  assert.deepEqual(characterMasteryNames(choicesOnly), ["Scimitar"]);
});

function asi() {
  return { level: 0, item: {}, actor: { system: { abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, { value: 10, max: 20 }])) } },
    configuration: { fixed: {}, locked: new Set(["str", "int", "wis"]), cap: 2, points: 3 }, canImprove: () => true };
}
test("origin ASIs honor the native budget, locked abilities, caps, and per-source attribution", () => {
  const advancement = asi();
  const scope = scopeForItem(character, { type: "background", name: "Charlatan" }, 0);
  assert.deepEqual(abilitySelection(advancement, scope), { type: "asi", assignments: { dex: 2, cha: 1 } });
  advancement.configuration.points = 2;
  assert.equal(abilitySelection(advancement, scope), null);
  advancement.configuration.points = 3;
  advancement.configuration.locked.add("dex");
  assert.equal(abilitySelection(advancement, scope), null);
  assert.equal(abilitySelection(asi(), { ...scope, kind: "class" }), null);
  const capped = asi(); capped.actor.system.abilities.dex.value = 19;
  assert.equal(abilitySelection(capped, scope), null);
  const multiple = asi(); multiple.item.advancement = { byType: { AbilityScoreImprovement: [{ level: 0 }, { level: 4 }] } };
  assert.equal(abilitySelection(multiple, scope), null);
});

test("size uses the explicit JSON choice when there are alternatives and the sole source option otherwise", async () => {
  const input = { ...character, modifiers: { ...character.modifiers, race: [{ type: "size", subType: "medium" }] } };
  const advancement = { type: "Size", item: { type: "race", name: "Test Species" }, configuration: { sizes: new Set(["sm", "med"]) }, actor: {} };
  assert.deepEqual(await selectAdvancement({ advancement, level: 0 }, { character: input }), { size: "med" });
  advancement.configuration.sizes = new Set(["sm"]);
  assert.deepEqual(await selectAdvancement({ advancement, level: 0 }, { character: input }), { size: "sm" });
});

test("HP uses first character level maximum, averages otherwise, and preserves prior level records", async () => {
  const advancement = { type: "HitPoints", item: { isOriginalClass: true }, value: {} };
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, {}), { 1: "max" });
  advancement.value = { 1: "max" };
  assert.deepEqual(await selectAdvancement({ advancement, level: 2 }, {}), { 1: "max", 2: "avg" });
  advancement.item.isOriginalClass = false;
  advancement.value = {};
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, {}), { 1: "avg" });
});

test("the native Subclass advancement uses the selected source for its parent class", async () => {
  const source = { type: "subclass", system: { classIdentifier: "paladin" }, testUserPermission: () => true };
  const advancement = { type: "Subclass", item: { system: { identifier: "paladin" } }, value: {} };
  const context = { tasks: [{ type: "subclass", uuid: "chosen-oath", source }], resolve: async () => source, user: {} };
  assert.deepEqual(await selectAdvancement({ advancement, level: 3 }, context), { uuid: "chosen-oath" });
  source.testUserPermission = () => false;
  assert.equal(await selectAdvancement({ advancement, level: 3 }, context), null);
  source.testUserPermission = () => true;
  source.system.classIdentifier = "fighter";
  assert.equal(await selectAdvancement({ advancement, level: 3 }, context), null);
});

test("item-choice steps with no remaining selection advance without adding items", async () => {
  const advancement = { type: "ItemChoice", item: { type: "class", name: "Paladin" },
    getCounts: () => ({ current: 0, max: 0 }), configuration: { choices: { 1: { count: 0, replacement: false } } } };
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, { character }), { selected: [] });
  advancement.getCounts = () => ({ current: 1, max: 1 });
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, { character }), { selected: [] });
});

test("JSON reference lists languages, racial traits, and selections regardless of native prompt placement", () => {
  const input = { ...character, race: { racialTraits: [{ definition: { id: 51, name: "Specialized Design" } }] } };
  const rows = jsonSelectionInventory(input);
  assert(rows.some(row => row.label === "Species traits" && row.values.includes("Specialized Design")));
  assert(rows.some(row => row.label === "Languages" && row.values.includes("Elvish")));
  assert(rows.some(row => row.label.startsWith("Class:") && row.values.includes("Two-Weapon Fighting")));
  assert(rows.some(row => row.label === "Subclasses" && row.values.includes("Test Oath")));
});

test("feat choices use native restrictions, refuse ambiguous editions, and prefer the configured source pool", async () => {
  const item = { type: "feat", name: "Fighting Style" };
  const advancement = { type: "ItemChoice", item, actor: { system: { details: { level: 3 } } },
    getCounts: () => ({ current: 0, max: 1 }), _validateItemType: source => source.valid,
    configuration: { type: "feat", choices: { 0: { count: 1, replacement: false } }, pool: [], allowDrops: true } };
  const docs = { one: { valid: true, testUserPermission: () => true, system: {} }, two: { valid: true, testUserPermission: () => true, system: {} } };
  const context = { character, tasks: [], user: {}, entries: [{ uuid: "one", type: "feat", name: "Two-Weapon Fighting" }], resolve: async uuid => docs[uuid] };
  const flow = { advancement, level: 0 };
  assert.deepEqual(await selectAdvancement(flow, context), { selected: ["one"] });
  context.entries.push({ uuid: "two", type: "feat", name: "Two-Weapon Fighting" });
  assert.equal(await selectAdvancement(flow, context), null);
  advancement.configuration.pool = [{ uuid: "one" }];
  assert.deepEqual(await selectAdvancement(flow, context), { selected: ["one"] });
  docs.one.valid = false;
  // Native pool checkboxes accept authored pool entries; drop filters apply outside the pool.
  assert.deepEqual(await selectAdvancement(flow, context), { selected: ["one"] });
  advancement.configuration.pool = [];
  context.entries = context.entries.slice(0, 1);
  assert.equal(await selectAdvancement(flow, context), null);
  advancement.configuration.pool = [{ uuid: "one" }];
  docs.one.valid = true;
  docs.one.testUserPermission = () => false;
  assert.equal(await selectAdvancement(flow, context), null);
  docs.one.testUserPermission = () => true;
  advancement.actor.items = [{ _stats: { compendiumSource: "one" } }];
  assert.equal(await selectAdvancement(flow, context), null);
});

test("Fighting Style recognizes a full pool UUID when the preview has a shortened UUID", async () => {
  const source = { type: "feat", testUserPermission: () => true, system: { type: { value: "feat", subtype: "fightingStyle" }, assertPrerequisites: () => true } };
  let externalValidationCalls = 0;
  const advancement = { type: "ItemChoice", item: { type: "class", name: "Paladin" }, actor: { system: { details: { level: 2 } } },
    getCounts: () => ({ current: 0, max: 1 }),
    _validateItemType() { externalValidationCalls++; return false; },
    configuration: { type: "feat", choices: { 2: { count: 1 } }, allowDrops: true,
      pool: [{ uuid: "Compendium.test.feats.Item.twoWeapon" }], restriction: { type: "class", subtype: "fightingStyle" } }
  };
  const context = { character, tasks: [], user: {}, entries: [
    { uuid: "Compendium.test.feats.twoWeapon", type: "feat", name: "Two-Weapon Fighting" },
    { uuid: "Compendium.other.feats.Item.twoWeapon", type: "feat", name: "Two-Weapon Fighting" }
  ], resolve: async () => source };
  assert.deepEqual(await selectAdvancement({ advancement, level: 2 }, context), { selected: ["Compendium.test.feats.twoWeapon"] });
  assert.equal(externalValidationCalls, 0);
});

test("Skilled prefills recognized skills and flags an unavailable tool without inventing a replacement", async () => {
  const input = { ...character, feats: [{ definition: { id: 60, name: "Skilled" } }], modifiers: { feat: [
    { componentId: 60, type: "proficiency", friendlySubtypeName: "Animal Handling" },
    { componentId: 60, type: "proficiency", friendlySubtypeName: "Athletics" },
    { componentId: 60, type: "proficiency", friendlySubtypeName: "Bowls" }
  ] } };
  const availableChoices = choices([
    { value: "skills:ani", label: "Animal Handling" }, { value: "skills:ath", label: "Athletics" },
    { value: "skills:acr", label: "Acrobatics" }, { value: "tool:game:dice", label: "Dice" }
  ]);
  const advancement = { type: "Trait", item: { type: "feat", name: "Skilled" }, actor: { system: { details: { level: 3 } } },
    configuration: { mode: "default" }, unfulfilledChoices: async () => ({
      available: Array.from({ length: 3 }, () => ({ type: "choice", choices: availableChoices })), choices: availableChoices
    }) };
  const flow = { advancement, level: 0 };
  assert.equal(await selectAdvancement(flow, { character: input }), null);
  const partial = await prefillTraitSelection(flow, { character: input });
  assert.deepEqual(partial.data, { chosen: ["skills:ani", "skills:ath"] });
  assert.deepEqual(partial.missing, ["Bowls"]);
});

test("ranger feature languages and expertise stay scoped; unsupported language is reported", async () => {
  const input = { classes: [{ definition: { name: "Ranger", classFeatures: [{ id: 70, name: "Deft Explorer", requiredLevel: 2 }] },
    classFeatures: [{ definition: { id: 70, name: "Deft Explorer", requiredLevel: 2 } }] }], modifiers: {
    class: [{ componentId: 70, type: "language", friendlySubtypeName: "Vedalken" },
      { componentId: 70, type: "language", friendlySubtypeName: "Common Sign Language" },
      { componentId: 70, type: "expertise", friendlySubtypeName: "Perception" },
      { componentId: 71, type: "proficiency", friendlySubtypeName: "Survival" }],
    race: [{ type: "language", friendlySubtypeName: "Giant" }]
  }};
  const languages = choices([{ value: "languages:standard:sign", label: "Common Sign Language" }, { value: "languages:standard:giant", label: "Giant" }]);
  const advancement = { type: "Trait", title: "Deft Explorer", item: { type: "class", name: "Ranger" }, configuration: { mode: "default" },
    unfulfilledChoices: async () => ({ available: [{ type: "choice", choices: languages }, { type: "choice", choices: languages }], choices: languages }) };
  const context = { character: input };
  assert.equal(await selectAdvancement({ advancement, level: 2 }, context), null);
  const partial = await prefillTraitSelection({ advancement, level: 2 }, context);
  assert.deepEqual(partial.data.chosen, ["languages:standard:sign"]);
  assert.deepEqual(partial.missing, ["Vedalken"]);
  const skills = choices([{ value: "skills:prc", label: "Perception" }, { value: "skills:sur", label: "Survival" }]);
  advancement.configuration.mode = "upgrade";
  advancement.unfulfilledChoices = async () => ({ available: [{ type: "choice", choices: skills }], choices: skills });
  assert.deepEqual(await selectAdvancement({ advancement, level: 2 }, context), { chosen: ["skills:prc"] });
});

test("Skilled partial choices ignore native options outside its slot pools", async () => {
  const input = { classes: [], feats: [{ definition: { id: 80, name: "Skilled" } }], modifiers: { feat: [
    { componentId: 80, type: "proficiency", friendlySubtypeName: "Sleight of Hand" },
    { componentId: 80, type: "proficiency", friendlySubtypeName: "Shawm" },
    { componentId: 80, type: "proficiency", friendlySubtypeName: "Birdpipes" }
  ] }};
  const pool = choices([{ value: "skills:slt", label: "Sleight of Hand" }, { value: "tool:music:shawm", label: "Shawm" }]);
  const all = choices([...pool.asOptions(), { value: "other:birdpipes", label: "Birdpipes" }]);
  const advancement = { type: "Trait", item: { type: "feat", name: "Skilled" }, actor: { system: { details: { level: 3 } } }, configuration: { mode: "default" },
    unfulfilledChoices: async () => ({ available: Array.from({ length: 3 }, () => ({ type: "choice", choices: pool })), choices: all }) };
  const partial = await prefillTraitSelection({ advancement, level: 0 }, { character: input });
  assert.deepEqual(partial.data.chosen, ["skills:slt", "tool:music:shawm"]);
  assert.deepEqual(partial.missing, ["Birdpipes"]);
});

test('Reborn resistance chooses the matching damage trait without treating it as a proficiency',async()=>{
 const pool=choices([{value:'dr:cold',label:'Cold'},{value:'dr:necrotic',label:'Necrotic'},{value:'dr:poison',label:'Poison'}]);
 const advancement={configuration:{mode:'default'},unfulfilledChoices:async()=>({available:[{type:'choice',choices:pool}],choices:pool})};
 const scope={modifiers:[{type:'resistance',friendlySubtypeName:'Cold',subType:'cold'}]};
 assert.deepEqual(await traitSelection(advancement,scope),{chosen:['dr:cold']});
 const skills=choices([{value:'skills:cold',label:'Cold'}]);
 advancement.unfulfilledChoices=async()=>({available:[{type:'choice',choices:skills}],choices:skills});
 assert.equal(await traitSelection(advancement,scope),null);
});

test('Harper Fiddle is reported when absent rather than substituted with Viol',async()=>{
 const input={classes:[],feats:[{definition:{id:10,name:'Harper Agent'}}],modifiers:{feat:[{componentId:10,type:'proficiency',friendlySubtypeName:'Fiddle'}]}};
 const instruments=choices([{value:'tool:music:viol',label:'Viol'},{value:'tool:music:flute',label:'Flute'}]);
 const advancement={type:'Trait',item:{type:'feat',name:'Harper Agent'},actor:{system:{details:{level:3}}},configuration:{mode:'default'},unfulfilledChoices:async()=>({available:[{type:'choice',choices:instruments}],choices:instruments})};
 const partial=await prefillTraitSelection({advancement,level:0},{character:input});
 assert.equal(partial.data,null);
 assert.deepEqual(partial.missing,['Fiddle']);
});

test('Druid reconciles JSON Nature when Guide has already granted the class selection Survival',async()=>{
 const oldConfig=globalThis.CONFIG;
 globalThis.CONFIG={DND5E:{skills:{sur:{label:'Survival'}}}};
 try{
 const input={classes:[{definition:{name:'Druid',classFeatures:[{id:10,name:'Core Traits',requiredLevel:1}]}}],modifiers:{class:[{componentId:10,type:'proficiency',friendlySubtypeName:'Survival'},{componentId:10,type:'proficiency',friendlySubtypeName:'Perception'}],background:[{type:'proficiency',friendlySubtypeName:'Nature'}],race:[{type:'proficiency',friendlySubtypeName:'Insight'}]}};
 const pool=choices([{value:'skills:prc',label:'Perception'},{value:'skills:nat',label:'Nature'},{value:'skills:med',label:'Medicine'}]);
 const advancement={type:'Trait',item:{type:'class',name:'Druid'},actor:{items:[{type:'background'}],system:{skills:{sur:{value:1}}}},configuration:{mode:'default'},unfulfilledChoices:async()=>({available:[{type:'choice',choices:pool},{type:'choice',choices:pool}],choices:pool})};
 assert.deepEqual(await selectAdvancement({advancement,level:1},{character:input}),{chosen:['skills:nat','skills:prc']});
 input.modifiers.background.push({type:'proficiency',friendlySubtypeName:'Medicine'});
 assert.equal(await selectAdvancement({advancement,level:1},{character:input}),null);
 advancement.actor.system.skills.sur.value=0;
 input.modifiers.background.pop();
 assert.equal(await selectAdvancement({advancement,level:1},{character:input}),null);
 }finally{globalThis.CONFIG=oldConfig;}
});


test('numbered Weapon Mastery feats include Longbow at level four without offering it at level one',async()=>{
 const input={classes:[],feats:[{definition:{id:10,name:'Weapon Mastery'}},{definition:{id:20,name:'4: Weapon Mastery'}}],modifiers:{feat:[]},choices:{feat:[{componentId:10,componentTypeId:1,type:3,optionValue:100},{componentId:10,componentTypeId:1,type:3,optionValue:101},{componentId:10,componentTypeId:1,type:3,optionValue:102},{componentId:20,componentTypeId:1,type:3,optionValue:103}],choiceDefinitions:[{id:'1-3',options:[{id:100,label:'Halberd (Cleave)'},{id:101,label:'Handaxe (Vex)'},{id:102,label:'Dagger (Nick)'},{id:103,label:'Longbow (Slow)'}]}]}};
 assert.deepEqual(characterMasteryNames(input,1),['Halberd','Handaxe','Dagger']);
 assert.deepEqual(characterMasteryNames(input,4),['Halberd','Handaxe','Dagger','Longbow']);
 const pool=choices([{value:'weapon:mar:longbow',label:'Longbow'},{value:'weapon:mar:longsword',label:'Longsword'}]);
 const advancement={level:4,configuration:{mode:'mastery'},unfulfilledChoices:async()=>({available:[{type:'choice',choices:pool}],choices:pool})};
 assert.deepEqual(await traitSelection(advancement,{modifiers:[]},input),{chosen:['weapon:mar:longbow']});
});

