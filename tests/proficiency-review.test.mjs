import {test} from 'node:test';
import assert from 'node:assert/strict';
import {proficiencyReview,proficiencyReviewHTML,editProficiencyChoices,focusProficiencyStep,registerProficiencyReview} from '../scripts/proficiency-review.mjs';
const trait=(id,chosen,grants=[],mode='default',extra={})=>({id,type:'Trait',level:1,value:{chosen:new Set(chosen)},configuration:{grants:new Set(grants),mode,...extra}});
const item=(id,type,traits)=>({id,name:id,type,system:{levels:1},advancement:{byType:{Trait:traits}}});
const actor={documentName:'Actor',type:'character',isOwner:true,items:[item('class','class',[trait('class-choice',['skills:arc'])]),item('background','background',[trait('background-grant',[],['skills:arc'])]),item('species','race',[trait('expertise',['skills:arc'],[],'expertise')])]};
test('render resolves native tool metadata through the system and only localizes strings',()=>{
 globalThis.foundry={utils:{escapeHTML:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;')}};
 globalThis.CONFIG={DND5E:{skills:{arc:{label:'Arcana'}},tools:{smith:{ability:'str',id:'Compendium.book.Item.smith'}}}};
 globalThis.game={i18n:{localize(value){assert.equal(typeof value,'string');return value;}}};
 const pc={...actor,items:[...actor.items,item('tools','background',[trait('tools',['tool:art:smith','tool:unknown'])])]};
 globalThis.dnd5e={documents:{Trait:{keyLabel:key=>key==='tool:art:smith'?"Smith’s Tools":key}}};
 assert.match(proficiencyReviewHTML(pc),/Smith’s Tools/);
 delete dnd5e.documents;
 const html=proficiencyReviewHTML(pc);assert.match(html,/tool:art:smith/);assert.match(html,/tool:unknown/);assert.match(html,/Arcana/);
 assert.doesNotMatch(html,/\[object Object\]/);
});
test('overlap includes unapplied fixed grants while keeping expertise separate; inspection is read only',()=>{
 const before=structuredClone(actor),report=proficiencyReview(actor);
 assert.equal(report.rows.length,2);assert.equal(report.rows[0].duplicate,true);assert.equal(report.rows[1].duplicate,false);
 assert.equal(report.rows[0].sources[0].editable,true);assert.equal(report.rows[0].sources[1].editable,false);assert.equal(report.rows[0].sources[1].recorded,false);
 assert.deepEqual(actor,before);
});
test('sheet scan flags unconnected proficiencies and expertise after scanning standalone feats',()=>{
 const feat=item('Skilled','feat',[trait('skilled',['skills:his','tool:art:smith'])]);
 const pc={...actor,items:[...actor.items,feat],system:{skills:{arc:{value:2},his:{value:1},nat:{value:1},prc:{value:0.5},ste:{value:0}},tools:{smith:{value:1},lute:{value:2}}}};
 const before=structuredClone(pc),report=proficiencyReview(pc);
 const row=(key,category='proficiency')=>report.rows.find(row=>row.key===key&&row.category===category);
 assert.equal(row('skills:arc').unconnected,false);assert.equal(row('skills:arc','expertise').unconnected,false);
 assert.equal(row('skills:his').sources[0].name,'Skilled');assert.equal(row('skills:his').unconnected,false);
 assert.equal(row('tool:art:smith').current,true);assert.equal(row('tool:art:smith').unconnected,false);
 assert.equal(row('skills:nat').unconnected,true);assert.equal(row('tool:lute').unconnected,true);assert.equal(row('tool:lute','expertise').unconnected,true);
 assert.equal(row('skills:prc','partial proficiency').unconnected,true);assert.equal(row('skills:ste'),undefined);
 assert.deepEqual(pc,before);
 const html=proficiencyReviewHTML(pc);assert.match(html,/No connected source — review/);assert.match(html,/On sheet/);assert.doesNotMatch(html,/Change undefined/);
});
test('current proficiency connects to a fixed grant even without a saved choice receipt',()=>{
 const report=proficiencyReview({...actor,items:[actor.items[1]],system:{skills:{arc:{value:1}}}});
 assert.equal(report.rows[0].unconnected,false);assert.equal(report.rows[0].sources[0].recorded,false);
 const html=proficiencyReviewHTML({...actor,items:[actor.items[1]],system:{skills:{arc:{value:1}}}});
 assert.match(html,/Source connected/);assert.match(html,/no saved receipt/);assert.doesNotMatch(html,/<strong>No connected source/);
});
test('background Stealth remains connected after changing overlapping class proficiency while retaining expertise',()=>{
 const background=item('House Thuranni Heir','background',[trait('fixed-stealth',[],['skills:ste'])]);
 const cls=item('Rogue','class',[trait('class-skill',['skills:prc'])]);
 const expertise=item('Expertise','feat',[trait('expertise',['skills:ste'],[],'expertise')]);expertise.flags={dnd5e:{advancementOrigin:'Rogue.grant'}};
 const pc={...actor,items:[cls,background,expertise],system:{skills:{ste:{value:2},prc:{value:1}}}};
 const before=structuredClone(pc),report=proficiencyReview(pc),stealth=report.rows.filter(row=>row.key==='skills:ste');
 assert.equal(stealth.length,2);assert.ok(stealth.every(row=>row.current&&!row.unconnected&&!row.duplicate));
 assert.equal(stealth.find(row=>row.category==='proficiency').sources[0].name,'House Thuranni Heir');
 assert.deepEqual(pc,before,'Review must not create receipts or change sheet values');
 const missing=proficiencyReview({...pc,items:[cls,expertise]}).rows.find(row=>row.key==='skills:ste'&&row.category==='proficiency');
 assert.equal(missing.unconnected,true,'Expertise alone does not explain the base proficiency');
 const absent=proficiencyReview({...pc,system:{skills:{ste:{value:0}}}}).rows.find(row=>row.key==='skills:ste'&&row.category==='proficiency');
 assert.equal(absent.current,false,'Fixed source must not imply proficiency is actually on the sheet');
});
test('tools, future levels, upgrade modes and missing receipts remain distinct',()=>{
 const future=trait('future',['tool:music:lute']);future.level=3;
 const report=proficiencyReview({...actor,items:[item('class','class',[future,trait('tool',['tool:art:smith']),trait('upgrade',['skills:arc'],[],'upgrade')]),item('background','background',[])]});
 assert.equal(report.rows.length,2);assert.equal(report.rows[0].key,'tool:art:smith');assert.equal(report.rows[1].category,'upgrade');assert.equal(report.notices.length,1);
});
test('granted features stay attributed through native parent relationships; cycles are ignored',()=>{
 const feature=item('feature','feat',[trait('feature-skill',['skills:arc'])]);feature.flags={dnd5e:{advancementOrigin:'species.grant'}};
 const cycle=item('cycle','feat',[trait('cycle-skill',['skills:arc'])]);cycle.flags={dnd5e:{advancementOrigin:'cycle.grant'}};
 const report=proficiencyReview({...actor,items:[...actor.items,feature,cycle]});
 assert.equal(report.rows[0].sources.length,3);assert.equal(report.rows[0].sources[2].name,'species → feature');
});
test('edits validate ownership and current native receipts before opening the level editor',()=>{
 globalThis.game={settings:{get:()=>false}};let args;
 const manager={steps:[{type:'forward',flow:{item:{id:'class'},advancement:{id:'class-choice'},level:1}}],render(value){assert.equal(value,true);}};
 globalThis.dnd5e={applications:{advancement:{AdvancementManager:{forModifyChoices(...values){args=values;return manager;}}}}};
 assert.throws(()=>editProficiencyChoices({...actor,isOwner:false},'class','class-choice'),/own/);
 assert.throws(()=>editProficiencyChoices(actor,'background','background-grant'),/no longer editable/);
 assert.equal(editProficiencyChoices(actor,'class','class-choice'),manager);assert.deepEqual(args,[actor,'class',1]);
 game.settings.get=()=>true;assert.throws(()=>editProficiencyChoices(actor,'class','class-choice'),/Enable/);
});
test('targeted editing keeps native undo and restores unrelated choices before and after the selected step',()=>{
 const flow=id=>({item:{id:'class'},advancement:{id},level:1,retainedData:{chosen:[id]}});
 const before=flow('saves'),target=flow('skills'),after=flow('tools');
 const manager={steps:[...[after,target,before].map(flow=>({type:'reverse',flow,automatic:true})),
  ...[before,target,after].map(flow=>({type:'forward',flow})),
  {type:'restore',flow:{...flow('later'),level:2},automatic:true},
  {type:'forward',automatic:true,level:2}]};
 focusProficiencyStep(manager,'class','skills',1);
 assert.deepEqual(manager.steps.filter(step=>!step.automatic).map(step=>step.flow.advancement.id),['skills']);
 assert.deepEqual(manager.steps.slice(0,3).map(step=>step.type),['reverse','reverse','reverse']);
 assert.deepEqual(manager.steps.slice(3,6).map(step=>step.type),['restore','forward','restore']);
 assert.deepEqual(before.retainedData,{chosen:['saves']});assert.deepEqual(after.retainedData,{chosen:['tools']});
 assert.equal(manager.steps.at(-1).type,'forward');
 const original=structuredClone(manager);assert.throws(()=>focusProficiencyStep(manager,'wrong','skills',1),/unavailable/);assert.deepEqual(manager,original);
});
test('sheet menu is available only for owned characters and does not duplicate',()=>{
 let callback;globalThis.Hooks={on(name,fn){assert.equal(name,'getHeaderControlsApplicationV2');callback=fn;}};
 registerProficiencyReview();const controls=[];callback({actor},controls);callback({actor},controls);assert.equal(controls.length,1);
 const denied=[];callback({actor:{...actor,isOwner:false}},denied);assert.equal(denied.length,0);
});
