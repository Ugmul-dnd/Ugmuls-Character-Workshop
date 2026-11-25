import fs from 'node:fs';import assert from 'node:assert/strict';
const hooks=new Map();globalThis.Hooks={on(name,callback){hooks.set(name,callback);return callback;},off(name){hooks.delete(name);}};
class App{get state(){return 2;}constructor(){this.rendered=true;}render(){return this;}async close(){this.rendered=false;}}
globalThis.foundry={utils:{deepClone:structuredClone,escapeHTML:value=>value.replaceAll('<','&lt;').replaceAll('>','&gt;')},applications:{api:{ApplicationV2:App}}};
globalThis.game={settings:{get:()=>false},items:{fromCompendium:source=>({type:source.type,name:source.name,system:{levels:5}})},actors:[],users:[],user:{isGM:true}};
globalThis.CONFIG={DND5E:{focusTypes:{arcane:{itemIds:{wand:'Compendium.book.equipment.Item.wand'}}},weaponTypes:{simM:'Simple melee',marM:'Martial melee'},toolTypes:{art:'Artisan',music:'Musical'}},Item:{dataModels:{}}};
let mode='no-steps',created=0,lastData;globalThis.dnd5e={applications:{advancement:{AdvancementManager:{forNewItem(actor,data){lastData=data;const manager={steps:mode==='no-steps'?[]:[{}],rendered:true,render(){if(mode==='complete')hooks.get('dnd5e.advancementManagerComplete')(manager);else this.close();},async close(){this.rendered=false;}};return manager;}}}}};
const api=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('scripts/pc-creator.js','utf8').replace('./pc-spells.js','data:text/javascript;base64,'+Buffer.from(fs.readFileSync('scripts/pc-spells.js','utf8')).toString('base64'))).toString('base64'));
const scores=Object.fromEntries(api.ABILITIES.map((key,i)=>[key,api.ARRAY[i]]));assert.deepEqual(api.validateScores(scores,'array'),scores);assert.throws(()=>api.validateScores({...scores,str:14},'array'),/exactly once/);const point={str:15,dex:15,con:15,int:8,wis:8,cha:8};assert.deepEqual(api.validateScores(point,'point'),point);assert.throws(()=>api.validateScores({...point,int:9},'point'),/27/);assert.throws(()=>api.validateScores({...point,str:16},'point'),/8 to 15/);
assert.equal(api.browserOptions('race').tab,'races');assert.deepEqual([...api.browserOptions('class').filters.locked.types],['class']);assert.equal(api.browserOptions('background').tab,'backgrounds');assert.equal(api.browserOptions('class').packs,undefined,'Sources are delegated to the native browser');
const entries=[{_id:'or',type:'OR',sort:0},{_id:'a',type:'AND',group:'or',sort:1},{_id:'b',type:'AND',group:'or',sort:2},{_id:'sword',type:'linked',key:'sword',group:'a',count:1,sort:0},{_id:'coins',type:'currency',key:'gp',count:4,group:'a',sort:1},{_id:'bow',type:'linked',key:'bow',group:'b',count:1,sort:0}];assert.deepEqual(api.equipmentLeaves(entries,{}).map(e=>e._id),['sword','coins']);assert.deepEqual(api.equipmentLeaves(entries,{or:'b'}).map(e=>e._id),['bow']);assert.throws(()=>api.equipmentLeaves(entries,{or:'invalid'}),/valid equipment/);
assert.deepEqual(api.equipmentFilter({type:'weapon',key:'mar'})[0].v,['marM','marR']);assert.equal(api.equipmentFilter({type:'tool',key:'lute'})[0].k,'system.type.baseItem');assert.deepEqual(api.equipmentFilter({type:'focus',key:'arcane'})[0].v,['wand']);
const actor={uuid:'Actor.pc',name:'<Hero>',isOwner:true,itemTypes:{class:[],background:[],race:[]},getFlag:()=>null,async createEmbeddedDocuments(){created++;}};await api.addNativeOrigin(actor,{type:'class',name:'Fighter'});assert.equal(lastData.system.levels,1);assert.equal(created,1);mode='cancel';assert.equal(await api.addNativeOrigin(actor,{type:'race',name:'Human'}),false);assert.equal(created,1);mode='complete';assert.equal(await api.addNativeOrigin(actor,{type:'background',name:'Soldier'}),true);assert.equal(hooks.size,0,'Completion and cancellation clean up listeners');actor.isOwner=false;await assert.rejects(api.addNativeOrigin(actor,{type:'class'}),/own/);actor.isOwner=true;actor.itemTypes.class=[{id:'already'}];await assert.rejects(api.addNativeOrigin(actor,{type:'class'}),/already/);
let bulk=[];actor.itemTypes.class=[{name:'Fighter',system:{startingEquipment:entries,wealth:'155'}}];actor.itemTypes.background=[{name:'Soldier',system:{startingEquipment:[],wealth:'50'}}];actor.system={currency:{gp:0,sp:0}};actor.performBulkUpdate=async data=>{bulk.push(data);};CONFIG.Item.documentClass={async createWithContents(docs){return [{_id:'gear',name:docs[0].name,system:{quantity:1}},{_id:'contents',name:'Contents',system:{container:'gear',quantity:2}}];}};
const wizard=new api.PlayerCreationWizard(actor);wizard.progress.equipment={class:{mode:'equipment',branches:{or:'a'},picks:{}},background:{mode:'gold',branches:{},picks:{}}};wizard.doc=async uuid=>({name:uuid,type:'weapon'});await wizard.applyEquipment();assert.equal(bulk.length,1);assert.equal(bulk[0].actor['system.currency'].gp,54);assert.equal(bulk[0].create.length,2);assert.equal(bulk[0].create[1].system.container,'gear');assert.equal(wizard.progress.step,6);await wizard.applyEquipment();assert.equal(bulk.length,1,'Completed equipment is never added twice');
const blank=new api.PlayerCreationWizard();const html=await blank._renderHTML();assert.match(html,/Character name/);assert.match(html,/default character token/);assert.equal(blank.progress.step,0);
console.log('PC creator: score budgets, native source-filtered selection/advancement, cancellation, equipment choices, quantities/containers, currency and repeat protection pass.');
const locked=new api.PlayerCreationWizard(actor);locked.progress.step=1;actor.system.abilities=Object.fromEntries(api.ABILITIES.map(key=>[key,{value:12}]));const lockedHTML=await locked._renderHTML();assert.match(lockedHTML,/Base scores are locked/);locked.element={querySelector:()=>null};let writes=0;actor.update=async()=>{writes++;};await locked.next();assert.equal(writes,0,'Returning to scores after advancement does not overwrite bonuses');assert.equal(locked.progress.step,2);
console.log('Back-navigation score lock passes.');

const spellStep=new api.PlayerCreationWizard(actor);spellStep.progress.step=6;const spellHTML=await spellStep._renderHTML();assert.match(spellHTML,/Spells/);assert.match(spellHTML,/no class spellcasting/);await spellStep.next();assert.equal(spellStep.progress.step,7,'Non-casters skip class spell choices');

// Reconcile actual sheet data instead of trusting a saved completion flag.
actor.type='character';actor.items=[];actor.name='Existing PC';actor.itemTypes={class:[],background:[],race:[],spell:[]};actor.system.abilities=Object.fromEntries(api.ABILITIES.map(key=>[key,{value:10}]));actor.getFlag=()=>null;
let reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,1,'Unallocated scores are the first missing step');assert.equal(reviewed.complete,false);
actor.itemTypes.class=[{id:'class',name:'Fighter',system:{}}];reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,3,'Existing class advancement is retained and missing background found');actor.itemTypes.background=[{id:'bg',name:'Soldier',system:{}}];reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,4);actor.itemTypes.race=[{id:'race',name:'Human',system:{}}];reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,5);assert.equal(reviewed.equipment.class.reviewExisting,true,'No receipt requires equipment review instead of automatic grants');
const saved={step:7,complete:true,method:'array',scores,sources:{class:{itemId:'class'},background:{itemId:'bg'},race:{itemId:'race'}},equipment:{class:{applied:true},background:{applied:true}},spells:{}};actor.getFlag=()=>saved;reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,7,'Completed noncaster is opened at review');assert.equal(reviewed.complete,false);actor.itemTypes.race=[];reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,4,'Deleting species reopens the missing step despite previous completion');actor.itemTypes.race=[{id:'race',name:'Human'}];
actor.itemTypes.class[0]={id:'class',identifier:'wizard',name:'Wizard',system:{levels:1,spellcasting:{progression:'full',type:'spell',preparation:{max:4,value:0}}}};actor.system.spells={spell1:{max:2}};actor.getRollData=()=>({scale:{wizard:{'cantrips-known':3}}});reviewed=await api.reviewCharacterProgress(actor);assert.equal(reviewed.step,6,'Missing class cantrips/spellbook reopens spell setup');actor.isOwner=false;await assert.rejects(api.reviewCharacterProgress(actor),/own/);actor.isOwner=true;actor.type='npc';await assert.rejects(api.reviewCharacterProgress(actor),/player character/);actor.type='character';
console.log('Character progress review passes: sheet changes, saved completion, score/origin/spell gaps, safe inventory review and owner permissions.');

// Score allocation: blank initial values, shared array pool and refundable point costs.
const allocation=new api.PlayerCreationWizard();allocation.progress.step=1;
assert.ok(api.ABILITIES.every(key=>allocation.progress.scores[key]===""),'New characters have no preselected scores');
const abilityHTML=await allocation._renderHTML();assert.ok(abilityHTML.indexOf('data-points')<abilityHTML.indexOf('rsa-pc-scores'),'Budget appears above abilities');assert.match(abilityHTML,/data-reset-scores/);
assert.deepEqual(api.scoreOptions(allocation.progress.scores,'array','str'),api.ARRAY);
allocation.progress.scores.str=15;assert.ok(!api.scoreOptions(allocation.progress.scores,'array','dex').includes(15));assert.ok(api.scoreOptions(allocation.progress.scores,'array','str').includes(15),'Keep own selection available');
Object.assign(allocation.progress.scores,{dex:14,con:13,int:12,wis:10});assert.deepEqual(api.scoreOptions(allocation.progress.scores,'array','cha'),[8]);
const affordable={str:15,dex:15,con:"",int:"",wis:"",cha:""};assert.equal(api.pointsRemaining(affordable),9);assert.ok(api.scoreOptions(affordable,'point','con').includes(15),'Two 15s leave nine points');
affordable.con=14;assert.equal(api.pointsRemaining(affordable),2);assert.deepEqual(api.scoreOptions(affordable,'point','int'),[8,9,10]);assert.ok(api.scoreOptions(affordable,'point','str').includes(15),'Editing refunds existing score cost');
affordable.int=10;assert.deepEqual(api.scoreOptions(affordable,'point','wis'),[8]);
assert.throws(()=>api.validateScores({...point,cha:""},'point'),/8 to 15/,'Unassigned scores cannot be submitted');
console.log('Blank ability allocation, unique array pool and affordable point-buy options pass.');
// Starting-equipment Choose buttons seed the native browser's visible filters.
CONFIG.DND5E.toolTypes.game='Gaming Set';
for(const key of ['art','music','game']){const options=api.equipmentBrowserOptions({type:'tool',key});assert.deepEqual(options.filters.initial.additional.type,{[key]:1});assert.deepEqual([...options.filters.initial.types],['tool']);assert.equal(options.filters.locked.additional,undefined,'Subtype filters stay editable; native choice validation enforces eligibility');}
assert.deepEqual(api.equipmentBrowserOptions({type:'weapon',key:'mar'}).filters.initial.additional.type,{marM:1,marR:1});
assert.deepEqual(api.equipmentBrowserOptions({type:'armor',key:'light'}).filters.initial.additional.type,{light:1});assert.deepEqual([...api.equipmentBrowserOptions({type:'armor',key:'light'}).filters.initial.types],['equipment']);
const luteCandidate={uuid:'Compendium.book.Item.lute',system:{type:{value:'music'}}};assert.deepEqual(api.equipmentBrowserOptions({type:'tool',key:'lute'},[luteCandidate]).filters.initial.additional.type,{music:1});
const focusCandidate={uuid:'Compendium.book.Item.wand',system:{type:{value:'trinket'},properties:new Set(['foc'])}};
const focusOptions=api.equipmentBrowserOptions({type:'focus',key:'arcane'},[focusCandidate]);assert.deepEqual(focusOptions.filters.initial.additional,{type:{trinket:1},properties:{foc:1}});assert.deepEqual([...focusOptions.filters.initial.types],['equipment']);
assert.deepEqual(api.equipmentBrowserOptions({type:'focus',key:'arcane'},[{uuid:'Compendium.book.Item.wand'}]).filters.initial.additional,{},'Incomplete imported metadata does not add filters that hide valid choices');
const firstFilters=api.equipmentBrowserOptions({type:'tool',key:'music'});firstFilters.filters.initial.additional.type.music=-1;assert.deepEqual(api.equipmentBrowserOptions({type:'tool',key:'music'}).filters.initial.additional.type,{music:1},'Each picker gets fresh filter state');
let chosen=null,pickerOptions,fetchOptions;const choiceEntry={_id:'musical-choice',type:'tool',key:'music'};
dnd5e.applications.CompendiumBrowser={async fetch(Type,options){fetchOptions=options;return [luteCandidate];},async selectOne(options){pickerOptions=options;return chosen;}};
const choiceWizard={actor:{itemTypes:{class:[{system:{startingEquipment:[choiceEntry]}}]}},progress:{equipment:{class:{picks:{}}}},doc:async uuid=>uuid===luteCandidate.uuid?luteCandidate:null};
await api.PlayerCreationWizard.prototype.pickGear.call(choiceWizard,{kind:'class',gear:choiceEntry._id,slot:0});assert.deepEqual(choiceWizard.progress.equipment.class.picks,{},'Cancel spends/adds nothing and keeps the choice empty');assert.deepEqual(pickerOptions.filters.initial.additional.type,{music:1});assert.deepEqual(fetchOptions.filters,[{k:'system.type.value',o:'in',v:['music']}]);
assert.equal(pickerOptions.prerequisites.validate(luteCandidate).get('equipment').valid,true);assert.equal(pickerOptions.prerequisites.validate({uuid:'wrong'}).get('equipment').valid,false);
chosen='wrong';await assert.rejects(api.PlayerCreationWizard.prototype.pickGear.call(choiceWizard,{kind:'class',gear:choiceEntry._id,slot:0}),/matching starting equipment/);assert.deepEqual(choiceWizard.progress.equipment.class.picks,{});
chosen=luteCandidate.uuid;await api.PlayerCreationWizard.prototype.pickGear.call(choiceWizard,{kind:'class',gear:choiceEntry._id,slot:0});assert.equal(choiceWizard.progress.equipment.class.picks[choiceEntry._id+':0'],luteCandidate.uuid);
console.log('Equipment browser filters: Artisan/Music/Game tools, specific tools, weapon/armor categories, native focus properties, incomplete import metadata, isolated filter state, actual picker integration, cancellation and invalid-choice rejection pass.');
// Native locked result filters hide invalid rows instead of only locking them.
const holyCandidates=['amulet','emblem','reliquary'].map(id=>({uuid:'Compendium.phb.equipment.Item.'+id,system:{type:{value:'trinket'},properties:['foc']}}));
const holyOptions=api.equipmentBrowserOptions({type:'focus',key:'holy'},holyCandidates);assert.deepEqual(holyOptions.filters.initial.additional.properties,{foc:1});assert.deepEqual(holyOptions.filters.locked.arbitrary,[{k:'_id',o:'in',v:holyCandidates.map(item=>item.uuid.split('.').at(-1))}]);
const sameIdDifferentPack={...holyCandidates[0],uuid:'Compendium.other.equipment.Item.amulet'};assert.equal(holyOptions.filters.locked.arbitrary[0].k,'_id','Only stored IDs may become browser index fields');
assert.deepEqual(api.equipmentBrowserOptions({type:'tool',key:'music'},[luteCandidate]).filters.locked.arbitrary[0].v,[luteCandidate.uuid.split('.').at(-1)]);
const deduped=api.equipmentBrowserOptions({type:'focus',key:'holy'},[...holyCandidates,holyCandidates[0]]);assert.equal(deduped.filters.locked.arbitrary[0].v.length,3);
console.log('Equipment result filtering: eligible Holy Focus choices only, Focus property retained, full UUID/source isolation, instruments and deduplicated allowed sets pass.');

// Reproduce v14's indexDocument behavior: requested top-level fields are read
// from _source over the generated { _id, uuid }. UUID is absent from _source.
const artisan={_id:'cartographer',uuid:'Compendium.book.Item.cartographer',name:'Cartographer Tools',type:'tool',system:{type:{value:'art'},source:{book:'Test Book'}}};
const artisanEntry={_id:'artisan-choice',type:'tool',key:'art'};
let previewIndex,previewLoaded=false;
dnd5e.applications.CompendiumBrowser={
 async fetch(){return [artisan];},
 async selectOne(options){
  const indexedFields=options.filters.locked.arbitrary.map(filter=>filter.k);
  const source={_id:artisan._id,name:artisan.name,type:artisan.type,system:artisan.system};
  previewIndex={_id:source._id,uuid:artisan.uuid};
  for(const field of indexedFields)previewIndex[field]=source[field];
  previewLoaded=true;
  assert.equal(previewIndex.uuid,artisan.uuid,'Preview loading must preserve the generated UUID');
  assert.equal(options.prerequisites.validate(previewIndex).get('equipment').valid,true);
  assert.equal(options.prerequisites.validate({...previewIndex,uuid:'Compendium.other.Item.cartographer'}).get('equipment').valid,false,'Same item ID in another pack is not authorized');
  return previewIndex.uuid;
 }
};
const artisanWizard={actor:{itemTypes:{background:[{system:{startingEquipment:[artisanEntry]}}]}},progress:{equipment:{background:{picks:{}}}},doc:async uuid=>uuid===artisan.uuid?artisan:null};
await api.PlayerCreationWizard.prototype.pickGear.call(artisanWizard,{kind:'background',gear:artisanEntry._id,slot:0});
assert.equal(previewLoaded,true);assert.equal(artisanWizard.progress.equipment.background.picks['artisan-choice:0'],artisan.uuid,'Selection remains recorded after loading its preview');
console.log('Artisan tool preview regression passes: cached UUID retained, selection recorded, reused IDs from other packs rejected.');
