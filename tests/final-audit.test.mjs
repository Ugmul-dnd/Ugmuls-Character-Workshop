import test from 'node:test';
import assert from 'node:assert/strict';
import {finalCharacterAudit} from '../scripts/final-audit.mjs';
const api={choices:async type=>({asOptions:()=>({skills:[{value:'skills:prf',label:'Performance'},{value:'skills:ath',label:'Athletics'}],tool:[{value:'tool:game:dice',label:'Dice'}]})[type]??[]}),changeKeyPath:value=>value.startsWith('skills:')?`system.skills.${value.split(':').pop()}.value`:'system.tools.dice.value'};
const setup=()=>({character:{stats:[1,2,3,4,5,6].map(id=>({id,value:10})),modifiers:{}},actor:{system:{abilities:Object.fromEntries(['str','dex','con','int','wis','cha'].map(key=>[key,{value:10}])),skills:{prf:{value:0},ath:{value:0}},tools:{}},update:()=>assert.fail('audit must not mutate')}});
test('final audit reports a clean match without changing the actor',async()=>{
 const {actor,character}=setup();const before=JSON.stringify(actor);
 const log=await finalCharacterAudit(actor,character,api);
 assert.match(log[0].detail,/No differences/);assert.equal(JSON.stringify(actor),before);
});
test('ability audit includes bonuses, deduplicated increases and explicit overrides',async()=>{
 const {actor,character}=setup();const increase={id:'same',componentId:1,type:'bonus',subType:'strength-score',value:2};
 character.modifiers={feat:[increase,increase]};character.bonusStats=[{id:1,value:1}];
 let log=await finalCharacterAudit(actor,character,api);assert.match(log.find(row=>row.name.endsWith('STR')).detail,/expected 13; Foundry 10/);
 character.overrideStats=[{id:1,value:17}];actor.system.abilities.str.value=17;
 log=await finalCharacterAudit(actor,character,api);assert.match(log[0].detail,/No differences/);
});
test('audit reports missing, extra and expertise differences plus unmapped tools',async()=>{
 const {actor,character}=setup();character.modifiers={background:[{type:'proficiency',friendlySubtypeName:'Performance'},{type:'expertise',friendlySubtypeName:'Dice Set'},{type:'proficiency',friendlySubtypeName:'Fiddle'}]};
 actor.system.skills.ath.value=1;actor.system.tools.dice={value:1};
 const log=await finalCharacterAudit(actor,character,api);
 assert.match(log.find(row=>row.name.endsWith('Performance')).detail,/not proficient/);
 assert.match(log.find(row=>row.name.endsWith('Dice')).detail,/JSON expertise; Foundry proficient/);
 assert.match(log.find(row=>row.name.endsWith('Athletics')).detail,/no matching proficiency/);
 assert.match(log.find(row=>row.name.endsWith('Fiddle')).detail,/no unique native mapping/);
});
test('conditional ability increases are flagged for review rather than declared mismatches',async()=>{
 const {actor,character}=setup();character.modifiers={item:[{type:'bonus',subType:'strength-score',value:2,restriction:'while equipped'}]};
 const log=await finalCharacterAudit(actor,character,api);assert.match(log[0].detail,/conditional/);assert.doesNotMatch(log[0].detail,/expected 12/);
});

test('native class weapon and armor category grants map directly without false warnings',async()=>{
 const {actor,character}=setup();
 const mods=['simple-weapons','martial-weapons','light-armor','medium-armor','shields'].map(subType=>({type:'proficiency',subType,friendlySubtypeName:subType.replaceAll('-',' ')}));
 character.modifiers={class:mods};
 actor.system.traits={weaponProf:{value:new Set(['sim','mar'])},armorProf:{value:new Set(['lgt','med','shl'])}};
 const categoryApi={...api,changeKeyPath:value=>value.startsWith('weapon:')?'system.traits.weaponProf.value':value.startsWith('armor:')?'system.traits.armorProf.value':api.changeKeyPath(value)};
 let log=await finalCharacterAudit(actor,character,categoryApi);
 assert.match(log[0].detail,/No differences/);
 actor.system.traits.armorProf.value.delete('shl');
 log=await finalCharacterAudit(actor,character,categoryApi);
 assert.ok(log.some(row=>row.name.endsWith('Shields')&&/not proficient/.test(row.detail)));
});
