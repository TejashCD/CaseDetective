import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BRIDGES, CANAL, QUAY, SPAWN, STREET, TREES, WORLD_W } from "../src/client/world/constants.ts";
import { bestBridgeX, isWalkable, planPath, regionAt, snapToWalkable } from "../src/client/world/navigation.ts";

const [firstBridge = 0, secondBridge = 0] = BRIDGES.map((b) => b.x + b.w / 2);

describe("navigation", () => {
  it("knows which part of the map a y position is in", () => {
    assert.equal(regionAt(STREET.top), "street");
    assert.equal(regionAt((CANAL.top + CANAL.bottom) / 2), "bridge");
    assert.equal(regionAt(QUAY.bottom), "quay");
  });

  it("only lets the player cross the canal on a bridge", () => {
    const midCanal = (CANAL.top + CANAL.bottom) / 2;
    assert.equal(isWalkable(200, midCanal), false);
    assert.equal(isWalkable(firstBridge, midCanal), true);
  });

  it("blocks the map edges, obstacles and witnesses", () => {
    assert.equal(isWalkable(5, STREET.top + 10), false);
    assert.equal(isWalkable(WORLD_W - 5, STREET.top + 10), false);
    const tree = TREES[1];
    assert.ok(tree);
    assert.equal(isWalkable(tree.x, tree.y), false);
    assert.equal(isWalkable(600, 300, [{ x: 600, y: 300 }]), false);
    assert.equal(isWalkable(SPAWN.x, SPAWN.y), true);
  });

  it("routes across the nearest bridge", () => {
    assert.equal(bestBridgeX(100, 300), firstBridge);
    assert.equal(bestBridgeX(2200, 2000), secondBridge);

    const path = planPath(SPAWN, { x: 500, y: 300 });
    assert.equal(path.length, 3);
    assert.equal(path[0]?.x, firstBridge);
    assert.deepEqual(path.at(-1), { x: 500, y: 300 });
  });

  it("walks straight when start and target are on the same side", () => {
    assert.deepEqual(planPath({ x: 100, y: 300 }, { x: 900, y: 310 }), [{ x: 900, y: 310 }]);
  });

  it("detours around a witness standing in the way", () => {
    const witness = { x: 1606, y: 300 };
    const from = { x: witness.x - 34, y: 304 };
    const to = { x: 2150, y: STREET.top + 6 };
    const path = planPath(from, to, [witness]);

    assert.ok(path.length > 1, "a detour was added");
    let previous = from;
    for (const point of path) {
      for (let k = 0; k <= 1; k += 0.01) {
        const x = previous.x + (point.x - previous.x) * k;
        const y = previous.y + (point.y - previous.y) * k;
        assert.ok(isWalkable(x, y, [witness]), `path crosses blocked ground at ${x},${y}`);
      }
      previous = point;
    }
  });

  it("snaps clicks on water or sky to the nearest walkable band", () => {
    assert.equal(snapToWalkable(200, 10).y, STREET.top + 6);
    assert.equal(snapToWalkable(200, CANAL.top + 5).y, STREET.bottom - 4);
    assert.equal(snapToWalkable(200, CANAL.bottom - 5).y, QUAY.top + 4);
    assert.equal(snapToWalkable(-50, 300).x, 24);
  });
});
