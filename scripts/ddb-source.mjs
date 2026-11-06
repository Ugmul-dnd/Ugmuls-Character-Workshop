const SERVICE_ORIGIN = "https://character-service.dndbeyond.com";

/** Accept a character number or a URL on the supplied character-service endpoint. */
export function parseCharacterId(input) {
  const value = String(input ?? "").trim();
  let id = value;
  if (!/^\d+$/.test(value)) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new Error("Enter a D&D Beyond character number or character-service URL.");
    }
    const match = url.pathname.match(/^\/character\/v5\/character\/(\d+)\/?$/);
    if (url.origin !== SERVICE_ORIGIN || url.username || url.password || !match) {
      throw new Error("Use a D&D Beyond character-service URL or enter the character number alone.");
    }
    id = match[1];
  }
  if (!Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    throw new Error("The character number must be a positive, safe integer.");
  }
  return String(Number(id));
}

export function characterServiceUrl(input) {
  return `${SERVICE_ORIGIN}/character/v5/character/${parseCharacterId(input)}?includeCustomItems=true`;
}

/** Validate the service envelope or a character object from an exported JSON file. */
export function readCharacterJson(payload, expectedId) {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (parsed?.success === false) {
    throw new Error("D&D Beyond did not return a successful character response.");
  }
  const character = parsed?.data ?? parsed;
  if (!character || typeof character !== "object" || Array.isArray(character)
    || typeof character.name !== "string" || !character.name.trim()
    || !Array.isArray(character.classes) || !character.classes.length
    || !Array.isArray(character.stats)) {
    throw new Error("This JSON does not contain a supported D&D Beyond character.");
  }
  const id = parseCharacterId(character.id);
  if (expectedId !== undefined && id !== parseCharacterId(expectedId)) {
    throw new Error("D&D Beyond returned a different character number than requested.");
  }
  return character;
}

export async function loadCharacter(input, { fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  const id = parseCharacterId(input);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(characterServiceUrl(id), {
      headers: { Accept: "application/json" },
      credentials: "omit",
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`D&D Beyond returned HTTP ${response.status}. Check that the character is publicly accessible, or use a JSON file.`);
    }
    return readCharacterJson(await response.json(), id);
  } catch (error) {
    if (controller.signal.aborted) throw new Error("D&D Beyond character loading timed out. Try again or use a JSON file.");
    if (error instanceof TypeError) {
      throw new Error("Could not reach D&D Beyond. Browser access or the network may be blocking the request. Open the character-service URL and save its JSON for file import.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
