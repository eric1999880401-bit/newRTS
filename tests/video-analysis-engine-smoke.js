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
assert(side.curvePreview.some((point) => Number.isFinite(point.barX) && Number.isFinite(point.barY)));
assert(side.curvePreview.some((point) => Number.isFinite(point.shoulderX) && Number.isFinite(point.shoulderY)));
assert(side.curvePreview.some((point) => Number.isFinite(point.hipX) && Number.isFinite(point.hipY)));

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

const benchSide = engine.analyzeLandmarkFrames(engine.buildSyntheticFrames("bench-side", 72), {
  lift: "Bench",
  setType: "Top",
  viewAngle: "side"
});

assert.strictEqual(benchSide.liftFamily, "bench");
assert(["left", "right"].includes(benchSide.poseSide));
assert.strictEqual(benchSide.angleMetrics.liftFamily, "bench");
assert(Number.isFinite(benchSide.angleMetrics.elbowAngle.avg));
assert(Number.isFinite(benchSide.angleMetrics.shoulderAngle.avg));
assert(Number.isFinite(benchSide.angleMetrics.wristStackPct.avg));
assert.strictEqual(benchSide.angleMetrics.hipAngle, undefined);
assert.strictEqual(benchSide.angleMetrics.kneeAngle, undefined);
assert(benchSide.techniqueFlags.join(" ").includes("Bench"));
assert(benchSide.curvePreview.some((point) => Number.isFinite(point.barX) && Number.isFinite(point.barY)));
assert(benchSide.curvePreview.some((point) => Number.isFinite(point.elbowX) && Number.isFinite(point.elbowY)));
assert(benchSide.curvePreview.some((point) => Number.isFinite(point.shoulderX) && Number.isFinite(point.shoulderY)));
assert(new Set(benchSide.curvePreview.map((point) => point.barY)).size > 2);
assert(new Set(benchSide.curvePreview.map((point) => point.elbowY)).size > 2);

const visualBarFrames = engine.buildSyntheticFrames("bench-side", 72).map((frame, index) => ({
  ...frame,
  barPoint: { x: 0.2 + index / 300, y: 0.4 + Math.sin(index / 9) * 0.04, visibility: 0.95 }
}));
const visualBar = engine.analyzeLandmarkFrames(visualBarFrames, {
  lift: "Bench",
  setType: "Top",
  viewAngle: "side"
});
assert.strictEqual(visualBar.barTrackingSource, "visual");
assert(visualBar.visualBarFrameCount >= 70);
assert(Math.abs(visualBar.curvePreview[0].barX - 0.2) < 0.02);

const benchFront = engine.analyzeLandmarkFrames(engine.buildSyntheticFrames("bench-front", 72), {
  lift: "Comp Bench",
  setType: "Top",
  viewAngle: "front"
});

assert.strictEqual(benchFront.liftFamily, "bench");
assert(benchFront.asymmetryFlags.some((flag) => flag.includes("Wrist") || flag.includes("Elbow") || flag.includes("Shoulder")));

assert.strictEqual(Math.round(engine._test.angleDeg({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 })), 90);
assert.strictEqual(engine._test.normalizeLiftFamily("Paused Bench"), "bench");

console.log("video analysis engine smoke ok");
