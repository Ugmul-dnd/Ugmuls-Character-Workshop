const MODULE_ID = "ugmuls-character-workshop";

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  console.info(`${MODULE_ID} | Module foundation loaded. Character import is not implemented yet.`);
});
