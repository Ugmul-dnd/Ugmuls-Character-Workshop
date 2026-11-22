# v0.2.1 — Beta

Character Workshop now includes **Create Player**, a guided builder for creating a level-one character from your installed compendium sources, alongside the existing D&D Beyond importer.

## New in this release

- Create Player is now part of Character Workshop, moved from Ugmul's 5.5e Automation.
- Resume an unfinished character from its Actors directory menu. Existing builder progress and world preferences carry forward.
- Add Item and Add Spell controls open filtered compendium browsing on standard and Tidy character sheets.
- Select multiple spells, or load missing unprepared class spells for eligible casters.
- Configure the sheet tools in Character Workshop's module settings.

The module remains independently usable. Source books are not included; users need access to the relevant installed compendiums.

## D&D Beyond importer

The importer remains a **beta, one-time import** intended to get a character ready for play in Foundry. Review missing matches, replacements, and the final sheet and import findings before play. Future character changes take place in Foundry; this is not ongoing synchronization with D&D Beyond.

Unknown content may receive a name-only **Needs GM Review** placeholder. The module does not create new gameplay automation or macros for unknown features, skills, or weapons.

## Requirements

Foundry VTT v14 and D&D5e 6.0.6 or later. Install the module using the release's module.json manifest, enable it in your world, and use **Actors → Create Player** or **Import D&D Beyond**.
