import test from 'node:test';
import assert from 'node:assert/strict';
import {characterOrigins,matchOrigins,speciesMatchNames} from '../scripts/compendium-matcher.mjs';
import {matchLoadout} from '../scripts/loadout.mjs';
import {scopeForItem} from '../scripts/advancement-choices.mjs';
function character(base,trait,selection){return {classes:[],race:{fullName:base,baseRaceName:base,isLegacy:false,racialTraits:[{definition:{id:10,name:trait}}]},options:{race:[{componentId:10,definition:{id:20,name:selection}}]},choices:{race:[{componentId:10,optionValue:20}]},modifiers:{race:[{componentId:10,type:'language',friendlySubtypeName:'Elvish'}]}};}
test('selected elven lineage resolves to the separate species rather than generic Elf',()=>{
 const c=character('Elf','Elven Lineage','High Elf Lineage');const row=characterOrigins(c).find(r=>r.key==='species');
 const entries=[{name:'Elf',type:'race',uuid:'generic'},{name:'Elf, High',type:'race',uuid:'high'},{name:'Elf, Wood',type:'race',uuid:'wood'}];
 assert.equal(matchOrigins([row],entries)[0].selectedUuid,'high');
 assert.equal(scopeForItem(c,{type:'race',name:'Elf, High'},0).modifiers.length,1);
 assert.equal(scopeForItem(c,{type:'race',name:'Elf, Wood'},0),null);
 c.choices.race=[];assert.deepEqual(speciesMatchNames(c),[]);
});
test('tiefling lineage maps only a recorded legacy option and preserves ambiguity',()=>{
 const c=character('Tiefling','Fiendish Legacy','Infernal Legacy');const row=characterOrigins(c).find(r=>r.key==='species');
 assert.equal(matchOrigins([row],[{name:'Tiefling, Infernal',type:'race',uuid:'a'},{name:'Tiefling, Infernal',type:'race',uuid:'b'}])[0].selectedUuid,null);
 c.race.isLegacy=true;assert.deepEqual(speciesMatchNames(c),[]);
});
test('Magic Initiate class suffix maps to the base feat and keeps JSON choice scope',()=>{
 const c={classes:[],feats:[{definition:{id:30,name:'Magic Initiate (Wizard)'}}],choices:{feat:[{componentId:30,optionValue:40}]}};
 const row={kind:'feat',name:'Magic Initiate (Wizard)',types:['feat']};
 assert.equal(matchLoadout([row],[{name:'Magic Initiate',type:'feat',uuid:'base'}])[0].selectedUuid,'base');
 assert.equal(scopeForItem(c,{type:'feat',name:'Magic Initiate'},0).choices[0].optionValue,40);
 assert.equal(matchLoadout([{...row,name:'Other Feat (Wizard)'}],[{name:'Other Feat',type:'feat',uuid:'other'}])[0].selectedUuid,null);
});
