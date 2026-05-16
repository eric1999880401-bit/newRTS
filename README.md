# Powerlifting Log

Powerlifting Log 是一個單頁式健力訓練紀錄工具，適合用來管理 RTS/RPE 風格的課表、當日訓練紀錄、e1RM、back-off 重量建議與疲勞下降比例。這個版本目前先保留在本機資料夾內，尚未發布到 GitHub。

## 主要功能

- 多位運動員 profile：每個人都有獨立名稱、課表、訓練紀錄、四捨五入重量與疲勞門檻。
- 今日訓練儀表板：快速看到目前運動員、今日組數、今日最高 e1RM、課表列數與 back-off 計算基準。
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
5. 回到 `Today` 頁面選 Week / Day，輸入當日訓練組數。
5. 用 `Export All` 或 `Backup Logs` 定期備份資料。

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

訓練資料現在只儲存在 Firebase Realtime Database。App 不再讀寫瀏覽器 `localStorage`，未連上 Firebase 時，新增組數、課表或設定不會被持久保存。

## Firebase 同步

App 會自動使用內建的預設 Firebase Realtime Database。`Setup` 頁面也可貼上自訂 Firebase config，至少需要：

- `databaseURL`

注意事項：

- 不要把任何私密金鑰、服務帳號 JSON 或含敏感資訊的 `.env` 檔提交到 GitHub。
- 自訂 Firebase config 只保留在目前頁面工作階段；重新整理後會回到預設 Firebase 連線。
- 真正上線前，請確認 Realtime Database rules 有限制讀寫權限。

## 備份建議

雖然訓練資料儲存在 Firebase，仍建議定期使用：

- `Export All`
- `Backup Program`
- `Backup Logs`

建議每次大改程式前先匯出一份 Excel 備份。

## 目前狀態

已完成：

- 手機優先 UI 重設計
- 今日摘要儀表板
- 動態新增運動員
- Demo Athlete 測試入口
- 多使用者資料結構與 Firebase 同步合併邏輯更新

尚未做：

- 正式登入系統
- Firebase rules 範本
- 自動化測試套件
- GitHub Pages 或其他正式部署
