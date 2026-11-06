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

Initial target: Foundry VTT v14 and D&D5e 6.0.6. Runtime compatibility and imports have not yet been verified in Foundry.

## Current status

Module foundation only: manifest and startup logging. No import UI or actor creation is implemented yet.

## Intended import workflow

1. Load and validate a JSON export; normalize it into character data and selected rules options.
2. Search accessible, selected compendiums and produce an import preview with source UUIDs, edition distinctions, missing entries, and ambiguous matches.
3. Resolve choices before actor creation. Keep preview read-only with respect to world documents.
4. Create a new character using matched source items and native advancements, applying character-specific values at the appropriate stage.
5. Show a result report describing applied choices and anything still requiring attention.

A representative JSON export is needed to implement and verify the first import path. Do not commit personal character exports by default.

## Reference project

The sibling `ugmuls-5-5e-automation` module contains relevant examples in `scripts/pc-creator.js`, `scripts/create-player.js`, and `scripts/sheet-compendium-browser.js`. Inspect the installed D&D5e implementation before adapting those patterns.
