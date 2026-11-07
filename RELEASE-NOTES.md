# v0.2.0 — Beta

**Import a public D&D Beyond character using the compendium content already available in your Foundry world.**

Ugmuls Character Workshop is a companion to **Ugmul's 5.5e Automation** that helps get characters into Foundry without rebuilding them by hand. It can also be used independently.

## Included in this beta

- Public character loading by number or URL, plus file/paste JSON import.
- Source matching for classes, subclasses, species, backgrounds, feats, equipment, and spells.
- Compendium search and replacement selection for content without a direct match.
- Native advancement assistance with manual prompts where needed.
- Supported spell selections and preparation, proficiency alignment, and local character artwork.
- A final review log comparing ability scores, proficiencies, and tools with the export.
- Revised-rule class/subclass source priority, with legacy and Tasha's content available as fallbacks.

## Before you use it

This is a **beta, one-time import tool**, not a guarantee of a finished or fully automated character. Review the completed sheet and log before play. Some choices and differences between source books still need GM attention.

The importer does **not** implement new gameplay automation for features, skills, or weapons. It contains no built-in macros or automation for unknown D&D Beyond content. Existing source activities and effects are preserved. An unresolved entry may become a name-only placeholder labeled **Needs GM Review**, for the GM to create or modify afterward.

This release creates new actors; it does not update or synchronize existing characters. Direct proficiency alignment may not retain every original advancement link. Legacy subclasses are not converted to revised rules.

## Requirements and getting started

Requires **Foundry VTT v14**, **D&D5e 6.0.6 or later**, and access to the compendium sources you want to use. Source books are not included. File upload permission is needed for local portraits.

Enable the module and open **Actors → Import D&D Beyond**. Load your public character, review missing entries, run the builder, and check **Sheet & log**. Keep the window open if you pause and want to continue the same draft.

See the [README](README.md) for installation and usage instructions. Report issues on [GitHub](https://github.com/Ugmul-dnd/Ugmuls-Character-Workshop/issues).
