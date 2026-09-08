"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ui = require("../app-ui.js");
const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const main = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].at(-1)[1];
new vm.Script(main);

// Progress counts the selected main lift's prescribed categories, not warm-ups or other sessions.
const context = { date: "2026-09-09", week: 1, day: 1, family: "Squat", topSets: 1, backoffSets: 3 };
const log = (setType, overrides = {}) => ({ ...context, lift: "Comp Squat", setType, ...overrides });
const work = [log("Top"), log("Back off")];
const noise = [log("Warm up"), log("Secondary"), log("Top", { lift: "Bench" }), log("Top", { date: "2026-09-08" }), log("Back off", { week: 2 }), log("Back off", { day: 2 })];
assert.deepEqual(ui.mainLiftProgress([...work, ...noise], context), { planned: 4, done: 2, percent: 50 });
assert.equal(ui.mainLiftProgress(Array.from({ length: 8 }, () => log("Top")), context).percent, 25);
assert.equal(ui.mainLiftProgress([...work, log("Back off"), log("Back off")], context).percent, 100);
assert.deepEqual(ui.mainLiftProgress(noise, { ...context, topSets: 0, backoffSets: 0 }), { planned: 0, done: 0, percent: 0 });
assert.equal(ui.trainingLabel("Back off", "zh"), "退階");
assert.equal(ui.trainingLabel("Back off", "en"), "Back off");
assert.equal(ui.trainingLabel("My custom lift", "zh"), "My custom lift");

// Exercise the actual application date function at the Taiwan midnight boundary.
const dateCode = main.slice(main.indexOf("function todayString("), main.indexOf("function parseDateValue("));
const dateApi = new Function(`${dateCode}; return todayString;`)();
process.env.TZ = "Asia/Taipei";
assert.equal(dateApi(new Date("2026-09-08T16:30:00Z")), "2026-09-09");
assert.equal(dateApi(new Date("2026-12-31T16:01:00Z")), "2027-01-01");

// Exercise the actual record-center renderer with synthetic old and archived rows.
const historyCode = main.slice(main.indexOf("function openHistoryCenterModal()"), main.indexOf("function collectBuilderInputs()"));
function checkHistory(lang) {
  const rows = Array.from({ length: 150 }, (_, i) => ({
    id: `fixture-${i}`, date: "2020-01-01", order: i, lift: "Squat", setType: "Top",
    reps: 1, weight: 100, rpe: 8, e1rm: 110, archived: i >= 100
  }));
  const ids = ["recordScopeFilter", "recordLiftFilter", "recordDaysFilter", "recordSearchFilter", "recordResultCount", "recordLoadMore", "recordCenterList", "sheetArchiveCycleBtn", "sheetDeleteLogsBtn"];
  const elements = Object.fromEntries(ids.map((id) => [id, {
    value: id === "recordSearchFilter" ? "" : "all", handlers: {},
    addEventListener(event, callback) { this.handlers[event] = callback; }, querySelectorAll() { return []; }
  }]));
  const sandbox = {
    currentLanguage: () => lang, getActiveUser: () => ({ logs: rows.slice(0, 100), archivedCycles: [{}] }),
    getAllTrainingLogs: (_, { includeArchived = true } = {}) => rows.filter((row) => includeArchived || !row.archived),
    buildTrainingOptions: () => "", escapeHtml: String, formatNumber: String, liftFamily: (value) => value,
    parseDateValue: (value) => new Date(value), window: { AppUI: ui },
    openInteractionModal(title, content, mount) {
      assert.equal(title, lang === "zh" ? "紀錄中心" : "Training records");
      assert.match(content, /id="recordScopeFilter"[^>]*><option value="all">/);
      assert.match(content, /id="recordDaysFilter"[^>]*><option value="all">/);
      mount({ querySelector: (selector) => elements[selector.slice(1)] });
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(`${historyCode}; openHistoryCenterModal();`, sandbox);
  assert.equal((elements.recordCenterList.innerHTML.match(/class="record-center-item"/g) || []).length, 80);
  assert.equal(elements.recordLoadMore.hidden, false);
  elements.recordLoadMore.handlers.click();
  assert.equal((elements.recordCenterList.innerHTML.match(/class="record-center-item"/g) || []).length, 150);
  assert.equal(elements.recordLoadMore.hidden, true);
  elements.recordScopeFilter.value = "archived";
  elements.recordScopeFilter.handlers.input();
  assert.equal((elements.recordCenterList.innerHTML.match(/class="record-center-item"/g) || []).length, 50);
  assert.match(elements.recordCenterList.innerHTML, / disabled/);
  elements.recordScopeFilter.value = "active";
  elements.recordScopeFilter.handlers.input();
  assert.equal((elements.recordCenterList.innerHTML.match(/class="record-center-item"/g) || []).length, 80);
  assert.doesNotMatch(elements.recordCenterList.innerHTML, / disabled/);
  elements.recordSearchFilter.value = "nonexistent";
  elements.recordSearchFilter.handlers.input();
  assert.equal(elements.recordLoadMore.hidden, true);
  assert.equal(rows.length, 150);
}
checkHistory("zh");
checkHistory("en");

// Theme state follows the device until the user explicitly toggles it.
const themeCode = main.slice(main.indexOf("let themePinned = false;"), main.indexOf("window.newRtsEngine ="));
const themeAttributes = { "data-theme": "dark" };
const buttonAttributes = {};
const themeIcon = {};
const themeLabel = {};
const meta = {};
let language = "zh";
let deviceChange;
let themeClick;
const themeButton = {
  querySelector: (selector) => selector === ".theme-toggle-icon" ? themeIcon : themeLabel,
  setAttribute: (name, value) => { buttonAttributes[name] = value; },
  addEventListener: (_, callback) => { themeClick = callback; }
};
const themeContext = {
  currentLanguage: () => language,
  document: {
    documentElement: { setAttribute: (name, value) => { themeAttributes[name] = value; }, getAttribute: (name) => themeAttributes[name] },
    getElementById: () => themeButton,
    querySelector: () => ({ setAttribute: (name, value) => { meta[name] = value; } })
  },
  window: { matchMedia: () => ({ addEventListener: (_, callback) => { deviceChange = callback; } }) }
};
vm.createContext(themeContext);
vm.runInContext(themeCode, themeContext);
assert.equal(buttonAttributes["aria-pressed"], "true");
assert.equal(buttonAttributes["aria-label"], "深色模式");
assert.equal(themeLabel.textContent, "深色");
assert.equal(meta.content, "#121618");
deviceChange({ matches: false });
assert.equal(themeAttributes["data-theme"], "light");
themeClick();
deviceChange({ matches: false });
assert.equal(themeAttributes["data-theme"], "dark");
language = "en";
themeContext.applyTheme("dark");
assert.equal(buttonAttributes["aria-label"], "Dark mode");
assert.equal(themeLabel.textContent, "Dark");
assert.equal(themeButton.title, "Turn off dark mode");
themeClick();
assert.equal(buttonAttributes["aria-pressed"], "false");
assert.equal(meta.content, "#f5f7f8");

// Run the real save handler with a deferred store; no network or production writes.
const saveCode = main.slice(main.indexOf("async function saveSet()"), main.indexOf("function deleteLog("));
function createHarness(save) {
  const values = { logDate: "2026-09-09", logWeek: "1", logDay: "1", logLift: "Squat", logSetType: "Top", logWeight: "100", logReps: "5", logRpe: "8", logSessionFocus: "Test", logTechNotes: "", logGeneralNotes: "" };
  const elements = Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value }]));
  for (const id of ["saveSetBtn", "sheetSaveSetBtn"]) elements[id] = { disabled: false, setAttribute() {}, removeAttribute() {} };
  const user = { logs: [] };
  const sandbox = {
    document: { getElementById: (id) => elements[id] }, crypto: require("node:crypto").webcrypto,
    canWriteFirebase: () => true, getActiveUser: () => user, currentLanguage: () => "zh", getVariationValue: () => "Competition",
    computeCurrentMetrics: () => ({ pct: .8, e1rm: 125, targetReps: 5, targetRpe: 6, suggestedWeight: 95, fatiguePct: null }),
    saveState: save, showToast() {}, refreshAll() {}, renderUserTabs() {}, renderMetrics() {}, renderSessionLog() {}, renderHistory() {}, renderTodayCommandCenter() {}, console: { error() {} }
  };
  vm.createContext(sandbox);
  vm.runInContext(`let setSaveInFlight = false; ${saveCode}; this.runSave = saveSet;`, sandbox);
  return { run: sandbox.runSave, user, elements };
}
async function mainTest() {
  let release;
  let writes = 0;
  const h = createHarness(() => { writes++; return new Promise((resolve) => { release = resolve; }); });
  const first = h.run();
  assert.equal(h.elements.saveSetBtn.disabled, true);
  assert.equal(await h.run(), false);
  assert.equal(writes, 1);
  assert.equal(h.user.logs.length, 1);
  release(true);
  assert.equal(await first, true);
  assert.equal(h.elements.saveSetBtn.disabled, false);
  const failing = createHarness(() => Promise.reject(new Error("offline")));
  failing.user.logs.push({ id: "existing", date: "2026-09-08", weight: 95 });
  const prior = JSON.stringify(failing.user.logs);
  assert.equal(await failing.run(), false);
  assert.equal(JSON.stringify(failing.user.logs), prior);
  assert.equal(failing.elements.saveSetBtn.disabled, false);
  const invalid = createHarness(() => { throw new Error("must not save invalid inputs"); });
  invalid.elements.logWeight.value = "-1";
  assert.equal(await invalid.run(), false);
  assert.equal(invalid.user.logs.length, 0);
  console.log("app UI smoke ok: themes, progress, local dates, labels, history pagination/archives, double-save prevention, rollback, input validation");
}
mainTest().catch((error) => { console.error(error); process.exitCode = 1; });
