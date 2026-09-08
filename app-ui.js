/* Presentation only. Training values and cloud writes stay in index.html. */
(function (root) {
  "use strict";
  const names = {
    Squat: "深蹲", Bench: "臥推", Deadlift: "硬舉", "Comp Squat": "比賽式深蹲",
    "Comp Bench": "比賽式臥推", "Competition Deadlift": "比賽式硬舉", "Sumo Deadlift": "相撲硬舉",
    "Paused Bench": "停頓臥推", "2ct Paused Bench": "兩秒停頓臥推", "2ct Pause Squat": "兩秒停頓深蹲",
    "Warm up": "暖身", Top: "頂組", "Back off": "退階", Secondary: "副項",
    Deload: "降載", Accessory: "輔助", Other: "其他", Competition: "比賽式",
    Paused: "停頓", Tempo: "節奏", "Close Grip": "窄握", Deficit: "墊高",
    Board: "墊板", Pin: "架上", Spoto: "懸停", Box: "箱式", "Touch and Go": "觸胸不停頓",
    Fast: "快", Normal: "正常", Slow: "慢", Grind: "吃力"
  };
  function trainingLabel(value, lang) {
    return lang === "zh" ? (names[value] || value) : value;
  }
  function mainLiftProgress(logs, { date, week, day, family, topSets, backoffSets }) {
    const sameFamily = (lift) => {
      const text = String(lift || "").toLowerCase();
      if (text.includes("bench") || text.includes("press")) return "Bench";
      if (text.includes("dead") || text.includes("pull")) return "Deadlift";
      if (text.includes("squat")) return "Squat";
      return lift;
    };
    const matches = logs.filter((log) => log.date === date && Number(log.week) === Number(week)
      && Number(log.day) === Number(day) && sameFamily(log.lift) === family);
    const planned = Math.max(0, topSets) + Math.max(0, backoffSets);
    const done = Math.min(topSets, matches.filter((log) => log.setType === "Top").length)
      + Math.min(backoffSets, matches.filter((log) => log.setType === "Back off").length);
    return { planned, done, percent: planned ? Math.round(done / planned * 100) : 0 };
  }

  function refreshPlannerLabels(lang) {
    const pick = (pair) => pair[lang === "zh" ? 0 : 1];
    const fields = {
      onboardMeetDate: ["目標 / 測驗日期", "Target / test date"], onboardDays: ["每週訓練天數", "Days per week"],
      onboardExperience: ["訓練年資", "Experience"], onboardWeakness: ["主要弱點", "Main focus"],
      onboardFatigue: ["疲勞耐受度", "Fatigue tolerance"], onboardEquipment: ["器材 / 限制", "Equipment / limitations"],
      onboardSquat: ["深蹲 e1RM kg", "Squat e1RM kg"], onboardBench: ["臥推 e1RM kg", "Bench e1RM kg"], onboardDeadlift: ["硬舉 e1RM kg", "Deadlift e1RM kg"],
      builderWeeks: ["週期長度", "Program length"], builderDays: ["每週訓練天數", "Days per week"],
      builderGoal: ["週期目標", "Program goal"], builderStrategy: ["規劃模式", "Planning approach"],
      builderStressBudget: ["訓練壓力", "Training stress"], builderMeetDate: ["測驗 / 比賽日期", "Test / meet date"],
      builderWeakness: ["主要弱點", "Main focus"], builderExperience: ["訓練年資", "Experience"],
      builderEquipment: ["器材 / 限制", "Equipment / limitations"], builderNotes: ["訓練備註", "Training notes"]
    };
    for (const [id, pair] of Object.entries(fields)) document.querySelector(`label[for="${id}"]`).textContent = pick(pair);
    const options = {
      novice: ["新手", "Beginner"], intermediate: ["中階", "Intermediate"], advanced: ["進階", "Advanced"],
      "squat-control": ["深蹲深度 / 控制", "Squat depth / control"], "bench-pause": ["臥推停頓", "Bench pause"],
      "deadlift-floor": ["硬舉離地", "Deadlift off the floor"], lockout: ["鎖定力量", "Lockout"], recovery: ["恢復管理", "Recovery"],
      conservative: ["保守", "Conservative"], moderate: ["中等", "Moderate"], aggressive: ["較高", "Higher"],
      accumulation: ["累積 / 技術", "Accumulation / technique"], strength: ["力量 / 強化", "Strength"], realization: ["測驗 / 模擬比賽", "Test / mock meet"],
      emerging: ["依個人反應調整", "Individual response"], generalized: ["中階訓練者通用", "Intermediate program"], meet: ["比賽 / 測驗準備", "Meet / test preparation"]
    };
    document.querySelectorAll("#page-planner select option").forEach((option) => {
      const value = option.value;
      if (options[value]) option.textContent = pick(options[value]);
      else if (option.parentElement.id === "builderWeeks") option.textContent = `${value} ${pick(["週", "weeks"])}`;
      else if (["builderDays", "onboardDays"].includes(option.parentElement.id)) option.textContent = `${value} ${pick(["天", "days"])}`;
    });
    const copy = {
      ".quest-summary-copy > span": ["初次設定", "Getting started"], ".quest-summary-copy > strong": ["建立第一份課表", "Create your first program"],
      "#onboardGenerateBtn": ["套用設定並產生課表", "Use settings and generate"], "#onboardFillBtn": ["只填入設定", "Fill settings only"],
      ".builder-console-copy > span": ["課表設定", "Program setup"],
      ".builder-stat:nth-child(1) > span": ["週期", "Program"], ".builder-stat:nth-child(2) > span": ["頻率", "Frequency"],
      ".builder-stat:nth-child(3) > span": ["目標", "Goal"], ".builder-stat:nth-child(4) > span": ["重點", "Focus"],
      ".builder-advanced-drawer > summary": ["進階限制與備註", "Limitations and notes"],
      "#generatePlanBtn": ["產生課表", "Generate program"], "#savePlanDraftBtn": ["儲存草稿", "Save draft"],
      "#applyGeneratedPlanBtn": ["套用到今日訓練", "Use for training"],
      ".builder-footer-note": ["草稿可先編輯；確認套用後，才會更新目前課表。", "Edit the draft first. Your current program changes only after you confirm."],
      "#page-planner .product-grid > section:nth-child(2) > h2": ["課表預覽", "Program preview"],
      "#page-planner .product-grid > section:nth-child(2) > .hint": ["查看各週安排與訓練細節。", "Review weekly sessions and prescriptions."]
    };
    for (const [selector, pair] of Object.entries(copy)) {
      const element = document.querySelector(selector);
      if (element) element.textContent = pick(pair);
    }
    for (const id of ["onboardSquat", "onboardBench", "onboardDeadlift", "onboardEquipment", "builderEquipment", "builderNotes"]) byId(id).placeholder = pick(["選填", "Optional"]);
  }

  let initialized = false;
  const opened = new Map();
  const byId = (id) => document.getElementById(id);
  function syncModals() {
    const modals = [...document.querySelectorAll(".modal-backdrop.open")];
    for (const [modal, previous] of opened) {
      if (!modals.includes(modal)) {
        opened.delete(modal);
        if (!modals.length) {
          document.querySelector(".app").inert = false;
          if (previous?.isConnected) previous.focus({ preventScroll: true });
        }
      }
    }
    modals.forEach((modal) => {
      if (opened.has(modal)) return;
      opened.set(modal, document.activeElement);
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      const heading = modal.querySelector("h2");
      if (heading?.id) modal.setAttribute("aria-labelledby", heading.id);
      const card = modal.querySelector(".modal-card");
      if (card) { card.tabIndex = -1; card.focus({ preventScroll: true }); }
    });
    document.body.classList.toggle("ui-dialog-open", modals.length > 0);
    document.querySelector(".app").inert = modals.length > 0;
  }
  function refresh({ lang = "zh", athletes = [], activeId, signedIn = false } = {}) {
    const zh = lang === "zh";
    refreshPlannerLabels(lang);
    root.renderBuilderVisualSummary();
    root.renderOnboardingQuestProgress();
    const select = byId("athleteSelect");
    if (select) {
      const selected = select.value;
      const next = athletes.map((athlete) => [athlete.id, athlete.name]);
      if (JSON.stringify([...select.options].map((o) => [o.value, o.text])) !== JSON.stringify(next)) {
        select.replaceChildren(...next.map(([id, name]) => new Option(name, id)));
      }
      select.value = activeId || selected;
      select.setAttribute("aria-label", zh ? "目前選手" : "Active athlete");
    }
    const text = {
      guestNoticeText: ["目前為範例預覽，登入後查看你的課表與紀錄。", "Sample preview. Sign in to see your plans and records."],
      guestSignInBtn: ["登入帳號", "Sign in"], todayPlanDisclosureLabel: ["完整課表與備註", "Full plan and notes"],
      calibrationDrawerLabel: ["個人化校準", "Personal calibration"], closeInteractionModalBtn: ["關閉", "Close"],
      coachDrawerLabel: ["訓練狀態與 AI 教練", "Readiness and AI coach"],
      plannerCurrentTitle: ["目前課表", "Current program"], plannerCurrentButton: ["查看訓練安排", "View schedule"],
      plannerBuildLabel: ["建立新課表", "Build a new program"],
      dashboardHistoryTitle: ["訓練回顧", "Training review"],
      recordBrowserLabel: ["依日期瀏覽與封存管理", "Browse dates and manage archives"],
      reviewInsightsLabel: ["恢復狀態與詳細分析", "Recovery and detailed insights"],
      trainingSettingsLabel: ["訓練設定與課表匯入", "Training settings and program import"],
      accountSheetButton: ["管理登入帳號", "Manage sign-in"],
      termsDrawerLabel: ["會員與安全說明", "Membership and safety"],
      historyIntro: ["查看、搜尋目前與已封存的訓練紀錄。", "Browse and search current and archived training records."],
      weeklyReviewIntro: ["回顧完成率、力量趨勢與疲勞，安排下一週訓練。", "Review consistency, strength trends, and fatigue before your next training week."]
    };
    for (const [id, labels] of Object.entries(text)) if (byId(id)) byId(id).textContent = labels[zh ? 0 : 1];
    if (byId("settingsAthleteName")) byId("settingsAthleteName").textContent = athletes.find((a) => a.id === activeId)?.name || "";
    if (byId("settingsAthleteLabel")) byId("settingsAthleteLabel").textContent = zh ? "目前選手" : "Active athlete";
    if (byId("dataManagementLabel")) byId("dataManagementLabel").textContent = zh ? "課表與紀錄管理" : "Manage program and records";
    if (byId("logInsightsLabel")) byId("logInsightsLabel").textContent = zh ? "重量建議與疲勞" : "Load guidance and fatigue";
    if (byId("guestNotice")) byId("guestNotice").hidden = signedIn;
    document.body.dataset.signedIn = String(signedIn);
    document.querySelector("label[for='sessionDate']").textContent = zh ? "日期" : "Date";
    if (byId("sessionDate") && byId("logDate") && document.activeElement !== byId("sessionDate")) byId("sessionDate").value = byId("logDate").value;
    document.querySelectorAll(".page-tab").forEach((button) => {
      button.setAttribute("aria-current", button.classList.contains("active") ? "page" : "false");
    });
    const activePage = document.querySelector(".page-content.active");
    if (activePage) {
      activePage.tabIndex = -1;
      const skip = document.querySelector(".skip-link");
      skip.href = `#${activePage.id}`;
      skip.textContent = zh ? "跳至主要內容" : "Skip to content";
    }
    document.querySelectorAll("#logLift option, #logSetType option, #logVariation option, #videoLift option, #videoSetType option, #videoSpeed option").forEach((option) => {
      const value = option.value;
      option.value = value;
      option.textContent = trainingLabel(value, lang);
    });
    document.querySelectorAll(".segmented button[data-value]").forEach((button) => {
      button.textContent = trainingLabel(button.dataset.value, lang);
      button.setAttribute("aria-pressed", String(button.classList.contains("active")));
    });
    byId("openSyncModalBtn").title = zh ? "帳號與同步" : "Account and sync";
    byId("openMembershipModalBtn").title = zh ? "會員狀態" : "Membership";
    byId("closeInteractionModalBtn").title = zh ? "關閉" : "Close";
    byId("closeInteractionModalBtn").setAttribute("aria-label", zh ? "關閉" : "Close");
  }
  function init() {
    if (initialized) return;
    initialized = true;
    document.querySelector(".header-actions").append(document.querySelector(".top-command-dock"));
    const logConsole = document.querySelector(".log-console");
    const insights = document.createElement("details");
    insights.className = "log-insights";
    insights.innerHTML = '<summary id="logInsightsLabel"></summary>';
    const advanced = document.querySelector(".quick-advanced-controls");
    insights.append(logConsole.querySelector(".metrics"), logConsole.querySelector(".fatigue-rail"), byId("calcSourceNote"));
    logConsole.querySelector(".save-row").after(insights, advanced);
    byId("guestSignInBtn").addEventListener("click", () => byId("openSyncModalBtn").click());
    byId("sessionDate").addEventListener("change", () => {
      byId("logDate").value = byId("sessionDate").value;
      byId("logDate").dispatchEvent(new Event("change", { bubbles: true }));
    });
    byId("athleteSelect").addEventListener("change", () => root.switchActiveUser(byId("athleteSelect").value));
    const settingsToolbar = document.createElement("div");
    settingsToolbar.className = "settings-toolbar";
    settingsToolbar.innerHTML = '<div><small id="settingsAthleteLabel"></small><strong id="settingsAthleteName"></strong></div>';
    settingsToolbar.append(byId("addUserBtn"));
    byId("page-settings").prepend(settingsToolbar);
    const dataDrawer = document.createElement("details");
    dataDrawer.className = "data-management-drawer";
    dataDrawer.innerHTML = '<summary id="dataManagementLabel"></summary><div class="actions-inline"></div>';
    byId("saveSettingsBtn").closest("section").append(dataDrawer);
    dataDrawer.lastElementChild.append(byId("loadBundledProgramBtn"), byId("clearActiveDataBtn"), byId("deleteAthleteBtn"));
    const settingsGrid = byId("userName").closest("section").parentElement;
    const settingsDrawer = document.createElement("details");
    settingsDrawer.className = "settings-detail-drawer";
    settingsDrawer.innerHTML = '<summary id="trainingSettingsLabel"></summary>';
    settingsGrid.before(settingsDrawer);
    settingsDrawer.append(settingsGrid);
    const accountButton = document.createElement("button");
    accountButton.id = "accountSheetButton";
    accountButton.type = "button";
    accountButton.addEventListener("click", () => byId("openSyncModalBtn").click());
    byId("refreshAccountStatusBtn").before(accountButton);
    const termsDrawer = document.createElement("details");
    termsDrawer.className = "advanced-drawer";
    termsDrawer.innerHTML = '<summary id="termsDrawerLabel"></summary>';
    byId("termsPanel").before(termsDrawer);
    termsDrawer.append(byId("termsPanel"));
    const coach = byId("coachToolsGrid");
    const analysisBand = byId("poseAnalysisOutput").closest(".feature-band");
    analysisBand.after(byId("manualAnnotationPanel"), document.querySelector(".calibration-drawer"));
    const coachDrawer = document.createElement("details");
    coachDrawer.className = "coach-drawer";
    coachDrawer.id = "coachDrawer";
    const summary = document.createElement("summary");
    summary.id = "coachDrawerLabel";
    coach.before(coachDrawer);
    coachDrawer.append(summary, coach);
    const planner = document.querySelector("#page-planner > .product-grid");
    const builderDrawer = document.createElement("details");
    builderDrawer.className = "builder-drawer";
    const builderSummary = document.createElement("summary");
    builderSummary.id = "plannerBuildLabel";
    planner.before(builderDrawer);
    builderDrawer.append(builderSummary, planner);
    const current = document.createElement("section");
    current.className = "current-program-entry";
    current.innerHTML = '<div><h2 id="plannerCurrentTitle"></h2><p id="plannerCurrentDescription"></p></div><button id="plannerCurrentButton" type="button"></button>';
    byId("page-planner").prepend(current);
    byId("plannerCurrentButton").addEventListener("click", () => root.openTodayPlanSheet());
    byId("onboardGenerateBtn").addEventListener("click", () => { builderDrawer.open = true; });
    document.querySelectorAll(".modal-backdrop").forEach((modal) => {
      new MutationObserver(syncModals).observe(modal, { attributes: true, attributeFilter: ["class"] });
    });
    document.addEventListener("keydown", (event) => {
      const modal = [...opened.keys()].at(-1);
      if (!modal) return;
      if (event.key === "Escape" && modal.id === "editModal") root.closeEditModal();
      if (event.key !== "Tab") return;
      const focusable = [...modal.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, a[href], [tabindex="0"]')]
        .filter((el) => el.getClientRects().length && !el.closest("[inert]"));
      const index = focusable.indexOf(document.activeElement);
      if (!focusable.length) { event.preventDefault(); return; }
      if (event.shiftKey && index <= 0) { event.preventDefault(); focusable.at(-1).focus(); }
      else if (!event.shiftKey && (index === -1 || index === focusable.length - 1)) { event.preventDefault(); focusable[0].focus(); }
    }, true);
  }
  const api = { trainingLabel, mainLiftProgress, refresh, init };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppUI = api;
})(typeof window !== "undefined" ? window : globalThis);
