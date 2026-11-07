import test from "node:test";
import assert from "node:assert/strict";
import { selectAdvancement, describeSelection, scopeForItem, abilitySelection } from "../scripts/advancement-choices.mjs";
import { characterFeats } from "../scripts/feats.mjs";

test("replacement-only steps skip without matching a class, including spell replacements", async () => {
  for (const type of ["feat", "spell"]) {
    const advancement = { type: "ItemChoice", configuration: { type, choices: { 4: { count: 0, replacement: true } } },
      getCounts: () => ({ current: 0, max: 0, replacement: false }) };
    const flow = { advancement, level: 4 };
    assert.deepEqual(await selectAdvancement(flow, {}), { selected: [] });
    assert.match(await describeSelection(flow, { selected: [] }, {}), /No replacement/);
  }
});

test("replacement permission does not skip new selections or undo a started replacement", async () => {
  const advancement = { type: "ItemChoice", item: { type: "class", name: "Unknown" },
    configuration: { choices: { 4: { count: 1, replacement: true } } },
    getCounts: () => ({ current: 0, max: 1, replacement: false }) };
  assert.equal(await selectAdvancement({ advancement, level: 4 }, { character: { classes: [] } }), null);
  advancement.getCounts = () => ({ current: 0, max: 1, replacement: true });
  assert.equal(await selectAdvancement({ advancement, level: 4 }, { character: { classes: [] } }), null);
});

test("Vestige domain alias selects only the matching entry from its native pool", async () => {
  const character = { classes: [{ definition: { name: "Warlock" }, classFeatures: [{ definition: { id: 10, name: "Vestige Spells", requiredLevel: 3 } }] }],
    choices: { class: [{ componentId: 10, optionValue: 20 }] }, options: { class: [{ componentId: 10, definition: { id: 20, name: "War Domain Spells" } }] } };
  const entries = [{ name: "Vestige Spells (War)", type: "feat", uuid: "war" },
    { name: "Vestige Spells (Life)", type: "feat", uuid: "life" }, { name: "War Domain Spells", type: "feat", uuid: "cleric" }];
  const advancement = { type: "ItemChoice", title: "Vestige Spells", item: { type: "feat", name: "Vestige Spells" },
    actor: { items: [], system: { details: { level: 3 } } }, getCounts: () => ({ current: 0, max: 1 }),
    configuration: { type: "feat", choices: { 3: { count: 1 } }, pool: [{ uuid: "war" }, { uuid: "life" }], allowDrops: false } };
  const context = { character, entries, tasks: [], user: {}, resolve: async () => ({ type: "feat", testUserPermission: () => true, system: { assertPrerequisites: () => true } }) };
  assert.deepEqual(await selectAdvancement({ advancement, level: 3 }, context), { selected: ["war"] });
  advancement.configuration.pool = [{ uuid: "life" }];
  assert.equal(await selectAdvancement({ advancement, level: 3 }, context), null);
});

test("singular background Ability Score Increase uses only its own native ASI budget", () => {
  const character = { classes: [], background: { definition: { name: "Pact Seeker" } },
    feats: [{ definition: { id: 20, name: "Pact Seeker Ability Score Increase" } }], modifiers: { feat: [
      { componentId: 20, type: "bonus", subType: "charisma-score", value: 2 },
      { componentId: 20, type: "bonus", subType: "constitution-score", value: 1 },
      { componentId: 21, type: "bonus", subType: "strength-score", value: 2 }
    ] } };
  const row = characterFeats(character)[0];
  assert.equal(row.nativeOnly, true);
  assert.equal(row.handledBy, "background-asi");
  const scope = scopeForItem(character, { name: "Pact Seeker", type: "background" }, 0);
  const advancement = { item: {}, configuration: { fixed: {}, cap: 2, points: 3, locked: new Set(["str", "dex", "wis"]) },
    canImprove: () => true, actor: { system: { abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map(key => [key, { value: 10, max: 20 }])) } } };
  assert.deepEqual(abilitySelection(advancement, scope), { type: "asi", assignments: { cha: 2, con: 1 } });
  advancement.configuration.locked.add("cha");
  assert.equal(abilitySelection(advancement, scope), null);
});

test("Divine Order matches its prefixed native option and scopes the nested choice", async () => {
  const character = { classes: [{ definition: { name: "Cleric", classFeatures: [{ id: 10, name: "Divine Order", requiredLevel: 1 }] },
    classFeatures: [{ definition: { id: 10, name: "Divine Order", requiredLevel: 1 } }] }],
    choices: { class: [{ id: "order", componentId: 10, optionValue: 20 },
      { id: "cantrip", parentChoiceId: "order", componentId: 10, optionValue: 30 }] },
    options: { class: [{ componentId: 10, definition: { id: 20, name: "Thaumaturge" } }] } };
  const entries = [{ name: "Divine Order: Thaumaturge", type: "feat", uuid: "thaumaturge" },
    { name: "Divine Order: Protector", type: "feat", uuid: "protector" }, { name: "Thaumaturge", type: "feat", uuid: "unrelated" }];
  const advancement = { type: "ItemChoice", title: "Divine Order Choice", item: { type: "class", name: "Cleric" },
    actor: { items: [], system: { details: { level: 1 } } }, getCounts: () => ({ current: 0, max: 1 }),
    configuration: { type: "feat", choices: { 1: { count: 1 } }, pool: [{ uuid: "thaumaturge" }, { uuid: "protector" }], allowDrops: false } };
  const context = { character, entries, tasks: [], user: {}, resolve: async () => ({ type: "feat", testUserPermission: () => true, system: { assertPrerequisites: () => true } }) };
  assert.deepEqual(await selectAdvancement({ advancement, level: 1 }, context), { selected: ["thaumaturge"] });
  const scope = scopeForItem(character, { type: "feat", name: "Divine Order: Thaumaturge" }, 1);
  assert.deepEqual(scope.choices.map(choice => choice.id), ["cantrip"]);
  advancement.configuration.pool = [{ uuid: "protector" }];
  assert.equal(await selectAdvancement({ advancement, level: 1 }, context), null);
});

test('Enchanting Conversationalist maps to Conversation and the parenthesized native skill option',async()=>{
 const character={classes:[{definition:{name:'Wizard',classFeatures:[]},classFeatures:[{definition:{id:10,name:'Enchanting Conversationalist',requiredLevel:3}}]}],
 options:{class:[{componentId:10,definition:{id:20,name:'Persuasion'}}]},choices:{class:[{componentId:10,optionValue:20}]}};
 const advancement={type:'ItemChoice',title:'Enchanting Conversation',item:{type:'feat',name:'Enchanting Conversation'},actor:{items:[],system:{details:{level:3}}},getCounts:()=>({current:0,max:1}),configuration:{type:'feat',choices:{3:{count:1}},pool:[{uuid:'persuasion'},{uuid:'deception'}],allowDrops:false}};
 const context={character,entries:[{name:'Enchanting Conversation (Persuasion)',type:'feat',uuid:'persuasion'},{name:'Enchanting Conversation (Deception)',type:'feat',uuid:'deception'}],tasks:[],user:{},resolve:async()=>({type:'feat',testUserPermission:()=>true,system:{assertPrerequisites:()=>true}})};
 assert.deepEqual(await selectAdvancement({advancement,level:3},context),{selected:['persuasion']});
});
