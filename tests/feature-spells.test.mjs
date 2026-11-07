import test from 'node:test';
import assert from 'node:assert/strict';
import {selectAdvancement,prefillSpellSelection} from '../scripts/advancement-choices.mjs';
function setup(name,group,id,spells){
 const character={classes:[{definition:{name:'Wizard',spellCastingAbilityId:4},classFeatures:[{definition:{id,name,requiredLevel:3}}]}],feats:group==='feat'?[{definition:{id,name:'Magic Initiate (Wizard)'}}]:[],spells:{[group]:spells.map((s,i)=>({definition:{id:i+100,name:s.name,level:s.level},componentId:id,spellCastingAbilityId:s.ability??null}))}};
 const entries=spells.map(s=>({name:s.name,level:s.level,type:'spell',uuid:s.name}));
 const advancement={type:'ItemChoice',item:{name,type:'feat'},actor:{items:[],system:{details:{level:3}}},configuration:{type:'spell',allowDrops:true,pool:[],choices:{0:{count:2},3:{count:2}},restriction:{level:'0'},spell:{ability:new Set(['int','wis','cha'])}},getCounts:()=>({current:0,max:2}),_validateItemType:(source)=>source.system.level===Number(advancement.configuration.restriction.level)};
 const context={character,entries,user:{},resolve:async uuid=>({name:uuid,type:'spell',system:{level:entries.find(e=>e.uuid===uuid).level},testUserPermission:()=>true})};
 return {advancement,context};
}
test('Magic Initiate selects recorded cantrips and Intelligence; level one spell remains separate',async()=>{
 const {advancement,context}=setup('Magic Initiate','feat',10,[{name:'Dancing Lights',level:0,ability:4},{name:'Message',level:0,ability:4},{name:'Mage Armor',level:1,ability:4}]);
 assert.deepEqual(await selectAdvancement({advancement,level:0},context),{selected:['Dancing Lights','Message'],ability:'int'});
 advancement.getCounts=()=>({current:0,max:1});advancement.configuration.restriction.level='1';
 assert.deepEqual(await selectAdvancement({advancement,level:0},context),{selected:['Mage Armor'],ability:'int'});
 context.entries.push({...context.entries[2],uuid:'second Mage Armor'});
 assert.equal(await selectAdvancement({advancement,level:0},context),null);
});
test('Savant selects explicit feature spells within native slot and school restrictions',async()=>{
 const {advancement,context}=setup('Enchantment Savant','class',20,[{name:'Hold Person',level:2},{name:'Crown of Madness',level:2}]);
 advancement.configuration.restriction.level='availableNoCantrips';advancement.configuration.spell.ability=new Set();advancement._validateItemType=()=>true;
 const flow={advancement,level:3,_maxSpellSlotLevel:()=>2};
 assert.deepEqual(await selectAdvancement(flow,context),{selected:['Hold Person','Crown of Madness']});
 advancement._validateItemType=()=>false;
 assert.equal(await selectAdvancement(flow,context),null);
});
test('racial ability falls back to prior selection, then unambiguous class ability',async()=>{
 const character={classes:[{definition:{spellCastingAbilityId:4}}],race:{fullName:'High Elf'},spells:{race:[]}};
 const advancement={type:'ItemGrant',item:{name:'High Elf',type:'race',advancement:{byType:{ItemGrant:[]}}},configuration:{items:[{uuid:'cantrip'}],spell:{ability:new Set(['int','wis','cha'])}}};
 const context={character,user:{},resolve:async()=>({type:'spell',name:'Prestidigitation',testUserPermission:()=>true})};
 assert.equal((await selectAdvancement({advancement,level:1},context)).ability,'int');
 advancement.item.advancement.byType.ItemGrant.push({value:{ability:'wis'}});
 assert.equal((await selectAdvancement({advancement,level:1},context)).ability,'wis');
 advancement.item.advancement.byType.ItemGrant.push({value:{ability:'cha'}});
 assert.equal(await selectAdvancement({advancement,level:1},context),null);
});


test('Magic Initiate Druid prefills the eligible cantrip and Wisdom while reporting the missing choice',async()=>{
 const {advancement,context}=setup('Magic Initiate','feat',10,[{name:'Primal Savagery',level:0,ability:5},{name:'Produce Flame',level:0,ability:5},{name:'Speak with Animals',level:1,ability:5}]);
 context.character.feats[0].definition.name='Magic Initiate (Druid)';
 advancement._validateItemType=source=>source.name==='Produce Flame';
 assert.equal(await selectAdvancement({advancement,level:0},context),null);
 const partial=await prefillSpellSelection({advancement,level:0},context);
 assert.deepEqual(partial.data,{selected:['Produce Flame'],ability:'wis'});
 assert.match(partial.missing[0],/Primal Savagery/);
 assert.equal(partial.missing.length,1);
});
