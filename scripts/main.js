import { characterServiceUrl, loadCharacter, readCharacterJson } from "./ddb-source.mjs";
import { CharacterSourceWindow, openSourceWindow } from "./source-window.js";

const MODULE_ID = "ugmuls-character-workshop";

Hooks.on("renderActorDirectory", (_app, html) => {
  const root = html?.[0] ?? html;
  if (game.system.id !== "dnd5e" || !root?.querySelector
    || !CONFIG.Actor.documentClass.canUserCreate(game.user)
    || root.querySelector("[data-ucw-import]")) return;
  const anchor = root.querySelector("[data-rsa-create-player]")
    ?? root.querySelector(".directory-header .header-actions");
  if (!anchor) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.ucwImport = "";
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-file-import";
  icon.setAttribute("aria-hidden", "true");
  button.append(icon, document.createTextNode(" Import D&D Beyond"));
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    openSourceWindow();
  });
  anchor.insertAdjacentElement("afterend", button);
});

Hooks.once("init", () => {
  game.settings.registerMenu(MODULE_ID, "loadCharacterJson", {
    name: "D&D Beyond Character JSON",
    label: "Load Character JSON",
    hint: "Load a public character by number, or import saved or pasted JSON for validation.",
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
