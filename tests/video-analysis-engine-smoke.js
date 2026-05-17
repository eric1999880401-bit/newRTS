const assert = require("assert");
const engine = require("../video-analysis-engine.js");

const side = engine.analyzeLandmarkFrames(engine.buildSyntheticFrames("side", 72), {
  lift: "Squat",
  setType: "Top",
  viewAngle: "side"
});

assert.strictEqual(side.analysisVersion, "pose-analysis-v1");
assert.strictEqual(side.viewAngle, "side");
assert(side.frameCount >= 70);
assert(side.repPhases.length >= 1);
assert(Number.isFinite(side.angleMetrics.hipAngle.avg));
assert(Number.isFinite(side.angleMetrics.kneeAngle.avg));
assert(Number.isFinite(side.velocityCurveSummary.avgVelocity));
assert.strictEqual(side.asymmetryFlags.length, 0);
assert(side.techniqueFlags.length >= 1);
assert(side.curvePreview.length <= 48);

const front = engine.analyzeLandmarkFrames(engine.buildSyntheticFrames("front", 72), {
  lift: "Squat",
  setType: "Top",
  viewAngle: "front",
  pixelToMeter: 0.002
});

assert.strictEqual(front.viewAngle, "front");
assert(front.asymmetryFlags.length >= 1);
assert.strictEqual(front.velocityCurveSummary.unit, "m/s estimate");
assert(front.confidence > 0.5);

assert.strictEqual(Math.round(engine._test.angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);

console.log("video analysis engine smoke ok");
