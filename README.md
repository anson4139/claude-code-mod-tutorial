# Claude Code mod 教學：session-board 工作台

這裡教的是 Claude Code 的 **mod**：一支跑在 Claude Code 裡面的程式，可以在畫面上加東西、加自己的斜線指令、改變它做事的方式。給 SA、PG、PM 看的，不需要先懂程式，用講的就能請 Claude 幫您寫。

範例是「session-board」：在輸入框上方加一個資訊與按鈕區，看得到額度與對話空間用了多少，並提供常用功能的按鈕。

## 它有什麼

- **上方膠囊**（不用按，只是顯示）：5 小時額度、7 天額度、對話空間（%）、輸入／輸出／快取量、金額、對話數與執行中數量。
- **按鈕**：工作台、寫入記憶、壓縮空間、產生建議、先規劃、設目標、說明；每顆都有小圖示。會「做動作」的按鈕只把字放進輸入框，由您按 Enter 才執行（唯一例外是「壓縮空間」，它會先問）。
- **說明**：先解釋上方每個膠囊的意思，再列每顆按鈕的用法；說明裡的名稱和按鈕上的名稱一致。
- **工作台面板**：看各對話的狀態與下一步建議。

## 看哪份

| 想知道 | 看這份 |
|---|---|
| mod 是什麼、怎麼運作、怎麼安裝、安全與關閉、怎麼請 Claude 寫一個 | [mod教學.md](mod教學.md)（魚骨圖：[mod魚骨圖.svg](mod魚骨圖.svg)） |
| session-board 的完整規格、**安裝步驟**、驗證清單、自己調整 | [session-board-設計規格與安裝.md](session-board-設計規格與安裝.md) |
| 範例程式 | [範本/session-board](範本/session-board) |
| 對照用：會議紀錄整理（**技能外掛，不是 mod**：只有說明檔，沒有程式） | [範本/meeting-minutes](範本/meeting-minutes) |

## 怎麼安裝（摘要）

**方法一（建議）：一行指令安裝**

在終端機版 Claude Code 的輸入框貼上：

```
/plugin install session-board --marketplace anson4139/claude-code-mod-tutorial
```

桌面版不能用 `/plugin`：按輸入框旁的 **＋** → **Plugins** → **Add marketplace**，填 `anson4139/claude-code-mod-tutorial`，再選 **Add plugin** 加入 session-board。裝好後完整關掉 Claude Code 再開。

> 這條安裝路線是依官方文件寫的，**我們還沒有在別台電腦實測過**。裝不起來請用方法二，並告訴作者。

**方法二：手動安裝**

1. 取得**整個資料夾**（Download ZIP 解壓縮，或 `git clone`）。只拿單一份文件不夠，安裝要複製旁邊的 `範本/session-board`。
2. 打開 Claude Code，請它讀 `session-board-設計規格與安裝.md`，照第 6-2 節幫您安裝；或照同一節手動做 4 步。
3. 完整關掉 Claude Code 再開，依第 6-3 節的清單驗證。

完整步驟與常見問題請看 [session-board-設計規格與安裝.md](session-board-設計規格與安裝.md) 第 6 節。

## 裝之前請先知道（它會做什麼）

- **讀寫本機檔案**：讀寫 `~/.claude/session-board/`（每個對話一份狀態檔），並讀 `~/.claude/projects/` 內的記憶檔來顯示「寫入記憶」（這顆按鈕只讀取，不會改記憶檔）。資料只在本機。
- **會多用額度**：按「寫入記憶」「產生建議」「壓縮空間」時會呼叫模型一次，用量很小，但會算進您的額度。
- **會改系統提示**：它會在每個對話加一條「用台灣繁體中文回覆」的規則（程式裡的 `ZH_TW_RULE`）。不想要可在程式搜尋這個名稱後移除。
- **不改您的專案檔**。
- **mod 沒有沙盒**：它用的是您的使用者權限。請只安裝您信任、並且看得懂做什麼的 mod；這份程式的原始碼就在 [範本/session-board/hooks/register.tsx](範本/session-board/hooks/register.tsx)，裝之前建議自己（或請 Claude）讀過一遍。
- 方法二（手動安裝）會修改 `~/.claude/settings.json` 的 `env`，請先備份；方法一由 Claude Code 自己管理，不需要手改。

## 測試範圍（誠實說明）

- 在 **Windows、Claude 桌面版（內含 Claude Code 2.1.299）** 上測過安裝與載入；沒有放 `.claude-plugin/types` 資料夾也能載入，重開後 Claude Code 會自動產生。
- 終端機版、Mac、其他版本**沒有測過**。程式現在自己找 `~/.claude` 的位置（先看環境變數 `CLAUDE_CONFIG_DIR`，沒有就用使用者資料夾加 `/.claude`），不用再手動換路徑，但這個自動找路徑也只在作者的 Windows 電腦上測過。
- 按鈕列的名稱已縮短、間距已縮小，在作者的 Windows 桌面版上排成一行；視窗太窄時仍可能換行，沒有針對各種寬度測過。

## 更新紀錄

- **0.2.0（2026-10-28）**：按鈕改用短名稱並加上小圖示、縮小間距；「說明」新增上方膠囊的解說；拿掉「驗收」按鈕與「退回」說明；程式自己找 `~/.claude` 的位置，不用再手動換路徑；新增 `.claude-plugin/marketplace.json`，可用一行指令安裝。
- **0.1.0（2026-10-16～21）**：初版與手動安裝步驟。

## 授權

[MIT License](LICENSE)，Copyright (c) 2026 Anson Chiang。

## 參考資料

- 官方部落格：Customize Claude Code with mods — https://claude.com/blog/claude-code-mods
- 官方文件：Mods overview — https://code.claude.com/docs/en/plugins/mods/overview
- 官方文件：Create a mod — https://code.claude.com/docs/en/plugins/mods/create
