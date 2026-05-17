"use strict";

const admin = require("firebase-admin");
const logger = require("firebase-functions/logger");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");

admin.initializeApp();

const OPENAI_API_KEY = defineSecret("OPENAI_API_KEY");
const REGION = "asia-southeast1";
const MAX_JSON_CHARS = 18000;
const AI_DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT || 5);
const AI_MONTHLY_PROJECT_LIMIT = Number(process.env.AI_MONTHLY_PROJECT_LIMIT || 150);
const VIDEO_REVIEW_DAILY_LIMIT = Number(process.env.VIDEO_REVIEW_DAILY_LIMIT || 40);
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;
const CALLABLE_DEFAULTS = {
  region: REGION,
  timeoutSeconds: 60,
  memory: "256MiB",
  maxInstances: 2
};

const AI_SUGGESTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "riskFlags", "recommendedChanges", "why", "confidence", "manualApplyPatch"],
  properties: {
    summary: { type: "string" },
    riskFlags: {
      type: "array",
      items: { type: "string" }
    },
    recommendedChanges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "action", "detail"],
        properties: {
          target: { type: "string" },
          action: { type: "string" },
          detail: { type: "string" }
        }
      }
    },
    why: {
      type: "array",
      items: { type: "string" }
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1
    },
    manualApplyPatch: {
      type: "object",
      additionalProperties: false,
      required: ["mode", "topSetTarget", "backoffPlan", "targetRpe", "note"],
      properties: {
        mode: { type: "string" },
        topSetTarget: { type: "string" },
        backoffPlan: { type: "string" },
        targetRpe: { type: "number" },
        note: { type: "string" }
      }
    }
  }
};

function assertAuthed(request) {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in before using this feature.");
  }
  return uid;
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function safeString(value, max = 1600) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function safeNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeId(value, fallback = "item") {
  const id = String(value || "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
  return id || fallback;
}

function safeFileName(value) {
  const name = String(value || "training-video.mp4")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
  return name || "training-video.mp4";
}

function collectionValues(collection) {
  if (!collection) return [];
  if (Array.isArray(collection)) return collection;
  if (typeof collection === "object") return Object.values(collection);
  return [];
}

function summarizeLog(row) {
  return {
    date: safeString(row.date, 32),
    lift: safeString(row.lift, 48),
    setType: safeString(row.setType, 48),
    reps: Number(row.reps) || 0,
    weight: Number(row.weight) || 0,
    rpe: Number(row.rpe) || 0,
    e1rm: Number(row.e1rm) || 0,
    fatiguePct: Number(row.fatiguePct) || 0
  };
}

function sanitizeRequestSummary(input = {}) {
  const athlete = input.athlete || {};
  const today = input.today || {};
  const recent = input.recentTraining || {};
  const summary = {
    requestVersion: safeString(input.requestVersion || "ai-coach-packet-v1", 80),
    createdAt: safeString(input.createdAt || new Date().toISOString(), 40),
    requestFocus: safeString(input.requestFocus || "training-adjustment", 80),
    athlete: {
      anonymousId: "active-athlete",
      trainingAge: safeString(athlete.trainingAge || "intermediate", 60),
      weeklyTrainingDays: clamp(athlete.weeklyTrainingDays || 3, 1, 7),
      primaryWeakPoint: safeString(athlete.primaryWeakPoint || "recovery", 100),
      roundingKg: clamp(athlete.roundingKg || 2.5, 0.1, 10),
      fatigueDropPct: clamp(athlete.fatigueDropPct || 5, 0, 20)
    },
    today: {
      date: safeString(today.date, 40),
      week: Number(today.week) || 1,
      day: Number(today.day) || 1,
      plan: collectionValues(today.plan).slice(0, 3).map((row) => ({
        focus: safeString(row.focus, 160),
        mainLift: safeString(row.mainLift, 100),
        topSetTarget: safeString(row.topSetTarget, 220),
        backoffPlan: safeString(row.backoffPlan, 260),
        secondaryLift: safeString(row.secondaryLift, 100),
        secondaryPrescription: safeString(row.secondaryPrescription, 180),
        fatigueTargetPct: Number(row.fatigueTargetPct) || Number(row.fatigueTarget) || 0
      })),
      readiness: today.readiness ? {
        date: safeString(today.readiness.date, 40),
        sleep: Number(today.readiness.sleep) || 0,
        stress: Number(today.readiness.stress) || 0,
        soreness: Number(today.readiness.soreness) || 0,
        pain: Number(today.readiness.pain) || 0,
        motivation: Number(today.readiness.motivation) || 0,
        previousCompletion: safeString(today.readiness.previousCompletion, 80),
        freeText: safeString(today.readiness.freeText, 600)
      } : null,
      currentCoachDecision: today.currentCoachDecision ? {
        action: safeString(today.currentCoachDecision.action, 120),
        score: Number(today.currentCoachDecision.readinessScore?.score) || null,
        reasons: collectionValues(today.currentCoachDecision.reasons).map((item) => safeString(item, 180)).slice(0, 8),
        adjustedPlan: today.currentCoachDecision.adjustedPlan ? {
          topSetTarget: safeString(today.currentCoachDecision.adjustedPlan.topSetTarget, 180),
          backoffPlan: safeString(today.currentCoachDecision.adjustedPlan.backoffPlan, 220),
          targetRpe: Number(today.currentCoachDecision.adjustedPlan.targetRpe) || null
        } : null
      } : null
    },
    recentTraining: {
      logs: collectionValues(recent.logs || recent.recentLogs).slice(-28).map(summarizeLog),
      liftSummaries: recent.liftSummaries || {},
      latestReadiness: recent.latestReadiness ? {
        sleep: Number(recent.latestReadiness.sleep) || 0,
        stress: Number(recent.latestReadiness.stress) || 0,
        soreness: Number(recent.latestReadiness.soreness) || 0,
        pain: Number(recent.latestReadiness.pain) || 0
      } : null,
      latestDecision: recent.latestDecision ? {
        action: safeString(recent.latestDecision.action, 120),
        applied: Boolean(recent.latestDecision.applied)
      } : null,
      latestVideoAnalyses: collectionValues(recent.latestVideoAnalyses).slice(0, 4).map((analysis) => ({
        date: safeString(analysis.date, 40),
        lift: safeString(analysis.lift, 80),
        viewAngle: safeString(analysis.viewAngle, 40),
        confidence: Number(analysis.confidence) || 0,
        avgConcentricSeconds: Number(analysis.avgConcentricSeconds) || null,
        velocityDropPct: Number(analysis.velocityDropPct) || null,
        barDriftPct: Number(analysis.barDriftPct) || null,
        flags: collectionValues(analysis.flags).map((item) => safeString(item, 180)).slice(0, 5)
      })),
      personalCalibration: recent.personalCalibration ? {
        version: safeString(recent.personalCalibration.version, 80),
        sampleCount: Number(recent.personalCalibration.sampleCount) || 0,
        poseSampleCount: Number(recent.personalCalibration.poseSampleCount) || 0,
        linkedPoseSampleCount: Number(recent.personalCalibration.linkedPoseSampleCount) || 0,
        signedRpeBias: safeNumber(recent.personalCalibration.signedRpeBias),
        avgAbsRpeError: safeNumber(recent.personalCalibration.avgAbsRpeError),
        recommendedRpeOffset: safeNumber(recent.personalCalibration.recommendedRpeOffset, 0),
        confidence: Number(recent.personalCalibration.confidence) || 0,
        confidenceLabel: safeString(recent.personalCalibration.confidenceLabel, 40),
        byLift: collectionValues(recent.personalCalibration.byLift).slice(0, 3).map((row) => ({
          lift: safeString(row.lift, 40),
          samples: Number(row.samples) || 0,
          bias: safeNumber(row.bias),
          avgError: safeNumber(row.avgError)
        })),
        velocityByRpe: collectionValues(recent.personalCalibration.velocityByRpe).slice(0, 5).map((row) => ({
          rpe: safeNumber(row.rpe),
          samples: Number(row.samples) || 0,
          avgVelocityDropPct: safeNumber(row.avgVelocityDropPct),
          avgConcentricSeconds: safeNumber(row.avgConcentricSeconds)
        })),
        commonWeakPoints: collectionValues(recent.personalCalibration.commonWeakPoints).slice(0, 5).map((row) => ({
          label: safeString(row.label, 160),
          count: Number(row.count) || 0
        }))
      } : null
    },
    poseAnalysis: input.poseAnalysis ? {
      id: safeString(input.poseAnalysis.id, 100),
      date: safeString(input.poseAnalysis.date, 40),
      lift: safeString(input.poseAnalysis.lift, 80),
      setType: safeString(input.poseAnalysis.setType, 80),
      viewAngle: safeString(input.poseAnalysis.viewAngle, 40),
      manualRpe: Number(input.poseAnalysis.manualRpe) || null,
      manualReps: Number(input.poseAnalysis.manualReps) || null,
      manualWeight: Number(input.poseAnalysis.manualWeight) || null,
      confidence: Number(input.poseAnalysis.confidence) || 0,
      confidenceLabel: safeString(input.poseAnalysis.confidenceLabel, 40),
      repCount: collectionValues(input.poseAnalysis.repPhases).length,
      velocity: {
        avgConcentricSeconds: Number(input.poseAnalysis.velocityCurveSummary?.avgConcentricSeconds) || null,
        velocityDropPct: Number(input.poseAnalysis.velocityCurveSummary?.velocityDropPct) || null,
        avgVelocity: Number(input.poseAnalysis.velocityCurveSummary?.avgVelocity) || null,
        peakVelocity: Number(input.poseAnalysis.velocityCurveSummary?.peakVelocity) || null,
        unit: safeString(input.poseAnalysis.velocityCurveSummary?.unit, 80)
      },
      barPath: {
        horizontalDriftPct: Number(input.poseAnalysis.barPathSummary?.horizontalDriftPct) || null,
        verticalTravelPct: Number(input.poseAnalysis.barPathSummary?.verticalTravelPct) || null,
        unit: safeString(input.poseAnalysis.barPathSummary?.unit, 80)
      },
      angles: {
        hipAvg: Number(input.poseAnalysis.angleMetrics?.hipAngle?.avg) || null,
        hipMin: Number(input.poseAnalysis.angleMetrics?.hipAngle?.min) || null,
        kneeAvg: Number(input.poseAnalysis.angleMetrics?.kneeAngle?.avg) || null,
        kneeMin: Number(input.poseAnalysis.angleMetrics?.kneeAngle?.min) || null,
        torsoAvg: Number(input.poseAnalysis.angleMetrics?.torsoAngle?.avg) || null,
        depthProxy: safeString(input.poseAnalysis.angleMetrics?.bottomHipVsKnee, 80)
      },
      flags: [
        ...collectionValues(input.poseAnalysis.techniqueFlags),
        ...collectionValues(input.poseAnalysis.asymmetryFlags)
      ].map((item) => safeString(item, 180)).slice(0, 8),
      coachCues: collectionValues(input.poseAnalysis.coachCues).map((item) => safeString(item, 180)).slice(0, 8),
      limitations: collectionValues(input.poseAnalysis.limitations).map((item) => safeString(item, 180)).slice(0, 6)
    } : null,
    instruction: safeString(input.instruction || "Return structured powerlifting training suggestions only. Do not diagnose injuries. Keep all writes manual.", 900)
  };
  const json = JSON.stringify(summary);
  if (json.length > MAX_JSON_CHARS) {
    summary.recentTraining.logs = summary.recentTraining.logs.slice(-14);
  }
  return summary;
}

function validateAiCoachSuggestion(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["Suggestion must be an object."] };
  }
  const errors = [];
  if (!safeString(value.summary, 2000)) errors.push("summary is required.");
  if (!Array.isArray(value.riskFlags)) errors.push("riskFlags must be an array.");
  if (!Array.isArray(value.recommendedChanges)) errors.push("recommendedChanges must be an array.");
  if (!Array.isArray(value.why)) errors.push("why must be an array.");
  if (!Number.isFinite(Number(value.confidence))) errors.push("confidence must be numeric.");
  if (!value.manualApplyPatch || typeof value.manualApplyPatch !== "object") errors.push("manualApplyPatch is required.");
  const patch = value.manualApplyPatch || {};
  if (patch && typeof patch === "object") {
    ["mode", "topSetTarget", "backoffPlan", "note"].forEach((key) => {
      if (!safeString(patch[key], 1200)) errors.push(`manualApplyPatch.${key} is required.`);
    });
    if (!Number.isFinite(Number(patch.targetRpe))) errors.push("manualApplyPatch.targetRpe must be numeric.");
  }
  return { ok: errors.length === 0, errors };
}

function normalizeAiCoachSuggestion(value) {
  const validation = validateAiCoachSuggestion(value);
  if (!validation.ok) {
    throw new HttpsError("internal", "AI response did not match the required suggestion schema.", { errors: validation.errors });
  }
  return {
    summary: safeString(value.summary, 1400),
    riskFlags: collectionValues(value.riskFlags).map((item) => safeString(item, 220)).filter(Boolean).slice(0, 8),
    recommendedChanges: collectionValues(value.recommendedChanges).map((item) => ({
      target: safeString(item.target, 80),
      action: safeString(item.action, 100),
      detail: safeString(item.detail, 260)
    })).filter((item) => item.target && item.action).slice(0, 8),
    why: collectionValues(value.why).map((item) => safeString(item, 240)).filter(Boolean).slice(0, 8),
    confidence: clamp(value.confidence, 0, 1),
    manualApplyPatch: {
      mode: safeString(value.manualApplyPatch.mode, 80) || "modify",
      topSetTarget: safeString(value.manualApplyPatch.topSetTarget, 220),
      backoffPlan: safeString(value.manualApplyPatch.backoffPlan, 260),
      targetRpe: clamp(value.manualApplyPatch.targetRpe, 4, 10),
      note: safeString(value.manualApplyPatch.note, 420)
    }
  };
}

function extractResponseJson(responseJson) {
  if (responseJson.output_parsed) return responseJson.output_parsed;
  const text = collectionValues(responseJson.output)
    .flatMap((item) => collectionValues(item.content))
    .filter((part) => part.type === "output_text" || part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
  if (!text) {
    throw new Error("OpenAI response contained no text output.");
  }
  return JSON.parse(text);
}

async function callOpenAiCoach(requestSummary, apiKey) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You are an RTS-style powerlifting assistant for training decisions.",
                "You are not a medical professional and must not diagnose injuries.",
                "If requestFocus is pose-weakness, focus on technique weak points, likely constraints, and 1-3 practical cues from pose metrics only.",
                "If requestFocus is pose-rpe, provide an RPE second opinion range from velocity drop, concentric time, manual context, and pose confidence.",
                "Use recentTraining.personalCalibration as athlete-specific context for RPE bias and recurring weak points, but do not claim the model has been trained.",
                "Prefer conservative, explainable changes when pain, poor sleep, missed reps, or high RPE are present.",
                "Return only the requested JSON shape. Any suggested change must require manual user approval."
              ].join(" ")
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify(requestSummary)
            }
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ai_coach_suggestion",
          strict: true,
          schema: AI_SUGGESTION_SCHEMA
        }
      }
    })
  });
  if (!response.ok) {
    const body = await response.text();
    logger.error("OpenAI Responses API failed", { status: response.status, body: body.slice(0, 500) });
    throw new HttpsError("internal", "AI coach request failed.");
  }
  const json = await response.json();
  return normalizeAiCoachSuggestion(extractResponseJson(json));
}

function estimateExperimentalRpe(input = {}) {
  const manualRpe = Number(input.manualRpe);
  const barSpeed = safeString(input.barSpeed || "Normal", 40).toLowerCase();
  const reps = Math.max(1, Number(input.reps) || 1);
  const firstRepSeconds = Number(input.firstRepSeconds) || 0;
  const lastRepSeconds = Number(input.lastRepSeconds) || 0;
  let estimate = Number.isFinite(manualRpe) && manualRpe > 0 ? manualRpe : 7;
  const reasons = [];
  let confidence = Number.isFinite(manualRpe) && manualRpe > 0 ? 0.48 : 0.22;

  if (barSpeed.includes("grind")) {
    estimate += 1.1;
    confidence += 0.12;
    reasons.push("Bar speed was marked as a grind.");
  } else if (barSpeed.includes("slow")) {
    estimate += 0.6;
    confidence += 0.1;
    reasons.push("Bar speed was marked slow.");
  } else if (barSpeed.includes("fast")) {
    estimate -= 0.4;
    confidence += 0.06;
    reasons.push("Bar speed was marked fast.");
  } else {
    reasons.push("Bar speed was marked normal.");
  }

  if (firstRepSeconds > 0 && lastRepSeconds > 0) {
    const slowdown = lastRepSeconds / Math.max(firstRepSeconds, 0.1);
    if (slowdown >= 1.8) {
      estimate += 0.8;
      reasons.push("Last rep was much slower than first rep.");
    } else if (slowdown >= 1.35) {
      estimate += 0.4;
      reasons.push("Last rep slowed down moderately.");
    } else if (slowdown < 1.1 && reps > 1) {
      estimate -= 0.2;
      reasons.push("Rep speed stayed stable across the set.");
    }
    confidence += 0.22;
  } else {
    reasons.push("No rep tempo markers were provided, so confidence is limited.");
  }

  if (!Number.isFinite(manualRpe) || manualRpe <= 0) {
    reasons.push("No manual RPE anchor was provided.");
  } else {
    reasons.push("Manual RPE remains the anchor; this estimate is experimental.");
  }

  return {
    estimatedRpe: Number(clamp(estimate, 4, 10).toFixed(1)),
    confidence: Number(clamp(confidence, 0.05, 0.9).toFixed(2)),
    why: reasons.slice(0, 6)
  };
}

async function writeUserChild(uid, child, id, payload) {
  await admin.database().ref(`users/${uid}/${child}/${id}`).update(payload);
}

async function assertDailyLimit(uid, feature, maxCount) {
  const day = new Date().toISOString().slice(0, 10);
  const ref = admin.database().ref(`usageLimits/${uid}/${feature}/${day}`);
  const result = await ref.transaction((current) => {
    const count = Number(current?.count) || 0;
    if (count >= maxCount) return;
    return {
      count: count + 1,
      limit: maxCount,
      updatedAt: new Date().toISOString()
    };
  }, undefined, false);
  if (!result.committed) {
    throw new HttpsError("resource-exhausted", `${feature} daily safety limit reached.`);
  }
}

async function assertMonthlyProjectLimit(feature, maxCount) {
  const month = new Date().toISOString().slice(0, 7);
  const ref = admin.database().ref(`usageLimits/_project/${feature}/${month}`);
  const result = await ref.transaction((current) => {
    const count = Number(current?.count) || 0;
    if (count >= maxCount) return;
    return {
      count: count + 1,
      limit: maxCount,
      updatedAt: new Date().toISOString()
    };
  }, undefined, false);
  if (!result.committed) {
    throw new HttpsError("resource-exhausted", `${feature} monthly project safety limit reached.`);
  }
}

exports.createAiCoachSuggestion = onCall({ ...CALLABLE_DEFAULTS, secrets: [OPENAI_API_KEY] }, async (request) => {
  const uid = assertAuthed(request);
  const athleteId = safeId(request.data?.athleteId || "active-athlete", "active-athlete");
  const requestSummary = sanitizeRequestSummary(request.data?.requestSummary || {});
  await assertDailyLimit(uid, "aiCoach", AI_DAILY_LIMIT);
  await assertMonthlyProjectLimit("aiCoach", AI_MONTHLY_PROJECT_LIMIT);
  const responseJson = await callOpenAiCoach(requestSummary, OPENAI_API_KEY.value());
  const sessionId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session = {
    id: sessionId,
    createdAt: new Date().toISOString(),
    athleteId,
    requestSummary,
    responseJson,
    status: "suggested",
    appliedDecisionId: ""
  };
  await writeUserChild(uid, "aiCoachSessions", sessionId, session);
  return { session };
});

exports.validateAiCoachResponse = onCall(CALLABLE_DEFAULTS, async (request) => {
  assertAuthed(request);
  const validation = validateAiCoachSuggestion(request.data?.responseJson);
  return validation;
});

exports.createVideoUploadMetadata = onCall(CALLABLE_DEFAULTS, async (request) => {
  const uid = assertAuthed(request);
  const reviewId = safeId(request.data?.reviewId || `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, "video");
  const fileName = safeFileName(request.data?.fileName);
  const contentType = safeString(request.data?.contentType || "", 100);
  if (!contentType.startsWith("video/")) {
    throw new HttpsError("invalid-argument", "Only video files are supported.");
  }
  const storagePath = `users/${uid}/videos/${reviewId}/${fileName}`;
  return { reviewId, storagePath, maxBytes: MAX_VIDEO_BYTES };
});

exports.saveVideoRpeEstimate = onCall(CALLABLE_DEFAULTS, async (request) => {
  const uid = assertAuthed(request);
  const data = request.data || {};
  const reviewId = safeId(data.reviewId || `video_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, "video");
  const storagePath = safeString(data.storagePath, 600);
  if (storagePath && !storagePath.startsWith(`users/${uid}/videos/${reviewId}/`)) {
    throw new HttpsError("permission-denied", "Video path does not belong to this account.");
  }
  await assertDailyLimit(uid, "videoReview", VIDEO_REVIEW_DAILY_LIMIT);
  const estimate = estimateExperimentalRpe(data);
  const review = {
    id: reviewId,
    date: safeString(data.date || new Date().toISOString().slice(0, 10), 40),
    createdAt: new Date().toISOString(),
    athleteId: safeId(data.athleteId || "active-athlete", "active-athlete"),
    lift: safeString(data.lift, 80),
    setType: safeString(data.setType, 80),
    storagePath,
    fileName: safeFileName(data.fileName),
    reps: Number(data.reps) || null,
    weight: Number(data.weight) || null,
    manualRpe: Number(data.manualRpe) || null,
    estimatedRpe: estimate.estimatedRpe,
    confidence: estimate.confidence,
    why: estimate.why,
    repMarkers: [
      { label: "firstRepSeconds", seconds: Number(data.firstRepSeconds) || null },
      { label: "lastRepSeconds", seconds: Number(data.lastRepSeconds) || null }
    ],
    barSpeedProxy: safeString(data.barSpeed || "Normal", 40),
    cue: safeString(data.cue, 500),
    experimental: true
  };
  await writeUserChild(uid, "videoReviews", reviewId, review);
  return { review };
});

exports.cleanupExpiredRawPoseVideos = onSchedule({
  region: REGION,
  schedule: "every 24 hours",
  timeZone: "Asia/Taipei",
  timeoutSeconds: 300,
  memory: "256MiB",
  maxInstances: 1
}, async () => {
  const now = Date.now();
  const usersSnap = await admin.database().ref("users").get();
  const bucket = admin.storage().bucket();
  let checked = 0;
  const expiredItems = [];

  usersSnap.forEach((userSnap) => {
    const uid = userSnap.key;
    const analyses = userSnap.child("videoAnalyses");
    analyses.forEach((analysisSnap) => {
      const analysis = analysisSnap.val() || {};
      const path = safeString(analysis.rawVideoStoragePath, 700);
      const expiresAt = Date.parse(analysis.rawVideoExpiresAt || "");
      checked += 1;
      if (!path || !Number.isFinite(expiresAt) || expiresAt > now || analysis.rawVideoDeletedAt) return;
      expiredItems.push({
        path,
        basePath: `users/${uid}/videoAnalyses/${analysisSnap.key}`
      });
    });
  });

  const results = await Promise.allSettled(expiredItems.map((item) => bucket.file(item.path).delete({ ignoreNotFound: true })));
  const updates = {};
  results.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const basePath = expiredItems[index].basePath;
    updates[`${basePath}/rawVideoDeletedAt`] = new Date().toISOString();
    updates[`${basePath}/rawVideoSaved`] = false;
    updates[`${basePath}/retentionPolicy`] = "raw-video-expired-deleted";
    updates[`${basePath}/rawVideoStoragePath`] = "";
  });
  if (Object.keys(updates).length) {
    await admin.database().ref().update(updates);
  }
  logger.info("Expired raw pose video cleanup finished", { checked, expired: expiredItems.length, deleted: Object.keys(updates).length / 4 });
});

exports._test = {
  sanitizeRequestSummary,
  validateAiCoachSuggestion,
  normalizeAiCoachSuggestion,
  estimateExperimentalRpe,
  safeFileName
};
