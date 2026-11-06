# Project guidance

- This is Ugmuls Character Workshop, a standalone module. Do not change or introduce a dependency on the sibling 5.5e automation module unless explicitly requested.
- Build characters from D&D Beyond JSON with existing installed compendium content. Do not generate substitute feats, equipment, spells, features, activities, or effects from exported descriptions.
- Preserve native D&D5e document behavior, source identities, and advancement relationships. Avoid duplicate grants and double-applied bonuses.
- Expose missing, ambiguous, and edition-conflicting matches. Do not silently guess or fabricate content.
- Keep analysis and import previews free of world mutations. Validate permissions before creating actors or embedded items. Default to a new actor; existing-actor updates require an explicit workflow.
- This directory is a live test installation. Do not mutate test-world actors or compendiums merely to verify startup. Report automated checks separately from observed in-game testing.
- Initial environment is Foundry v14 with D&D5e 6.0.6. Read local system code when integrating version-sensitive APIs.
- Keep personal JSON exports out of version control. Use anonymized fixtures for importer tests.
