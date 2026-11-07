import { PUBLIC_CHARACTER_SERVICE, parseCharacterId } from "./ddb-source.mjs";

/** Only accept public D&D Beyond avatar URLs; ignore backdrop decorations. */
export function characterPortrait(character) {
  const value = character.decorations?.avatarUrl;
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["www.dndbeyond.com", "dndbeyond.com", "media.dndbeyond.com"].includes(url.hostname)
      || url.username || url.password || url.port || !url.pathname.startsWith("/avatars/")) return null;
    // Remove DDB's small square thumbnail crop to use the original artwork.
    url.search = "";
    url.hash = "";
    return url.href;
  } catch { return null; }
}

export async function saveCharacterPortrait(actor, character, {
  fetchImpl = globalThis.fetch, picker = globalThis.foundry?.applications.apps.FilePicker.implementation,
  user = globalThis.game?.user, worldId = globalThis.game?.world.id
} = {}) {
  if (!characterPortrait(character)) return null;
  if (!actor.isOwner) throw new Error("You no longer own this character.");
  if (!user?.can("FILES_UPLOAD")) throw new Error("File upload permission is required to save a local portrait.");
  if (!/^[a-z0-9_-]+$/i.test(worldId ?? "") || !/^[a-z0-9_-]+$/i.test(actor.id ?? "")) throw new Error("Invalid portrait storage path.");
  const directory = `worlds/${worldId}/token-images`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  let blob;
  try {
    const res = await fetchImpl(`${PUBLIC_CHARACTER_SERVICE}/v1/characters/${parseCharacterId(character.id)}/portrait`, {
      credentials: "omit", redirect: "error", cache: "no-store", signal: controller.signal
    });
    if (!res.ok) throw new Error(`Portrait retrieval failed (HTTP ${res.status}).`);
    const type = res.headers.get("Content-Type")?.split(";")[0];
    if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("The portrait service returned an unsupported image.");
    blob = await res.blob();
    if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error("Portrait exceeds the local upload limit.");
  } finally { clearTimeout(timer); }
  const root = `worlds/${worldId}`;
  const listing = await picker.browse("data", root);
  if (!listing.dirs.some(path => path.replace(/\/$/, "") === directory)) await picker.createDirectory("data", directory);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[blob.type];
  const file = new File([blob], `${actor.id}-portrait.${extension}`, { type: blob.type });
  const uploaded = await picker.upload("data", directory, file, {}, { notify: false });
  if (!uploaded?.path?.startsWith(`${directory}/`) || uploaded.path.includes("..")) throw new Error("Foundry did not return the expected local portrait path.");
  if (!actor.isOwner) throw new Error("You no longer own this character.");
  await actor.update({ img: uploaded.path });
  return { name: "Character portrait", detail: `Saved local portrait: ${uploaded.path}. The actor now uses this file.` };
}
