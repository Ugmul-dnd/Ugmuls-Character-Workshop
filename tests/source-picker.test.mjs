import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementEntry} from '../scripts/source-picker.mjs';
const pack={visible:true,documentName:'Item',collection:'test.items',metadata:{label:'Test'}};
const source={uuid:'Compendium.test.items.Item.a',name:'Alternative',type:'loot',system:{},testUserPermission:()=>true};
test('browser replacements retain source identity and metadata without changing documents',()=>{
 const before=structuredClone({...source,testUserPermission:undefined});
 assert.equal(replacementEntry({types:['loot']},source,pack,{}).uuid,source.uuid);
 assert.deepEqual({...source,testUserPermission:undefined},before);
});
test('browser replacements reject inaccessible, wrong-type, world and wrong-level sources',()=>{
 assert.throws(()=>replacementEntry({types:['feat']},source,pack,{}),/compatible/);
 assert.throws(()=>replacementEntry({types:['loot']},source,{...pack,visible:false},{}),/accessible/);
 assert.throws(()=>replacementEntry({types:['loot']},{...source,uuid:'Item.world'},pack,{}),/compendium/);
 assert.throws(()=>replacementEntry({types:['spell'],kind:'spell',level:1},{...source,type:'spell',system:{level:2}},pack,{}),/level 1/);
});
