import {spellProfile,preloadClassSpells} from "./pc-spells.js";
const MODULE_ID="ugmuls-character-workshop";
const createSelector='.item-create,.tidy-table-header-row .tidy-table-button:has(.fa-plus),[data-action="addDocument"],[data-action="create"],[data-action="createItem"],[data-action="addItem"],[data-action="createDocument"][data-document-class="Item"]';

export function sheetBrowserOptions(actor,tab,spellLists=globalThis.dnd5e?.registry?.spellLists) {
    const spells=["spells","spellbook"].includes(tab);
    const initial={documentClass:"Item",types:new Set([spells?"spell":"physical"])};
    if(spells) {
        const classes=new Set(Object.keys(actor.classes??{}));
        for(const item of actor.itemTypes?.class??[]) {
            const id=item.identifier??item.system?.identifier;if(id)classes.add(id);
        }
        const available=new Set((spellLists?.options??[]).map(option=>option.value));
        const lists=Object.fromEntries([...classes].map(id=>`class:${id}`).filter(id=>available.has(id)).map(id=>[id,1]));
        if(Object.keys(lists).length)initial.additional={spelllist:lists};
    }
    return {tab:spells?"spells":"physical",filters:{initial}};
}

const selecting=new Map(),adding=new Map();
const spellKey=item=>item?.system?.identifier||item?.name?.trim().toLowerCase();
export function sheetSpellSelectionOptions(actor){
 const options=sheetBrowserOptions(actor,"spells");
 return {...options,window:{title:"Add spells — "+actor.name},hint:"Select spells to add to "+actor.name+". Choose several, then confirm. Existing spells are skipped; new spells start unprepared.",selection:{min:1,max:null},filters:{...options.filters,locked:{documentClass:"Item",types:new Set(["spell"])}}};
}
export async function addSelectedSheetSpells(actor,uuids,{event=null}={}){
 if(actor?.type!=="character"||!actor.isOwner)throw Error("Choose a character you own.");
 // Serialize imports per actor so concurrent confirmation cannot create duplicates.
 const previous=adding.get(actor.uuid)??Promise.resolve(),task=previous.catch(()=>{}).then(async()=>{
  if(!actor.isOwner)throw Error("You no longer own this character.");
  const sources=await Promise.all([...new Set(uuids)].map(uuid=>fromUuid(uuid)));
  if(sources.some(item=>!item||item.type!=="spell"))throw Error("A selected spell is unavailable. No spells were added.");
  const existing=new Set(Array.from(actor.itemTypes?.spell??[]).map(spellKey)),data=[];
  for(const source of sources){const key=spellKey(source);if(existing.has(key))continue;existing.add(key);const row=game.items.fromCompendium(source);delete row._id;row.system??={};delete row.system.prepared;
   CONFIG.Item.dataModels?.spell?.onDropCreate?.(event??{target:{closest:()=>null}},actor,row);
   const matches=Array.from(actor.itemTypes?.class??[]).filter(cls=>globalThis.dnd5e?.registry?.spellLists?.forType?.("class",cls.identifier??cls.system?.identifier)?.identifiers?.has(source.system.identifier));
   if(matches.length===1){const cls=matches[0],id=cls.identifier??cls.system.identifier;row.system.sourceItem="class:"+id;const casting=cls.spellcasting??cls.system.spellcasting;if(casting)row.system.method=casting.type??(casting.progression==="pact"?"pact":"spell");}
   row.system.prepared=Number(row.system.level)===0?CONFIG.DND5E.spellPreparationStates.prepared.value:CONFIG.DND5E.spellPreparationStates.unprepared.value;data.push(row);
  }
  if(!actor.isOwner)throw Error("You no longer own this character.");
  if(data.length)await actor.createEmbeddedDocuments("Item",data);return data.length;
 });adding.set(actor.uuid,task);try{return await task;}finally{if(adding.get(actor.uuid)===task)adding.delete(actor.uuid);}
}
export function requestSheetSpellSelection(actor,Browser){
 return new Promise((resolve,reject)=>{
  const browser=new Browser(sheetSpellSelectionOptions(actor));let selected=null;
  const hook=Hooks.on("dnd5e.compendiumBrowserSelection",(app,uuids)=>{if(app===browser)selected=new Set(uuids);});
  browser.addEventListener("close",()=>{Hooks.off("dnd5e.compendiumBrowserSelection",hook);resolve(selected);},{once:true});
  try{browser.render({force:true});}catch(error){Hooks.off("dnd5e.compendiumBrowserSelection",hook);reject(error);}
 });
}
export async function selectSheetSpells(actor,Browser,{event=null}={}){
 if(actor?.type!=="character"||!actor.isOwner)throw Error("Choose a character you own.");
 if(selecting.has(actor.uuid))return selecting.get(actor.uuid);
 const task=(async()=>{const result=await requestSheetSpellSelection(actor,Browser);if(!result?.size)return 0;const count=await addSelectedSheetSpells(actor,result,{event});ui.notifications.info(count?"Added "+count+" spell"+(count===1?"":"s")+" to "+actor.name+".":"The selected spells are already on this character.");return count;})();selecting.set(actor.uuid,task);try{return await task;}finally{if(selecting.get(actor.uuid)===task)selecting.delete(actor.uuid);}
}

const loading=new Map();
export function preparationClasses(actor){return Array.from(actor.itemTypes?.class??[]).filter(cls=>(cls.identifier??cls.system?.identifier)!=="paladin"&&spellProfile(actor,cls)?.policy==="library");}
export function configuredClassSpellLevel(actor,cls){
    const casting=cls.spellcasting??cls.system.spellcasting,method=casting?.type??(casting?.progression==="pact"?"pact":"spell"),model=CONFIG.DND5E.spellcasting[method];
    const slots=actor.system.spells??{},configured=Object.entries(slots).filter(([key,slot])=>/^spell[1-9]$/.test(key)&&Number(slot.max)>0).map(([key])=>Number(key.slice(5)));
    if(!configured.length||!model?.calculateSlots)return 0;
    const progression={[method]:0};
    if(typeof actor.constructor.computeClassProgression==="function")actor.constructor.computeClassProgression(progression,cls,{actor,spellcasting:casting,count:1});
    else model.computeProgression(progression,actor,cls,{...casting,levels:casting.levels??cls.system.levels},1);
    const available=model.calculateSlots(progression[method]);return Math.max(0,...configured.filter(level=>Number(available[level])>0));
}
export async function loadUnpreparedSheetSpells(actor,classId){
    if(actor?.type!=="character"||!actor.isOwner)throw Error("Choose a character you own.");
    const cls=preparationClasses(actor).find(item=>item.id===classId);if(!cls)throw Error("Choose a class with access to its full preparation list.");
    const maxLevel=configuredClassSpellLevel(actor,cls);if(!maxLevel)throw Error("Set up this class’s spell slots before loading spells.");
    if(loading.has(actor.uuid))return loading.get(actor.uuid);
    const task=preloadClassSpells(actor,{cls,maxLevel});loading.set(actor.uuid,task);
    try{return await task;}finally{if(loading.get(actor.uuid)===task)loading.delete(actor.uuid);}
}
export async function chooseSheetSpellAction(actor,Browser,context={}){
    const classes=preparationClasses(actor),e=foundry.utils.escapeHTML,available=classes.map(cls=>({cls,level:configuredClassSpellLevel(actor,cls)}));
    const first=available.find(entry=>entry.level>0);
    const content='<p>Select one or more spells in the compendium, or load missing spells from your class list at currently configured spell-slot levels. Loaded spells start unprepared; existing spells are unchanged.</p><label>Class<select name="class">'+available.map(({cls,level})=>'<option value="'+e(cls.id)+'" '+(!level?'disabled':cls.id===first?.cls.id?'selected':'')+'>'+e(cls.name)+(level?' — spell levels 1–'+level:' — no configured slots')+'</option>').join('')+'</select></label>';
    const result=await foundry.applications.api.DialogV2.wait({classes:["rsa-add-spells"],position:{width:360},window:{title:"Add Spells"},content,rejectClose:false,buttons:[{action:"browse",label:"Browse Compendium",default:true,callback:()=>({action:"browse"})},{action:"load",label:"Load Unprepared Spells",disabled:!first,callback:(event,button,dialog)=>({action:"load",classId:dialog.element.querySelector('[name="class"]').value})}]});
    if(result?.action==="browse")return selectSheetSpells(actor,Browser,context);
    if(result?.action==="load"){const count=await loadUnpreparedSheetSpells(actor,result.classId);ui.notifications.info(count?"Added "+count+" missing class spell"+(count===1?"":"s")+", unprepared.":"Your available class spells are already loaded.");}
}

function sheetForElement(root) {
    const matches=app=>(app.element instanceof HTMLElement?app.element:app.element?.[0])===root;
    return [...(foundry.applications.instances?.values?.()??[]),...Object.values(globalThis.ui?.windows??{})].find(matches);
}
export function handleSheetAdd(event) {
    if(game.settings.get(MODULE_ID,"sheetAddCompendiumBrowser")!==true)return;
    const button=event.target.closest?.(createSelector);if(!button||button.disabled||button.classList.contains("disabled"))return;
    const root=button.closest(".application,.app");if(!root)return;
    const sheet=sheetForElement(root),actor=sheet?.actor??sheet?.document;
    if(actor?.type!=="character"||!actor.isOwner||sheet.isEditable===false)return;
    const panel=button.closest('[data-tab-contents-for],[data-tab-id],.tab[data-tab],[data-application-part="inventory"],[data-application-part="spells"]');
    const tab=panel?.dataset.tabContentsFor??panel?.dataset.tabId??panel?.dataset.tab??panel?.dataset.applicationPart??sheet.tabGroups?.primary??sheet._tabs?.[0]?.active;
    if(!["inventory","spells","spellbook"].includes(tab))return;
    const Browser=globalThis.dnd5e?.applications?.CompendiumBrowser;
    if(typeof Browser!=="function")return;
    event.preventDefault();event.stopImmediatePropagation();
    if(["spells","spellbook"].includes(tab)&&game.settings.get(MODULE_ID,"sheetLoadUnpreparedSpells")===true&&preparationClasses(actor).length)return chooseSheetSpellAction(actor,Browser,{event});
    if(["spells","spellbook"].includes(tab))return selectSheetSpells(actor,Browser,{event});
    return new Browser(sheetBrowserOptions(actor,tab)).render({force:true});
}
function reportSheetBrowserError(error){console.error("Ugmuls Character Workshop | Sheet compendium browser failed:",error);ui.notifications.error(error.message??"Could not open spell options.");}
async function migrateSheetPreferences() {
    if (!game.user.isGM || game.users.activeGM?.id !== game.user.id) return;
    const storage = game.settings.storage.get("world");
    for (const key of ["sheetAddCompendiumBrowser", "sheetLoadUnpreparedSpells"]) {
        if (storage.find(setting => setting.key === MODULE_ID + "." + key)) continue;
        const previous = storage.find(setting => setting.key === "ugmuls-5-5e-automation." + key);
        const value = previous?.value;
        if ([true, false, "true", "false"].includes(value)) {
            await game.settings.set(MODULE_ID, key, value === true || value === "true");
        }
    }
}
export function registerSheetTools() {
    game.settings.register(MODULE_ID,"sheetAddCompendiumBrowser",{
        name:"Browse Items and Spells from Character Sheets",
        hint:"Use Add Item on a character's Inventory or Spells tab to open the compendium browser. Spell browsing starts with the character's class lists and lets you select several spells to add at once. You can change the filters.",
        scope:"world",config:true,type:Boolean,default:true
    });
    game.settings.register(MODULE_ID,"sheetLoadUnpreparedSpells",{name:"Offer to Add Missing Class Spells",hint:"When adding spells, offer to fill in missing spells for classes that prepare from their full spell list. Added spells start unprepared. Requires configured spell slots and Browse Items and Spells from Character Sheets to be enabled.",scope:"world",config:true,type:Boolean,default:true});
    Hooks.once("ready", () => migrateSheetPreferences().catch(reportSheetBrowserError));
    Hooks.once("ready",()=>document.addEventListener("click",event=>{
        try {Promise.resolve(handleSheetAdd(event)).catch(reportSheetBrowserError);}
        catch(err){reportSheetBrowserError(err);}
    },{capture:true}));
}
