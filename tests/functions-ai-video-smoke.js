const assert = require("assert");

const api = require("../functions/index.js")._test;

const sanitized = api.sanitizeRequestSummary({
  athlete: {
    anonymousId: "should-not-survive",
    trainingAge: "intermediate",
    weeklyTrainingDays: 4,
    primaryWeakPoint: "bench lockout",
    roundingKg: 2.5,
    fatigueDropPct: 4
  },
  today: {
    date: "2026-05-17",
    week: 2,
    day: 1,
    plan: [
      {
        focus: "Squat priority",
        mainLift: "Comp Squat",
        topSetTarget: "Top set: 1 set x 3 reps @8",
        backoffPlan: "Back-off: 2 sets x 3 reps @6.5. Fatigue cap 2%.",
        secondaryLift: "Paused Bench",
        secondaryPrescription: "3 x 5 @6"
      }
    ],
    readiness: {
      sleep: 5,
      stress: 4,
      soreness: 3,
      pain: 2,
      motivation: 3,
      previousCompletion: "overshot",
      freeText: "Bad sleep, wrist feels weird."
    }
  },
  recentTraining: {
    logs: [
      { date: "2026-05-15", lift: "Squat", setType: "Top", reps: 3, weight: 180, rpe: 9, e1rm: 220, fatiguePct: 6 }
    ],
    latestVideoAnalyses: [
      { date: "2026-05-16", lift: "Squat", viewAngle: "side", confidence: 0.73, avgConcentricSeconds: 1.4, velocityDropPct: 35, barDriftPct: 4.2, flags: ["Velocity dropped sharply."] }
    ],
    personalCalibration: {
      version: "personal-calibration-v1",
      sampleCount: 7,
      poseSampleCount: 5,
      linkedPoseSampleCount: 3,
      signedRpeBias: 0.4,
      avgAbsRpeError: 0.6,
      recommendedRpeOffset: 0.4,
      confidence: 0.62,
      confidenceLabel: "useful",
      byLift: [{ lift: "Squat", samples: 4, bias: 0.5, avgError: 0.7 }],
      velocityByRpe: [{ rpe: 8, samples: 2, avgVelocityDropPct: 28, avgConcentricSeconds: 1.3 }],
      commonWeakPoints: [{ label: "Velocity dropped sharply.", count: 3 }]
    }
  },
  requestFocus: "pose-rpe",
  poseAnalysis: {
    id: "pose-1",
    date: "2026-05-16",
    lift: "Squat",
    setType: "Top",
    viewAngle: "side",
    manualRpe: 8,
    manualReps: 2,
    manualWeight: 180,
    confidence: 0.73,
    confidenceLabel: "high",
    repPhases: [{ rep: 1 }, { rep: 2 }],
    velocityCurveSummary: { avgConcentricSeconds: 1.4, velocityDropPct: 35, avgVelocity: 0.48, peakVelocity: 0.72, unit: "m/s estimate" },
    barPathSummary: { horizontalDriftPct: 4.2, verticalTravelPct: 22, unit: "m estimate" },
    angleMetrics: { hipAngle: { avg: 88, min: 52 }, kneeAngle: { avg: 102, min: 68 }, torsoAngle: { avg: 21 }, bottomHipVsKnee: "below_or_level" },
    techniqueFlags: ["Velocity dropped sharply."],
    asymmetryFlags: [],
    coachCues: ["Brace before descent."],
    limitations: ["Single-camera estimate."]
  }
});

assert.strictEqual(sanitized.athlete.anonymousId, "active-athlete");
assert.strictEqual(sanitized.today.readiness.freeText.includes("wrist"), true);
assert.strictEqual(JSON.stringify(sanitized).includes("should-not-survive"), false);
assert.strictEqual(sanitized.recentTraining.latestVideoAnalyses[0].viewAngle, "side");
assert.strictEqual(sanitized.recentTraining.latestVideoAnalyses[0].flags[0].includes("Velocity"), true);
assert.strictEqual(sanitized.recentTraining.personalCalibration.sampleCount, 7);
assert.strictEqual(sanitized.recentTraining.personalCalibration.byLift[0].lift, "Squat");
assert.strictEqual(sanitized.recentTraining.personalCalibration.commonWeakPoints[0].count, 3);
assert.strictEqual(sanitized.requestFocus, "pose-rpe");
assert.strictEqual(sanitized.poseAnalysis.repCount, 2);
assert.strictEqual(sanitized.poseAnalysis.manualRpe, 8);
assert.strictEqual(sanitized.poseAnalysis.velocity.velocityDropPct, 35);
assert.strictEqual(sanitized.poseAnalysis.flags[0].includes("Velocity"), true);

const validSuggestion = {
  summary: "Reduce today's fatigue and keep skill work.",
  riskFlags: ["Low sleep", "Recent overshoot"],
  recommendedChanges: [
    { target: "backoff", action: "cut", detail: "Reduce one to two sets." }
  ],
  why: ["Readiness is reduced.", "Recent RPE was high."],
  confidence: 0.72,
  manualApplyPatch: {
    mode: "modify",
    topSetTarget: "Top set: 1 set x 3 reps @7",
    backoffPlan: "Back-off: 1 set x 3 reps @6. Fatigue cap 2%.",
    targetRpe: 6,
    note: "Apply only if warmups move normally."
  }
};
assert.strictEqual(api.validateAiCoachSuggestion(validSuggestion).ok, true);
assert.strictEqual(api.validateAiCoachSuggestion({ summary: "" }).ok, false);
assert.strictEqual(api.normalizeAiCoachSuggestion({ ...validSuggestion, confidence: 3 }).confidence, 1);

const grind = api.estimateExperimentalRpe({
  manualRpe: 8,
  barSpeed: "Grind",
  reps: 3,
  firstRepSeconds: 0.9,
  lastRepSeconds: 2.1
});
assert(grind.estimatedRpe > 8.5);
assert(grind.confidence > 0.7);
assert(grind.why.some((item) => item.includes("slower") || item.includes("grind")));

assert.strictEqual(api.safeFileName("bad/name?.mp4").includes("/"), false);
assert.strictEqual(api.entitlementIsActive({ status: "active", currentPeriodEnd: "2099-01-01T00:00:00.000Z" }), true);
assert.strictEqual(api.entitlementIsActive({ status: "canceled", currentPeriodEnd: "2099-01-01T00:00:00.000Z" }), false);
assert.strictEqual(api.entitlementIsActive({ status: "active", currentPeriodEnd: "2020-01-01T00:00:00.000Z" }), false);
assert.strictEqual(api.summarizeEntitlement({ status: "active", plan: "beta_monthly_twd_300", currentPeriodEnd: "2099-01-01T00:00:00.000Z" }).active, true);

const legacyUser = {
  name: "Camel",
  program: [{ id: "p1", week: 1, day: 1 }],
  logs: [{ id: "l1", date: "2026-05-17", lift: "Squat" }],
  readinessChecks: [{ id: "r1" }],
  coachDecisions: [{ id: "c1" }],
  videoReviews: [{ id: "v1" }],
  videoAnalyses: [{ id: "pa1" }],
  aiCoachSessions: [{ id: "ai1" }]
};
assert.strictEqual(api.countLegacyAthlete(legacyUser).logs, 1);
const scoped = api.buildScopedPayloadFromLegacyAthlete({ legacyUser, athleteId: "u1", uid: "uid1", email: "x@example.com" });
assert.strictEqual(scoped.profile.activeAthleteId, "u1");
assert.strictEqual(Object.keys(scoped.logs).length, 1);
assert.strictEqual(scoped.athletes.u1.name, "Camel");

console.log("functions ai/video smoke ok");
