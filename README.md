# Powerlifting Log

## AI Coach v1 / Experimental Video RPE

This branch adds the next product layer. Production is deployed on Firebase Blaze with Cloud Functions secrets and Firebase Storage rules.

- AI Coach v1 lives behind Firebase Callable Functions. The OpenAI API key stays server-side in `OPENAI_API_KEY`; it is never placed in `index.html`.
- AI requests use anonymous training summaries and return structured suggestions only. Suggestions are saved as `aiCoachSessions` and require a manual Apply before changing today's log form or coach decision history.
- Video RPE v1 stores video files in Firebase Storage and saves only metadata/results in Realtime Database. The RPE estimate is experimental and must not replace manual RPE.
- Pose Analysis v1 runs in the browser with MediaPipe Pose Landmarker, calculates joint-angle summaries, rep phases, velocity/drop estimates, bar-path proxy, and front-view asymmetry flags, then saves only the summary to RTDB by default.
- Pose AI v1 can ask for weak-point analysis or an RPE second opinion from saved pose metrics. It does not send raw video to OpenAI.
- Cost safety: Google Cloud budget alert is TWD 150/month, AI Coach defaults to 5 calls/user/day and 150 calls/project/month, raw video saving is optional, uploaded videos are capped at 120MB, and expired raw pose videos are cleaned up daily.

Powerlifting Log 是一個單頁式健力訓練紀錄工具，適合用來管理 RTS/RPE 風格的課表、當日訓練紀錄、e1RM、back-off 重量建議與疲勞下降比例。這個版本目前先保留在本機資料夾內，尚未發布到 GitHub。

## 主要功能

- 多位運動員 profile：每個人都有獨立名稱、課表、訓練紀錄、四捨五入重量與疲勞門檻。
- 今日訓練儀表板：快速看到目前運動員、今日組數、今日最高 e1RM、課表列數與 back-off 計算基準。
- RTS Plan Builder v2：用不靠 AI 的 RTS-style 規則引擎產生 4-12 週課表草稿，包含 protocol library、stress index、central/peripheral stress、TTP/response profile 與每堂課的可解釋規則。
- Readiness Coach：記錄睡眠、壓力、痠痛、疼痛、動機與上一堂完成度，產生當日現場調整建議。
- Coach Decision：可將規則式建議手動套用到 log form，例如降 RPE、減 back-off、deload 或停止重訓主項。
- Progress Dashboard：彙整近 28 天訓練量、e1RM、readiness 與教練決策。
- AI Coach v1：透過 Firebase Callable Functions 讀取匿名訓練摘要，回傳可解釋建議；只有使用者按 Apply 才會寫入 coach decision。
- Experimental Video RPE：支援影片 metadata / Storage 上傳、人工 RPE、rep tempo 與半自動 RPE estimate；估算只作為參考。
- 課表檢視：依 Week / Day 查看匯入的主項、副項與配件訓練。
- 訓練紀錄：輸入 lift、variation、set type、reps、weight、RPE 後自動計算 `%1RM`、e1RM、建議 back-off 重量與 fatigue drop。
- 歷史紀錄：依日期彙整訓練內容，支援展開查看每一組。
- Excel / CSV 匯入匯出：可匯入課表、備份單一運動員課表、備份 logs、匯出全部資料。
- Firebase Realtime Database 儲存：貼上 Firebase config 後，訓練資料會寫入 Firebase，不再存在瀏覽器 localStorage。

## 快速開始

1. 打開 `index.html`。
2. 打開 App 後會自動連到預設 Firebase Realtime Database；若要改用其他 Firebase 專案，可到 `Setup` 頁面貼上 config 並按 `Connect & Sync`。
3. 選擇或新增 Athlete。
4. 在 `Setup` 頁面匯入課表，或按 `Reload bundled sample program` 載入內建範例。
5. 到 `Plan Builder` 產生 RTS 規則式課表草稿，確認後按 `Apply to active program`。
6. 回到 `Today` 頁面選 Week / Day，輸入當日訓練組數。
7. 訓練前可到 `Coach` 頁面填 readiness check，產生今日調整建議。
8. 用 `Export All` 或 `Backup Logs` 定期備份資料。

這是一個靜態 HTML 檔，不需要安裝 Node、npm 或後端伺服器即可使用。

## 新增運動員

點選上方 `Add Athlete`：

- `Create Athlete` 會新增空白訓練紀錄，可選擇是否複製目前運動員課表。
- `Add Demo Athlete` 會新增一個帶有假訓練紀錄的測試 profile，方便確認手機版畫面、今日摘要、歷史紀錄與切換運動員流程。

## 課表匯入格式

建議使用 `.xlsx`，工作表名稱可用 `Schedule_12w`。支援欄位：

- `Week`
- `Day`
- `Phase`
- `Focus`
- `Main Lift`
- `Top Set Target`
- `Back-off Plan`
- `Secondary Lift`
- `Secondary Prescription`
- `Accessories / Notes`

App 內的 `Download Program Template` 會產生範本檔。

## 資料儲存

訓練資料、運動員 profile、generated plan drafts、readiness checks、coach decisions、AI coach packet 紀錄與 video review notes 都儲存在 Firebase Realtime Database。App 不再讀寫瀏覽器 `localStorage` 作為訓練資料來源，未連上 Firebase 時，新增組數、課表或設定不會被持久保存。

## Firebase 同步

App 會自動使用內建的預設 Firebase Realtime Database。`Setup` 頁面也可貼上自訂 Firebase config，至少需要：

- `databaseURL`

注意事項：

- 不要把任何私密金鑰、服務帳號 JSON 或含敏感資訊的 `.env` 檔提交到 GitHub。
- 自訂 Firebase config 只保留在目前頁面工作階段；重新整理後會回到預設 Firebase 連線。

## Auth migration safety

登入版的資料安全規則是：不要刪除或覆蓋舊的 `powerlifting_log`。新版會先讀取 legacy path 做預覽，登入後才能按 `Claim existing training data`，流程是：

1. 讀取 legacy `powerlifting_log`。
2. 顯示 athletes / logs / program rows / coach decisions 等數量。
3. 寫入 `migrationBackups/{uid}/{timestamp}` 完整備份。
4. 複製資料到 `users/{uid}` scoped path。
5. 比對 legacy counts 和 scoped counts，一致才標記 migration complete。

新版 app 不會再用 root `set()` 覆寫 `powerlifting_log`。完成 claim 以前，寫入會被鎖住，以保護既有訓練紀錄。
- 真正上線前，請確認 Realtime Database rules 有限制讀寫權限。

## 備份建議

雖然訓練資料儲存在 Firebase，仍建議定期使用：

- `Export All`
- `Backup Program`
- `Backup Logs`

建議每次大改程式前先匯出一份 Excel 備份。

## 測試

可用 Node 跑核心規則引擎 smoke test：

```bash
node tests/rts-engine-smoke.js
```

這會檢查 RPE/e1RM、四捨五入、8 週 RTS v2 plan generation、pivot week、protocol selection、stress index、TTP/response profile、readiness downshift 與疼痛紅旗規則。

## 目前狀態

已完成：

- 手機優先 UI 重設計
- 今日摘要儀表板
- 動態新增運動員
- Demo Athlete 測試入口
- 多使用者資料結構與 Firebase 同步合併邏輯更新
- Firebase-only schema v2：plan drafts、readiness、coach decisions、AI packets、video review notes
- RTS Plan Builder v2：deterministic RTS-style rules engine，不靠 AI 產生課表，輸出 protocol / stress / TTP / response explanations
- Readiness Coach v1：睡眠/壓力/痠痛/疼痛/上一堂完成度的當日調整
- Progress Dashboard v1
- 匿名 AI coach packet 產生器
- AI Coach / Video RPE production deploy：Firebase Callable Functions、OpenAI server-side secret、Storage upload metadata
- Pose Analysis v1：端上姿態分析、角度/速度/槓路 proxy、front-view 不平衡 flags
- Pose AI v1：可將 pose summary 交給 AI 做弱點分析或 RPE second opinion，不傳原始影片
- Storage 防爆：影片上傳限登入者本人、video MIME、120MB 以下；原始影片選存 30 天並由 scheduled cleanup 清理

尚未完成：

- 完整 E2E 自動化測試套件。
- 更完整的人工標註面板：rep-by-rep 標註、弱點標籤、manual RPE 校準、教練 note。
- 更可靠的影片分析：目前是影片估算與 pose proxy，還不是 VBT 裝置或實驗室等級動作品質判讀。
- Pig legacy 資料仍需等她登入後自行 claim；不要刪除 legacy `powerlifting_log`。
