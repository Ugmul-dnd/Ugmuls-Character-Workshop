import { selectAdvancement, describeSelection, prefillTraitSelection } from "./advancement-choices.mjs";
import { canonicalItemUuid } from "./compendium-matcher.mjs";

const MODULE_ID = "ugmuls-character-workshop";
const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"];

export function baseActorData(character, userId) {
  const abilities = {};
  for (const [index, key] of ABILITIES.entries()) {
    const value = character.stats.find(stat => stat.id === index + 1)?.value;
    if (!Number.isInteger(value) || value < 1 || value > 30) throw new Error(`Invalid base ${key.toUpperCase()} score in JSON.`);
    abilities[key] = { value };
  }
  return { name: character.name, type: "character", system: { abilities }, ownership: { [userId]: 3 },
    flags: { [MODULE_ID]: { importState: { characterId: String(character.id), status: "draft", completed: [] } } } };
}

/** Freeze selected source identities before creating any world documents. */
export async function prepareActorPlan(character, preview, resolve) {
  if (!preview?.rows?.length) throw new Error("Find and select source matches first.");
  const unresolved = preview.rows.filter(row => !row.selectedUuid);
  if (unresolved.length) throw new Error(`Select sources before creating: ${unresolved.map(row => row.name || row.label).join(", ")}.`);
  const tasks = [];
  const seen = new Set();
  let totalLevels = 0;
  for (const row of preview.rows) {
    if (seen.has(row.selectedUuid)) throw new Error("The same source was selected for more than one origin.");
    seen.add(row.selectedUuid);
    const entry = preview.entries.find(entry => entry.uuid === row.selectedUuid && entry.type === row.type);
    if (!entry) throw new Error(`Selected source for ${row.name} is outside this preview.`);
    const source = await resolve(row.selectedUuid);
    if (!source || source.type !== row.type) throw new Error(`Source unavailable or wrong type: ${row.name}.`);
    const task = { key: row.key, type: row.type, uuid: row.selectedUuid, source, name: source.name, level: row.level };
    if (row.type === "class") {
      if (!Number.isInteger(row.level) || row.level < 1 || row.level > 20) throw new Error(`Invalid class level for ${row.name}.`);
      totalLevels += row.level;
      task.starting = Boolean(character.classes[Number(row.key.split("-")[1])]?.isStartingClass);
    }
    tasks.push(task);
  }
  if (totalLevels < 1 || totalLevels > 20) throw new Error("Total character level must be between 1 and 20.");
  const classes = tasks.filter(task => task.type === "class");
  for (const task of tasks.filter(task => task.type === "subclass")) {
    const parent = tasks.find(candidate => candidate.key === task.key.replace("subclass-", "class-"));
    if (!parent || task.source.system.classIdentifier !== parent.source.system.identifier) {
      throw new Error(`${task.name} does not belong to the selected class. Choose a compatible subclass source.`);
    }
  }
  // Starting class controls first-level proficiencies and hit points.
  classes.sort((a, b) => Number(b.starting) - Number(a.starting));
  return [...classes, ...tasks.filter(task => task.type === "background"),
    ...tasks.filter(task => task.type === "race"), ...tasks.filter(task => task.type === "subclass")];
}

/** Await native commit, or a genuine close/cancel, without treating a canceled close as cancellation. */
export function runAdvancement(manager, hooks = globalThis.Hooks, choices = null) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const originalClose = manager.close;
    const wrapped = new Map();
    let prepare;
    const cleanup = () => {
      hooks.off("dnd5e.advancementManagerComplete", complete);
      if (prepare) hooks.off("dnd5e.preAdvancementManagerRender", prepare);
      for (const [flow, { own, original }] of wrapped) {
        if (own) flow.getAutomaticApplicationValue = original;
        else delete flow.getAutomaticApplicationValue;
      }
      manager.close = originalClose;
    };
    const finish = value => { if (!settled) { settled = true; cleanup(); resolve(value); } };
    const complete = hooks.on("dnd5e.advancementManagerComplete", current => { if (current === manager) finish(true); });
    if (choices) prepare = hooks.on("dnd5e.preAdvancementManagerRender", current => {
      const flow = current.step?.flow;
      if (current !== manager || !flow || current.step.type !== "forward" || wrapped.has(flow)) return;
      const original = flow.getAutomaticApplicationValue;
      wrapped.set(flow, { own: Object.hasOwn(flow, "getAutomaticApplicationValue"), original });
      flow.getAutomaticApplicationValue = async function() {
        const advancement = this.advancement;
        const key = `${advancement.item.id}:${advancement.id}:${this.level}`;
        const label = `${advancement.item.name} — ${advancement.title || advancement.type} (level ${this.level})`;
        let data;
        let reason = choices.report.get(key)?.kind === "manual" ? choices.report.get(key).detail : "No unique compatible JSON selection; complete the native prompt.";
        try { data = await selectAdvancement(this, choices); }
        catch (error) { reason = `Needs review: ${error.message}`; }
        let kind = data && advancement.type === "HitPoints" ? "default"
          : data && advancement.type === "Size" && advancement.configuration.sizes.size === 1 ? "source" : "json";
        if (!data) {
          // Size's native helper can default a multi-size choice; require an explicit JSON match.
          data = advancement.type === "Size" ? false : await original.call(this);
          kind = data === false ? "manual" : "source";
          if (data === false) {
            try {
              const partial = await prefillTraitSelection(this, choices);
              if (partial) {
                const names = await describeSelection(this, partial.data, choices);
                await advancement.apply(this.level, partial.data, { automatic: true });
                reason = `Pre-filled ${names}. Review remaining JSON choice${partial.missing.length === 1 ? "" : "s"}: ${partial.missing.join(", ") || "not specified in JSON"}.`;
              }
            } catch (error) { reason = `Needs review: ${error.message}`; }
          }
        }
        let detail = kind === "source" ? "Native source grant/default." : reason;
        if (kind === "json" || kind === "default" || (data && advancement.type === "Size")) {
          try { detail = await describeSelection(this, data, choices); }
          catch { detail = "JSON selection applied."; }
        }
        choices.report.set(key, { kind, label, detail });
        choices.onReport?.();
        return data || false;
      };
    });
    manager.close = async function(...args) {
      const result = await originalClose.apply(this, args);
      if (!this.rendered) finish(false);
      return result;
    };
    Promise.resolve().then(() => manager.render({ force: true })).catch(error => {
      if (!settled) { settled = true; cleanup(); reject(error); }
    });
  });
}

function existingSource(actor, task) {
  return [...actor.items].find(item => item.type === task.type
    && [item._stats?.compendiumSource, item.flags?.dnd5e?.sourceId].some(uuid => uuid && canonicalItemUuid(uuid) === canonicalItemUuid(task.uuid)));
}

export async function applyNativeSource(actor, task, choices = null) {
  if (!actor.isOwner) throw new Error("You no longer own this character.");
  if (!task.source.testUserPermission(game.user, "OBSERVER")) throw new Error(`Source permission lost: ${task.name}.`);
  const existing = existingSource(actor, task);
  if (existing) {
    if (task.type === "class" && existing.system.levels !== task.level) throw new Error(`Review ${task.name}'s level on the draft actor before continuing.`);
    return true;
  }
  const conflict = [...actor.items].find(item => item.type === task.type && (
    ["background", "race"].includes(task.type)
    || (task.type === "class" && item.system.identifier === task.source.system.identifier)
    || (task.type === "subclass" && item.system.classIdentifier === task.source.system.classIdentifier)));
  if (conflict) throw new Error(`The draft already has ${conflict.name}; it conflicts with ${task.name}. Review the actor before continuing.`);
  const data = game.items.fromCompendium(task.source);
  if (task.type === "class") data.system.levels = task.level;
  const manager = dnd5e.applications.advancement.AdvancementManager.forNewItem(actor, data, { automaticApplication: Boolean(choices) });
  if (manager.steps.length) return runAdvancement(manager, globalThis.Hooks, choices);
  await CONFIG.Item.dataModels[task.type]?.onDropCreate?.(null, actor, data);
  await actor.createEmbeddedDocuments("Item", [data]);
  return true;
}

/** Session remains attached to the window so retries continue the same draft. */
export async function buildActor(session, { createActor, applySource, applyFeats, applyLoadout, progress = () => {} }) {
  if (session.busy) throw new Error("Character creation is already running.");
  if (session.complete) return session.actor;
  session.busy = true;
  try {
    session.actor ??= await createActor(session.data);
    if (!session.actor) throw new Error("Actor creation was canceled or prevented.");
    for (const task of session.tasks) {
      if (session.completed.includes(task.key)) continue;
      progress(`Applying ${task.name}${task.level ? ` ${task.level}` : ""} from JSON and native sources. Review any remaining advancement prompts.`);
      if (!await applySource(session.actor, task)) {
        progress(`Paused on ${task.name}. The draft actor is retained; Continue resumes it.`);
        return session.actor;
      }
      session.completed.push(task.key);
      await session.actor.setFlag(MODULE_ID, "importState", {
        characterId: String(session.characterId), status: "draft", completed: [...session.completed],
        sources: session.tasks.map(({ key, uuid, level }) => ({ key, uuid, ...(level ? { level } : {}) }))
      });
    }
    if (applyFeats && !session.featsComplete) {
      progress("Reconciling selected feats with native grants.");
      if (!await applyFeats(session.actor)) return session.actor;
      session.featsComplete = true;
    }
    if (applyLoadout && !session.loadoutComplete) {
      progress("Importing selected equipment and spells; retaining native grants.");
      await applyLoadout(session.actor);
      session.loadoutComplete = true;
    }
    await session.actor.setFlag(MODULE_ID, "importState.status", applyLoadout ? "complete" : "origins-complete");
    session.complete = true;
    return session.actor;
  } finally { session.busy = false; }
}

