# v0.2.0 — Beta

Ugmuls Character Workshop supplements Ugmul’s 5.5e Automation with a guided, one-time import of public D&D Beyond characters into Foundry VTT. It remains independently installable and does not require the automation module.

## What it does

- Loads public characters by ID or character-service URL, with saved/pasted JSON as an alternative.
- Builds from your world’s approved, accessible compendium sources, preserving native source documents and advancements.
- Lets you search for replacements when exported feats, items, or abilities have no direct compendium match.
- Imports supported recorded choices, equipment and spells, aligns missing proficiencies, and saves character artwork locally when upload permissions allow.
- Reports differences in ability scores, proficiencies, expertise, and tools for GM review.
- Prioritizes revised-rule class/subclass sources, with legacy and Tasha’s content available as fallbacks.

## Beta limitations and review

This importer is intended to get a character started, not guarantee a finished, fully automated character. Review the sheet, source selections, and final log before play. Ambiguous or unsupported choices may still need manual input.

It does not add new gameplay automation for features, skills, or weapons. No built-in macros or automation for unknown skills/features exported by D&D Beyond are included. Unknown content may be represented by a name-only placeholder with the description **Needs GM Review**, for the GM to create or modify afterward. No rules, macros, effects, or activities are generated from exported descriptions.

Source books are separate purchases and are not included. The importing user must have access to the relevant compendiums. Public retrieval depends on the shared Cloudflare service and D&D Beyond availability; private characters are unsupported. File upload permission is required for local portraits. Failed portrait downloads retain the hosted image and report the failure.

Direct proficiency alignment is additive and may not retain every proficiency’s original advancement link. Existing extras and expertise are not removed. The final audit reports discrepancies for review. This is a new-actor workflow; updating existing actors and reliable level-down reconstruction are outside this release.

## Compatibility and release assets

- Foundry VTT v14; D&D5e 6.0.6 or later.
- Release assets: `module.json` and `ugmuls-character-workshop.zip` under tag `v0.2.0`.
- The Foundry ZIP includes runtime scripts/styles, the manifest, license, README, and these notes. Worker source, dependencies, tests, development tools, and personal exports are excluded.
- Packaging command from PowerShell: `./tools/package-release.ps1`.

This release is prepared locally. Publishing the GitHub release is a separate action.
