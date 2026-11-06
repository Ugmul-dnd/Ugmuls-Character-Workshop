# Ugmuls Character Workshop

A standalone Foundry VTT module for building D&D5e characters from D&D Beyond JSON exports using installed source books and compendiums.

## Core approach

- Treat D&D Beyond JSON as a record of character identity, ability scores, levels, equipment, spells, and selected options.
- Resolve classes, subclasses, species, backgrounds, feats, features, spells, and equipment to existing Foundry compendium documents.
- Create the actor's embedded items from those source documents, preserving their activities, effects, advancements, and source identity. Do not reconstruct rules content from D&D Beyond descriptions.
- Use native D&D5e advancements for grants and choices. Reconcile those grants before adding other items to avoid duplicates or applying bonuses twice.
- Report missing entries and ambiguous matches for review. Never silently fabricate replacement rules content or choose between conflicting editions.
- Keep this module independent of Ugmuls 5.5e Automation. That project is a reference, not a dependency.

## Development environment

This folder is installed directly in the user's test Foundry environment. Local runtime edits are available after reloading Foundry; manifest changes may require restarting Foundry. Treat world document changes as persistent.

Initial target: Foundry VTT v14 and D&D5e 6.0.6. JSON loading, source matching, actor creation, and automatic native advancement choices have been tested by the user. Equipment and spell imports still require live verification.

## Current status

JSON loading, class/origin/equipment/spell matching, actor creation through native advancements, and selected equipment/class spell import. Missing or unsupported content remains a reported review item; this is not yet a complete character importer.

### Load JSON in Foundry

Open **Configure Settings → Ugmuls Character Workshop → Load Character JSON**. Enter the character number, follow the generated link, then save the JSON response or copy its contents. Choose the saved file or paste the JSON and click **Load and validate JSON**. The optional number also checks that the loaded file belongs to the requested character.

D&D Beyond's CORS policy blocked direct fetching from the user's Foundry browser during testing. Opening the endpoint in a browser tab and loading its saved or copied response is the supported workflow. Loading and previewing JSON do not write world documents or persist the JSON in module settings. The separate **Create Character** action creates a world actor.

### Preview compendium matches

After loading JSON, the source compendiums default to the world's **D&D5e → Configure Sources** choices. This follows D&D5e's `packSourceConfiguration` behavior: a pack is included unless explicitly disabled, while inaccessible and non-Item packs are excluded. Defaults are read again each time JSON is loaded. You can adjust the checkboxes for this search without changing world settings. Click **Find character matches**. The preview includes each class, any selected subclasses, species, background, inventory entries, and spells. Multiclass characters receive separate class and subclass rows.

Exact-name matches are restricted to the appropriate Item type. Each candidate displays its compendium, source book, and rules edition where supplied. A single exact match is selected automatically and can be changed or cleared. Multiple matches remain unresolved for explicit selection. D&D Beyond numeric source IDs are informational; they are not treated as Foundry book or edition identifiers.

Use each row's alternative-name search to find entries with different names, such as a legacy suffix. Select an entry and use **View source item** to inspect it. Missing entries stay unresolved; no content is generated. Failed compendium reads are reported as an incomplete search. Changing the compendium selection clears the previous preview.

Selections remain in memory in the window and are discarded when it closes. Feat choices within native advancements use these same selected compendiums. Separate review of feats outside advancements remains a future step.

### Create a character

Resolve every origin row, then click **Create Character**. The module checks creation permissions, source access, class levels, and subclass/class compatibility before creating a new actor. Existing actors are not updated by this action.

The actor receives the JSON name and six base ability scores. Class items are added at the JSON levels, starting with the class marked as the starting class. Background, species, and subclasses use the selected source documents and native advancement managers. Already-granted source items are recognized to avoid adding the selected subclass twice. Source grants, activities, effects, and advancements are preserved.

Compatible choices are filled through native advancement application data rather than writing final proficiencies or recreating rules items. This covers skill/tool/language choices that uniquely satisfy native available slots, size, origin/granted-feat ability increases matching the source's budget and restrictions, and feat/subclass Item Choice selections matching accessible sources and native prerequisites. D&D5e's dedicated Subclass advancement also uses the subclass selected in the preview. Fixed native grants, sole source size options, and item-choice steps without remaining selections run automatically. Selected feat names come from D&D Beyond's choice IDs and definitions; feats are searched in the same selected compendium indexes.

Expand **Selections recorded in JSON** after loading to review languages, racial traits, subclasses, recorded feats, and selected options, including choices that Foundry places on different native steps. This is a reference list, not a claim that every listed choice has been imported.

Choices are scoped to the matching class, subclass, species, background, or granted feature/feat, including named racial traits such as Specialized Design. A skill selected for a subclass is not treated as a class selection. Language-only steps may reconcile the character's known JSON languages across origins because different source books place those steps on species or backgrounds; native availability still excludes already-known languages and ambiguous selections remain manual. Background ability increases stored by D&D Beyond on its associated ability-improvement feat are attributed to that background. Multiple same-name feat candidates require manual review unless the selected source's configured pool identifies a unique eligible entry. Short and full Item UUIDs are compared consistently. Configured pool entries follow native checkbox eligibility and prerequisite checks; external selections additionally pass native drop filters.

When a default proficiency step has recognized JSON selections but an unavailable choice, the importer prefills the recognized selections through the native advancement on its draft clone, then leaves the remaining slot manual. The report names the unavailable choice. For example, Skilled can prefill Animal Handling and Athletics while flagging Bowls if the installed system does not offer that tool. No replacement tool or proficiency is fabricated.

Weapon mastery steps read the selected weapons from D&D Beyond's Weapon Mastery feat choices and weapon-mastery modifiers, then select the matching native weapon proficiency/mastery keys. Material variants emitted by D&D Beyond do not become extra copies of a base-weapon selection. The mastery rules and properties remain defined by Foundry source items.

HP automatically takes the native maximum at the first level of the original class and the native average at all other levels, including the first level of additional classes. No HP rolls are made. Constitution and source bonuses remain handled by D&D5e's native HP advancement.

Per-level class ASIs, spell choices, item replacement, unknown names, and ambiguous/incompatible choices remain native prompts. Complete those using the character's choices on D&D Beyond. Base scores are set before advancements; final scores are not overwritten afterward, so native ability improvements are not doubled. JSON bonusStats and overrideStats are not applied and require review.

The workshop reports **From JSON**, **From source**, **Default** (HP policy), and **Manual prompt** for advancement steps. Manual entries record that a prompt was needed; they do not mean a choice you subsequently completed is still missing. Automation is scoped to each import manager and its dynamically granted feature flows; no global advancement methods are patched.

Canceling a native prompt pauses creation and retains the draft. **Continue Character** resumes that same actor in the same workshop window without repeating completed origins; **Open draft character** opens its sheet. Source controls are locked once creation starts. Keep this window open to continue a paused import. Closing it or reloading Foundry ends the in-memory session; the actor remains and can be completed through its sheet. Import flags record its source selections and progress but do not yet provide a cross-session resume UI.

On completion the sheet opens. Review both reports, class levels, subclass, species, background, abilities, HP, equipment state, and spell preparation. Feats outside native advancement selections, currency, appearance, and other character details are not imported in this pass. Native source advancements may grant some of these themselves.

### Equipment and spells

Review source choices under **Equipment and spells** before creating the actor. Equipment matching uses physical Item types; spell matching also requires the exported spell level. A single exact match defaults automatically. Alternative-name searches can resolve differences such as renamed gear. Missing or ambiguous selections can remain unresolved: they are skipped and reported rather than blocking origin creation or producing replacement content.

Equipment copies the source document and applies JSON quantity, equipped state, and attunement where supported by that source type. Source effects, activities, charges, and attunement rules are preserved. Separate JSON inventory rows remain separate items. Existing matching source inventory can be reconciled to the JSON quantity rather than added again. Valid JSON container relationships are linked to actor container IDs after item creation; missing, cyclic, overly deep, or non-container parents leave items at top level and are reported. Custom equipment requires selection of an existing source entry. Container quantities other than one require review.

Class spells copy existing spell sources and receive a native class association, casting method/ability, and preparation state from the JSON. Cantrips are always prepared. Already-granted class/subclass spells retain their native activities, preparation, free-use resources, and advancement links. Multiple casting entries for a feature spell are combined for reconciliation; the importer does not create duplicate free-use/slot copies of a spell already represented by a native grant. Separate spellcasting classes retain their own associations.

Feature, species, feat, and item spells without a corresponding native grant are flagged for review. Their limited-use casting rules are not invented from raw JSON. The equipment/spell report identifies imported, updated, retained, and unresolved entries. Retrying a failed item phase reuses workshop-marked items on the same draft instead of creating duplicates.

Run automated checks with `node --test tests/*.test.mjs`.

The source loader accepts a character number or a full character-service URL and always requests `includeCustomItems=true`. Custom items remain source data; this does not authorize creating substitute rules items.

After enabling the module and reloading Foundry, the loader is available through its API:

```js
const workshop = game.modules.get("ugmuls-character-workshop").api;
const character = await workshop.loadCharacter("YOUR_CHARACTER_NUMBER");
```

This only returns character data in memory; it does not create or change actors. The loader uses no D&D Beyond login credentials. Direct loading is subject to the service's CORS policy; use the validation window above when blocked. File contents can also be validated using `workshop.readCharacterJson(jsonText)`.

## Intended import workflow

1. Load and validate a JSON export; normalize it into character data and selected rules options.
2. Search accessible, selected compendiums and produce an import preview with source UUIDs, edition distinctions, missing entries, and ambiguous matches.
3. Resolve choices before actor creation. Keep preview read-only with respect to world documents.
4. Create a new character using matched source items and native advancements, applying character-specific values at the appropriate stage.
5. Show a result report describing applied choices and anything still requiring attention.

Supplied character-service responses have been inspected as references. JSON file/paste validation, source defaults, scrolling, source matching, actor creation, and automatic advancement selections have been confirmed by the user in Foundry. Equipment and spell imports still need live testing. Do not commit personal character exports by default.

## Reference project

The sibling `ugmuls-5-5e-automation` module contains relevant examples in `scripts/pc-creator.js`, `scripts/create-player.js`, and `scripts/sheet-compendium-browser.js`. Inspect the installed D&D5e implementation before adapting those patterns.
