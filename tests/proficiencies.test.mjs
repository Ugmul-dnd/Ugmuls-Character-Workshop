import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileProficiencies} from '../scripts/proficiencies.mjs';
import {deferredProficiencySelection} from '../scripts/advancement-choices.mjs';
const pool=options=>({asOptions:()=>options,asSet:()=>new Set(options.map(o=>o.value))});
const api={choices:async type=>pool(({skills:[{value:'skills:prf',label:'Performance'},{value:'skills:sur',label:'Survival'}],tool:[{value:'tool:game:dice',label:'Dice'}]})[type]??[]),changeKeyPath:value=>value.startsWith('skills:')?`system.skills.${value.split(':').pop()}.value`:'system.tools.dice.value'};
function actor(){return {isOwner:true,system:{skills:{prf:{value:0},sur:{value:2}},tools:{}},calls:0,async update(data){this.calls++;for(const[path,value]of Object.entries(data)){const parts=path.split('.');let current=this;for(const p of parts.slice(0,-1))current=current[p]??={};current[parts.at(-1)]=value;}}};}
test('final alignment adds Performance and Dice without downgrading expertise; retry is idempotent',async()=>{
 const a=actor();const c={modifiers:{background:[{type:'proficiency',friendlySubtypeName:'Performance'},{type:'proficiency',friendlySubtypeName:'Dice Set'}],class:[{type:'proficiency',friendlySubtypeName:'Survival'}]}};
 const log=await reconcileProficiencies(a,c,api);
 assert.equal(a.system.skills.prf.value,1);assert.equal(a.system.skills.sur.value,2);assert.equal(a.system.tools.dice.value,1);assert.equal(log.length,2);
 assert.deepEqual(await reconcileProficiencies(a,c,api),[]);assert.equal(a.calls,1);
});
test('unknown proficiencies are logged and permissions are checked before updates',async()=>{
 const a=actor();const c={modifiers:{feat:[{type:'proficiency',friendlySubtypeName:'Fiddle'}]}};
 const log=await reconcileProficiencies(a,c,api);assert.match(log[0].detail,/Needs GM Review/);assert.equal(a.calls,0);
 a.isOwner=false;await assert.rejects(reconcileProficiencies(a,c,api),/own/);
});
test('unresolved tool choices can advance empty; language and resistance choices stay native',async()=>{
 const tool=pool([{value:'tool:music:viol',label:'Viol'}]);
 const advancement={type:'Trait',item:{type:'feat',name:'Harper Agent'},actor:{system:{details:{level:1}}},configuration:{mode:'default'},unfulfilledChoices:async()=>({available:[{type:'choice',choices:tool}],choices:tool})};
 const context={character:{classes:[],feats:[{definition:{id:10,name:'Harper Agent'}}],modifiers:{feat:[{componentId:10,type:'proficiency',friendlySubtypeName:'Fiddle'}]}}};
 assert.deepEqual(await deferredProficiencySelection({advancement,level:0},context),{chosen:[]});
 for(const value of ['languages:elvish','dr:cold']){const p=pool([{value,label:'Other'}]);advancement.unfulfilledChoices=async()=>({available:[{type:'choice',choices:p}],choices:p});assert.equal(await deferredProficiencySelection({advancement,level:0},context),null);}
});
