import { characterServiceUrl, loadCharacter, readCharacterJson } from "./ddb-source.mjs";
import { CharacterSourceWindow, openSourceWindow } from "./source-window.js";

const MODULE_ID = "ugmuls-character-workshop";

Hooks.once("init", () => {
  game.settings.registerMenu(MODULE_ID, "loadCharacterJson", {
    name: "D&D Beyond Character JSON",
    label: "Load Character JSON",
    hint: "Open the character-service link, then load saved or pasted JSON for validation.",
    icon: "fa-solid fa-file-import",
    type: CharacterSourceWindow,
    restricted: false
  });
  game.modules.get(MODULE_ID).api = Object.freeze({
    characterServiceUrl,
    loadCharacter,
    readCharacterJson,
    openSourceWindow
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  console.info(`${MODULE_ID} | Character source loader and native origin creation ready.`);
});
