import {openPlayerCreator,continuePlayerCreator} from "./pc-creator.js";
export async function createPlayer(){
    if(!CONFIG.Actor.documentClass.canUserCreate(game.user))return;
    return openPlayerCreator();
}

export function addCreatePlayerButton(app,html){
    const root=html?.[0]??html;
    if(!root?.querySelector||!CONFIG.Actor.documentClass.canUserCreate(game.user)||root.querySelector('[data-rsa-create-player]'))return;
    const actions=root.querySelector('.directory-header .header-actions');if(!actions)return;
    const button=document.createElement("button");button.type="button";button.dataset.rsaCreatePlayer="";
    const icon=document.createElement("i");icon.className="fa-solid fa-user-plus";icon.setAttribute("aria-hidden","true");
    const label=document.createElement("span");label.textContent="Create Player";button.append(icon,label);
    button.addEventListener("click",async event=>{event.preventDefault();event.stopPropagation();button.disabled=true;try{await createPlayer();}catch(error){console.error("Ugmuls Character Workshop | Create Player:",error);ui.notifications.error("Could not create the player character. See the console for details.");}finally{button.disabled=false;}});
    actions.insertAdjacentElement("afterend",button);
}

export function addContinuePlayerContext(app,options){
    const actorForEntry=element=>{const root=element?.[0]??element,id=root?.closest?.('[data-entry-id]')?.dataset.entryId??root?.dataset?.entryId;return app.collection?.get?.(id)??game.actors?.get?.(id);};
    options.push({label:"Continue Character Creator Wizard",icon:'<i class="fa-solid fa-user-pen"></i>',visible:element=>{const actor=actorForEntry(element);return actor?.type==="character"&&actor.isOwner;},onClick:async(event,element)=>{try{await continuePlayerCreator(actorForEntry(element));}catch(error){console.error("Ugmuls Character Workshop | Continue PC creator:",error);ui.notifications.error(error.message);}}});
}
export function registerPlayerCreator() {
    Hooks.on("renderActorDirectory", addCreatePlayerButton);
    Hooks.on("getActorContextOptions", addContinuePlayerContext);
}
