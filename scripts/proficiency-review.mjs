const origins = new Set(["class", "background", "race"]);
const list = value => Array.from(value ?? []);

/** Read native receipts and fixed grants without changing the actor. */
export function proficiencyReview(actor) {
  const rows = new Map(), notices = [];
  const items = list(actor.items), byId = new Map(items.map(item=>[item.id,item]));
  function originFor(item, seen = new Set()) {
    if (!item || seen.has(item.id)) return null;
    if (origins.has(item.type) || (["feat", "subclass"].includes(item.type) && !item.flags?.dnd5e?.advancementOrigin && !item.flags?.dnd5e?.advancementRoot)) return item;
    seen.add(item.id);
    const origin = item.flags?.dnd5e?.advancementOrigin ?? item.flags?.dnd5e?.advancementRoot;
    return originFor(byId.get(origin?.split('.')[0]), seen);
  }
  for (const item of items) {
    const origin = originFor(item);
    if (!origin) continue;
    const advancements = item.advancement?.byType?.Trait ?? list(item.system?.advancement).filter(a => a.type === "Trait");
    if (!advancements.length && origins.has(item.type)) notices.push(`${item.name}: no structured proficiency advancements to inspect.`);
    for (const advancement of advancements) {
      const config = advancement.configuration ?? {}, mode = config.mode ?? "default";
      if (mode === "mastery") continue;
      const grants = new Set(list(config.grants)), chosen = new Set(list(advancement.value?.chosen));
      // Do not predict grants from future class levels.
      if (item.type === "class" && Number(advancement.level ?? 0) > Number(item.system?.levels ?? 0)) continue;
      for (const key of new Set([...grants, ...chosen])) {
        if (!/^(skills|tool):/.test(key) || key.includes("*")) continue;
        const category = mode === "default" ? "proficiency" : mode === "expertise" || mode === "forcedExpertise" ? "expertise" : mode;
        const rowKey = identity(key, category);
        if (!rows.has(rowKey)) rows.set(rowKey, {key, category, sources: []});
        rows.get(rowKey).sources.push({itemId:item.id, advancementId:advancement.id ?? advancement._id,
          name:item === origin ? item.name : `${origin.name} → ${item.name}`, level:Number(advancement.level ?? 0), recorded:chosen.has(key),
          editable:chosen.has(key) && (!grants.has(key) || config.allowReplacements === true), fixed:grants.has(key), repairable:mode === "default" && grants.has(key) && !config.allowReplacements});
      }
    }
  }
  // Compare the prepared sheet values with the source ledger. Tool receipts
  // may include a category prefix while system.tools is indexed by leaf ID.
  for (const [type, values] of [["skills", actor.system?.skills], ["tool", actor.system?.tools]]) {
    for (const [id, data] of Object.entries(values ?? {})) {
      const value = Number(data.value);
      if (!(value > 0)) continue;
      const categories = value >= 2 ? ["proficiency", "expertise"] : value >= 1 ? ["proficiency"] : ["partial proficiency"];
      for (const category of categories) {
        const key = `${type}:${id}`, rowKey = identity(key, category);
        if (!rows.has(rowKey)) rows.set(rowKey, {key, category, sources:[]});
        rows.get(rowKey).current = true;
      }
    }
  }
  return {rows:[...rows.values()].map(row => {
    const values = row.key.startsWith("skills:") ? actor.system?.skills : actor.system?.tools;
    const value = Number(values?.[row.key.split(":").at(-1)]?.value ?? 0);
    const current = row.current ?? (row.category === "expertise" ? value >= 2 : row.category === "proficiency" ? value >= 1 : false);
    return {...row, current, sources:row.sources.map(source=>({...source,
      editable:source.editable || (!current && source.repairable)})), missingFixed:!current && row.sources.some(source=>source.repairable), duplicate:row.sources.length > 1,
      // A fixed grant identifies its source without a choice receipt. Native
      // advancements may omit that receipt when proficiency already existed.
      // Keep recorded separate so the UI never claims a missing receipt exists.
      unconnected:current && !row.sources.some(source=>source.recorded || source.fixed)};
  }), notices};
}

function identity(key, category) { return `${category}:${key.split(":")[0]}:${key.split(":").at(-1)}`; }

const escape = value => foundry.utils.escapeHTML(String(value ?? ""));
function label(key) {
  // Native tool entries hold compendium IDs, not localization labels. The
  // system resolves their names from its base-item index, including categories.
  const nativeLabel = globalThis.dnd5e?.documents?.Trait?.keyLabel?.(key);
  if (typeof nativeLabel === "string" && nativeLabel !== key) return nativeLabel;
  const [type, ...parts] = key.split(":"), id = parts.at(-1);
  const entry = type === "skills" ? CONFIG.DND5E.skills?.[id]
    : CONFIG.DND5E.toolProficiencies?.[id] ?? CONFIG.DND5E.vehicleTypes?.[id] ?? CONFIG.DND5E.tools?.[id];
  const text = typeof entry === "string" ? entry : entry?.label;
  return typeof text === "string" ? game.i18n.localize(text) : key;
}
export function proficiencyReviewHTML(actor) {
  const {rows, notices} = proficiencyReview(actor);
  return '<div class="ucw-proficiency-review"><h3>Skills &amp; Tool Proficiencies</h3><p>Current sheet proficiencies checked against class, background, species, subclass, and feat advancements. Highlighted entries show overlaps or a current proficiency without a recorded source. Expertise is reviewed separately.</p>'
    + '<p>Change choices opens the selected proficiency step in Foundry’s native editor. Other saved choices are restored automatically, and missing fixed skill/tool grants are reapplied before saving. Complete it, then refresh this review. If a saved choice needs attention, Foundry may show that step too.</p>'
    + (rows.length ? '<table><thead><tr><th>Proficiency</th><th>Sources</th><th>Review</th></tr></thead><tbody>' + rows.map(row => '<tr class="'+(row.duplicate||row.unconnected||row.missingFixed?'ucw-proficiency-overlap':'')+'"><td>'+escape(label(row.key))+'<br><small>'+escape(row.category)+(row.current?' · On sheet':' · Source record only')+'</small></td><td>'+(row.sources.length?'':'No recorded source')+row.sources.map(source => escape(source.name)+' — '+(source.fixed?'fixed grant':'selected')+(source.recorded?'':source.fixed?' (no saved receipt)':' (not recorded as applied)')).join('<br>')+'</td><td>'+(row.unconnected?'<strong>No connected source — review</strong><br>':'')+(row.duplicate?'<strong>Overlap — review</strong>':row.unconnected?'':row.current?'Source connected':'Not currently on sheet')+row.sources.filter(source=>source.editable).map(source=>'<br><button type="button" data-proficiency-item="'+escape(source.itemId)+'" data-proficiency-advancement="'+escape(source.advancementId)+'">'+(!row.current&&source.repairable?'Restore '+escape(source.name)+' grant':'Change '+escape(source.name)+' choices')+'</button>').join('')+'</td></tr>').join('')+'</tbody></table>' : '<p>No recorded skill or tool grants found.</p>')
    + notices.map(notice=>'<p>'+escape(notice)+'</p>').join('')
    + '<p>“Source connected” means a saved choice or fixed advancement grant matches the current proficiency. A fixed grant can identify the source even without a saved receipt. “No connected source” means neither was found; direct sheet edits, imports, or effects may explain it. Review these manually; nothing is changed automatically.</p><button type="button" data-proficiency-refresh>Refresh review</button></div>';
}

export function editProficiencyChoices(actor, itemId, advancementId) {
  if (actor?.type !== "character" || !actor.isOwner) throw Error("Choose a player character you own.");
  if (game.settings.get("dnd5e", "disableAdvancements")) throw Error("Enable D&D5e advancements before changing choices.");
  const source = proficiencyReview(actor).rows.flatMap(row=>row.sources).find(source=>source.itemId===itemId && source.advancementId===advancementId && source.editable);
  if (!source) throw Error("This choice is no longer editable. Refresh the review.");
  const manager = dnd5e.applications.advancement.AdvancementManager.forModifyChoices(actor, itemId, source.level);
  if (!manager.steps.length) throw Error("No native choices are available for this source.");
  focusProficiencyStep(manager, itemId, advancementId, source.level);
  appendFixedGrantRepairs(manager);
  manager.render(true);
  return manager;
}

/** Replay only missing, unconditional fixed skill/tool grants at the end of
 * the native clone transaction. Compute missing keys at execution time: a
 * class reversal can remove proficiency that another source skipped earlier.
 * Native restore records the receipt; completion commits everything together.
 */
export function appendFixedGrantRepairs(manager) {
  const Manager = dnd5e.applications.advancement.AdvancementManager;
  const seen = new Set();
  for (const row of proficiencyReview(manager.clone).rows) {
    if (row.category !== "proficiency") continue;
    for (const source of row.sources) {
      if (!source.fixed) continue;
      const id = `${source.itemId}.${source.advancementId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const item = manager.clone.items.get(source.itemId);
      const advancement = item?.advancement?.byId?.[source.advancementId];
      // Replacement-enabled grants may have been intentionally traded away.
      if (!advancement || advancement.configuration.allowReplacements || !advancement.appliesToClass) continue;
      const flow = Manager.flowsForLevel(item, source.level).find(flow=>flow.advancement.id === source.advancementId);
      if (!flow) continue;
      Object.defineProperty(flow, "retainedData", {configurable:true, get() {
        const chosen = list(advancement.configuration.grants).filter(key=> {
          if (!/^(skills|tool):/.test(key) || key.includes("*")) return false;
          const path = dnd5e.documents.Trait.changeKeyPath(key);
          const value = path?.split('.').reduce((data, part)=>data?.[part], manager.clone);
          return Number(value ?? 0) < 1;
        });
        return {chosen};
      }});
      manager.steps.push({type:"restore",flow,automatic:true});
    }
  }
}

/** Keep native reversal, retained data, validation, and final commit intact.
 * Unrelated forward prompts replay their own retained values through restore,
 * just as the native modify-choices manager restores choices at later levels.
 */
export function focusProficiencyStep(manager, itemId, advancementId, level) {
  const target = manager.steps.find(step => step.type === "forward"
    && step.flow?.item?.id === itemId && step.flow?.advancement?.id === advancementId
    && step.flow.level === level);
  if (!target) throw Error("The selected proficiency step is unavailable. Refresh the review.");
  for (const step of manager.steps) {
    if (step === target || step.type !== "forward" || !step.flow || step.automatic) continue;
    step.type = "restore";
    step.automatic = true;
  }
}

export function bindProficiencyReview(root, actor, refresh) {
  root.querySelector('[data-proficiency-refresh]')?.addEventListener('click', refresh);
  for (const button of root.querySelectorAll('[data-proficiency-item]')) button.addEventListener('click', () => {
    try { editProficiencyChoices(actor, button.dataset.proficiencyItem, button.dataset.proficiencyAdvancement); }
    catch (error) { ui.notifications.error(error.message); }
  });
}

export function openProficiencyReview(actor) {
  if (actor?.type !== "character" || !actor.isOwner) throw Error("Choose a player character you own.");
  class Review extends foundry.applications.api.ApplicationV2 {
    static DEFAULT_OPTIONS = {window:{title:"Character Proficiency Review",resizable:true},position:{width:760,height:640},classes:["ucw-proficiency-window"]};
    async _renderHTML() { return proficiencyReviewHTML(actor); }
    _replaceHTML(html, content) { content.innerHTML = html; }
    _onRender(context, options) { super._onRender(context, options); bindProficiencyReview(this.element, actor, ()=>this.render({force:true})); }
  }
  return new Review().render({force:true});
}

export function registerProficiencyReview() {
  Hooks.on("getHeaderControlsApplicationV2", (app, controls) => {
    const actor = app.actor ?? app.document;
    if (actor?.documentName !== "Actor" || actor.type !== "character" || !actor.isOwner) return;
    if (controls.some(control=>control.action==="ucwProficiencyReview")) return;
    controls.push({action:"ucwProficiencyReview",icon:"fa-solid fa-list-check",label:"Review Skills & Tools",onClick:()=>openProficiencyReview(actor)});
  });
}
