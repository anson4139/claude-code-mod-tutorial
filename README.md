# Claude Code mod 教學：session-board 工作台

這裡教的是 Claude Code 的 **mod**：一支跑在 Claude Code 裡面的程式，可以在畫面上加東西、加自己的斜線指令、改變它做事的方式。給 SA、PG、PM 看的，不需要先懂程式，用講的就能請 Claude 幫您寫。

範例是「session-board」：在輸入框上方加一個資訊與按鈕區，看得到額度與對話空間用了多少，並提供常用功能的按鈕。

## 看哪份

| 想知道 | 看這份 |
|---|---|
| mod 是什麼、怎麼運作、怎麼安裝、安全與關閉、怎麼請 Claude 寫一個 | [mod教學.md](mod教學.md)（魚骨圖：[mod魚骨圖.svg](mod魚骨圖.svg)） |
| session-board 的完整規格、**安裝步驟**、驗證清單、自己調整 | [session-board-設計規格與安裝.md](session-board-設計規格與安裝.md) |
| 範例程式 | [範本/session-board](範本/session-board) |
| 對照用：會議紀錄整理（**技能外掛，不是 mod**：只有說明檔，沒有程式） | [範本/meeting-minutes](範本/meeting-minutes) |

## 怎麼安裝（摘要）

1. 取得**整個資料夾**（Download ZIP 解壓縮，或 `git clone`）。只拿單一份文件不夠，安裝要複製旁邊的 `範本/session-board`。
2. 打開 Claude Code，請它讀 `session-board-設計規格與安裝.md`，照第 6-2 節幫您安裝；或照同一節手動做 5 步。
3. 完整關掉 Claude Code 再開，依第 6-3 節的清單驗證。

完整步驟與常見問題請看 [session-board-設計規格與安裝.md](session-board-設計規格與安裝.md) 第 6 節。

## 裝之前請先知道（它會做什麼）

- **讀寫本機檔案**：讀寫 `~/.claude/session-board/`（每個對話一份狀態檔），並讀 `~/.claude/projects/` 內的記憶檔來顯示「記憶」。資料只在本機。
- **會多用額度**：按「記憶」「產生建議」「整理重點」時會呼叫模型一次，用量很小，但會算進您的額度。
- **會改系統提示**：它會在每個對話加一條「用台灣繁體中文回覆」的規則（程式裡的 `ZH_TW_RULE`）。不想要可在程式搜尋這個名稱後移除。
- **不改您的專案檔**。
- **mod 沒有沙盒**：它用的是您的使用者權限。請只安裝您信任、並且看得懂做什麼的 mod；這份程式的原始碼就在 [範本/session-board/hooks/register.tsx](範本/session-board/hooks/register.tsx)，裝之前建議自己（或請 Claude）讀過一遍。
- 安裝會修改 `~/.claude/settings.json` 的 `env`，請先備份。

## 測試範圍（誠實說明）

- 在 **Windows、Claude 桌面版（內含 Claude Code 2.1.299）** 上測過安裝與載入；沒有放 `.claude-plugin/types` 資料夾也能載入，重開後 Claude Code 會自動產生。
- 終端機版、Mac、其他版本**沒有測過**。
- 視窗太窄時第 3 排按鈕可能換行，沒有針對各種寬度測過。

## 授權

[MIT License](LICENSE)，Copyright (c) 2026 Anson Chiang。

## 參考資料

- 官方部落格：Customize Claude Code with mods — https://claude.com/blog/claude-code-mods
- 官方文件：Mods overview — https://code.claude.com/docs/en/plugins/mods/overview
- 官方文件：Create a mod — https://code.claude.com/docs/en/plugins/mods/create
