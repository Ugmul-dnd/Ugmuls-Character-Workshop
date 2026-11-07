import test from "node:test";
import assert from "node:assert/strict";
import { accessibleItemPacks, worldSourceItemPacks, characterOrigins, indexOriginPacks, matchOrigins, searchOriginEntries } from "../scripts/compendium-matcher.mjs";

test("world defaults honor explicit exclusions, include unspecified packs, and preserve visibility", () => {
  const pack = (collection, extra = {}) => ({ collection, documentName: "Item", visible: true, ...extra });
  const packs = [pack("enabled"), pack("excluded"), pack("unspecified"),
    pack("hidden", { visible: false }), pack("actors", { documentName: "Actor" })];
  const configuration = { enabled: true, excluded: false, hidden: true, actors: true };
  assert.deepEqual(worldSourceItemPacks(packs, configuration).map(pack => pack.collection), ["enabled", "unspecified"]);
  assert.deepEqual(worldSourceItemPacks(packs, {}).map(pack => pack.collection), ["enabled", "excluded", "unspecified"]);
  assert.equal(configuration.excluded, false);
});

const character = {
  classes: [
    { definition: { name: "Warlock", sources: [{ sourceId: 145 }] }, level: 3,
      subclassDefinition: { name: "Vestige Patron" } },
    { definition: { name: "Fighter" }, level: 1 }
  ],
  race: { fullName: "Warforged", isLegacy: false },
  background: { definition: { name: "Pact Seeker" } }
};

test("extracts multiclass origins and subclass without inventing absent subclass entries", () => {
  const rows = characterOrigins(character);
  assert.deepEqual(rows.map(row => [row.type, row.name]), [
    ["class", "Warlock"], ["subclass", "Vestige Patron"], ["class", "Fighter"],
    ["race", "Warforged"], ["background", "Pact Seeker"]
  ]);
  assert.equal(rows[1].parent, "Warlock");
  assert.deepEqual(rows[0].sourceIds, [145]);
  assert.equal(rows[3].legacy, false);
});

test("a custom background does not fall back to the underlying stock definition", () => {
  const rows = characterOrigins({ ...character, background: {
    hasCustomBackground: true, customBackground: { name: "Custom Scholar" }, definition: { name: "Acolyte" }
  } });
  assert.equal(rows.at(-1).name, "Custom Scholar");
  assert.equal(rows.at(-1).custom, true);
});

test("prefers revised class sources while keeping wrong types unresolved", () => {
  const entries = [
    { type: "class", name: "Warlock", rules: "2014", uuid: "old" },
    { type: "class", name: "Warlock", rules: "2024", uuid: "new" },
    { type: "feat", name: "Warforged", uuid: "wrong-type" },
    { type: "background", name: "Pact Seeker", uuid: "background" }
  ];
  const rows = matchOrigins(characterOrigins(character), entries);
  assert.equal(rows[0].status, "review");
  assert.equal(rows[0].selectedUuid, "new");
  assert.equal(rows[0].candidates.length, 2);
  assert.equal(rows[3].status, "missing");
  assert.equal(rows[4].status, "review");
  assert.equal(rows[4].selectedUuid, "background");
  assert(rows.slice(1, 4).every(row => row.selectedUuid === null));
});

test("custom backgrounds can match existing source items, but differently spelled names need manual selection", () => {
  const background = characterOrigins({ ...character, background: {
    hasCustomBackground: true, customBackground: { name: "Pact Seeker" }
  } }).at(-1);
  const entries = [{ type: "background", name: "packseeker", packLabel: "Custom", uuid: "custom" }];
  assert.equal(matchOrigins([background], entries)[0].selectedUuid, null);
  assert.deepEqual(searchOriginEntries(background, entries, "pack"), entries);
  const exact = [...entries, { type: "background", name: "Pact Seeker", uuid: "exact" }];
  assert.equal(matchOrigins([background], exact)[0].selectedUuid, "exact");
});

test("a differently named entry is available for manual search but is never silently matched", () => {
  const origin = { type: "race", name: "Warforged" };
  const entries = [{ type: "race", name: "Warforged (Legacy)", packLabel: "Old Book" },
    { type: "feat", name: "Warforged Feature", packLabel: "Features" }];
  assert.equal(matchOrigins([origin], entries)[0].status, "missing");
  assert.deepEqual(searchOriginEntries(origin, entries, "WARFORGED"), [entries[0]]);
});

test("only visible item packs are eligible, indexes stay read-only and failed packs are reported", async () => {
  const good = { documentName: "Item", visible: true, collection: "test.origins", metadata: { label: "Test Book" },
    async getIndex({ fields }) {
      assert(fields.includes("system.source"));
      return [{ _id: "class1", type: "class", name: "Warlock", system: { source: { book: "Test", rules: "2024" } } },
        { _id: "spell1", type: "spell", name: "Test Spell" }];
    }
  };
  const broken = { ...good, collection: "test.broken", async getIndex() { throw new Error("Permission denied"); } };
  const packs = accessibleItemPacks([good, broken, { ...good, visible: false }, { ...good, documentName: "Actor" }]);
  assert.equal(packs.length, 2);
  const result = await indexOriginPacks(packs);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].uuid, "Compendium.test.origins.Item.class1");
  assert.equal(result.entries[0].rules, "2024");
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].pack, "test.broken");
});


test('Tasha class/subclass entries are fallback candidates, never preferred over another book',()=>{
 const origin={name:'Artificer',type:'class'};
 const tasha={name:'Artificer',type:'class',uuid:'Compendium.dnd-tashas-cauldron.classes.Item.a',rules:'2014'};
 const revised={name:'Artificer',type:'class',uuid:'Compendium.dnd-forge-artificer.classes.Item.a',rules:'2024'};
 const rows=matchOrigins([origin],[tasha,revised]);
 assert.equal(rows[0].selectedUuid,revised.uuid);
 assert.equal(rows[0].candidates.length,2);
 assert.match(matchOrigins([origin],[tasha])[0].selectionReason,/fallback/);
 const subclass={name:'Example Subclass',type:'subclass'};
 const old={...tasha,...subclass};const modern={...revised,...subclass};
 assert.equal(matchOrigins([subclass],[old,modern])[0].selectedUuid,modern.uuid);
 assert.equal(matchOrigins([subclass],[old,modern,{...modern,uuid:'another-modern'}])[0].selectedUuid,null);
});
