import { characterServiceUrl, readCharacterJson } from "./ddb-source.mjs";
import { accessibleItemPacks, worldSourceItemPacks, characterOrigins, indexOriginPacks, matchOrigins, searchOriginEntries } from "./compendium-matcher.mjs";
import { baseActorData, prepareActorPlan, applyNativeSource, buildActor } from "./actor-builder.mjs";
import { jsonSelectionInventory } from "./advancement-choices.mjs";
import { characterLoadout, matchLoadout, prepareLoadoutPlan, importLoadout } from "./loadout.mjs";
import { characterFeats, importFeats } from "./feats.mjs";

export class CharacterSourceWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ugmuls-character-source",
    window: { title: "Ugmuls Character Workshop — Load JSON", resizable: true },
    position: { width: 820, height: 760 }
  };

  character = null;
  preview = null;
  creation = null;
  preparing = false;
  disabledControls = new Map();

  async close(options) {
    if (this.preparing || this.creation?.busy) {
      ui.notifications.warn("Character creation is running. Finish or cancel any advancement prompt, or wait for item import to finish.");
      return this;
    }
    return super.close(options);
  }

  async _renderHTML() {
    return `<div data-workshop-content>
      <p>Enter a character number to open its D&D Beyond JSON in your browser. Save the response as a JSON file, or copy its contents, then load it below.</p>
      <p>Direct requests from Foundry are blocked by D&D Beyond's browser access policy.</p>
      <div class="form-group"><label for="ucw-character-id">Character number or service URL</label>
        <input id="ucw-character-id" type="text" data-character-id placeholder="171139899"></div>
      <p><a data-service-link target="_blank" rel="noopener noreferrer" hidden>Open character JSON in browser</a></p>
      <p data-link-error role="status"></p>
      <div class="form-group"><label for="ucw-json-file">Saved JSON file</label>
        <input id="ucw-json-file" type="file" accept=".json,application/json" data-json-file></div>
      <div class="form-group"><label for="ucw-json-text">Or paste JSON</label>
        <textarea id="ucw-json-text" data-json-text rows="6" spellcheck="false"></textarea></div>
      <p>Choose a file or paste JSON. No actors or source items will be changed.</p>
      <button type="button" data-load-json>Load and validate JSON</button>
      <p data-result role="status" aria-live="polite"></p>
      <section data-match-section hidden>
        <details><summary>Selections recorded in JSON</summary>
          <p>This reference includes choices even if Foundry asks for them in a different place. Listing a choice here does not mean it has been imported.</p>
          <ul data-json-selections></ul>
        </details>
        <h3>Source compendiums</h3>
        <p>Defaults follow D&D5e → Configure Sources for this world. You can adjust the search below without changing world settings. Only accessible Item compendiums are listed.</p>
        <div data-pack-list style="max-height:180px;overflow:auto"></div>
        <p><button type="button" data-match-origins>Find character matches</button></p>
        <p data-match-status role="status" aria-live="polite"></p>
        <div data-match-results></div>
        <h3>Feats</h3>
        <p>Class-level feats are applied through native class advancements. Existing background and class grants are retained. Select sources for other feats below, or leave unresolved for review.</p>
        <div data-feat-results></div>
        <h3>Equipment and spells</h3>
        <p>Choose source entries below. Unresolved equipment and spells are skipped and reported; they do not block character creation. Existing native spell grants are retained. Special casting resources require their granting source feature.</p>
        <div data-loadout-results></div>
        <hr>
        <p>Create a new actor from the selected sources. Compatible JSON choices and fixed source grants fill native advancements automatically. HP uses the first-level maximum and averages thereafter, without rolling. Selected feats, equipment, and class spells import through their source documents. Unmatched choices, ability overrides, and other bonuses require review.</p>
        <button type="button" data-create-actor disabled>Create Character</button>
        <button type="button" data-open-actor hidden>Open draft character</button>
        <p data-creation-status role="status" aria-live="polite"></p>
        <ul data-choice-report></ul>
        <h3>Feat results</h3>
        <ul data-feat-report></ul>
        <h3>Equipment and spell results</h3>
        <ul data-loadout-report></ul>
      </section>
    </div>`;
  }

  _replaceHTML(result, content) {
    // ApplicationV2 bounds the content area to the resized window. Keep its
    // children in normal flow so growing results overflow into this scrollbar.
    Object.assign(content.style, {
      display: "block",
      minHeight: "0",
      overflowY: "scroll",
      overflowX: "hidden",
      scrollbarGutter: "stable"
    });
    content.innerHTML = result;
  }

  _clearPreview(root) {
    this.preview = null;
    root.querySelector("[data-create-actor]").disabled = true;
    root.querySelector("[data-match-results]").replaceChildren();
    root.querySelector("[data-loadout-results]").replaceChildren();
    root.querySelector("[data-feat-results]").replaceChildren();
    root.querySelector("[data-match-status]").textContent = "";
  }

  _showPacks(root) {
    const list = root.querySelector("[data-pack-list]");
    const configuration = game.settings.get("dnd5e", "packSourceConfiguration");
    const defaults = new Set(worldSourceItemPacks(game.packs, configuration).map(pack => pack.collection));
    list.replaceChildren();
    for (const pack of accessibleItemPacks(game.packs)) {
      const label = document.createElement("label");
      label.style.display = "block";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = pack.collection;
      checkbox.checked = defaults.has(pack.collection);
      checkbox.dataset.sourcePack = "";
      checkbox.addEventListener("change", () => this._clearPreview(root));
      label.append(checkbox, document.createTextNode(` ${pack.metadata.label} (${pack.collection})`));
      list.append(label);
    }
  }

  _showMatches(root) {
    const container = root.querySelector("[data-match-results]");
    container.replaceChildren();
    const loadoutContainer = root.querySelector("[data-loadout-results]");
    loadoutContainer.replaceChildren();
    const featContainer = root.querySelector("[data-feat-results]");
    featContainer.replaceChildren();
    for (const row of [...this.preview.rows, ...(this.preview.feats ?? []), ...(this.preview.loadout ?? [])]) {
      const section = document.createElement("fieldset");
      section.style.marginBottom = "12px";
      const title = document.createElement("legend");
      title.textContent = `${row.label}: ${row.name || "Not supplied in JSON"}${row.level ? ` — level ${row.level}` : ""}`;
      const info = document.createElement("p");
      info.textContent = row.kind ? row.notes : [row.parent ? `Class: ${row.parent}.` : "", row.custom ? "Custom background; choose an existing source only if appropriate." : "",
        row.legacy === undefined ? "" : `D&D Beyond legacy: ${row.legacy ? "yes" : "no"}.`,
        row.sourceIds.length ? `D&D Beyond source IDs: ${row.sourceIds.join(", ")}.` : "",
        "Source IDs are informational; edition equivalence is not assumed."].filter(Boolean).join(" ");
      const status = document.createElement("p");
      if (row.nativeOnly) {
        status.textContent = "Handled by the native ability-score advancement. No separate feat source is needed.";
        section.append(title, info, status);
        featContainer.append(section);
        continue;
      }
      const matchStatus = row.status === "missing" ? "No exact match. Search for alternatives or leave unresolved."
        : `${row.candidates.length} exact-name match${row.candidates.length === 1 ? "" : "es"}. Confirm the source and edition.`;
      status.textContent = row.selectedUuid ? "Single exact match selected automatically. Review the source and edition." : matchStatus;
      status.setAttribute("role", "status");
      const search = document.createElement("input");
      search.type = "search";
      search.placeholder = "Search alternative names (blank shows exact matches)";
      search.setAttribute("aria-label", `Search ${row.label} alternatives`);
      const select = document.createElement("select");
      select.style.width = "100%";
      select.setAttribute("aria-label", `Select ${row.label} source`);
      const fillOptions = () => {
        const candidates = search.value.trim() ? searchOriginEntries(row, this.preview.entries, search.value) : row.candidates;
        const selected = this.preview.entries.find(entry => entry.uuid === row.selectedUuid);
        const visible = selected && !candidates.some(entry => entry.uuid === selected.uuid) ? [selected, ...candidates] : candidates;
        select.replaceChildren(new Option(row.kind ? "Skip / needs review — choose a source" : "Leave unresolved — choose a source", ""));
        for (const entry of visible) select.add(new Option(
          `${entry.name} | ${entry.packLabel} | ${entry.book || "Book unspecified"} | Rules: ${entry.rules || "unspecified"}`, entry.uuid));
        select.value = row.selectedUuid ?? "";
      };
      const uuid = document.createElement("p");
      uuid.textContent = row.selectedUuid ?? "";
      uuid.style.overflowWrap = "anywhere";
      const inspect = document.createElement("button");
      inspect.type = "button";
      inspect.textContent = "View source item";
      inspect.disabled = !row.selectedUuid;
      inspect.addEventListener("click", async () => {
        inspect.disabled = true;
        try {
          const item = await fromUuid(row.selectedUuid);
          if (!item || !(row.types ?? [row.type]).includes(item.type) || !item.testUserPermission(game.user, "OBSERVER")) throw new Error("The selected source item is unavailable.");
          item.sheet.render({ force: true, editable: false });
        } catch (error) { ui.notifications.error(error.message); }
        finally { inspect.disabled = !row.selectedUuid; }
      });
      select.addEventListener("change", () => {
        row.selectedUuid = select.value || null;
        uuid.textContent = row.selectedUuid ?? "";
        status.textContent = row.selectedUuid ? "Source selected for preview. No item has been added." : matchStatus;
        inspect.disabled = !row.selectedUuid;
      });
      search.addEventListener("input", fillOptions);
      fillOptions();
      section.append(title, info, status, search, select, uuid, inspect);
      (row.kind === "feat" ? featContainer : row.kind ? loadoutContainer : container).append(section);
    }
    root.querySelector("[data-create-actor]").disabled = false;
  }

  _creationControls(root) {
    const locked = this.preparing || Boolean(this.creation);
    for (const control of root.querySelectorAll("[data-workshop-content] input, [data-workshop-content] textarea, [data-workshop-content] select, [data-workshop-content] button")) {
      if (control.matches("[data-create-actor], [data-open-actor]")) continue;
      if (locked) {
        if (!this.disabledControls.has(control)) this.disabledControls.set(control, control.disabled);
        control.disabled = true;
      }
    }
    if (!locked) {
      for (const [control, disabled] of this.disabledControls) control.disabled = disabled;
      this.disabledControls.clear();
    }
    const button = root.querySelector("[data-create-actor]");
    button.disabled = this.preparing || Boolean(this.creation?.busy) || Boolean(this.creation?.complete) || !this.preview;
    button.textContent = this.creation?.complete ? "Character created" : this.creation?.actor ? "Continue Character" : "Create Character";
    root.querySelector("[data-open-actor]").hidden = !this.creation?.actor;
  }

  _showChoiceReport() {
    const list = this.element.querySelector("[data-choice-report]");
    if (!list) return;
    list.replaceChildren();
    for (const entry of this.creation?.choices?.report.values() ?? []) {
      const row = document.createElement("li");
      const kind = entry.kind === "json" ? "From JSON" : entry.kind === "source" ? "From source" : entry.kind === "default" ? "Default" : "Manual prompt";
      row.textContent = `${kind}: ${entry.label} — ${entry.detail}`;
      list.append(row);
    }
  }

  _showJsonSelections(root) {
    const list = root.querySelector("[data-json-selections]");
    list.replaceChildren();
    for (const entry of jsonSelectionInventory(this.character)) {
      const row = document.createElement("li");
      row.textContent = `${entry.label}: ${entry.values.join(", ")}`;
      list.append(row);
    }
  }

  _showLoadoutReport() {
    const list = this.element.querySelector("[data-loadout-report]");
    if (!list) return;
    list.replaceChildren();
    for (const entry of this.creation?.loadoutReport?.values() ?? []) {
      const row = document.createElement("li");
      row.textContent = `${entry.status === "review" ? "Needs review" : entry.status}: ${entry.name} — ${entry.detail}`;
      list.append(row);
    }
  }

  _showFeatReport() {
    const list = this.element.querySelector("[data-feat-report]");
    if (!list) return;
    list.replaceChildren();
    for (const entry of this.creation?.featReport?.values() ?? []) {
      const row = document.createElement("li");
      row.textContent = `${entry.status === "review" ? "Needs review" : entry.status}: ${entry.name} — ${entry.detail}`;
      list.append(row);
    }
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const root = this.element;
    const idInput = root.querySelector("[data-character-id]");
    idInput.addEventListener("input", () => {
      const link = root.querySelector("[data-service-link]");
      const status = root.querySelector("[data-link-error]");
      link.hidden = true;
      link.removeAttribute("href");
      status.textContent = "";
      if (!idInput.value.trim()) return;
      try {
        link.href = characterServiceUrl(idInput.value);
        link.hidden = false;
      } catch (error) { status.textContent = error.message; }
    });
    root.querySelector("[data-load-json]").addEventListener("click", async event => {
      const button = event.currentTarget;
      const result = root.querySelector("[data-result]");
      button.disabled = true;
      this.character = null;
      this._clearPreview(root);
      root.querySelector("[data-match-section]").hidden = true;
      result.textContent = "Reading JSON…";
      try {
        const file = root.querySelector("[data-json-file]").files[0];
        const pasted = root.querySelector("[data-json-text]").value.trim();
        if (file && pasted) throw new Error("Choose either a file or pasted JSON. Clear the other input first.");
        if (!file && !pasted) throw new Error("Choose a JSON file or paste the character JSON first.");
        const character = readCharacterJson(file ? await file.text() : pasted, idInput.value.trim() || undefined);
        const classes = character.classes.map(entry => `${entry.definition?.name ?? "Unknown class"} ${entry.level ?? "?"}`).join(", ");
        result.textContent = `Validated: ${character.name} — ${classes}. Character number: ${character.id}. No actor was created.`;
        this.character = character;
        this._showJsonSelections(root);
        this._showPacks(root);
        root.querySelector("[data-match-section]").hidden = false;
      } catch (error) {
        result.textContent = error instanceof SyntaxError ? "Invalid JSON. Save or copy the full JSON response, rather than the page URL." : error.message;
      } finally { button.disabled = false; }
    });
    root.querySelector("[data-match-origins]").addEventListener("click", async event => {
      const button = event.currentTarget;
      this._clearPreview(root);
      const status = root.querySelector("[data-match-status]");
      const selected = [...root.querySelectorAll("[data-source-pack]:checked")].map(input => input.value);
      if (!this.character || !selected.length) {
        status.textContent = "Load a character and select at least one source compendium.";
        return;
      }
      const character = this.character;
      const controls = [...root.querySelectorAll("[data-source-pack], [data-load-json]")];
      button.disabled = true;
      controls.forEach(control => { control.disabled = true; });
      status.textContent = "Searching compendium indexes…";
      try {
        const packs = accessibleItemPacks(game.packs).filter(pack => selected.includes(pack.collection));
        const { entries, errors } = await indexOriginPacks(packs);
        if (this.character !== character) return;
        this.preview = { rows: matchOrigins(characterOrigins(character), entries), feats: matchLoadout(characterFeats(character), entries), loadout: matchLoadout(characterLoadout(character), entries), entries, errors };
        this._showMatches(root);
        status.textContent = `${this.preview.rows.length} origins, ${this.preview.feats.length} feats, and ${this.preview.loadout.length} equipment/spell entries reviewed across ${packs.length} compendiums. Review the sources below, then create the character.`
          + (errors.length ? ` Search incomplete — could not read: ${errors.map(error => `${error.label}: ${error.message}`).join("; ")}` : "");
      } catch (error) { status.textContent = error.message; }
      finally {
        button.disabled = false;
        controls.forEach(control => { control.disabled = false; });
      }
    });
    root.querySelector("[data-open-actor]").addEventListener("click", () => this.creation?.actor?.sheet.render({ force: true }));
    root.querySelector("[data-create-actor]").addEventListener("click", async () => {
      if (this.preparing || this.creation?.busy || this.creation?.complete) return;
      const status = root.querySelector("[data-creation-status]");
      this.preparing = true;
      this._creationControls(root);
      try {
        if (!CONFIG.Actor.documentClass.canUserCreate(game.user)) throw new Error("You do not have permission to create actors.");
        if (game.settings.get("dnd5e", "disableAdvancements")) throw new Error("Enable D&D5e advancements before creating this character.");
        if (!this.creation) {
          const data = baseActorData(this.character, game.user.id);
          const tasks = await prepareActorPlan(this.character, this.preview, async uuid => {
            const source = await fromUuid(uuid);
            if (!source?.testUserPermission(game.user, "OBSERVER")) throw new Error("A selected source is no longer accessible.");
            return source;
          });
          const loadout = await prepareLoadoutPlan(this.preview.loadout, this.preview.entries, async uuid => {
            const source = await fromUuid(uuid);
            if (!source?.testUserPermission(game.user, "OBSERVER")) throw new Error("A selected equipment/spell source is no longer accessible.");
            return source;
          });
          const feats = await prepareLoadoutPlan(this.preview.feats, this.preview.entries, async uuid => {
            const source = await fromUuid(uuid);
            if (!source?.testUserPermission(game.user, "OBSERVER")) throw new Error("A selected feat source is no longer accessible.");
            return source;
          });
          this.creation = { characterId: this.character.id, data, tasks, feats, featReport: new Map(), loadout, loadoutReport: new Map(), completed: [], actor: null, busy: false, complete: false };
          const documents = new Map(tasks.map(task => [task.uuid, task.source]));
          this.creation.choices = {
            character: this.character, entries: this.preview.entries, tasks, featTasks: feats, user: game.user, report: new Map(),
            resolve: async uuid => {
              if (!documents.has(uuid)) documents.set(uuid, await fromUuid(uuid));
              return documents.get(uuid);
            },
            onReport: () => this._showChoiceReport()
          };
        }
        await buildActor(this.creation, {
          createActor: data => CONFIG.Actor.documentClass.create(data),
          applySource: (actor, task) => applyNativeSource(actor, task, this.creation.choices),
          applyFeats: actor => importFeats(actor, this.creation.feats, {
            character: this.creation.choices.character,
            applySource: (actor, task) => applyNativeSource(actor, task, this.creation.choices),
            report: this.creation.featReport, onReport: () => this._showFeatReport()
          }),
          applyLoadout: actor => importLoadout(actor, this.creation.loadout, {
            character: this.creation.choices.character, fromCompendium: source => game.items.fromCompendium(source),
            report: this.creation.loadoutReport, onReport: () => this._showLoadoutReport()
          }),
          progress: message => { status.textContent = message; }
        });
        root.querySelector("[data-result]").textContent = `Draft actor: ${this.creation.actor.name}.`;
        if (this.creation.complete) {
          const report = [...this.creation.choices.report.values()];
          const review = [...this.creation.loadoutReport.values()].filter(entry => entry.status === "review").length;
          const featReview = [...this.creation.featReport.values()].filter(entry => entry.status === "review").length;
          status.textContent = `Created ${this.creation.actor.name}. ${report.filter(entry => entry.kind === "json").length} advancement choices filled from JSON; ${report.filter(entry => entry.kind === "default").length} used defaults; ${report.filter(entry => entry.kind === "manual").length} used manual prompts. ${featReview} feats and ${review} equipment/spell entries need review. Check the reports and character sheet.`;
          this.creation.actor.sheet.render({ force: true });
        }
      } catch (error) {
        console.error("Ugmuls Character Workshop | Actor creation", error);
        status.textContent = `${error.message}${this.creation?.actor ? " The draft is retained. Review it, then Continue Character in this window." : " No actor was created."}`;
        if (this.creation && !this.creation.actor) this.creation = null;
      } finally {
        this.preparing = false;
        this._creationControls(root);
      }
    });
    // Preserve the loaded character and draft if Foundry re-renders this window.
    if (this.character) {
      this._showJsonSelections(root);
      this._showPacks(root);
      root.querySelector("[data-match-section]").hidden = false;
      root.querySelector("[data-result]").textContent = `Loaded: ${this.character.name}.`;
    }
    if (this.preview) this._showMatches(root);
    this._showChoiceReport();
    this._showLoadoutReport();
    this._showFeatReport();
    this._creationControls(root);
  }
}

export function openSourceWindow() {
  return new CharacterSourceWindow().render({ force: true });
}
