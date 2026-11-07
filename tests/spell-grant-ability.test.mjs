import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAdvancement} from '../scripts/advancement-choices.mjs';
const character={classes:[],race:{fullName:'Tiefling',baseRaceName:'Tiefling',racialTraits:[{definition:{id:10,name:'Fiendish Legacy'}}]},options:{race:[{componentId:10,definition:{id:20,name:'Infernal Legacy'}}]},choices:{race:[{componentId:10,optionValue:20}]},spells:{race:[{definition:{name:'Thaumaturgy'},componentId:30,spellCastingAbilityId:5},{definition:{name:'Fire Bolt'},componentId:40,spellCastingAbilityId:5}]}};
function advancement(name){return {type:'ItemGrant',title:name,item:{type:'race',name:'Tiefling, Infernal'},configuration:{optional:false,items:[{uuid:name,optional:false}],spell:{ability:new Set(['int','wis','cha'])}}};}
test('tiefling native grants use their exported Wisdom ability and keep authored spell UUIDs',async()=>{
 for(const name of ['Thaumaturgy','Fire Bolt']){
 const a=advancement(name);
 const context={character,user:{},resolve:async()=>({name,type:'spell',testUserPermission:()=>true})};
 assert.deepEqual(await selectAdvancement({advancement:a,level:1},context),{ability:'wis',selected:[name]});
 }
});
test('spell ability grants remain manual if conflicting, optional, unavailable, or disallowed',async()=>{
 const a=advancement('Thaumaturgy');const context={character:structuredClone(character),user:{},resolve:async()=>({name:'Thaumaturgy',type:'spell',testUserPermission:()=>true})};
 context.character.spells.race.push({definition:{name:'Thaumaturgy'},spellCastingAbilityId:6});
 assert.equal(await selectAdvancement({advancement:a,level:1},context),null);
 context.character={...character,spells:{race:[]}};a.configuration.optional=true;
 assert.equal(await selectAdvancement({advancement:a,level:1},context),null);
 a.configuration.optional=false;a.configuration.spell.ability=new Set(['int','cha']);
 assert.equal(await selectAdvancement({advancement:a,level:1},context),null);
});


test('optional Mark spell grants advance only when explicitly present in the export',async()=>{
 const character={classes:[],feats:[{definition:{id:50,name:'Mark of Shadow'}}],spells:{feat:[{definition:{name:'Minor Illusion'},componentId:50,spellCastingAbilityId:5}]}};
 const advancement={type:'ItemGrant',item:{type:'feat',name:'Mark of Shadow'},actor:{system:{details:{level:3}}},configuration:{optional:true,items:[{uuid:'illusion',optional:false}],spell:{ability:new Set(['int','wis','cha'])}}};
 const context={character,user:{},resolve:async()=>({name:'Minor Illusion',type:'spell',testUserPermission:()=>true})};
 assert.deepEqual(await selectAdvancement({advancement,level:0},context),{ability:'wis',selected:['illusion']});
 character.spells.feat=[];
 assert.equal(await selectAdvancement({advancement,level:0},context),null);
});
