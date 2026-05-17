(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.newRtsVideoAnalysis = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const L = Object.freeze({
    leftShoulder: 11,
    rightShoulder: 12,
    leftWrist: 15,
    rightWrist: 16,
    leftHip: 23,
    rightHip: 24,
    leftKnee: 25,
    rightKnee: 26,
    leftAnkle: 27,
    rightAnkle: 28
  });

  const SIDE_JOINTS = Object.freeze({
    left: {
      shoulder: L.leftShoulder,
      wrist: L.leftWrist,
      hip: L.leftHip,
      knee: L.leftKnee,
      ankle: L.leftAnkle
    },
    right: {
      shoulder: L.rightShoulder,
      wrist: L.rightWrist,
      hip: L.rightHip,
      knee: L.rightKnee,
      ankle: L.rightAnkle
    }
  });

  function clamp(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function round(value, digits = 2) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const m = Math.pow(10, digits);
    return Math.round(n * m) / m;
  }

  function pointScore(point) {
    if (!point) return 0;
    const score = Number(point.visibility ?? point.presence ?? point.score ?? 0);
    return Number.isFinite(score) ? clamp(score, 0, 1) : 0;
  }

  function getPoint(frame, index) {
    return frame && frame.landmarks ? frame.landmarks[index] || null : null;
  }

  function midpoint(a, b) {
    if (!a || !b) return null;
    return {
      x: (Number(a.x) + Number(b.x)) / 2,
      y: (Number(a.y) + Number(b.y)) / 2,
      z: ((Number(a.z) || 0) + (Number(b.z) || 0)) / 2,
      visibility: Math.min(pointScore(a), pointScore(b))
    };
  }

  function distance(a, b) {
    if (!a || !b) return null;
    const dx = Number(a.x) - Number(b.x);
    const dy = Number(a.y) - Number(b.y);
    return Math.sqrt(dx * dx + dy * dy);
  }

  function angleDeg(a, b, c) {
    if (!a || !b || !c) return null;
    const abx = Number(a.x) - Number(b.x);
    const aby = Number(a.y) - Number(b.y);
    const cbx = Number(c.x) - Number(b.x);
    const cby = Number(c.y) - Number(b.y);
    const dot = abx * cbx + aby * cby;
    const mag = Math.sqrt(abx * abx + aby * aby) * Math.sqrt(cbx * cbx + cby * cby);
    if (!mag) return null;
    return Math.acos(clamp(dot / mag, -1, 1)) * 180 / Math.PI;
  }

  function torsoAngleDeg(shoulder, hip) {
    if (!shoulder || !hip) return null;
    const dx = Number(shoulder.x) - Number(hip.x);
    const dy = Number(shoulder.y) - Number(hip.y);
    if (!dx && !dy) return null;
    return Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
  }

  function summarize(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    if (!clean.length) return { min: null, max: null, avg: null };
    return {
      min: round(Math.min(...clean), 1),
      max: round(Math.max(...clean), 1),
      avg: round(clean.reduce((sum, v) => sum + v, 0) / clean.length, 1)
    };
  }

  function movingAverage(values, windowSize = 5) {
    const half = Math.floor(windowSize / 2);
    return values.map((_, index) => {
      const start = Math.max(0, index - half);
      const end = Math.min(values.length, index + half + 1);
      const slice = values.slice(start, end).filter(Number.isFinite);
      return slice.length ? slice.reduce((sum, v) => sum + v, 0) / slice.length : values[index];
    });
  }

  function chooseSide(frame, preferred = "auto") {
    if (preferred === "left" || preferred === "right") return preferred;
    const sideScore = (side) => {
      const joints = SIDE_JOINTS[side];
      return [joints.shoulder, joints.hip, joints.knee, joints.ankle, joints.wrist]
        .map((index) => pointScore(getPoint(frame, index)))
        .reduce((sum, score) => sum + score, 0);
    };
    return sideScore("left") >= sideScore("right") ? "left" : "right";
  }

  function makeFrameMetrics(frame, options) {
    const side = chooseSide(frame, options.preferredSide || "auto");
    const joints = SIDE_JOINTS[side];
    const shoulder = getPoint(frame, joints.shoulder);
    const wrist = getPoint(frame, joints.wrist);
    const hip = getPoint(frame, joints.hip);
    const knee = getPoint(frame, joints.knee);
    const ankle = getPoint(frame, joints.ankle);
    const leftShoulder = getPoint(frame, L.leftShoulder);
    const rightShoulder = getPoint(frame, L.rightShoulder);
    const leftHip = getPoint(frame, L.leftHip);
    const rightHip = getPoint(frame, L.rightHip);
    const leftKnee = getPoint(frame, L.leftKnee);
    const rightKnee = getPoint(frame, L.rightKnee);
    const leftAnkle = getPoint(frame, L.leftAnkle);
    const rightAnkle = getPoint(frame, L.rightAnkle);
    const shoulderMid = midpoint(leftShoulder, rightShoulder) || shoulder;
    const wristMid = midpoint(getPoint(frame, L.leftWrist), getPoint(frame, L.rightWrist)) || wrist;
    const hipMid = midpoint(leftHip, rightHip) || hip;
    const lift = String(options.lift || "").toLowerCase();
    const barProxy = lift.includes("bench") || lift.includes("deadlift") ? wristMid : shoulderMid;
    const scores = [shoulder, hip, knee, ankle, barProxy].map(pointScore);
    const confidence = scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1);

    return {
      time: Number(frame.time) || 0,
      side,
      confidence,
      hipAngle: angleDeg(shoulder, hip, knee),
      kneeAngle: angleDeg(hip, knee, ankle),
      torsoAngle: torsoAngleDeg(shoulder, hip),
      shoulderMid,
      hipMid,
      knee,
      barProxy,
      front: {
        shoulderHeightDiffPct: Math.abs(Number(leftShoulder?.y) - Number(rightShoulder?.y)) * 100,
        hipHeightDiffPct: Math.abs(Number(leftHip?.y) - Number(rightHip?.y)) * 100,
        kneeHeightDiffPct: Math.abs(Number(leftKnee?.y) - Number(rightKnee?.y)) * 100,
        centerShiftPct: Math.abs(Number(hipMid?.x) - Number(shoulderMid?.x)) * 100,
        leftKneeInward: kneeInwardProxy(leftHip, leftKnee, leftAnkle),
        rightKneeInward: kneeInwardProxy(rightHip, rightKnee, rightAnkle)
      }
    };
  }

  function kneeInwardProxy(hip, knee, ankle) {
    if (!hip || !knee || !ankle) return null;
    const span = Math.max(distance(hip, ankle) || 0, 0.001);
    const lineX = (Number(hip.x) + Number(ankle.x)) / 2;
    return round((Number(knee.x) - lineX) / span, 3);
  }

  function detectRepPhases(metrics, options = {}) {
    if (metrics.length < 5) return [];
    const yValues = movingAverage(metrics.map((m) => Number(m.barProxy?.y)), 5);
    const minGap = Number(options.minRepGapSeconds) || 0.7;
    const bottoms = [];
    for (let i = 2; i < yValues.length - 2; i += 1) {
      if (!Number.isFinite(yValues[i])) continue;
      const isLocalBottom = yValues[i] >= yValues[i - 1] && yValues[i] >= yValues[i + 1] && yValues[i] >= yValues[i - 2] && yValues[i] >= yValues[i + 2];
      if (!isLocalBottom) continue;
      const previous = bottoms[bottoms.length - 1];
      if (!previous || (metrics[i].time - metrics[previous].time) >= minGap) {
        bottoms.push(i);
      } else if (yValues[i] > yValues[previous]) {
        bottoms[bottoms.length - 1] = i;
      }
    }
    if (!bottoms.length) {
      const maxY = Math.max(...yValues.filter(Number.isFinite));
      const idx = yValues.findIndex((value) => value === maxY);
      if (idx >= 0) bottoms.push(idx);
    }

    return bottoms.slice(0, 8).map((bottomIndex, repIndex) => {
      const prevBound = repIndex ? bottoms[repIndex - 1] : 0;
      const nextBound = repIndex < bottoms.length - 1 ? bottoms[repIndex + 1] : metrics.length - 1;
      const eccentricStart = findMinIndex(yValues, prevBound, bottomIndex);
      const lockout = findMinIndex(yValues, bottomIndex, nextBound);
      const concentricSeconds = Math.max(0, metrics[lockout].time - metrics[bottomIndex].time);
      const eccentricSeconds = Math.max(0, metrics[bottomIndex].time - metrics[eccentricStart].time);
      const displacement = Math.abs(yValues[bottomIndex] - yValues[lockout]);
      return {
        rep: repIndex + 1,
        eccentricStartTime: round(metrics[eccentricStart].time, 2),
        bottomTime: round(metrics[bottomIndex].time, 2),
        lockoutTime: round(metrics[lockout].time, 2),
        eccentricSeconds: round(eccentricSeconds, 2),
        concentricSeconds: round(concentricSeconds, 2),
        relativeDisplacement: round(displacement, 4),
        bottomFrameIndex: bottomIndex,
        lockoutFrameIndex: lockout
      };
    });
  }

  function findMinIndex(values, start, end) {
    let best = Math.max(0, start);
    for (let i = Math.max(0, start); i <= Math.min(values.length - 1, end); i += 1) {
      if (Number.isFinite(values[i]) && (!Number.isFinite(values[best]) || values[i] < values[best])) best = i;
    }
    return best;
  }

  function velocitySummary(metrics, reps, pixelToMeter) {
    const points = metrics.map((m) => m.barProxy).filter(Boolean);
    if (points.length < 2) {
      return { unit: "relative frame/s", avgConcentricSeconds: null, peakVelocity: null, avgVelocity: null, velocityDropPct: null };
    }
    const velocities = [];
    for (let i = 1; i < metrics.length; i += 1) {
      const prev = metrics[i - 1];
      const current = metrics[i];
      const dt = Number(current.time) - Number(prev.time);
      if (!dt || !prev.barProxy || !current.barProxy) continue;
      const dy = Math.abs(Number(current.barProxy.y) - Number(prev.barProxy.y));
      velocities.push((dy * (pixelToMeter || 1)) / dt);
    }
    const avgVelocity = velocities.length ? velocities.reduce((sum, v) => sum + v, 0) / velocities.length : null;
    const repSeconds = reps.map((rep) => Number(rep.concentricSeconds)).filter((v) => v > 0);
    const firstHalf = velocities.slice(0, Math.ceil(velocities.length / 2));
    const lastHalf = velocities.slice(Math.floor(velocities.length / 2));
    const firstAvg = firstHalf.length ? firstHalf.reduce((sum, v) => sum + v, 0) / firstHalf.length : null;
    const lastAvg = lastHalf.length ? lastHalf.reduce((sum, v) => sum + v, 0) / lastHalf.length : null;
    const drop = firstAvg && lastAvg ? Math.max(0, 1 - lastAvg / firstAvg) * 100 : null;
    return {
      unit: pixelToMeter ? "m/s estimate" : "relative frame/s",
      avgConcentricSeconds: repSeconds.length ? round(repSeconds.reduce((sum, v) => sum + v, 0) / repSeconds.length, 2) : null,
      peakVelocity: velocities.length ? round(Math.max(...velocities), pixelToMeter ? 2 : 4) : null,
      avgVelocity: avgVelocity === null ? null : round(avgVelocity, pixelToMeter ? 2 : 4),
      velocityDropPct: drop === null ? null : round(drop, 1)
    };
  }

  function barPathSummary(metrics, pixelToMeter) {
    const points = metrics.map((m) => m.barProxy).filter(Boolean);
    if (points.length < 2) {
      return { source: "bar proxy", horizontalDriftPct: null, verticalTravelPct: null, pathLength: null };
    }
    const xs = points.map((p) => Number(p.x));
    const ys = points.map((p) => Number(p.y));
    let pathLength = 0;
    for (let i = 1; i < points.length; i += 1) {
      pathLength += distance(points[i - 1], points[i]) || 0;
    }
    return {
      source: "pose proxy",
      horizontalDriftPct: round((Math.max(...xs) - Math.min(...xs)) * 100, 1),
      verticalTravelPct: round((Math.max(...ys) - Math.min(...ys)) * 100, 1),
      pathLength: round(pathLength * (pixelToMeter || 1), pixelToMeter ? 2 : 4),
      unit: pixelToMeter ? "m estimate" : "relative frame"
    };
  }

  function decimateCurve(metrics, maxPoints = 48) {
    if (!metrics.length) return [];
    const step = Math.max(1, Math.ceil(metrics.length / maxPoints));
    return metrics.filter((_, index) => index % step === 0).map((m) => ({
      t: round(m.time, 2),
      hip: round(m.hipAngle, 1),
      knee: round(m.kneeAngle, 1),
      torso: round(m.torsoAngle, 1),
      barX: round(m.barProxy?.x, 4),
      barY: round(m.barProxy?.y, 4)
    }));
  }

  function buildFlags({ viewAngle, angleMetrics, velocity, barPath, front, confidence }) {
    const flags = [];
    const cues = [];
    if (viewAngle === "side") {
      if (angleMetrics.bottomHipVsKnee === "high") {
        flags.push("Depth may be high.");
        cues.push("Check squat depth from a true side angle.");
      }
      if (Number(velocity.velocityDropPct) >= 35) {
        flags.push("Velocity dropped sharply.");
        cues.push("Treat this as high fatigue; compare with manual RPE.");
      }
      if (Number(barPath.horizontalDriftPct) >= 6) {
        flags.push("Bar path drift is noticeable.");
        cues.push("Review balance over midfoot and brace timing.");
      }
    } else {
      if (Number(front.shoulderHeightDiffPct) >= 3) flags.push("Shoulder height asymmetry detected.");
      if (Number(front.hipHeightDiffPct) >= 3) flags.push("Hip height asymmetry detected.");
      if (Number(front.kneeHeightDiffPct) >= 4) flags.push("Knee height asymmetry detected.");
      if (Number(front.centerShiftPct) >= 4) flags.push("Center shift proxy is elevated.");
      if (flags.length) cues.push("Confirm with another front-view set before changing technique.");
    }
    if (confidence < 0.45) {
      flags.push("Low landmark confidence.");
      cues.push("Retake with full body visible, stable camera, and brighter lighting.");
    }
    if (!flags.length) flags.push("No major video flag from this angle.");
    if (!cues.length) cues.push("Use this as a trend marker, not a final technical verdict.");
    return { flags, cues };
  }

  function analyzeLandmarkFrames(frames, options = {}) {
    const cleanFrames = (frames || []).filter((frame) => Array.isArray(frame.landmarks) && frame.landmarks.length >= 29);
    if (cleanFrames.length < 5) {
      throw new Error("Need at least 5 pose frames for analysis.");
    }
    const viewAngle = options.viewAngle === "front" ? "front" : "side";
    const metrics = cleanFrames.map((frame) => makeFrameMetrics(frame, options));
    const validConfidence = metrics.map((m) => m.confidence).filter(Number.isFinite);
    const landmarkConfidence = validConfidence.reduce((sum, v) => sum + v, 0) / Math.max(validConfidence.length, 1);
    const pixelToMeter = Number(options.pixelToMeter) || 0;
    const reps = detectRepPhases(metrics, options);
    const velocity = velocitySummary(metrics, reps, pixelToMeter);
    const barPath = barPathSummary(metrics, pixelToMeter);
    const bottomRep = reps[0];
    const bottomMetrics = bottomRep ? metrics[bottomRep.bottomFrameIndex] : metrics[Math.floor(metrics.length / 2)];
    const bottomHip = Number(bottomMetrics?.hipMid?.y);
    const bottomKnee = Number(bottomMetrics?.knee?.y);
    const angleMetrics = {
      hipAngle: summarize(metrics.map((m) => m.hipAngle)),
      kneeAngle: summarize(metrics.map((m) => m.kneeAngle)),
      torsoAngle: summarize(metrics.map((m) => m.torsoAngle)),
      bottomHipVsKnee: Number.isFinite(bottomHip) && Number.isFinite(bottomKnee) ? (bottomHip >= bottomKnee ? "below_or_level" : "high") : "unknown"
    };
    const frontSummary = {
      shoulderHeightDiffPct: round(Math.max(...metrics.map((m) => Number(m.front.shoulderHeightDiffPct) || 0)), 1),
      hipHeightDiffPct: round(Math.max(...metrics.map((m) => Number(m.front.hipHeightDiffPct) || 0)), 1),
      kneeHeightDiffPct: round(Math.max(...metrics.map((m) => Number(m.front.kneeHeightDiffPct) || 0)), 1),
      centerShiftPct: round(Math.max(...metrics.map((m) => Number(m.front.centerShiftPct) || 0)), 1)
    };
    const confidence = round(clamp(landmarkConfidence * (cleanFrames.length >= 20 ? 1 : 0.75) * (pixelToMeter ? 1 : 0.88), 0.05, 0.95), 2);
    const flags = buildFlags({ viewAngle, angleMetrics, velocity, barPath, front: frontSummary, confidence });
    return {
      analysisVersion: "pose-analysis-v1",
      createdAt: new Date().toISOString(),
      viewAngle,
      lift: String(options.lift || "Lift"),
      setType: String(options.setType || "Set"),
      calibration: {
        mode: options.calibrationMode || (pixelToMeter ? "manual" : "relative"),
        pixelToMeter: pixelToMeter ? round(pixelToMeter, 6) : null,
        unit: pixelToMeter ? "metric estimate" : "relative only"
      },
      frameCount: cleanFrames.length,
      durationSeconds: round((cleanFrames[cleanFrames.length - 1].time || 0) - (cleanFrames[0].time || 0), 2),
      repPhases: reps,
      angleMetrics,
      velocityCurveSummary: velocity,
      barPathSummary: barPath,
      asymmetryFlags: viewAngle === "front" ? flags.flags : [],
      techniqueFlags: viewAngle === "side" ? flags.flags : [],
      confidence,
      confidenceLabel: confidence >= 0.72 ? "high" : confidence >= 0.45 ? "medium" : "low",
      coachCues: flags.cues,
      curvePreview: decimateCurve(metrics),
      keyFrames: {
        bottomTime: reps[0]?.bottomTime ?? null,
        lockoutTime: reps[0]?.lockoutTime ?? null
      },
      limitations: [
        "Single-camera estimate.",
        viewAngle === "front" ? "Front view is for asymmetry only; side-view depth and bar speed are limited." : "Side view cannot make reliable left-right asymmetry claims.",
        pixelToMeter ? "Metric speed depends on calibration quality." : "Velocity is relative because no metric calibration was provided."
      ]
    };
  }

  function buildSyntheticFrames(kind = "side", count = 60) {
    const frames = [];
    for (let i = 0; i < count; i += 1) {
      const phase = i / Math.max(count - 1, 1);
      const dip = Math.sin(Math.PI * phase);
      const yShift = dip * 0.18;
      const landmarks = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
      landmarks[L.leftShoulder] = { x: 0.45, y: 0.24 + yShift * 0.2, visibility: 0.95 };
      landmarks[L.rightShoulder] = { x: kind === "front" ? 0.57 : 0.47, y: 0.24 + yShift * 0.2, visibility: 0.95 };
      landmarks[L.leftHip] = { x: 0.44, y: 0.48 + yShift, visibility: 0.95 };
      landmarks[L.rightHip] = { x: kind === "front" ? 0.58 : 0.46, y: 0.48 + yShift * (kind === "front" ? 0.88 : 1), visibility: 0.95 };
      landmarks[L.leftKnee] = { x: 0.43, y: 0.68 + yShift * 0.35, visibility: 0.95 };
      landmarks[L.rightKnee] = { x: kind === "front" ? 0.6 : 0.45, y: 0.68 + yShift * 0.25, visibility: 0.95 };
      landmarks[L.leftAnkle] = { x: 0.42, y: 0.88, visibility: 0.95 };
      landmarks[L.rightAnkle] = { x: kind === "front" ? 0.61 : 0.44, y: 0.88, visibility: 0.95 };
      landmarks[L.leftWrist] = { x: 0.41, y: 0.34 + yShift * 0.7, visibility: 0.9 };
      landmarks[L.rightWrist] = { x: kind === "front" ? 0.62 : 0.43, y: 0.34 + yShift * 0.7, visibility: 0.9 };
      frames.push({ time: i / 12, width: 720, height: 1280, landmarks });
    }
    return frames;
  }

  return {
    analyzeLandmarkFrames,
    buildSyntheticFrames,
    _test: {
      angleDeg,
      torsoAngleDeg,
      detectRepPhases,
      velocitySummary,
      barPathSummary,
      chooseSide
    }
  };
});
