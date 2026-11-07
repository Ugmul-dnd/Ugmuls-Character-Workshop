import test from 'node:test';
import assert from 'node:assert/strict';
import {characterPortrait} from '../scripts/portrait.mjs';
import {baseActorData} from '../scripts/actor-builder.mjs';
test('portrait uses the original public DDB image without thumbnail cropping',()=>{
 const character={name:'Synthetic',id:123,stats:[1,2,3,4,5,6].map(id=>({id,value:10})),decorations:{avatarUrl:'https://www.dndbeyond.com/avatars/1/2/example.jpeg?width=150&height=150&fit=crop'}};
 assert.equal(characterPortrait(character),'https://www.dndbeyond.com/avatars/1/2/example.jpeg');
 const data=baseActorData(character,'owner');assert.equal(data.img,characterPortrait(character));assert.equal(data.prototypeToken,undefined);
});
test('absent, malformed, or untrusted portraits leave the default image alone',()=>{
 for(const value of [null,'invalid','https://evil.example/avatars/test.png','javascript:alert(1)','https://user@www.dndbeyond.com/avatars/1.png','https://www.dndbeyond.com/profile'])assert.equal(characterPortrait({decorations:{avatarUrl:value}}),null);
 assert.equal(characterPortrait({}),null);
});

test('portrait is uploaded to the world token-images folder before updating actor image',async()=>{
 const {saveCharacterPortrait}=await import('../scripts/portrait.mjs');let update,upload;
 const actor={id:'actor123',isOwner:true,update:async data=>{update=data;}};
 const character={id:123,decorations:{avatarUrl:'https://www.dndbeyond.com/avatars/1/2/test.jpeg'}};
 const picker={browse:async()=>({dirs:[]}),createDirectory:async(source,path)=>assert.equal(path,'worlds/test-world/token-images'),upload:async(source,path,file)=>{upload={source,path,name:file.name};return {path:`${path}/${file.name}`};}};
 const deps={picker,user:{can:()=>true},worldId:'test-world',fetchImpl:async()=>new Response(new Uint8Array([255,216,255,0]),{headers:{'Content-Type':'image/jpeg'}})};
 await saveCharacterPortrait(actor,character,deps);
 assert.equal(upload.source,'data');assert.equal(upload.path,'worlds/test-world/token-images');assert.equal(update.img,'worlds/test-world/token-images/actor123-portrait.jpg');
 update=null;await assert.rejects(saveCharacterPortrait(actor,character,{...deps,user:{can:()=>false}}),/permission/);assert.equal(update,null);
});
