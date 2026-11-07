import test from "node:test";
import assert from "node:assert/strict";
import { characterLoadout, loadoutItemData, usesKnownSpellReadiness } from "../scripts/loadout.mjs";

const learned = { spellPrepareType: null, spellCastingLearningStyle: 1, knowsAllSpells: false, spellRules: { levelPreparedSpellMaxes: [] } };
const wizard = { spellPrepareType: 1, spellCastingLearningStyle: 2, knowsAllSpells: false, spellContainerName: "Spellbook", spellRules: { levelPreparedSpellMaxes: [0,4,5,6] } };
const cleric = { spellPrepareType: 1, spellCastingLearningStyle: 1, knowsAllSpells: true, spellRules: { levelPreparedSpellMaxes: [0,4,5,6] } };
const spell = (id, prepared = false, extra = {}) => ({ definition: { id, name: `Test ${id}`, level: 1 }, countsAsKnownSpell: true, prepared, alwaysPrepared: false, ...extra });
const input = (definition, spells) => ({ classes: [{ id: 1, definition: { ...definition, name: "Test class" } }], classSpells: [{ characterClassId: 1, spells }] });
const prepared = row => loadoutItemData(row, { type: "spell", system: {} }, { system: { identifier: "test", spellcasting: { type: "spell" } } }, { classes: [{ definition: {} }] }).system.prepared;

test("learned-spell metadata makes selected warlock/sorcerer-style spells ready without always-prepared status", () => {
  const rows = characterLoadout(input(learned, [spell(1), spell(2, false, { alwaysPrepared: true }), spell(3, false, { countsAsKnownSpell: false })]));
  assert.equal(prepared(rows[0]), 1);
  assert.equal(rows[0].alwaysPrepared, false);
  assert.match(rows[0].notes, /ready to cast/);
  assert.equal(prepared(rows[1]), 2);
  assert.equal(prepared(rows[2]), 0);
});

test("wizard spellbook and cleric preparation preserve explicit flags despite countsAsKnownSpell", () => {
  for (const definition of [wizard, cleric]) {
    const rows = characterLoadout(input(definition, [spell(1, true), spell(2), spell(3, false, { definition: { id: 3, name: "Cantrip", level: 0 } })]));
    assert.deepEqual(rows.map(prepared), [1, 0, 2]);
    assert.equal(rows[1].countsAsKnownSpell, true);
  }
});

test("multiclass preparation stays scoped and incomplete metadata never enables blanket preparation", () => {
  const character = input(wizard, [spell(1)]);
  character.classes.push({ id: 2, definition: { ...learned, name: "Second class" } });
  character.classSpells.push({ characterClassId: 2, spells: [spell(1)] });
  assert.deepEqual(characterLoadout(character).map(prepared), [0,1]);
  for (const definition of [{}, { ...learned, spellPrepareType: 1 }, { ...learned, spellRules: {} }, { ...learned, spellCastingLearningStyle: 2 }]) {
    assert.equal(usesKnownSpellReadiness(definition), false);
    assert.equal(prepared(characterLoadout(input(definition, [spell(1)]))[0]), 0);
  }
});

test("feature spell grants are not reinterpreted using learned-class readiness", () => {
  const character = input(learned, []);
  character.spells = { class: [spell(1, false, { componentId: 9 })] };
  character.classes[0].definition.classFeatures = [{ id: 9 }];
  const row = characterLoadout(character)[0];
  assert.equal(row.origin, "grant-class");
  assert.equal(row.prepared, false);
});
