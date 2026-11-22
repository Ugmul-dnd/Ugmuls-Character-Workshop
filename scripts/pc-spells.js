const ID="ugmuls-character-workshop";
const identifier=item=>item?.identifier??item?.system?.identifier;
const keyOf=item=>item?.system?.identifier||item?.name?.trim().toLowerCase();
const always=()=>CONFIG.DND5E.spellPreparationStates.always.value;
const prepared=()=>CONFIG.DND5E.spellPreparationStates.prepared.value;
export function classSpells(actor,cls){return Array.from(actor.itemTypes?.spell??[]).filter(item=>item.system.sourceItem==="class:"+identifier(cls)||(item.getFlag?.(ID,"creatorSpellClass") ?? item.flags?.["ugmuls-5-5e-automation"]?.creatorSpellClass)===identifier(cls));}
export function spellProfile(actor,selectedClass=null){
    const cls=selectedClass??actor.itemTypes?.class?.[0];if(!cls||!cls.system.spellcasting||cls.system.spellcasting.progression==="none")return null;
    const id=identifier(cls),casting=cls.system.spellcasting,scale=actor.getRollData?.()?.scale?.[id]??{};
    const collection=cls.system.advancement,advancements=collection?.values?Array.from(collection.values()):Object.values(collection??{});
    const advancement=advancements.find(entry=>entry.type==="ScaleValue"&&/cantrips[- ]known/i.test(entry.configuration?.identifier||entry.identifier||entry.title||""));
    const level=Number(cls.system.levels??1),levels=Object.keys(advancement?.configuration?.scale??{}).map(Number).filter(value=>value<=level).sort((a,b)=>b-a);
    const base=Number(advancement?.configuration?.scale?.[levels[0]]?.value??NaN);
    let cantrips=Number(scale["cantrips-known"]?.value??scale["cantrips-known"]??base);
    const path="system.scale."+id+".cantrips-known";
    const changes=Array.from(actor.appliedEffects??actor.effects??[]).filter(effect=>!effect.disabled&&effect.active!==false&&!effect.duration?.expired&&!effect.system?.expired).flatMap(effect=>Array.from(effect.system?.changes??effect.changes??[])).filter(change=>change.key===path||change.key===path+".value");
    // Some PHB effects add to the scale object instead of its numeric value.
    // Rebuild that count numerically; 2 + 1 must be 3, not the string "21".
    if(Number.isFinite(base)&&changes.some(change=>change.key===path&&change.type==="add")){
        cantrips=base;
        for(const change of changes.sort((a,b)=>(a.priority??20)-(b.priority??20))){const value=Number(change.value);if(!Number.isFinite(value))throw Error("A cantrip-count modifier needs manual review.");switch(change.type){case "add":cantrips+=value;break;case "multiply":cantrips*=value;break;case "override":cantrips=value;break;case "upgrade":cantrips=Math.max(cantrips,value);break;case "downgrade":cantrips=Math.min(cantrips,value);break;default:throw Error("A cantrip-count modifier needs manual review.");}}
    }
    if(!Number.isFinite(cantrips))cantrips=0;
    const method=casting.type??(casting.progression==="pact"?"pact":"spell"),slots=actor.system.spells??{};
    const maxLevel=method==="pact"?Number(slots.pact?.max)>0?Number(slots.pact.level):0:Math.max(0,...Object.entries(slots).filter(([key,slot])=>/^spell[1-9]$/.test(key)&&Number(slot.max)>0).map(([key])=>Number(key.slice(5))));
    const maxPrepared=Number(casting.preparation?.max),policy=id==="wizard"?"book":["cleric","druid","paladin","ranger","artificer"].includes(id)?"library":"selected";
    const spells=classSpells(actor,cls),cantripsOwned=spells.filter(item=>item.system.level===0).length,leveled=spells.filter(item=>item.system.level>0&&item.system.prepared!==always());
    const preparedCount=Number.isFinite(casting.preparation?.value)?casting.preparation.value:leveled.filter(item=>item.system.prepared===prepared()).length;
    return {cls,id,method,cantrips,cantripsOwned,maxLevel,maxPrepared,preparedCount,policy,spells,leveled,bookTarget:id==="wizard"&&Number(cls.system.levels)===1?6:null};
}
export async function spellCandidates(actor,cantrips=false,{cls=null,maxLevel=null}={}){
    const profile=spellProfile(actor,cls);if(!profile)return [];
    const list=dnd5e.registry.spellLists.forType("class",profile.id);if(!list?.identifiers?.size)throw Error("The class spell list is unavailable. Check the enabled books and spell lists.");
    const filters=[{k:"system.identifier",o:"in",v:list.identifiers},{k:"system.level",o:"in",v:cantrips?[0]:Array.from({length:maxLevel===null?profile.maxLevel:Math.min(profile.maxLevel,maxLevel)},(_,i)=>i+1)}];
    const entries=await dnd5e.applications.CompendiumBrowser.fetch(CONFIG.Item.documentClass,{types:new Set(["spell"]),filters,indexFields:new Set(["system.level","system.identifier","system.source"])});
    const rules=profile.cls.system.source?.rules??"2024",sourcePack=profile.cls._stats?.compendiumSource?.split(".")[1];
    const unique=new Map();entries.filter(entry=>!entry.system?.source?.rules||entry.system.source.rules===rules).sort((a,b)=>Number(b.uuid?.split(".")[1]===sourcePack)-Number(a.uuid?.split(".")[1]===sourcePack)).forEach(entry=>{const key=keyOf(entry);if(!unique.has(key))unique.set(key,entry);});return [...unique.values()];
}
export function spellPickerOptions(profile,allowed,count,cantrips){return {tab:"spells",hint:"Choose "+count+" "+(cantrips?"class cantrip(s)":"class spell(s)"),filters:{locked:{documentClass:"Item",types:new Set(["spell"]),additional:{spelllist:{["class:"+profile.id]:1},level:{min:cantrips?0:1,max:cantrips?0:profile.maxLevel}}},initial:{documentClass:"Item",types:new Set(["spell"])}},selection:{min:count,max:count},prerequisites:{enforce:true,fullDocuments:false,validate:item=>new Map([["classSpell",{valid:allowed.has(item.uuid),label:"Available class spell of the required level",quiet:true}]])}};}
export async function importClassSpells(actor,uuids,{cantrips=false,prepare=false,cls=null,maxLevel=null}={}){
    if(!actor.isOwner)throw Error("You do not own this character.");
    const profile=spellProfile(actor,cls);if(!profile)throw Error("No spellcasting class is available.");
    const candidates=await spellCandidates(actor,cantrips,{cls,maxLevel}),allowed=new Set(candidates.map(item=>item.uuid)),existing=new Set(Array.from(actor.itemTypes?.spell??[]).map(keyOf)),create=[];
    for(const uuid of new Set(uuids)){
        if(!allowed.has(uuid))throw Error("The selection includes a spell outside the enabled class list or available spell levels.");
        const source=await fromUuid(uuid);if(!source||source.type!=="spell")throw Error("A selected spell is unavailable.");
        if(existing.has(keyOf(source)))continue;existing.add(keyOf(source));const data=game.items.fromCompendium(source);delete data._id;
        data.system.sourceItem="class:"+profile.id;data.system.method=profile.method;data.system.prepared=cantrips||prepare?prepared():CONFIG.DND5E.spellPreparationStates.unprepared.value;
        data.flags??={};data.flags[ID]={...data.flags[ID],creatorSpellClass:profile.id};create.push(data);
    }
    if(cantrips&&create.length>Math.max(0,profile.cantrips-profile.cantripsOwned))throw Error("Too many class cantrips were selected.");
    if(!cantrips&&profile.policy==="book"&&profile.bookTarget!==null&&create.length>Math.max(0,profile.bookTarget-profile.leveled.length))throw Error("Too many starting spellbook spells were selected.");
    if(!cantrips&&profile.policy==="selected"&&create.length>Math.max(0,profile.maxPrepared-profile.leveled.length))throw Error("Too many starting class spells were selected.");
    if(prepare&&!cantrips&&create.length>Math.max(0,profile.maxPrepared-profile.preparedCount))throw Error("This would exceed the class prepared-spell limit.");
    if(create.length)await actor.createEmbeddedDocuments("Item",create);return create.length;
}
export async function pickClassSpells(actor,cantrips){
    const profile=spellProfile(actor);if(!profile)return;
    const existing=new Set(Array.from(actor.itemTypes?.spell??[]).map(keyOf)),candidates=(await spellCandidates(actor,cantrips)).filter(item=>!existing.has(keyOf(item)));
    const target=cantrips?profile.cantrips:profile.policy==="book"?profile.bookTarget:profile.maxPrepared,owned=cantrips?profile.cantripsOwned:profile.leveled.length,count=Math.max(0,target-owned);
    if(!Number.isFinite(target))throw Error("The native class count is unavailable. Review this class’s spellcasting on the sheet.");if(!count)return;
    if(candidates.length<count)throw Error("Not enough matching spells are available in enabled Compendium Sources.");
    const result=await dnd5e.applications.CompendiumBrowser.select(spellPickerOptions(profile,new Set(candidates.map(item=>item.uuid)),count,cantrips));if(!result)return;
    if(result.size!==count)throw Error("Select exactly "+count+" spells.");
    await importClassSpells(actor,[...result],{cantrips,prepare:!cantrips&&profile.policy==="selected"});
}
export async function preloadClassSpells(actor,{cls=null,maxLevel=null}={}){
    const profile=spellProfile(actor,cls);if(!profile||profile.policy!=="library")throw Error("This class does not use a full prepared-spell library.");
    const candidates=await spellCandidates(actor,false,{cls,maxLevel});if(profile.maxLevel&&!candidates.length)throw Error("No class spells are available in enabled Compendium Sources.");return importClassSpells(actor,candidates.map(item=>item.uuid),{cls,maxLevel});
}
export async function setPreparedClassSpells(actor,ids){
    const profile=spellProfile(actor),eligible=profile?.leveled.filter(item=>item.system.level<=profile.maxLevel)??[],allowed=new Set(eligible.map(item=>item.id));
    if(!actor.isOwner||!profile)throw Error("Character spellcasting is unavailable.");
    if(!Number.isFinite(profile.maxPrepared)||ids.length>profile.maxPrepared||ids.some(id=>!allowed.has(id)))throw Error("Choose spells from the class list within its preparation limit.");
    const selected=new Set(ids);if(selected.size!==ids.length)throw Error("Choose each prepared spell once.");const updates=eligible.map(item=>({_id:item.id,"system.prepared":selected.has(item.id)?prepared():CONFIG.DND5E.spellPreparationStates.unprepared.value}));
    if(updates.length)await actor.updateEmbeddedDocuments("Item",updates);
}
export async function choosePreparedClassSpells(actor){
    const profile=spellProfile(actor);if(!profile||!Number.isFinite(profile.maxPrepared))throw Error("The class prepared-spell limit is unavailable.");
    const eligible=profile.leveled.filter(item=>item.system.level<=profile.maxLevel).sort((a,b)=>a.name.localeCompare(b.name)),e=foundry.utils.escapeHTML;
    const content='<p>Select up to '+profile.maxPrepared+' prepared '+e(profile.cls.name)+' spells. Always-prepared spells are separate.</p><p data-count></p><div class="rsa-pc-prepared">'+eligible.map(item=>'<label><input type="checkbox" value="'+e(item.id)+'" '+(item.system.prepared===prepared()?'checked':'')+'> '+e(item.name)+' (level '+item.system.level+')</label>').join('')+'</div>';
    const result=await foundry.applications.api.DialogV2.wait({window:{title:"Prepare Class Spells",resizable:true},position:{width:580,height:600},content,rejectClose:false,buttons:[{action:"confirm",label:"Confirm",default:true,callback:(event,button,dialog)=>Array.from(dialog.element.querySelectorAll('input:checked'),input=>input.value)},{action:"cancel",label:"Cancel",callback:()=>null}],render:(event,dialog)=>{const inputs=Array.from(dialog.element.querySelectorAll('input[type="checkbox"]'));const update=()=>{const count=inputs.filter(input=>input.checked).length;dialog.element.querySelector('[data-count]').textContent=count+' / '+profile.maxPrepared+' prepared';for(const input of inputs)input.disabled=!input.checked&&count>=profile.maxPrepared;dialog.element.querySelector('[data-action="confirm"]').disabled=count>profile.maxPrepared;};inputs.forEach(input=>input.addEventListener('change',update));update();}});
    if(Array.isArray(result))await setPreparedClassSpells(actor,result);
}
export function validateSpellSetup(actor,{manual=false}={}){
    const profile=spellProfile(actor);if(!profile||manual)return;
    if(profile.cantripsOwned!==profile.cantrips)throw Error("Choose the class’s remaining cantrips before continuing.");
    if(!Number.isFinite(profile.maxPrepared))throw Error("The native preparation limit is unavailable; review on the sheet and acknowledge manual setup.");
    if(profile.policy==="book"&&profile.bookTarget!==null&&profile.leveled.length<profile.bookTarget)throw Error("Choose the remaining starting spellbook spells.");
    if(profile.policy==="selected"&&profile.leveled.length<profile.maxPrepared)throw Error("Choose the remaining starting class spells.");
    if(profile.preparedCount>profile.maxPrepared)throw Error("The prepared-spell limit has been exceeded.");
}
