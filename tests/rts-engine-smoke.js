const assert = require("assert");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.resolve(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
const mainScript = scripts.at(-1)[1];
const pageNavigationIndex = mainScript.indexOf("Page navigation");
const coreScript = mainScript.slice(0, pageNavigationIndex - 10);

const fakeDocument = {
  getElementById(id) {
    if (id === "targetRpe") return { value: "6.0" };
    if (id === "logSetType") return { value: "Top" };
    return { value: "" };
  }
};

const api = new Function("document", "firebase", "XLSX", "window", `${coreScript}
return {
  APP_SCHEMA_VERSION,
  buildCoachAdjustedPlan,
  buildScopedDataFromState,
  calcE1RM,
  countLegacyData,
  countScopedData,
  createUserProfile,
  generateRTSPlan,
  getPercent1RM,
  getStructuredPrescription,
  hydrateStateFromScopedData,
  parseSetPrescription,
  roundToIncrement,
  scoreReadiness,
  state
};
`)(fakeDocument, {}, {}, {});

assert.strictEqual(api.APP_SCHEMA_VERSION, 2);
assert.strictEqual(api.getPercent1RM(1, 10), 1);
assert(Math.abs(api.calcE1RM(180, 1, 8) - 195.2277) < 0.01);
assert.strictEqual(api.roundToIncrement(142.4, 2.5), 142.5);

const user = api.createUserProfile("qa", "QA");
user.logs = [
  { date: "2026-04-01", lift: "Squat", setType: "Top", reps: 1, weight: 189, rpe: 8, e1rm: 205 },
  { date: "2026-04-08", lift: "Squat", setType: "Top", reps: 1, weight: 190, rpe: 8, e1rm: 206 },
  { date: "2026-04-15", lift: "Squat", setType: "Top", reps: 1, weight: 191, rpe: 8, e1rm: 207 },
  { date: "2026-04-22", lift: "Squat", setType: "Top", reps: 1, weight: 185, rpe: 9, e1rm: 201, fatiguePct: 6.5 },
  { date: "2026-04-29", lift: "Squat", setType: "Top", reps: 1, weight: 184, rpe: 9.5, e1rm: 200, fatiguePct: 7, generalNotes: "missed last backoff" },
  { date: "2026-05-06", lift: "Squat", setType: "Top", reps: 1, weight: 182, rpe: 9, e1rm: 198, fatiguePct: 6.5 },
  { date: "2026-05-03", lift: "Bench", setType: "Top", reps: 1, weight: 110, rpe: 8, e1rm: api.calcE1RM(110, 1, 8) }
];

const plan = api.generateRTSPlan({
  weeks: 8,
  daysPerWeek: 3,
  goal: "strength",
  strategyModel: "emerging",
  stressBudget: "moderate",
  meetDate: "",
  weakPoint: "recovery",
  trainingAge: "intermediate",
  equipment: "rack",
  coachNotes: "",
  fatigueDropPct: 5,
  roundingKg: 2.5,
  preferredSquat: "Comp Squat",
  preferredBench: "Comp Bench",
  preferredDeadlift: "Deadlift"
}, user);

assert.strictEqual(plan.version, "rts-engine-v2");
assert.strictEqual(plan.rows.length, 24);
assert(plan.rows[0].ruleNotes.length >= 3);
assert(plan.rows.some((row) => row.phase.includes("Pivot")));
assert(plan.responseProfile.Squat);
assert.strictEqual(plan.responseProfile.Squat.response, "falling");
assert(plan.rows.every((row) => row.protocolName && Number.isFinite(row.stressIndex)));
assert(plan.rows.every((row) => Number.isFinite(row.centralStress) && Number.isFinite(row.peripheralStress)));
assert(plan.rows.every((row) => row.ttpTarget >= 3 && row.ttpTarget <= 7));
assert(plan.rows.every((row) => row.prescriptionSummary && row.prescriptionSummaryZh));
assert(plan.rows.every((row) => Number.isFinite(row.fatigueTargetPct)));
assert(plan.rows.every((row) => Number.isFinite(row.topReps) && Number.isFinite(row.backoffReps)));
assert(plan.rows.some((row) => row.protocolKey === "noDrop" || row.protocolKey === "repeat"));
assert(plan.rows[0].ruleNotes.some((note) => note.includes("Stress index")));
assert(plan.rows[0].ruleNotes.some((note) => note.includes("Response/TTP")));

const parsedBackoff = api.parseSetPrescription("Back-off: 2-3 sets x 5 reps @6-7. Fatigue cap 2.0%");
assert.deepStrictEqual(parsedBackoff, { setsMin: 2, setsMax: 3, reps: "5", rpe: "6-7" });

const coachRow = {
  focus: "Squat priority",
  mainLift: "Comp Squat",
  topSetTarget: "Top set: 1 set x 5 reps @7-8",
  backoffPlan: "Back-off: 2 sets x 5 reps @6-7. Fatigue cap 2.0%.",
  secondaryLift: "Paused Bench",
  secondaryPrescription: "2-4 repeat sets @6-7",
  fatigueTargetPct: 2
};
const modified = api.buildCoachAdjustedPlan(coachRow, user, "modify", { readinessScore: { score: 62 }, highRpeCount: 2 });
assert.strictEqual(modified.topReps, "5");
assert.strictEqual(modified.topRpe, "6-7");
assert.strictEqual(modified.backoffSetsMin, 1);
assert.strictEqual(modified.backoffSetsMax, 1);
assert.strictEqual(modified.backoffReps, "5");
assert(modified.backoffPlan.includes("1 set x 5 reps @5.5-6.5"));

const downshifted = api.buildCoachAdjustedPlan(coachRow, user, "downshift", { readinessScore: { score: 42 }, highRpeCount: 0 });
assert.strictEqual(downshifted.backoffSetsMin, 1);
assert.strictEqual(downshifted.backoffSetsMax, 1);
assert.strictEqual(downshifted.backoffReps, "5");
assert(downshifted.backoffPlan.includes("1 set x 5 reps @5.5-6"));

const legacyState = {
  schemaVersion: 2,
  activeUserId: "qa",
  uiLanguage: "zh",
  users: {
    qa: {
      ...user,
      program: plan.rows.slice(0, 3),
      readinessChecks: [{ id: "r1", date: "2026-05-17", sleep: 5, stress: 4, soreness: 3, pain: 1, motivation: 3 }],
      coachDecisions: [{ id: "c1", date: "2026-05-17", action: "Modify volume", applied: true }],
      videoReviews: [{ id: "v1", date: "2026-05-17", lift: "Squat", manualRpe: 8 }]
    }
  }
};
const scoped = api.buildScopedDataFromState(legacyState, "uid_test", "qa@example.com");
const legacyCounts = api.countLegacyData(legacyState);
const scopedCounts = api.countScopedData(scoped);
assert.strictEqual(scoped.profile.uid, "uid_test");
assert.strictEqual(scoped.profile.uiLanguage, "zh");
assert.strictEqual(scopedCounts.logs, legacyCounts.logs);
assert.strictEqual(scopedCounts.programRows, legacyCounts.programRows);
assert.strictEqual(scopedCounts.coachDecisions, legacyCounts.coachDecisions);
const duplicateIdState = {
  activeUserId: "a",
  users: {
    a: { ...api.createUserProfile("a", "A"), logs: [{ id: "same", date: "2026-05-17", lift: "Squat" }] },
    b: { ...api.createUserProfile("b", "B"), logs: [{ id: "same", date: "2026-05-17", lift: "Bench" }] }
  }
};
const duplicateScoped = api.buildScopedDataFromState(duplicateIdState, "uid_test", "qa@example.com");
assert.strictEqual(Object.keys(duplicateScoped.logs).length, 2);
const singleAthleteScoped = api.buildScopedDataFromState(duplicateIdState, "uid_test", "qa@example.com", { athleteIds: ["b"] });
assert.strictEqual(singleAthleteScoped.profile.activeAthleteId, "b");
assert.deepStrictEqual(Object.keys(singleAthleteScoped.athletes), ["b"]);
assert.strictEqual(Object.keys(singleAthleteScoped.logs).length, 1);
assert.strictEqual(singleAthleteScoped.logs.b_log_same.lift, "Bench");
const hydrated = api.hydrateStateFromScopedData({ ...scoped, migration: { completed: true } });
assert.strictEqual(hydrated.activeUserId, "qa");
assert.strictEqual(hydrated.users.qa.logs.length, legacyCounts.logs);
assert.strictEqual(hydrated.users.qa.program.length, 3);

const tired = api.scoreReadiness({
  sleep: 4.5,
  stress: 5,
  soreness: 4,
  pain: 4,
  motivation: 2,
  previousCompletion: "overshot",
  freeText: "",
  date: "2026-05-17"
});
assert(tired.score < 60);
assert(["warn", "bad"].includes(tired.level));

const redFlag = api.scoreReadiness({
  sleep: 8,
  stress: 1,
  soreness: 1,
  pain: 8,
  motivation: 5,
  previousCompletion: "completed",
  freeText: "sharp radiating pain",
  date: "2026-05-17"
});
assert.strictEqual(redFlag.level, "bad");

console.log("rts engine smoke ok");
