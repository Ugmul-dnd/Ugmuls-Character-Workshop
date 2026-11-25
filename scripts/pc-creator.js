import {spellProfile,pickClassSpells,preloadClassSpells,choosePreparedClassSpells,validateSpellSetup,spellCandidates} from "./pc-spells.js";
const ID="ugmuls-character-workshop",FLAG="pcCreation",apps=new Map();
function savedProgress(actor) {
    return actor?.getFlag(ID, FLAG) ?? actor?.flags?.["ugmuls-5-5e-automation"]?.pcCreation;
}
export const ABILITIES=["str","dex","con","int","wis","cha"],ARRAY=[15,14,13,12,10,8];
export const POINT_COST={8:0,9:1,10:2,11:3,12:4,13:5,14:7,15:9};
const emptyScores=()=>Object.fromEntries(ABILITIES.map(key=>[key,""]));
export const pointsRemaining=scores=>27-ABILITIES.reduce((sum,key)=>sum+(POINT_COST[scores[key]]??0),0);
export function scoreOptions(scores,method,key){
    if(method==="array")return ARRAY.filter(value=>!ABILITIES.some(other=>other!==key&&Number(scores[other])===value));
    const budget=pointsRemaining(scores)+(POINT_COST[scores[key]]??0);
    return Object.keys(POINT_COST).map(Number).filter(value=>POINT_COST[value]<=budget);
}
const hasOrigins=actor=>Object.keys(kinds).some(type=>actor?.itemTypes?.[type]?.length);
const steps=["Character","Ability scores","Class","Background","Species","Equipment","Spells","Review"];
const kinds={class:{label:"Class",tab:"classes"},background:{label:"Background",tab:"backgrounds"},race:{label:"Species",tab:"races"}};
const escape=value=>foundry.utils.escapeHTML(String(value??""));
export function validateScores(scores,method){
    const values=ABILITIES.map(key=>Number(scores[key]));
    if(values.some(value=>!Number.isInteger(value)||!(value in POINT_COST)))throw Error("Assign a score from 8 to 15 to every ability.");
    if(method==="array"){if([...values].sort((a,b)=>a-b).join()!==[...ARRAY].sort((a,b)=>a-b).join())throw Error("Use each standard-array score exactly once.");}
    else if(method==="point"){if(values.reduce((sum,value)=>sum+POINT_COST[value],0)!==27)throw Error("Spend exactly 27 points before continuing.");}
    else throw Error("Choose Standard Array or Point Buy.");
    return Object.fromEntries(ABILITIES.map((key,i)=>[key,values[i]]));
}
export function browserOptions(type){return {tab:kinds[type]?.tab??"physical",filters:{locked:{documentClass:"Item",types:new Set([type])},initial:{documentClass:"Item",types:new Set([type])}},selection:{min:1,max:1}};}
export function equipmentLeaves(entries,branches){
    const children=id=>entries.filter(entry=>(entry.group||null)===(id||null)).sort((a,b)=>a.sort-b.sort);
    const walk=entry=>{if(entry.type==="AND")return children(entry._id).flatMap(walk);if(entry.type==="OR"){const options=children(entry._id),chosen=branches[entry._id]??options[0]?._id;if(!options.some(option=>option._id===chosen))throw Error("Choose a valid equipment package.");return walk(options.find(option=>option._id===chosen));}return [entry];};
    return children(null).flatMap(walk);
}
export function equipmentFilter(entry){
    if(entry.type==="focus")return [{k:"_id",o:"in",v:Object.values(CONFIG.DND5E.focusTypes[entry.key]?.itemIds??{}).map(uuid=>uuid.split(".").at(-1))}];
    const values=entry.type==="weapon"&&["sim","mar"].includes(entry.key)?[entry.key+"M",entry.key+"R"]:[entry.key];
    const specific=entry.type==="weapon"&&!(["sim","mar"].includes(entry.key)||entry.key in CONFIG.DND5E.weaponTypes)||entry.type==="tool"&&!(entry.key in CONFIG.DND5E.toolTypes);
    return entry.key?[{k:specific?"system.type.baseItem":"system.type.value",o:"in",v:values}]:[];
}
export function equipmentBrowserOptions(entry,candidates=[]){
    const types=new Set([['focus','armor'].includes(entry.type)?'equipment':entry.type]),additional={};
    const category=equipmentFilter(entry).find(filter=>filter.k==='system.type.value');
    if(category)additional.type=Object.fromEntries(category.v.map(value=>[value,1]));
    else if(candidates.length&&candidates.every(item=>typeof item.system?.type?.value==='string'&&item.system.type.value)){
        // Specific tools and native focus IDs use base-item/ID restrictions,
        // not a browser category. Derive their category from the allowed items.
        additional.type=Object.fromEntries(candidates.map(item=>[item.system.type.value,1]));
    }
    if(entry.type==='focus'&&candidates.length&&candidates.every(item=>Array.from(item.system?.properties??[]).includes('foc')))additional.properties={foc:1};
    const locked={documentClass:'Item',types:new Set(types)};
    // Browser filter keys become compendium index fields. UUID is derived:
    // indexing it overwrites the generated UUID when a preview loads a document
    // (Foundry v14), breaking later previews, source labels, and selection.
    // Narrow by stored ID; prerequisites and the final UUID check below retain
    // source identity if another enabled pack reuses one of those IDs.
    if(candidates.length)locked.arbitrary=[{k:'_id',o:'in',v:[...new Set(candidates.map(item=>item._id??item.id??item.uuid.split('.').at(-1)))]}];
    return {tab:'physical',filters:{locked,initial:{documentClass:'Item',types:new Set(types),additional}},selection:{min:1,max:1}};
}
export async function addNativeOrigin(actor,source){
    if(!actor.isOwner)throw Error("You do not own this character.");
    if(!kinds[source.type])throw Error("Choose a class, background, or species.");
    if((actor.itemTypes?.[source.type]??[]).length)throw Error("This character already has that selection. Adjust it through its character sheet.");
    if(game.settings.get("dnd5e","disableAdvancements"))throw Error("Enable the D&D5e advancement system before continuing.");
    const data=game.items.fromCompendium(source);if(source.type==="class")data.system.levels=1;
    const Manager=dnd5e.applications.advancement.AdvancementManager,manager=Manager.forNewItem(actor,data);
    if(!manager.steps.length){CONFIG.Item.dataModels[source.type]?.onDropCreate?.(null,actor,data);await actor.createEmbeddedDocuments("Item",[data]);return true;}
    return new Promise((resolve,reject)=>{
        let settled=false;const complete=Hooks.on("dnd5e.advancementManagerComplete",current=>{if(current!==manager)return;settled=true;Hooks.off("dnd5e.advancementManagerComplete",complete);resolve(true);});
        const close=manager.close;manager.close=async function(...args){const result=await close.apply(this,args);if(!this.rendered&&!settled){settled=true;Hooks.off("dnd5e.advancementManagerComplete",complete);resolve(false);}return result;};
        try{manager.render(true);}catch(error){Hooks.off("dnd5e.advancementManagerComplete",complete);reject(error);}
    });
}

export async function reviewCharacterProgress(actor){
    if(actor?.type!=="character"||!actor.isOwner)throw Error("Choose a player character you own.");
    const saved=savedProgress(actor),progress=foundry.utils.deepClone(saved??{});
    progress.method??="array";progress.sources??={};progress.equipment??={};progress.spells??={};progress.complete=false;
    const currentScores=Object.fromEntries(ABILITIES.map(key=>[key,Number(actor._source?.system?.abilities?.[key]?.value??actor.system?.abilities?.[key]?.value)]));
    let scoresReady=hasOrigins(actor);
    if(!scoresReady){for(const method of [progress.method,progress.method==="array"?"point":"array"]){try{validateScores(currentScores,method);progress.method=method;scoresReady=true;break;}catch{}}}
    if(!hasOrigins(actor))progress.scores=scoresReady?currentScores:(saved?.scores??emptyScores());else progress.scores??=currentScores;
    const origins=["class","background","race"];
    for(const type of origins){const item=actor.itemTypes?.[type]?.[0];if(item)progress.sources[type]={...progress.sources[type],name:item.name,itemId:item.id,uuid:item._stats?.compendiumSource??progress.sources[type]?.uuid};else delete progress.sources[type];}
    const inventory=Array.from(actor.items??[]).filter(item=>!["class","subclass","background","race","feat","spell"].includes(item.type));
    for(const type of ["class","background"]){
        const item=actor.itemTypes?.[type]?.[0],oldId=saved?.sources?.[type]?.itemId,changed=oldId&&item?.id!==oldId;
        if(!progress.equipment[type]?.applied||changed){progress.equipment[type]??={mode:"equipment",branches:{},picks:{}};if(changed)progress.equipment[type].applied=false;if(inventory.length||!saved)progress.equipment[type].reviewExisting=true;}
    }
    let step=!actor.name?.trim()?0:!scoresReady?1:origins.findIndex(type=>!actor.itemTypes?.[type]?.length);
    if(step===-1){step=["class","background"].every(type=>progress.equipment[type]?.applied)?6:5;}
    else if(scoresReady&&actor.name?.trim())step+=2;
    if(step===6){try{
        validateSpellSetup(actor,{manual:progress.spells.manual===true});const profile=spellProfile(actor);
        if(profile?.policy==="library"&&profile.maxLevel&&!progress.spells.manual){const candidates=await spellCandidates(actor,false),existing=new Set(Array.from(actor.itemTypes?.spell??[]).map(item=>item.system.identifier||item.name?.trim().toLowerCase()));progress.spells.libraryLoaded=candidates.length>0&&candidates.every(item=>existing.has(item.system.identifier||item.name?.trim().toLowerCase()));if(!progress.spells.libraryLoaded)throw Error("The available class spell list has missing spells.");}
        step=7;
    }catch{progress.spells.libraryLoaded=false;}}
    progress.step=step;progress.resumeReview=true;return progress;
}
export async function continuePlayerCreator(actor){
    if(actor?.type!=="character"||!actor.isOwner)throw Error("Choose a player character you own.");
    const existing=apps.get(actor.uuid);if(existing?.busy){existing.render({force:true});return existing;}
    const progress=await reviewCharacterProgress(actor),app=existing??new PlayerCreationWizard(actor);app.progress=progress;apps.set(actor.uuid,app);await app.save();app.render({force:true});return app;
}

export class PlayerCreationWizard extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS={id:"rsa-pc-creator-{id}",window:{title:"Create Player — Guided Setup",resizable:true},position:{width:730,height:700},classes:["rsa-pc-creator"]};
    constructor(actor=null){super();this.actor=actor;this.progress=foundry.utils.deepClone(savedProgress(actor)??{step:0,method:"array",scores:emptyScores(),sources:{},equipment:{}});this.busy=false;this.documents=new Map();}
    async save(){if(this.actor)await this.actor.setFlag(ID,FLAG,this.progress);}
    async doc(uuid){if(!this.documents.has(uuid))this.documents.set(uuid,await fromUuid(uuid));return this.documents.get(uuid);}
    async _renderHTML(){
        const step=this.progress.step;let body="";
        if(step===0){const resumes=Array.from(game.actors??[]).filter(actor=>actor.isOwner&&savedProgress(actor)&&!savedProgress(actor).complete);body='<label>Character name<input name="name" required maxlength="120" value="'+escape(this.actor?.name??"")+'"></label>';
            if(game.user.isGM)body+='<label>Player ownership<select name="owner"><option value="">'+(this.actor?'Keep current ownership':'GM only for now')+'</option>'+Array.from(game.users??[]).filter(user=>!user.isGM).map(user=>'<option value="'+escape(user.id)+'">'+escape(user.name)+'</option>').join("")+'</select></label>';
            body+='<p>Creates a level-one PC with Foundry’s default character token. Token name matches the character; artwork stays manual.</p>';
            if(!this.actor&&resumes.length)body+='<h3>Resume setup</h3>'+resumes.map(actor=>'<button type="button" data-resume="'+escape(actor.id)+'">'+escape(actor.name)+'</button>').join("");
        }else if(step===1&&hasOrigins(this.actor)){
            body="<p>Base scores are locked after applying class, background, or species advancement. Make later adjustments through the character sheet.</p><p>"+ABILITIES.map(key=>key.toUpperCase()+" "+this.actor.system.abilities[key].value).join(" · ")+"</p>";
        }else if(step===1){
            body='<label>Method<select name="method"><option value="array" '+(this.progress.method==="array"?"selected":"")+'>Standard Array</option><option value="point" '+(this.progress.method==="point"?"selected":"")+'>Point Buy (27 points)</option></select></label><p>Base scores only. Background increases are handled later by Foundry.</p><p data-points aria-live="polite"></p><div class="rsa-pc-scores">'+ABILITIES.map(key=>'<label>'+key.toUpperCase()+'<select name="score-'+key+'">'+this.scoreOptionsHTML(key)+'</select></label>').join("")+'</div><button type="button" data-reset-scores>Reset Points</button>';
        }else if(step>=2&&step<=4){const type=["class","background","race"][step-2],existing=this.actor.itemTypes?.[type]?.[0];body='<p>Choose your '+kinds[type].label.toLowerCase()+' from Foundry’s Compendium Browser. It uses the GM’s enabled Compendium Sources.</p><p>Complete the native advancement prompts for features, proficiencies, ability increases, and other choices.</p>'+(existing?'<p><strong>'+escape(existing.name)+'</strong> is on the character. Continue to the next step; changes can be made through the sheet.</p>':'<button type="button" data-pick="'+type+'">Choose '+kinds[type].label+'</button>');
        }else if(step===5){body='<p>Choose class and background equipment separately. Items, container contents, quantities, and included coins come from the selected book entries.</p>';for(const type of ["class","background"])body+=await this.equipmentHTML(type);
        }else if(step===6){body=this.spellsHTML();
        }else{body='<h3>'+escape(this.actor.name)+'</h3><ul>'+["class","background","race"].map(type=>'<li>'+kinds[type].label+': '+escape(this.actor.itemTypes?.[type]?.[0]?.name??"Missing")+'</li>').join("")+'</ul><p>Ability scores: '+ABILITIES.map(key=>key.toUpperCase()+' '+this.actor.system.abilities[key].value).join(" · ")+'</p><p>Starting equipment choices have been applied. Review your inventory, spell selections, and any remaining class choices on the character sheet. Portrait and token art can be added manually.</p>';}
        if(step===7)body+=(await import('./proficiency-review.mjs')).proficiencyReviewHTML(this.actor);
        return '<div class="rsa-pc-layout"><nav aria-label="Creation progress">'+steps.map((name,i)=>'<span class="'+(i===step?'active':'')+'">'+(i+1)+'. '+name+'</span>').join("")+'</nav><section><h2>'+steps[step]+'</h2>'+(this.progress.resumeReview?'<p>Checked your character sheet against saved setup. Continue from the first unfinished step, or use Back to review earlier steps.</p>':'')+body+'<p class="rsa-pc-error" role="alert"></p></section><footer><button type="button" data-close>Save &amp; Close</button>'+(this.actor?'<button type="button" data-sheet>Open Sheet</button>':'')+(step>0?'<button type="button" data-back>Back</button>':'')+'<button type="button" data-next>'+(step===7?'Finish':'Continue')+'</button></footer></div>';
    }

    spellsHTML(){
        const profile=spellProfile(this.actor);if(!profile)return '<p>This class has no class spellcasting at level one. Spells granted by species, backgrounds, or feats stay with their native choices.</p>';
        this.progress.spells??={};const e=escape,cantripsDone=profile.cantripsOwned===profile.cantrips,libraryDone=this.progress.spells.libraryLoaded,bookDone=profile.policy==='book'&&profile.bookTarget!==null&&profile.leveled.length>=profile.bookTarget;
        let html='<p><strong>'+e(profile.cls.name)+'</strong> · Available spell levels: '+(profile.maxLevel?'1–'+profile.maxLevel:'none')+'</p><p>Always-prepared spells and spells from background, species, or feats keep their existing configuration and do not use the class preparation allowance.</p>';
        html+='<h3>1. Class cantrips · '+profile.cantripsOwned+' / '+profile.cantrips+'</h3>'+(profile.cantrips?'<button type="button" data-spells="cantrips" '+(cantripsDone?'disabled':'')+'>Choose remaining cantrips</button>':'<p>No class cantrips to choose.</p>');
        if(profile.maxLevel){
            html+='<h3>2. '+(profile.policy==='book'?'Spellbook · '+profile.leveled.length+' / '+(profile.bookTarget??'review on sheet'):'Class spells')+'</h3>';
            if(profile.policy==='library')html+='<p>Load the full class list at currently castable spell levels, initially unprepared. Later long-rest preparation changes stay on the sheet.</p><button type="button" data-spells="library" '+(!cantripsDone||libraryDone?'disabled':'')+'>'+(libraryDone?'Class list loaded':'Load available class list')+'</button>';
            else html+='<p>'+(profile.policy==='book'?'Choose six starting level-one Wizard spells, then prepare from that spellbook.':'Choose the class’s starting spells; they will be prepared. Current class spells: '+profile.leveled.length+' / '+profile.maxPrepared)+ '</p><button type="button" data-spells="leveled" '+(!cantripsDone||bookDone||profile.policy==='selected'&&profile.leveled.length>=profile.maxPrepared?'disabled':'')+'>Choose remaining class spells</button>';
            html+='<h3>3. Prepared spells · '+profile.preparedCount+' / '+(Number.isFinite(profile.maxPrepared)?profile.maxPrepared:'unavailable')+'</h3>';
            if(profile.policy!=='selected')html+='<button type="button" data-spells="prepare" '+(!cantripsDone||!(libraryDone||bookDone)?'disabled':'')+'>Choose prepared spells</button>';
            html+='<p>Preparing fewer than the maximum is allowed; the displayed cap comes from the class item.</p>';
        }
        return html+'<label><input type="checkbox" data-spells-manual '+(this.progress.spells.manual?'checked':'')+'> Handle class spells manually on the sheet instead.</label>';
    }

    _replaceHTML(html,content){content.innerHTML=html;}
    async equipmentHTML(type){
        const item=this.actor.itemTypes?.[type]?.[0];if(!item)return '<p>Missing '+type+'.</p>';
        this.progress.equipment[type]??={mode:"equipment",branches:{},picks:{}};const choice=this.progress.equipment[type];
        if(choice.reviewExisting&&!choice.applied)return '<fieldset><legend>'+escape(item.name)+'</legend><p>This character has existing equipment or no starting-equipment receipt. Confirm what is already handled to avoid adding items or gold twice.</p><label><input type="checkbox" data-existing-gear="'+type+'" '+(choice.reviewedExisting?'checked':'')+'> Starting equipment / gold for this selection is already handled.</label><button type="button" data-new-gear="'+type+'">Choose starting equipment instead (adds items / gold)</button></fieldset>';
        if(choice.applied)return '<h3>'+escape(item.name)+'</h3><p>Starting equipment / gold already applied.</p>';
        const entries=Array.from(item.system.startingEquipment??[]);await Promise.all([...entries.filter(entry=>entry.type==="linked").map(entry=>entry.key),...Object.values(choice.picks)].map(uuid=>this.doc(uuid)));
        const wealth=Number(item.system.wealth),hasGold=String(item.system.wealth??"").trim()!==""&&Number.isFinite(wealth)&&wealth>=0;
        if(!entries.length&&hasGold)choice.mode="gold";
        let html='<fieldset><legend>'+escape(item.name)+'</legend>';
        if(!entries.length&&!hasGold)return html+'<p>No structured starting equipment or fixed gold alternative is supplied by this entry. Configure it on the sheet, then acknowledge below.</p><label><input type="checkbox" data-manual="'+type+'" '+(choice.manual?'checked':'')+'> I will handle this starting equipment manually.</label></fieldset>';
        html+='<label>Starting option<select data-equipment-mode="'+type+'"><option value="equipment" '+(choice.mode==="equipment"?'selected':'')+' '+(!entries.length?'disabled':'')+'>Equipment package</option>'+(hasGold?'<option value="gold" '+(choice.mode==="gold"?'selected':'')+'>'+wealth+' GP instead</option>':'')+'</select></label>';
        if(!entries.length)choice.mode="gold";
        if(choice.mode==="gold")return html+'<p>Add '+wealth+' GP from this selection.</p></fieldset>';
        const children=id=>entries.filter(entry=>(entry.group||null)===(id||null)).sort((a,b)=>a.sort-b.sort);
        const render=entry=>{
            if(entry.type==="AND")return children(entry._id).map(render).join("");
            if(entry.type==="OR"){const options=children(entry._id);choice.branches[entry._id]??=options[0]?._id;return '<label>Package<select data-branch="'+entry._id+'" data-kind="'+type+'">'+options.map((option,i)=>'<option value="'+option._id+'" '+(choice.branches[entry._id]===option._id?'selected':'')+'>Option '+String.fromCharCode(65+i)+'</option>').join("")+'</select></label>'+render(options.find(option=>option._id===choice.branches[entry._id])??options[0]);}
            if(entry.type==="currency")return '<p>'+Number(entry.count??0)+' '+escape(entry.key?.toUpperCase())+'</p>';
            if(entry.type==="linked")return '<p>'+Number(entry.count??1)+' × '+escape(this.documents.get(entry.key)?.name??'Unavailable book item')+(entry.requiresProficiency?' (included only if proficient)':'')+'</p>';
            return Array.from({length:Number(entry.count??1)},(_,i)=>{const key=entry._id+':'+i,uuid=choice.picks[key];return '<p>'+escape(entry.categoryLabel??entry.type)+' '+(i+1)+': '+escape(this.documents.get(uuid)?.name??(uuid?'Selected item':'Not selected'))+' <button type="button" data-gear="'+entry._id+'" data-slot="'+i+'" data-kind="'+type+'">Choose</button></p>';}).join("");
        };
        return html+children(null).map(render).join("")+'</fieldset>';
    }
    _onRender(context,options){super._onRender(context,options);const root=this.element;
        root.querySelector('[data-close]').addEventListener('click',()=>this.close());root.querySelector('[data-sheet]')?.addEventListener('click',()=>this.actor.sheet.render({force:true}));
        root.querySelector('[data-back]')?.addEventListener('click',()=>this.run(async()=>{this.readScores();this.progress.step=Math.max(0,this.progress.step-1);}));
        root.querySelector('[data-next]').addEventListener('click',()=>this.run(()=>this.next()));
        for(const button of root.querySelectorAll('[data-resume]'))button.addEventListener('click',()=>{openPlayerCreator(game.actors.get(button.dataset.resume));this.close();});
        root.querySelector('[name="method"]')?.addEventListener('change',event=>{this.progress.method=event.target.value;this.progress.scores=emptyScores();this.render({force:true});});
        root.querySelector('[data-reset-scores]')?.addEventListener('click',()=>this.run(async()=>{this.progress.scores=emptyScores();}));
        for(const select of root.querySelectorAll('[name^="score-"]'))select.addEventListener('change',()=>{this.readScores();this.points();});this.points();
        for(const button of root.querySelectorAll('[data-pick]'))button.addEventListener('click',()=>this.run(()=>this.pickOrigin(button.dataset.pick)));
        for(const select of root.querySelectorAll('[data-equipment-mode]'))select.addEventListener('change',()=>{this.progress.equipment[select.dataset.equipmentMode].mode=select.value;this.render({force:true});});
        for(const select of root.querySelectorAll('[data-branch]'))select.addEventListener('change',()=>{this.progress.equipment[select.dataset.kind].branches[select.dataset.branch]=select.value;this.render({force:true});});
        for(const input of root.querySelectorAll('[data-manual]'))input.addEventListener('change',()=>{this.progress.equipment[input.dataset.manual].manual=input.checked;});
        for(const button of root.querySelectorAll('[data-gear]'))button.addEventListener('click',()=>this.run(()=>this.pickGear(button.dataset)));
        for(const input of root.querySelectorAll('[data-existing-gear]'))input.addEventListener('change',()=>{this.progress.equipment[input.dataset.existingGear].reviewedExisting=input.checked;});
        for(const button of root.querySelectorAll('[data-new-gear]'))button.addEventListener('click',()=>this.run(async()=>{this.progress.equipment[button.dataset.newGear].reviewExisting=false;}));
        root.querySelector('[data-spells-manual]')?.addEventListener('change',event=>{this.progress.spells??={};this.progress.spells.manual=event.target.checked;});
        for(const button of root.querySelectorAll('[data-spells]'))button.addEventListener('click',()=>this.run(async()=>{
            const action=button.dataset.spells;
            if(action==='cantrips')await pickClassSpells(this.actor,true);
            if(action==='leveled')await pickClassSpells(this.actor,false);
            if(action==='library'){await preloadClassSpells(this.actor);this.progress.spells??={};this.progress.spells.libraryLoaded=true;}
            if(action==='prepare')await choosePreparedClassSpells(this.actor);
        }));
        if(this.progress.step===7)import('./proficiency-review.mjs').then(api=>api.bindProficiencyReview(root,this.actor,()=>this.render({force:true})));
        if(this.busy)for(const control of root.querySelectorAll('button,input,select'))control.disabled=true;
    }
    readScores(){for(const key of ABILITIES){const select=this.element.querySelector('[name="score-'+key+'"]');if(select)this.progress.scores[key]=select.value===""?"":Number(select.value);}}
    scoreOptionsHTML(key){return '<option value="" '+(this.progress.scores[key]===""||this.progress.scores[key]==null?'selected':'')+'>Choose score</option>'+scoreOptions(this.progress.scores,this.progress.method,key).map(value=>'<option value="'+value+'" '+(Number(this.progress.scores[key])===value?'selected':'')+'>'+value+'</option>').join("");}
    points(){const node=this.element.querySelector('[data-points]');if(!node)return;node.textContent=this.progress.method==='point'?pointsRemaining(this.progress.scores)+' / 27 points remaining (unassigned abilities start at 8).':'Choose each score once: 15, 14, 13, 12, 10, 8.';for(const key of ABILITIES){const select=this.element.querySelector('[name="score-'+key+'"]');if(select)select.innerHTML=this.scoreOptionsHTML(key);}}
    async run(callback){if(this.busy)return;this.busy=true;for(const control of this.element.querySelectorAll('button,input,select'))control.disabled=true;try{await callback();await this.save();}catch(error){console.error('Ugmuls Character Workshop | PC creator:',error);ui.notifications.error(error.message);}finally{this.busy=false;if(!this.progress.complete)await this.render({force:true});}}
    async pickOrigin(type){
        const uuid=await dnd5e.applications.CompendiumBrowser.selectOne(browserOptions(type));if(!uuid)return;const source=await fromUuid(uuid);if(!source||source.type!==type)throw Error('That book entry is unavailable.');
        const completed=await addNativeOrigin(this.actor,source);if(completed){const item=this.actor.itemTypes?.[type]?.[0];this.progress.sources[type]={uuid,name:source.name,itemId:item?.id};}
    }
    async pickGear({kind,gear,slot}){
        const item=this.actor.itemTypes[kind][0],entry=Array.from(item.system.startingEquipment).find(entry=>entry._id===gear);if(!entry)throw Error('Equipment choice is unavailable.');
        const types=new Set([['focus','armor'].includes(entry.type)?'equipment':entry.type]);
        const candidates=await dnd5e.applications.CompendiumBrowser.fetch(CONFIG.Item.documentClass,{types,filters:equipmentFilter(entry)}),allowed=new Set(candidates.map(item=>item.uuid));
        if(!allowed.size)throw Error("No matching equipment in enabled Compendium Sources.");
        const uuid=await dnd5e.applications.CompendiumBrowser.selectOne({...equipmentBrowserOptions(entry,candidates),prerequisites:{enforce:true,fullDocuments:false,validate:item=>new Map([['equipment',{valid:allowed.has(item.uuid),label:'Matches starting equipment choice',quiet:true}]])}});if(!uuid)return;
        const doc=await this.doc(uuid);if(!doc||!allowed.has(uuid))throw Error('Choose a matching starting equipment item.');this.progress.equipment[kind].picks[gear+':'+slot]=uuid;
    }
    async applyEquipment(){
        const persisted=savedProgress(this.actor);
        for(const type of ['class','background'])if(persisted?.equipment?.[type]?.applied)this.progress.equipment[type]=foundry.utils.deepClone(persisted.equipment[type]);
        if(['class','background'].every(type=>this.progress.equipment[type]?.applied)){this.progress.step=6;return;}
        const create=[],currency=foundry.utils.deepClone(this.actor.system.currency),next=foundry.utils.deepClone(this.progress);
        for(const type of ['class','background']){
            const choice=next.equipment[type];if(choice?.applied)continue;const item=this.actor.itemTypes[type][0],entries=Array.from(item.system.startingEquipment??[]);
            if(choice?.reviewExisting){if(!choice.reviewedExisting)throw Error('Confirm existing starting equipment or choose a new package.');choice.applied=true;continue;}
            if(choice?.manual&&!entries.length&&!String(item.system.wealth??'').trim()){choice.applied=true;continue;}
            if(choice?.mode==='gold'){const gold=Number(item.system.wealth);if(!String(item.system.wealth??'').trim()||!Number.isFinite(gold)||gold<0)throw Error('No fixed gold alternative is configured.');currency.gp=Number(currency.gp??0)+gold;}
            else {
                if(!entries.length)throw Error('Acknowledge manual equipment setup or choose gold.');
                for(const entry of equipmentLeaves(entries,choice?.branches??{})){
                    if(entry.type==='currency'){if(!(entry.key in currency))throw Error('Unsupported currency in starting equipment.');currency[entry.key]+=Number(entry.count??0);continue;}
                    const count=Number(entry.count??1);if(!Number.isInteger(count)||count<1||count>1000)throw Error('Invalid starting equipment quantity.');
                    const uuids=entry.type==='linked'?[entry.key]:Array.from({length:count},(_,i)=>choice.picks[entry._id+':'+i]);
                    if(uuids.some(uuid=>!uuid))throw Error('Complete all equipment choices before continuing.');
                    for(const uuid of uuids){const doc=await this.doc(uuid);if(!doc)throw Error('A starting item is unavailable; check book access.');if(entry.requiresProficiency){const owned=new CONFIG.Item.documentClass(doc.toObject(),{parent:this.actor});if(!(owned.system.proficiencyMultiplier>=1))continue;}
                        const copies=entry.type==='linked'&&doc.type==='container'?count:1;for(let copy=0;copy<copies;copy++){const data=await CONFIG.Item.documentClass.createWithContents([doc]);if(!data?.length)throw Error('Could not prepare starting equipment.');if(entry.type==='linked')data[0].system.quantity=doc.type==='container'?1:count;create.push(...data);}}
                }
            }
            choice.applied=true;
        }
        next.step=6;await this.actor.performBulkUpdate({actor:{'system.currency':currency,['flags.'+ID+'.'+FLAG]:next},create});this.progress=next;
    }
    async next(){
        const step=this.progress.step;
        if(step===0){const name=this.element.querySelector('[name="name"]').value.trim();if(!name)throw Error('Enter a character name.');if(!this.actor&&!CONFIG.Actor.documentClass.canUserCreate(game.user))throw Error('You cannot create actors.');const owner=this.element.querySelector('[name="owner"]')?.value;const data={name,type:'character',prototypeToken:{name},flags:{[ID]:{[FLAG]:{...this.progress,step:1}}}};if(owner)data.ownership={[owner]:CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER};if(this.actor){const update={name,'prototypeToken.name':name};if(owner)update['ownership.'+owner]=CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER;await this.actor.update(update);}else this.actor=await CONFIG.Actor.documentClass.create(data,{renderSheet:false});apps.set(this.actor.uuid,this);this.progress.step=1;}
        else if(step===1){if(hasOrigins(this.actor)){this.progress.step=2;return;}this.readScores();const scores=validateScores(this.progress.scores,this.progress.method);await this.actor.update(Object.fromEntries(ABILITIES.map(key=>['system.abilities.'+key+'.value',scores[key]])));this.progress.step=2;}
        else if(step<=4){const type=['class','background','race'][step-2];if(!this.actor.itemTypes?.[type]?.length)throw Error('Choose your '+kinds[type].label.toLowerCase()+' and complete its advancement first.');this.progress.step++;}
        else if(step===5)await this.applyEquipment();
        else if(step===6){validateSpellSetup(this.actor,{manual:this.progress.spells?.manual===true});const profile=spellProfile(this.actor);if(profile?.policy==='library'&&profile.maxLevel&&!this.progress.spells?.libraryLoaded&&!this.progress.spells?.manual)throw Error('Load the available class spell list before continuing.');this.progress.step=7;}
        else{this.progress.complete=true;await this.save();this.actor.sheet.render({force:true});await this.close();}
    }
    async close(options){if(this.busy&&!this.progress.complete)return;this.readScores();await this.save();if(this.actor)apps.delete(this.actor.uuid);return super.close(options);}
}
export function openPlayerCreator(actor=null){if(actor&&!actor.isOwner)throw Error('You do not own this character.');const existing=actor&&apps.get(actor.uuid);if(existing)return existing.render({force:true});const app=new PlayerCreationWizard(actor);if(actor)apps.set(actor.uuid,app);app.render({force:true});return app;}
