import test from "node:test";
import assert from "node:assert/strict";
import { reviewItemData, createReviewItems } from "../scripts/review-items.mjs";
import { prepareActorPlan, buildActor } from "../scripts/actor-builder.mjs";

test("review markers contain names and the requested review text, without exported rules", () => {
  for (const row of [{ key: "feat", kind: "feat", name: "Missing feat" },
    { key: "item", kind: "equipment", name: "Missing item", types: ["weapon"] },
    { key: "spell", kind: "spell", name: "Missing spell", level: 2 }]) {
    const data = reviewItemData({ ...row, description: "do not copy", effects: [{ bad: true }] });
    assert.equal(data.name, row.name);
    assert.equal(data.system.description.value, "Needs GM Review");
    assert.deepEqual(data.system.activities, {});
    assert.deepEqual(data.system.advancement, []);
    assert.deepEqual(data.effects, []);
    assert.equal(data.flags["ugmuls-character-workshop"].needsGmReview, true);
    assert.doesNotMatch(JSON.stringify(data), /do not copy/);
  }
});

test("markers follow native grants, respect ownership, and are safe to retry", async () => {
  let created = 0;
  const actor = { isOwner: true, items: [{ type: "feat", name: "Native grant" }],
    async createEmbeddedDocuments(_type, docs) { created++; this.items.push(...docs); return docs; } };
  const rows = [{ key: "missing", kind: "feat", name: "Missing feat" }, { key: "native", kind: "feat", name: "Native grant" },
    { key: "selected", selectedUuid: "source", name: "Selected" }, { nativeOnly: true }];
  const log = await createReviewItems(actor, rows);
  assert.equal(log.length, 2);
  assert.equal(created, 1);
  await createReviewItems(actor, rows);
  assert.equal(created, 1);
  actor.isOwner = false;
  await assert.rejects(createReviewItems(actor, rows), /own/);
});

test("explicitly skipped origins do not block a valid class; class sources remain mandatory", async () => {
  const rows = [{ key: "class-0", name: "Fighter", type: "class", level: 1, selectedUuid: "class" },
    { key: "background", name: "Unknown", type: "background", skip: true }];
  const preview = { rows, entries: [{ type: "class", uuid: "class" }] };
  const plan = await prepareActorPlan({ classes: [{}] }, preview, async () => ({ name: "Fighter", type: "class", system: {} }));
  assert.equal(plan.length, 1);
  rows[0].selectedUuid = null;
  rows[0].skip = true;
  await assert.rejects(prepareActorPlan({ classes: [{}] }, preview, async () => assert.fail()), /Select sources/);
});

test("a review-phase failure retains the draft and retries without repeating source phases", async () => {
  const session = { data: {}, tasks: [], completed: [] };
  let actorCount = 0, loadoutCount = 0, attempts = 0;
  const dependencies = { createActor: async () => { actorCount++; return { setFlag: async () => {} }; },
    applyLoadout: async () => { loadoutCount++; }, applyReview: async () => { if (++attempts === 1) throw new Error("review interrupted"); } };
  await assert.rejects(buildActor(session, dependencies), /review interrupted/);
  assert.ok(!session.complete);
  await buildActor(session, dependencies);
  assert.equal(actorCount, 1);
  assert.equal(loadoutCount, 1);
  assert.equal(session.complete, true);
});
