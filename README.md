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

Initial target: Foundry VTT v14 and D&D5e 6.0.6. JSON loading, source matching, actor creation, automatic native advancement choices, equipment, and spell imports have been tested by the user. The feat preview, per-level class feat/ASI mapping, and species ancestry alias matching still require live verification.

## Current status

JSON loading, class/origin/feat/equipment/spell matching, actor creation through native advancements, and selected feat/equipment/class spell import. Missing or unsupported content remains a reported review item; this is not yet a complete character importer.

### Load JSON in Foundry

Open **Configure Settings → Ugmuls Character Workshop → Load Character JSON**. Enter a public D&D Beyond character number (or character-service URL) and click **Load public character**. Every installation uses the shared HTTPS workshop service; users need no Cloudflare account, token, local proxy, or special localhost configuration. The service retrieves public characters only. Compendium access and actor creation still follow the user's Foundry permissions.

The shared service at `https://ugmuls-ddb-public-proxy.anthony-e-colbert.workers.dev` handles D&D Beyond's browser CORS restriction. Loading sends it the character number without browser credentials. Successful responses may be cached for 60 seconds; shared limits can require waiting before retrying. Its availability depends on the maintained service and D&D Beyond's public endpoint.

For manual import, open the generated character JSON link, choose a saved JSON file or paste its contents, then click **Load and validate JSON**. The optional number checks that the manual export belongs to that character. This remains available if the service is unavailable. Both loading methods use the same validation and source preview, do not write world documents, and do not persist character JSON in settings. The separate **Create Character** action creates a world actor.

### Five-step builder

Local portrait saving uses the approved, deployed portrait Worker route described in `cloudflare/ddb-public-proxy/PORTRAIT-DEPLOYMENT-REVIEW.md`. New imports save artwork through Foundry's FilePicker in `worlds/<world-id>/token-images/`, using an actor-ID filename, and switch the portrait to that local file. File upload permission is required. A failed download/upload is logged and leaves the hosted portrait in place. No Tokenizer dependency is required.

After alignment and item import, a read-only final audit compares the sheet's ability scores and proficiencies/tools with the JSON. Differences appear in Sheet & log and the actor's saved module review log. Ability expectations include base scores, bonusStats, recorded score increases, and overrideStats; conditional or unsupported score data is flagged for manual comparison. The audit reports missing/extra skills and tools, expertise differences, and unmapped proficiency names without modifying the actor. These are review findings, since effects or source differences may explain a mismatch.

Unresolved skill/tool proficiency-only steps no longer block import. The builder keeps unambiguous native selections, skips the remaining slots, and adds missing JSON proficiencies directly to the completed sheet after native advancements and item imports. Reconciliation never removes extra proficiencies or downgrades expertise; it intentionally does not reconstruct source advancement links. Corrections are shown in the final log and saved on the actor. Unknown or ambiguous native proficiency keys are logged for GM review rather than replaced with guessed tools. Other choices, including languages, resistances, spells, and feats, retain their normal native handling.

1. **Load JSON** — load by public character number, file, or pasted JSON. Matching starts automatically after validation.
2. **Matched features** — review selected origins, feats, equipment, and spells. Source defaults follow the world; optional source controls are collapsed under Advanced.
3. **Missing / unknown** — search the selected compendium indexes for compatible replacement sources, or leave Skip selected. Searching and selecting sources never mutate actors.
4. **Build character** — explicitly create a new actor and run the existing native advancement flow. Manual prompts and cancel/continue behavior remain available.
5. **Sheet & log** — open the sheet and review advancement prompts, manual source selections, placeholders, and import results. The review log is also saved on the actor under the module's reviewLog flag.

Skipped non-class entries receive an inert name-only placeholder with description **Needs GM Review**, after checking for a matching native grant. These contain no exported descriptions, effects, activities, or advancements. Equipment uses a compatible physical Item type, spells use an unprepared Spell item, and unresolved origins/feats use a Feature review marker. Class sources are required so native levels and advancement relationships remain valid. Placeholders are marked for review, and retries reuse them. This explicit review-marker workflow is the exception to the module's normal source-only import policy.

### Preview compendium matches

Class and subclass exact-name matches prioritize sources marked 2024, then other non-Tasha’s sources with unspecified rules, then 2014 sources, and finally Tasha’s Cauldron. A unique candidate at the best priority is selected; ties still require review. All candidates remain available for manual selection, and legacy fallbacks are labeled. This preference does not alter spell, equipment, feat, species, or background searches. It does not convert legacy subclasses to revised rules.

After loading JSON, the source compendiums default to the world's **D&D5e → Configure Sources** choices. This follows D&D5e's `packSourceConfiguration` behavior: a pack is included unless explicitly disabled, while inaccessible and non-Item packs are excluded. Defaults are read again each time JSON is loaded. You can adjust the checkboxes for this search without changing world settings. Matching starts automatically; use **Advanced → Find character matches** to repeat it after adjusting sources. The preview includes each class, any selected subclasses, species, background, inventory entries, and spells. Multiclass characters receive separate class and subclass rows.

Exact-name matches are restricted to the appropriate Item type. Each candidate displays its compendium, source book, and rules edition where supplied. A single exact match is selected automatically and can be changed or cleared. Multiple origin, feat, and spell matches remain unresolved for explicit selection; equipment defaults to its first exact match. D&D Beyond numeric source IDs are informational; they are not treated as Foundry book or edition identifiers.

Use each row's alternative-name search to find entries with different names, such as a legacy suffix. Select an entry and use **View source item** to inspect it. Missing entries remain visible in Missing / unknown. Leaving Skip selected creates only the requested name and Needs GM Review marker after native grants are reconciled. Failed compendium reads are reported as an incomplete search. Changing the compendium selection clears the previous preview.

Selections remain in memory in the window and are discarded when it closes. Feats within and outside native advancements use these same selected compendiums.

### Create a character

Resolve class sources and review skipped entries, then open Build character and click **Create Character**. The module checks creation permissions, source access, class levels, and subclass/class compatibility before creating a new actor. Existing actors are not updated by this action.

The actor receives the JSON name and six base ability scores. Class items are added at the JSON levels, starting with the class marked as the starting class. Background, species, and subclasses use the selected source documents and native advancement managers. Already-granted source items are recognized to avoid adding the selected subclass twice. Source grants, activities, effects, and advancements are preserved.

Compatible choices are filled through native advancement application data rather than writing final proficiencies or recreating rules items. This covers skill/tool/language choices that uniquely satisfy native available slots, size, origin/granted-feat ability increases matching the source's budget and restrictions, and feat/subclass Item Choice selections matching accessible sources and native prerequisites. D&D5e's dedicated Subclass advancement also uses the subclass selected in the preview. Fixed native grants, sole source size options, and item-choice steps without remaining selections run automatically. Selected feat names come from D&D Beyond's choice IDs and definitions; feats are searched in the same selected compendium indexes.

Expand **Selections recorded in JSON** after loading to review languages, racial traits, subclasses, recorded feats, and selected options, including choices that Foundry places on different native steps. This is a reference list, not a claim that every listed choice has been imported.

Choices are scoped to the matching class, subclass, species, background, or granted feature/feat, including named racial traits such as Specialized Design. A skill selected for a subclass is not treated as a class selection. Language-only steps may reconcile the character's known JSON languages across origins because different source books place those steps on species or backgrounds; native availability still excludes already-known languages and ambiguous selections remain manual. Background ability increases stored by D&D Beyond on its associated ability-improvement feat are attributed to that background. Multiple same-name feat candidates require manual review unless the selected source's configured pool identifies a unique eligible entry. Short and full Item UUIDs are compared consistently. Configured pool entries follow native checkbox eligibility and prerequisite checks; external selections additionally pass native drop filters.

When a default proficiency step has recognized JSON selections but an unavailable choice, the importer prefills the recognized selections through the native advancement on its draft clone, then leaves the remaining slot manual. The report names the unavailable choice. For example, Skilled can prefill Animal Handling and Athletics while flagging Bowls if the installed system does not offer that tool. No replacement tool or proficiency is fabricated.

Named class-feature advancements keep their own selections separate from other features. Expertise and upgrade steps use recorded expertise, not ordinary proficiencies. Trait matching considers only the native step's eligible slot pools, so unrelated native options cannot block a partial import. For the supplied ranger, Deft Explorer records Perception expertise, Common Sign Language, and Vedalken; Skilled records Sleight of Hand, Shawm, and Birdpipes. Vedalken and Birdpipes are absent from the default installed system choices and require review rather than substitution.

D&D Beyond entries tagged `__DISGUISE_FEAT` are listed separately under hidden reference entries and excluded from feat search/import. The supplied export's Dark Bargain entry has this tag; it is not treated as an ordinary selected feat or automatically added to the actor.

Warlock invocations stored in `options.class` are included in the feat preview as Invocation rows. Recorded level labels scope their native selection to the appropriate advancement level. A spell-qualified name such as Agonizing Blast (Eldritch Blast) can match the base invocation source; automatic alias selection is limited to the native invocation pool. Nested choices such as Lessons of the First Ones → Tough use the exported parent choice link. Invocations are reconciled after class advancements and are never added as bonus feats to bypass a missing class choice. Ambiguous/replacement choices and spell-specific configuration remain native prompts.

Replacement-only ItemChoice steps automatically use No Replacement across classes, including spell choices, and log that default. New selections at the same level still run normally; an already-started manual replacement is not undone. Vestige Spells maps a recorded domain option such as War Domain Spells to Vestige Spells (War) only within that feature's authored native pool. Background ASIs recognize both Ability Score Improvement(s) and Ability Score Increase(s) synthetic entries; they still obey the selected background's allowed abilities and native point budget.

Weapon mastery steps read the selected weapons from D&D Beyond's Weapon Mastery feat choices and weapon-mastery modifiers, then select the matching native weapon proficiency/mastery keys. Material variants emitted by D&D Beyond do not become extra copies of a base-weapon selection. The mastery rules and properties remain defined by Foundry source items.

HP automatically takes the native maximum at the first level of the original class and the native average at all other levels, including the first level of additional classes. No HP rolls are made. Constitution and source bonuses remain handled by D&D5e's native HP advancement.

Class feats and ASIs are mapped to their exact exported class feature and level when unambiguous. Repeated feat definitions whose modifiers cannot be attributed to a specific level remain manual. Spell choices within native advancements, item replacement, unknown names, and ambiguous/incompatible choices remain native prompts. Complete those using the character's choices on D&D Beyond. Base scores are set before advancements; final scores are not overwritten afterward, so native ability improvements are not doubled. JSON bonusStats and overrideStats are not applied and require review.

The workshop reports **From JSON**, **From source**, **Default** (HP policy), and **Manual prompt** for advancement steps. Manual entries record that a prompt was needed; they do not mean a choice you subsequently completed is still missing. Automation is scoped to each import manager and its dynamically granted feature flows; no global advancement methods are patched.

Canceling a native prompt pauses creation and retains the draft. **Continue Character** resumes that same actor in the same workshop window without repeating completed origins; **Open draft character** opens its sheet. Source controls are locked once creation starts. Keep this window open to continue a paused import. Closing it or reloading Foundry ends the in-memory session; the actor remains and can be completed through its sheet. Import flags record its source selections and progress but do not yet provide a cross-session resume UI.

On completion the sheet opens. Review the reports, feats, class levels, subclass, species, background, abilities, HP, equipment state, and spell preparation. Currency, appearance, and other character details are not imported in this pass. Native source advancements may grant some of these themselves.

### Feats and species ancestry

The **Feats** preview lists exported feats with source selection and class-level attribution where available. Class ASI steps use the selected feat source, native prerequisites, and native feat-granted advancements. A plain Ability Score Improvement is applied as the native class ASI rather than an extra rules item. Distinct modifier IDs preserve separate +1 assignments to the same ability; duplicate records of the same modifier are counted once.

Background ability-improvement records are marked as handled by the native background advancement and need no separate compendium feat. Already-granted feats such as a background's origin feat are retained, with no second copy or bonus application. Additional matched feats are added through native advancement managers after origins and before equipment/spells so their spell grants can also be retained. Canceling an extra feat prompt pauses the same draft. Missing class-level feats are flagged rather than added as free bonus feats after the class advancement.

Species options can differ in display names: D&D Beyond may export `Hill’s Tumble (Hill Giant)` while the selected Goliath source offers `Hill's Tumble`. The importer accepts the unqualified name only when it identifies a unique entry in that species' configured native choice pool. This is not a general fuzzy-name or cross-edition substitution.

### Equipment and spells

Review source choices under **Equipment and spells** before creating the actor. Equipment matching uses physical Item types; spell matching also requires the exported spell level. A single exact match defaults automatically. Alternative-name searches can resolve differences such as renamed gear. Missing or ambiguous selections can remain unresolved: they are skipped and reported rather than blocking origin creation or producing replacement content.

Equipment copies the source document and applies JSON quantity, equipped state, and attunement where supported by that source type. Source effects, activities, charges, and attunement rules are preserved. Separate JSON inventory rows remain separate items. Existing matching source inventory can be reconciled to the JSON quantity rather than added again. Valid JSON container relationships are linked to actor container IDs after item creation; missing, cyclic, overly deep, or non-container parents leave items at top level and are reported. Custom equipment requires selection of an existing source entry. Container quantities other than one require review.

Equipment defaults to the first compatible exact-name match in the search results, including when several selected compendiums contain the same name. The preview identifies that default and keeps all candidates available for changing the source. Multiple feat, spell, and origin matches still require a selection.

Class spells copy existing spell sources and receive a native class association, casting method/ability, and preparation state from the JSON. Cantrips are always prepared. Already-granted class/subclass spells retain their native activities, preparation, free-use resources, and advancement links. Multiple casting entries for a feature spell are combined for reconciliation; the importer does not create duplicate free-use/slot copies of a spell already represented by a native grant. Separate spellcasting classes retain their own associations.

Preparation is class-aware: learned-spell metadata (`spellPrepareType: null`, learning style 1, not knowing the full list, and an empty prepared-limit table) makes selected class spells with `countsAsKnownSpell: true` ready to cast in Foundry. It does not mark them always prepared. This matches the inspected Warlock and Sorcerer exports. Wizard spellbook and Cleric-style explicit preparation flags remain unchanged, including unprepared spellbook entries. Bard/Druid behavior follows their exported metadata; those classes have not yet been checked with live examples. Unknown metadata preserves explicit flags. No full class spell catalog is inferred or imported from `knowsAllSpells` alone, and feature/item grants retain native rules.

Explicit feature spell choices, including Magic Initiate and Savant, can fill native ItemChoice steps using their component-scoped exported spells. Native level, spell-list, school, and permission checks still apply. Uniquely selected preview sources are respected. A complete, unambiguous set is required; ordinary class spellbook acquisition and ambiguous later-level feature choices remain manual. Native grants preserve their preparation and free-use resources. Spell-grant ability choices use exported spell abilities first, then prior choices on the same source item, recorded racial ability options, and finally one unambiguous class casting ability.

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

Supplied character-service responses have been inspected as references. JSON file/paste validation, source defaults, scrolling, source matching, actor creation, automatic advancement selections, equipment, and spell imports have been confirmed by the user in Foundry. Feat preview/class-level mapping and species ancestry alias matching still need live testing. Do not commit personal character exports by default.

## Reference project

The sibling `ugmuls-5-5e-automation` module contains relevant examples in `scripts/pc-creator.js`, `scripts/create-player.js`, and `scripts/sheet-compendium-browser.js`. Inspect the installed D&D5e implementation before adapting those patterns.
