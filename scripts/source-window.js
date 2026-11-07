import { characterServiceUrl, loadCharacter, readCharacterJson } from "./ddb-source.mjs";
import { accessibleItemPacks, worldSourceItemPacks, characterOrigins, indexOriginPacks, matchOrigins, searchOriginEntries } from "./compendium-matcher.mjs";
import { baseActorData, prepareActorPlan, applyNativeSource, buildActor } from "./actor-builder.mjs";
import { jsonSelectionInventory } from "./advancement-choices.mjs";
import { characterLoadout, matchLoadout, prepareLoadoutPlan, importLoadout } from "./loadout.mjs";
import { characterFeats, importFeats } from "./feats.mjs";

import { previewRows, needsReview, createReviewItems } from "./review-items.mjs";
import { replacementEntry } from "./source-picker.mjs";

export class CharacterSourceWindow extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "ugmuls-character-source",
    window: { title: "Ugmuls Character Workshop — Load Character", resizable: true },
    position: { width: 820, height: 760 }
  };

  step = 1;
  searching = false;
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
    return `<div data-workshop-content class="ucw-wizard">
      <nav aria-label="Character builder steps">${["Load JSON", "Matched features", "Missing / unknown", "Build character", "Sheet & log"].map((label, index) => `<button type="button" data-step="${index + 1}">${index + 1}. ${label}</button>`).join("")}</nav>
      <section data-step-panel="1">
      <h2>Load your character</h2>
      <p>Enter a public D&D Beyond character number to load it directly. No Cloudflare account or sign-in is needed.</p>
      <p>Loading sends the character number to the shared workshop service, which retrieves the public JSON. No actors or source items are changed until you choose Create Character.</p>
      <div class="form-group"><label for="ucw-character-id">Character number or service URL</label>
        <input id="ucw-character-id" type="text" data-character-id placeholder="171139899"></div>
      <button type="button" data-load-public>Load public character</button>
      <p><a data-service-link target="_blank" rel="noopener noreferrer" hidden>Open character JSON in browser</a></p>
      <p data-link-error role="status"></p>
      <h3>Or import JSON manually</h3>
      <div class="form-group"><label for="ucw-json-file">Saved JSON file</label>
        <input id="ucw-json-file" type="file" accept=".json,application/json" data-json-file></div>
      <div class="form-group"><label for="ucw-json-text">Or paste JSON</label>
        <textarea id="ucw-json-text" data-json-text rows="6" spellcheck="false"></textarea></div>
      <p>Choose a file or paste JSON. No actors or source items will be changed.</p>
      <button type="button" data-load-json>Load and validate JSON</button>
      <p data-result role="status" aria-live="polite"></p>
      <button type="button" data-find-matches disabled>Find matches & continue</button>
      </section>
      <section data-match-section hidden>
      <section data-step-panel="2" hidden>
        <h2>Matched features</h2>
        <p>Review the selected compendium sources. You can change a source before building.</p>
        <details><summary>Selections recorded in JSON</summary>
          <p>This reference includes choices even if Foundry asks for them in a different place. Listing a choice here does not mean it has been imported.</p>
          <ul data-json-selections></ul>
        </details>
        <details><summary>Advanced: source compendiums</summary>
        <p>Defaults follow D&D5e → Configure Sources for this world. You can adjust the search below without changing world settings. Only accessible Item compendiums are listed.</p>
        <div data-pack-list style="max-height:180px;overflow:auto"></div>
        <p><button type="button" data-match-origins>Find character matches</button></p>
        </details>
        <p data-match-status role="status" aria-live="polite"></p>
        <div data-match-results></div>
        <h3>Feats</h3>
        <p>Class-level feats are applied through native class advancements. Existing background and class grants are retained. Select sources for other feats below, or leave unresolved for review.</p>
        <div data-feat-results></div>
        <h3>Equipment and spells</h3>
        <p>Existing native grants are retained. Equipment defaults to the first exact-name match.</p>
        <div data-loadout-results></div>
      </section>
      <section data-step-panel="3" hidden>
        <h2>Missing or unknown features</h2>
        <p>Search the selected compendiums for a replacement, or leave Skip selected. Skipped entries receive a name-only item with the description “Needs GM Review” after native grants are checked. Class sources must be resolved to preserve levels and advancements.</p>
        <p data-missing-count role="status"></p>
        <div data-missing-results></div>
      </section>
      <section data-step-panel="4" hidden>
        <h2>Build character</h2>
        <p data-build-summary></p>
        <p>Create a new actor from the selected sources. Compatible JSON choices and fixed source grants fill native advancements automatically. HP uses the first-level maximum and averages thereafter, without rolling. Selected feats, equipment, and class spells import through their source documents. Unmatched choices, ability overrides, and other bonuses require review.</p>
        <button type="button" data-create-actor disabled>Create Character</button>
        <button type="button" data-open-draft hidden>Open draft character</button>
        <p data-creation-status role="status" aria-live="polite"></p>
      </section>
      <section data-step-panel="5" hidden>
        <h2>Character sheet & import log</h2>
        <p data-final-status></p>
        <button type="button" data-open-actor hidden>Open character sheet</button>
        <h3>Manual review items and replacements</h3>
        <ul data-review-report></ul>
        <h3>Advancement log</h3>
        <p>Manual entries identify prompts shown during the build; review the sheet for the final selections.</p>
        <ul data-choice-report></ul>
        <h3>Feat results</h3>
        <ul data-feat-report></ul>
        <h3>Equipment and spell results</h3>
        <ul data-loadout-report></ul>
      </section>
      </section>
      <footer><button type="button" data-previous>Back</button><button type="button" data-next>Continue</button></footer>
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
    root.querySelector("[data-missing-results]").replaceChildren();
  }

  _showStep(step = this.step) {
    const root = this.element;
    if (step !== this.step) {
      const content = root.querySelector(".window-content");
      if (content) content.scrollTop = 0;
    }
    this.step = step;
    for (const panel of root.querySelectorAll("[data-step-panel]")) panel.hidden = Number(panel.dataset.stepPanel) !== step;
    for (const button of root.querySelectorAll("[data-step]")) {
      const target = Number(button.dataset.step);
      button.setAttribute("aria-current", target === step ? "step" : "false");
      button.disabled = this.preparing || this.creation?.busy || this.searching
        || (this.creation ? target < 4 || (target === 5 && !this.creation.complete)
          : target === 5 || (target > 1 && !this.preview));
    }
    root.querySelector("[data-previous]").disabled = step === 1 || this.searching || this.preparing || Boolean(this.creation);
    const next = root.querySelector("[data-next]");
    next.hidden = step >= 4;
    next.disabled = this.searching || !this.preview || this.preparing;
    next.textContent = step === 1 ? "Review matches" : step === 2 ? "Review missing / unknown" : "Continue to builder";
    const rows = previewRows(this.preview);
    const missing = rows.filter(needsReview);
    const missingClasses = missing.filter(row => row.type === "class");
    root.querySelector("[data-missing-count]").textContent = missing.length
      ? `${missing.length} unresolved entries. Skipped entries will be marked Needs GM Review.` : "All entries have a source or a native advancement. No missing entries.";
    root.querySelector("[data-build-summary]").textContent = `${rows.filter(row => row.selectedUuid).length} source selections; ${missing.filter(row => row.type !== "class").length} potential review placeholders. Native grants are checked before adding placeholders.`;
    if (missingClasses.length) root.querySelector("[data-build-summary]").textContent += ` Choose a source for ${missingClasses.map(row => row.name).join(", ")} in Missing / unknown before creating.`;
    root.querySelector("[data-find-matches]").disabled = !this.character || this.searching || Boolean(this.creation);
    if (this.creation?.complete) root.querySelector("[data-final-status]").textContent = `Created ${this.creation.actor.name}. Review the sheet and the log below.`;
  }

  _showReviewReport() {
    const list = this.element.querySelector("[data-review-report]");
    list.replaceChildren();
    for (const entry of this.creation?.reviewLog ?? []) {
      const li = document.createElement("li");
      li.textContent = `${entry.name} — ${entry.detail}`;
      list.append(li);
    }
    for (const row of previewRows(this.preview).filter(row => row.selectedUuid && (row.manualSelection || !row.candidates.some(candidate => candidate.uuid === row.selectedUuid)))) {
      const source = this.preview.entries.find(entry => entry.uuid === row.selectedUuid);
      const li = document.createElement("li");
      li.textContent = `Replacement: ${row.name} → ${source?.name ?? row.selectedUuid} (${source?.packLabel ?? "source"}).`;
      list.append(li);
    }
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
    const missingContainer = root.querySelector("[data-missing-results]");
    missingContainer.replaceChildren();
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
      status.textContent = row.selectedUuid
        ? row.kind === "equipment" && row.candidates.length > 1
          ? `First of ${row.candidates.length} exact-name matches selected automatically. You can change the source below.`
          : "Single exact match selected automatically. Review the source and edition."
        : matchStatus;
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
        select.replaceChildren(new Option(row.type === "class" ? "Choose a class source (required)" : "Skip — create a Needs GM Review placeholder", ""));
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
        row.manualSelection = true;
        row.skip = !row.selectedUuid && row.type !== "class";
        uuid.textContent = row.selectedUuid ?? "";
        status.textContent = row.selectedUuid ? "Source selected for preview. No item has been added." : matchStatus;
        inspect.disabled = !row.selectedUuid;
        this._showStep();
      });
      const browse = document.createElement("button");
      browse.type = "button";
      browse.textContent = "Choose replacement from compendiums";
      browse.addEventListener("click", async () => {
        const preview = this.preview;
        browse.disabled = true;
        try {
          const types = new Set(row.types ?? [row.type]);
          const selected = await dnd5e.applications.CompendiumBrowser.selectOne({
            tab: row.kind === "equipment" ? "physical" : row.kind === "spell" ? "spells"
              : ({ class: "classes", subclass: "subclasses", race: "races", background: "backgrounds" }[row.type] ?? "feats"),
            filters: { locked: { documentClass: "Item", types }, initial: { documentClass: "Item", types } },
            selection: { min: 1, max: 1 }
          });
          if (!selected) return;
          const source = await fromUuid(selected);
          if (this.preview !== preview || this.preparing || this.creation) throw new Error("The preview changed or building started. Return to this step before choosing a replacement.");
          const entry = replacementEntry(row, source, game.packs.get(source?.pack), game.user);
          if (!preview.entries.some(candidate => candidate.uuid === entry.uuid)) preview.entries.push(entry);
          row.selectedUuid = entry.uuid;
          row.manualSelection = true;
          row.skip = false;
          fillOptions();
          uuid.textContent = entry.uuid;
          inspect.disabled = false;
          status.textContent = `Replacement selected: ${entry.name} (${entry.packLabel}). No actor or item has been changed.`;
          this._showStep();
        } catch (error) { ui.notifications.error(error.message); }
        finally { browse.disabled = Boolean(this.creation) || this.preparing; }
      });
      search.addEventListener("input", fillOptions);
      fillOptions();
      section.append(title, info, status, search, select, browse, uuid, inspect);
      (needsReview(row) ? missingContainer : row.kind === "feat" ? featContainer : row.kind ? loadoutContainer : container).append(section);
    }
    root.querySelector("[data-create-actor]").disabled = false;
  }

  _creationControls(root) {
    const locked = this.preparing || Boolean(this.creation);
    for (const control of root.querySelectorAll("[data-workshop-content] input, [data-workshop-content] textarea, [data-workshop-content] select, [data-workshop-content] button")) {
      if (control.matches("[data-create-actor], [data-open-actor], [data-open-draft], [data-step], [data-previous], [data-next]")) continue;
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
    root.querySelector("[data-open-draft]").hidden = !this.creation?.actor;
    this._showStep();
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
    root.querySelectorAll("[data-step]").forEach(button => button.addEventListener("click", () => this._showStep(Number(button.dataset.step))));
    root.querySelector("[data-previous]").addEventListener("click", () => this._showStep(Math.max(1, this.step - 1)));
    root.querySelector("[data-next]").addEventListener("click", () => {
      if (this.preview && !this.creation) {
        this._showMatches(root);
        this._showStep(Math.min(4, this.step + 1));
      }
    });
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
    const load = async fromPublic => {
      const controls = [...root.querySelectorAll("[data-load-json], [data-load-public], [data-character-id], [data-json-file], [data-json-text]")];
      if (controls.some(control => control.disabled)) return;
      const result = root.querySelector("[data-result]");
      controls.forEach(control => { control.disabled = true; });
      this.character = null;
      this._clearPreview(root);
      root.querySelector("[data-match-section]").hidden = true;
      result.textContent = fromPublic ? "Loading public character…" : "Reading JSON…";
      try {
        const file = root.querySelector("[data-json-file]").files[0];
        const pasted = root.querySelector("[data-json-text]").value.trim();
        if (!fromPublic && file && pasted) throw new Error("Choose either a file or pasted JSON. Clear the other input first.");
        if (!fromPublic && !file && !pasted) throw new Error("Choose a JSON file or paste the character JSON first.");
        const character = fromPublic ? await loadCharacter(idInput.value)
          : readCharacterJson(file ? await file.text() : pasted, idInput.value.trim() || undefined);
        const classes = character.classes.map(entry => `${entry.definition?.name ?? "Unknown class"} ${entry.level ?? "?"}`).join(", ");
        result.textContent = `Validated: ${character.name} — ${classes}. Character number: ${character.id}. No actor was created.`;
        this.character = character;
        this._showJsonSelections(root);
        this._showPacks(root);
        root.querySelector("[data-match-section]").hidden = false;
      } catch (error) {
        result.textContent = error instanceof SyntaxError ? "Invalid JSON. Save or copy the full JSON response, rather than the page URL." : error.message;
      } finally { controls.forEach(control => { control.disabled = false; }); }
      this._showStep(1);
      if (this.character) root.querySelector("[data-match-origins]").click();
    };
    root.querySelector("[data-load-public]").addEventListener("click", () => load(true));
    root.querySelector("[data-load-json]").addEventListener("click", () => load(false));
    root.querySelector("[data-find-matches]").addEventListener("click", () => root.querySelector("[data-match-origins]").click());
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
      this.searching = true;
      this._showStep(2);
      const controls = [...root.querySelectorAll("[data-source-pack], [data-load-json], [data-load-public]")];
      button.disabled = true;
      controls.forEach(control => { control.disabled = true; });
      status.textContent = "Searching compendium indexes…";
      try {
        const packs = accessibleItemPacks(game.packs).filter(pack => selected.includes(pack.collection));
        const { entries, errors } = await indexOriginPacks(packs);
        if (this.character !== character) return;
        this.preview = { rows: matchOrigins(characterOrigins(character), entries), feats: matchLoadout(characterFeats(character), entries), loadout: matchLoadout(characterLoadout(character), entries), entries, errors };
        for (const row of previewRows(this.preview)) row.skip = needsReview(row) && row.type !== "class";
        this._showMatches(root);
        status.textContent = `${this.preview.rows.length} origins, ${this.preview.feats.length} feats, and ${this.preview.loadout.length} equipment/spell entries reviewed across ${packs.length} compendiums. Review the sources below, then create the character.`
          + (errors.length ? ` Search incomplete — could not read: ${errors.map(error => `${error.label}: ${error.message}`).join("; ")}` : "");
      } catch (error) { status.textContent = error.message; }
      finally {
        this.searching = false;
        button.disabled = false;
        controls.forEach(control => { control.disabled = false; });
        this._showStep(2);
      }
    });
    root.querySelector("[data-open-actor]").addEventListener("click", () => this.creation?.actor?.sheet.render({ force: true }));
    root.querySelector("[data-open-draft]").addEventListener("click", () => this.creation?.actor?.sheet.render({ force: true }));
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
            character: this.character, entries: this.preview.entries, tasks, featTasks: feats, loadoutTasks: loadout, user: game.user, report: new Map(),
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
          applyReview: async actor => {
            this.creation.reviewLog = await createReviewItems(actor, previewRows(this.preview));
            this._showReviewReport();
            await actor.setFlag("ugmuls-character-workshop", "reviewLog", {
              items: this.creation.reviewLog,
              advancements: [...this.creation.choices.report.values()],
              replacements: previewRows(this.preview).filter(row => row.selectedUuid && (row.manualSelection || !row.candidates.some(entry => entry.uuid === row.selectedUuid)))
                .map(row => ({ name: row.name, uuid: row.selectedUuid }))
            });
          },
          progress: message => { status.textContent = message; }
        });
        root.querySelector("[data-result]").textContent = `Draft actor: ${this.creation.actor.name}.`;
        if (this.creation.complete) {
          const report = [...this.creation.choices.report.values()];
          const review = [...this.creation.loadoutReport.values()].filter(entry => entry.status === "review").length;
          const featReview = [...this.creation.featReport.values()].filter(entry => entry.status === "review").length;
          status.textContent = `Created ${this.creation.actor.name}. ${report.filter(entry => entry.kind === "json").length} advancement choices filled from JSON; ${report.filter(entry => entry.kind === "default").length} used defaults; ${report.filter(entry => entry.kind === "manual").length} used manual prompts. ${featReview} feats and ${review} equipment/spell entries need review. Check the reports and character sheet.`;
          this.creation.actor.sheet.render({ force: true });
          this._showStep(5);
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
    this._showReviewReport();
    this._creationControls(root);
  }
}

export function openSourceWindow() {
  return new CharacterSourceWindow().render({ force: true });
}
