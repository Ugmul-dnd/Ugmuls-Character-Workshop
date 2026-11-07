# Ugmuls Character Workshop

**v0.2.0 · Beta**

Bring a public D&D Beyond character into Foundry VTT without rebuilding it by hand.

Ugmuls Character Workshop reads your character's exported choices and builds a new Foundry character using your world's approved, accessible compendium sources. It is designed to complement **Ugmul's 5.5e Automation**, but can be used independently.

## What it does

- Loads public D&D Beyond characters by character number or character-service URL. Saved or pasted JSON is also supported.
- Matches classes, subclasses, species, backgrounds, feats, equipment, and spells to existing compendium content.
- Uses Foundry's native character advancements and fills supported choices from the export, leaving manual prompts when needed.
- Lets you search compendiums and select replacements for missing or differently named content before building.
- Imports equipment and supported spell selections, including class-aware spell preparation.
- Aligns missing proficiencies and expertise, then compares ability scores, proficiencies, and tools with the export.
- Saves character artwork locally when file upload permission is available.
- Provides a final review log showing corrections, unresolved entries, and differences that need attention.

Revised-rule class and subclass sources take priority. Legacy sources, including Tasha's Cauldron of Everything, remain available as fallbacks. The module does not convert their rules to the revised edition.

## Beta status and limitations

**This is a one-time importer intended to get a character started. Review the completed sheet and import log before play.** Some source books, unusual character options, or differences between D&D Beyond and Foundry may still require manual choices or GM cleanup.

The module preserves the activities, effects, and advancements supplied by your selected compendium sources. It does **not** create new gameplay automation for features, skills, or weapons, and it includes no built-in macros or automation for unknown D&D Beyond content.

If you leave an unresolved entry at **Skip**, the importer may add a name-only feature or item with the description **Needs GM Review**. This is a placeholder for the GM to create, replace, or modify afterward; it does not implement the missing rules.

Other boundaries to keep in mind:

- This creates a **new actor**; it does not update or synchronize an existing character.
- Proficiency alignment adds missing entries without removing existing grants or downgrading expertise. It may not preserve every original advancement link, so level-down/rebuild behavior needs review.
- Ability overrides, conditional bonuses, and differences caused by items or effects may appear in the final comparison for manual review.
- HP uses the first-level maximum and averages for later levels; it does not roll HP.
- Portrait saving imports the artwork, not a cropped or framed token. A tool such as Tokenizer can handle that afterward.

## Requirements

- **Foundry VTT v14**
- **D&D5e system 6.0.6 or later**
- Installed compendium sources containing the content you want to use
- Permission to view those compendiums and create actors
- File upload permission to save portraits locally

Source books are separate purchases and are **not included**. Players can only import content from compendiums they can access; GMs may need to grant Observer access to the relevant packs.

Public character retrieval and portrait downloading use the shared import service. No D&D Beyond login, Cloudflare account, or personal token is required. Availability depends on that service and D&D Beyond; file/paste import remains an alternative. If local portrait saving fails, the hosted portrait is retained and the failure is reported.

## Installation

In Foundry's Setup screen, open **Add-on Modules → Install Module**, paste this into **Manifest URL**, and install:

```text
https://github.com/Ugmul-dnd/Ugmuls-Character-Workshop/releases/latest/download/module.json
```

Enable **Ugmuls Character Workshop** in your world. Configure the sources you want to use under **D&D5e → Configure Sources**.

## Import a character

1. Open **Actors → Import D&D Beyond**, or **Configure Settings → Ugmuls Character Workshop → Load Character JSON**.
2. Enter a public character number or character-service URL and select **Load public character**. Alternatively, load a JSON file or paste its contents.
3. Review **Missing / unknown** entries. Search for a replacement, open the compendium picker, or leave an entry at Skip. The optional **Matched features** tab lets you inspect other selected sources.
4. Open **Build character** and select **Create Character**. Complete any remaining native prompts.
5. Review **Sheet & log**, resolve any Needs GM Review placeholders, and check the final character before play.

If you cancel an advancement, keep the workshop window open and use **Continue Character** to resume the same draft. Closing the window or reloading ends that import session; the draft actor remains in the world.

## Feedback

Please report problems through [GitHub Issues](https://github.com/Ugmul-dnd/Ugmuls-Character-Workshop/issues). Include the module, Foundry, and D&D5e versions, the affected feature, what happened, and any relevant console error. A public character ID can help reproduce an import issue; avoid posting private character exports or credentials.

See the [v0.2.0 beta release notes](RELEASE-NOTES.md) and [changelog](CHANGELOG.md) for a summary of the current release.
