# Changelog

## Unreleased

- Restore missing unconditional fixed skill/tool grants inside the native choice-edit transaction after resolving overlaps. Add a Restore grant action for missing fixed proficiencies; preserve expertise and intentionally replaceable grants.
- Recognize a current proficiency's fixed advancement grant as a connected source even when the native advancement has no saved choice receipt. Keep missing receipts visible without falsely flagging the proficiency as unconnected.
- Fix starting-equipment previews and tool selections losing their source UUID after a compendium document loads. Equipment browser filters now index stored IDs while selection validation retains full source identity.
- Open the selected proficiency advancement directly when changing review choices, automatically restoring unrelated saved choices through the native advancement manager.
- Add Skills & Tools review to guided setup and the owned character sheet menu, with native source-choice editing.
- Compare current sheet skill/tool proficiencies with class, background, species, subclass, and feat advancement records. Highlight overlaps and proficiencies without a connected record; distinguish expertise and partial proficiency. Inspection does not change the character.

## 0.2.1 — Beta

- Move Create Player, wizard continuation, filtered sheet compendium browsing, batch spell selection, and missing class spell loading into Character Workshop. Existing wizard progress and world preferences carry forward.

## 0.2.0 — Beta

- Import public D&D Beyond characters by number or URL, or use saved/pasted JSON.
- Build characters from approved, accessible Foundry compendium sources.
- Review missing content and choose alternate sources through compendium search or the picker.
- Fill supported native advancement choices and import equipment and spells.
- Align missing proficiencies and save character portraits locally when permissions allow.
- Review ability-score, proficiency, and tool differences in the final log.
- Prefer revised-rule class/subclass sources, with legacy sources as fallbacks.
- Retain unresolved content as name-only Needs GM Review placeholders where appropriate.

This beta complements Ugmul's 5.5e Automation but works independently. It does not add macros or gameplay automation for unknown features, skills, or weapons. Review the imported character before play.

## 0.1.0

- Initial character import workflow.
