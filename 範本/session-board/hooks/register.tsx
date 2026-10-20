import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Limit, Mem, Row, Suggestion } from '../types'

const DIR = '__你的CLAUDE資料夾__/session-board'
const PROJECTS = '__你的CLAUDE資料夾__/projects'
const MEM_PANE = 'memory-view'
const BOARD_PANE = 'board'
const BOARD_TITLE = '工作台'
// what a control turns to under the pointer: a blue that reads on dark and light alike
const HOVER_COLOR = '#3b82f6'
// the suggestion the AI recommends: a green that reads on dark and light alike
const RECOMMEND_COLOR = '#16a34a'
const TICK_MS = 2000
const STALE_MS = 15000
const LABEL_LENGTH = 10
const LABEL_STORE = 40
const BAR = 10
const PILL_BAR = 5
const TWD_PER_USD = 31

const rows = atom({ plugin: 'session-board', key: 'rows' } as const, [] as Row[])
const selfId = atom({ plugin: 'session-board', key: 'selfId' } as const, '')
const confirming = atom({ plugin: 'session-board', key: 'confirming' } as const, false)
const compacting = atom({ plugin: 'session-board', key: 'compacting' } as const, false)

const memItems = atom({ plugin: 'session-board', key: 'memItems' } as const, [] as Mem[])
const memBusy = atom({ plugin: 'session-board', key: 'memBusy' } as const, false)
const memOpen = atom({ plugin: 'session-board', key: 'memOpen' } as const, [] as string[])
// the board shows this conversation alone until the person asks for every one
const boardAll = atom({ plugin: 'session-board', key: 'boardAll' } as const, false)
// off by default: the board and band keep to this conversation; /board-others turns it on, for every session
const showOthers = atom({ plugin: 'session-board', key: 'showOthers' } as const, false)
// when the person last pressed 產生建議: held by the host, so the timer's load sees a press from anywhere
const suggestAsk = atom({ plugin: 'session-board', key: 'suggestAsk' } as const, 0)
// whether the board shows the button guide at its top
const helpOpen = atom({ plugin: 'session-board', key: 'helpOpen' } as const, false)

// one entry per button: what it does, when to use it, what a press does. `fill` buttons put text in the composer.
// Plain words on purpose: this is the guide the person reads in the board.
const GUIDE = [
  { key: 'board', label: '工作台', what: '開啟右側面板，看這個對話的狀態與下一步建議。', when: '想知道現在進度、或不知道接下來該做什麼時。', effect: '只是打開面板，不會改任何東西。' },
  { key: 'memory', label: '記憶', what: '把 AI 替自己記的筆記翻成白話給您看。', when: '想確認 AI 記住了您的哪些習慣和規定時。', effect: '只讀取，不會修改記憶。' },
  { key: 'compact', label: '整理重點', what: '把前面的對話濃縮成摘要，騰出空間。', when: '上下文接近滿（按鈕變橘色）、AI 開始忘記前面講的事時。', effect: '點了會先問您確認；整理後細節被濃縮，無法還原。' },
  { key: 'suggest', label: '產生建議', what: '請 AI 根據目前對話，列出 2～3 個下一步。', when: '做完一段、不確定下一步，或想讓 AI 幫您想選項時。', effect: '結果顯示在工作台，點標題才會填入輸入框，不會自動送出。' },
  { key: 'context', label: '上下文（上方膠囊）', what: '膠囊顯示這個對話的空間用了多少 %，越滿 AI 越容易忘記前面講的話。', when: '覺得 AI 變慢、變笨時看一眼；接近 70% 就該考慮「整理重點」。', effect: '只是顯示，不用按；綠色安全、黃色注意、紅色快滿。' },
  { key: 'rewind', label: '退回（沒有按鈕，連按兩次 Esc）', what: '把對話或程式碼退回到之前某一次送出訊息的時間點。', when: 'AI 改壞了、或方向錯了想重來時。', effect: '在輸入框連按兩次 Esc（或輸入 /rewind），出現選單讓您挑時間點。注意：只能退回 AI 用編輯工具改的檔案。' },
  { key: 'plan', label: '先規劃', fill: '/plan', what: '切到「只規劃、不動手」的模式，AI 只讀檔案和寫計畫。', when: '要改好幾個檔案，或您自己也還不確定怎麼做時。', effect: '放進輸入框，按 Enter 後生效；一句話能講完的小修改不需要。' },
  { key: 'verify', label: '驗收提示', fill: '請自己跑測試或檢查，確認結果正確後，把執行的指令和輸出貼給我看，不要只說做好了。', what: '放入一段話，要求 AI 自己驗收並貼出證據。', when: 'AI 說「做好了」，但您不想自己再檢查一遍時。', effect: '只填入輸入框，您可以改字再送出。' },
  { key: 'goal', label: '設目標', fill: '/goal ', what: '設定「做到什麼程度才算完成」，沒達成 AI 會自己繼續做。', when: '您要離開一陣子，又希望回來時事情是真的做完的。', effect: '放進輸入框，您接著打條件（例如「全部測試都通過」）再按 Enter；輸入 /goal clear 可取消。' },
] as const
const SHOW_OTHERS_KEY = 'showOthers'

const COMPACT_HINT_PERCENT = 70
// band layout: row 1 quotas and space, row 2 usage and sessions, row 3 buttons (the secondary ones drawn without icons)
const ROW_QUOTA = ['five', 'seven', 'ctx']
const SECONDARY = ['plan', 'verify', 'goal', 'help']
// button colors by kind: look = blue, tidy up = amber / violet, tools = red / teal / green / indigo, help = grey
const BUTTON_COLOR: Record<string, string> = {
  board: '#60a5fa',
  memory: '#60a5fa',
  compact: '#fbbf24',
  suggest: '#c084fc',
  plan: '#2dd4bf',
  verify: '#4ade80',
  goal: '#818cf8',
  help: '#94a3b8',
}
// the first button of each kind starts a new group, set apart by a wider gap
const GROUP_START = ['compact', 'plan', 'help']
const COMPACT_INSTRUCTIONS =
  '保留：目標、已做的決定、還沒完成的事項、重要的檔案路徑、指令、數字與錯誤訊息。省略：嘗試錯誤的過程與重複的說明。'

let me: Row | null = null
let timer: unknown = null
let hasName = false
let hasWarned = false
// bumped by each prompt, so a summary that finishes after the person answered is dropped
let askSeq = 0
// the last suggestion request this load took; null until its first look
let takenRequest: number | null = null
let seen: Record<string, Row> = {}
// diagnostics: how often this session was asked to draw the band, and what it saw
let renders = 0
let listLen = -1

// a session that ran shorter than this finishes without a notice
const NOTIFY_MIN_MS = 10000
const ZH_TW_RULE =
  '一律使用繁體中文（台灣慣用詞彙）回覆，除非使用者明確要求其他語言。程式碼、指令、檔名、錯誤訊息與專有名詞保持原樣，不要翻譯。' +
  '列出選項讓使用者選擇時，挑出你建議的一個，在該選項標題後加上「**（建議）**」。'

const fileOf = (id: string) => `${DIR}/${id.replace(/[^\w-]/g, '_')}.json`
// a request for suggestions, written by the band's button and taken by the session's timer
const requestOf = (id: string) => `${DIR}/${id.replace(/[^\w-]/g, '_')}.suggest`

// a typed /command, or the rows the transcript keeps for one: never the person's question
const isSlashCommand = (text: string) =>
  /<command-name>|<local-command-|<command-message>/.test(text) || cleanText(text).startsWith('/')

const cleanText = (text: string) =>
  text
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<[^>]+>/g, '')
    .trim()

const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))

  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const usdOnly = (usd: number) => `US$${usd.toFixed(2)}`

const money = (usd: number) => `${usdOnly(usd)} ≈NT$${Math.round(usd * TWD_PER_USD)}`

const count = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)

const until = (iso: string | undefined, now: number) => {
  const ms = iso === undefined ? NaN : new Date(iso).getTime() - now

  if (!(ms > 0)) {
    return '—'
  }

  const minutes = Math.floor(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)

  return days > 0 ? `${days}d ${hours}h` : `${hours}h ${String(minutes % 60).padStart(2, '0')}m`
}

const cells = (percent: number, length: number) => {
  const filled = Math.max(0, Math.min(length, Math.round((percent / 100) * length)))

  return '▰'.repeat(filled) + '▱'.repeat(length - filled)
}

// green under 60%, amber under 85%, red above: [background, text]
const heat = (percent: number) =>
  percent < 60
    ? ['#064e3b', '#6ee7b7']
    : percent < 85
      ? ['#78350f', '#fcd34d']
      : ['#7f1d1d', '#fca5a5']

// --- pills: the desktop draws the top row as vector capsules ---
type Hue = { dark: string; light: string }

const HUES = {
  green: { dark: '#6ee7b7', light: '#047857' },
  amber: { dark: '#fcd34d', light: '#b45309' },
  red: { dark: '#fca5a5', light: '#b91c1c' },
  purple: { dark: '#c4b5fd', light: '#6d28d9' },
  pink: { dark: '#fda4af', light: '#be123c' },
  teal: { dark: '#5eead4', light: '#0f766e' },
  indigo: { dark: '#a5b4fc', light: '#4338ca' },
  gold: { dark: '#fcd34d', light: '#a16207' },
  slate: { dark: '#cbd5e1', light: '#475569' },
} satisfies Record<string, Hue>

const heatHue = (percent: number): Hue =>
  percent < 60 ? HUES.green : percent < 85 ? HUES.amber : HUES.red

// 24-unit stroke icons, drawn at 14px
const ICONS = {
  gauge: '<path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  up: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  down: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  layers: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  coin:
    '<circle cx="12" cy="12" r="10"/><path d="M12 6v12"/>' +
    '<path d="M15 9.5c0-1.2-1.3-2-3-2s-3 .8-3 2 1.3 1.7 3 2 3 .9 3 2.1-1.3 2-3 2-3-.8-3-2"/>',
  chat: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z"/>',
  activity: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  book:
    '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/>' +
    '<path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  scissors:
    '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
    '<path d="M20 4 8.12 15.88"/><path d="M14.47 14.48 20 20"/><path d="M8.12 8.12 12 12"/>',
  sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4"/>',
  rewind: '<path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  list: '<path d="M3 6h18M3 12h18M3 18h12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
}

// a lone icon, for a control whose label stays a native button
const iconSvg = (name: keyof typeof ICONS, hue: Hue) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24">` +
  `<style>.i{fill:none;stroke:${hue.dark};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}` +
  `@media (prefers-color-scheme:light){.i{stroke:${hue.light}}}</style><g class="i">${ICONS[name]}</g></svg>`

type Part =
  | { kind: 'icon'; name: keyof typeof ICONS }
  | { kind: 'text'; text: string; bold?: boolean; dim?: boolean }
  | { kind: 'bar'; percent: number; pace?: number }
  | { kind: 'rule' }

const PILL_H = 26
const PAD_X = 10
const PART_GAP = 6
const CHAR_W = 7
// a Chinese character takes about two monospace cells
const WIDE_W = 12
const ICON_W = 14
const BAR_W = 44

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const partWidth = (part: Part) =>
  part.kind === 'icon'
    ? ICON_W
    : part.kind === 'bar'
      ? BAR_W
      : part.kind === 'rule'
        ? 1
        : [...part.text].reduce((sum, ch) => sum + (ch.charCodeAt(0) >= 0x2e80 ? WIDE_W : CHAR_W), 0)

// one capsule: tinted fill, hairline border, parts laid left to right
const pill = (hue: Hue, parts: Part[]) => {
  const width = PAD_X * 2 + parts.reduce((sum, part) => sum + partWidth(part), 0) + PART_GAP * (parts.length - 1)
  const mid = PILL_H / 2
  let x = PAD_X
  let body = ''

  for (const part of parts) {
    const w = partWidth(part)

    if (part.kind === 'icon') {
      body += `<g class="i" transform="translate(${x} ${mid - 7}) scale(${ICON_W / 24})">${ICONS[part.name]}</g>`
    } else if (part.kind === 'text') {
      body +=
        `<text class="t${part.dim ? ' d' : ''}" x="${x}" y="${mid + 4}" textLength="${w}" lengthAdjust="spacing"` +
        `${part.bold ? ' font-weight="700"' : ''}>${esc(part.text)}</text>`
    } else if (part.kind === 'bar') {
      const fill = Math.max(0, Math.min(BAR_W, (part.percent / 100) * BAR_W))

      body += `<rect class="tr" x="${x}" y="${mid - 2}" width="${BAR_W}" height="4" rx="2"/>`
      body += `<rect class="f" x="${x}" y="${mid - 2}" width="${fill.toFixed(1)}" height="4" rx="2"/>`

      if (part.pace !== undefined) {
        const at = x + Math.max(0, Math.min(1, part.pace)) * BAR_W

        body += `<rect class="k" x="${(at - 1).toFixed(1)}" y="${mid - 5}" width="2" height="10" rx="1"/>`
      }
    } else {
      body += `<rect class="r" x="${x}" y="${mid - 7}" width="1" height="14"/>`
    }

    x += w + PART_GAP
  }

  const style =
    `.bg{fill:${hue.dark};fill-opacity:.1;stroke:${hue.dark};stroke-opacity:.35}` +
    `.t{fill:${hue.dark};font:12px ui-monospace,Consolas,Menlo,monospace}.d{fill-opacity:.75}` +
    `.i{fill:none;stroke:${hue.dark};stroke-width:2;stroke-linecap:round;stroke-linejoin:round}` +
    `.tr{fill:${hue.dark};fill-opacity:.2}.f{fill:${hue.dark}}.k{fill:#f8fafc}.r{fill:${hue.dark};fill-opacity:.35}` +
    `@media (prefers-color-scheme:light){.bg{fill:${hue.light};fill-opacity:.08;stroke:${hue.light}}` +
    `.t,.f,.r,.tr{fill:${hue.light}}.i{stroke:${hue.light}}.k{fill:#334155}}`

  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${PILL_H}" viewBox="0 0 ${width} ${PILL_H}">` +
    `<style>${style}</style>` +
    `<rect class="bg" x=".5" y=".5" width="${width - 1}" height="${PILL_H - 1}" rx="${mid - 0.5}"/>` +
    `${body}</svg>`

  return { source, width, height: PILL_H }
}

const WINDOW_MS = { five_hour: 5 * 3600e3, seven_day: 7 * 24 * 3600e3 } as Record<string, number>

// share of the window already gone: usage left of the tick is under pace
const paceOf = (limit: Limit, now: number) => {
  const span = WINDOW_MS[limit.kind]
  const left = limit.resetsAt === undefined ? NaN : new Date(limit.resetsAt).getTime() - now

  return span && left > 0 ? 1 - left / span : undefined
}

const quotaPill = (name: string, icon: keyof typeof ICONS, hue: Hue, limit: Limit, now: number) =>
  pill(hue, [
    { kind: 'icon', name: icon },
    { kind: 'text', text: name, dim: true },
    { kind: 'bar', percent: limit.percentUsed, pace: paceOf(limit, now) },
    { kind: 'text', text: `${Math.round(limit.percentUsed)}%`, bold: true },
    { kind: 'rule' },
    { kind: 'icon', name: 'clock' },
    { kind: 'text', text: until(limit.resetsAt, now), dim: true },
  ])

const countPill = (icon: keyof typeof ICONS, hue: Hue, text: string) =>
  pill(hue, [
    { kind: 'icon', name: icon },
    { kind: 'text', text, bold: true },
  ])
// --- end pills ---

const barOf = (row: Row, now: number) => {
  if (row.total !== undefined && row.total > 0) {
    const filled = Math.round((BAR * (row.done ?? 0)) / row.total)

    return `${'█'.repeat(filled)}${'░'.repeat(BAR - filled)} ${row.done ?? 0}/${row.total}`
  }

  if (row.status === 'running') {
    const at = Math.floor(now / TICK_MS) % BAR

    return Array.from({ length: BAR }, (_, i) => (i === at ? '▓' : '░')).join('')
  }

  return ''
}

async function save($: any, patch: Partial<Row>) {
  if (me === null) {
    return
  }

  me = { ...me, ...patch, updatedAt: await $.clock.now() }
  await $.fs.write(fileOf(me.id), JSON.stringify(me))
}

async function refresh($: any) {
  const now: number = await $.clock.now()
  const entries = await $.fs.list(DIR).catch(() => [])
  const found: Row[] = []

  for (const entry of entries) {
    if (!entry.name.endsWith('.json')) {
      continue
    }

    try {
      const row = JSON.parse(await $.fs.read(`${DIR}/${entry.name}`)) as Row

      if (row.status !== 'ended' && now - row.updatedAt < STALE_MS) {
        found.push(row)
      }
    } catch {
      // a file caught mid-write: the next tick reads it whole
    }
  }

  found.sort((a, b) => a.id.localeCompare(b.id))

  // another session that was running and has gone idle: tell the person looking at this one
  for (const row of found) {
    const was = seen[row.id]

    if (
      me !== null &&
      row.id !== me.id &&
      was?.status === 'running' &&
      row.status === 'idle' &&
      now - was.startedAt >= NOTIFY_MIN_MS
    ) {
      $.ui.toast(`「${row.label.slice(0, LABEL_LENGTH)}」已完成（${clock(now - was.startedAt)}）`)
    }

  }

  seen = Object.fromEntries(found.map(row => [row.id, row]))
  await update($, rows, () => found)
}

async function runCompact($: any) {
  await update($, confirming, () => false)
  await update($, compacting, () => true)

  try {
    // the same as typing /compact <instructions>: a desktop session is headless, where
    // $.session.compact is refused and a slash prompt must go through the command noun
    const result = await $.command.run({ command: 'compact', args: COMPACT_INSTRUCTIONS })

    $.ui.toast(result?.text ? `整理重點：${String(result.text).slice(0, 80)}` : '已整理重點')
  } catch (error) {
    $.ui.toast(`整理失敗：${String(error)}`)
  } finally {
    await update($, compacting, () => false)
  }
}

const MEM_PROMPT =
  '背景：使用者在 Claude 桌面版裡，請 AI 助理做了一個叫 session-board 的外掛（mod），它在輸入框上方畫一條資訊列，顯示各個對話的狀態、花費與額度，列上有「✂ 整理重點」（壓縮對話內容）和「📖 記憶」兩個按鈕。「分割畫面」指桌面版把兩個對話左右並排。\n\n' +
  '下面是 AI 助理寫給自己看的一則記憶筆記。請用繁體中文（台灣用語），像對完全不懂技術的人說明，2 句話以內：這在記什麼（要點名是哪個按鈕或哪個部分）、使用者遇到時該怎麼做。不要用術語，不要加標題或前言。\n\n'

// one translation per note, run only when the person asks: it costs a small model call each
async function loadMemory($: any) {
  await $.ui.open({ id: MEM_PANE, title: '記憶（白話）' })
  await update($, memBusy, () => true)

  try {
    const cwd: string = await $.session.cwd()
    const dir = `${PROJECTS}/${cwd.replace(/[^A-Za-z0-9]/g, '-')}/memory`
    const entries: Array<{ name: string }> = await $.fs.list(dir).catch(() => [])
    const files = entries
      .map(entry => entry.name)
      .filter(name => name.endsWith('.md') && name !== 'MEMORY.md')
      .sort()
    const items: Mem[] = await Promise.all(
      files.map(async file => ({
        file,
        raw: (await $.fs.read(`${dir}/${file}`)) as string,
        plain: '',
        state: 'wait' as const,
      })),
    )

    await update($, memItems, () => items)
    await Promise.all(
      items.map(async item => {
        let next: Pick<Mem, 'plain' | 'state'> = { plain: '', state: 'fail' }

        try {
          const result = await $.model.complete({
            model: 'haiku',
            prompt: MEM_PROMPT + item.raw,
            effort: 'low',
            maxTokens: 400,
          })

          next = result.isAnswered
            ? { plain: result.text.trim(), state: 'done' }
            : { plain: `翻譯失敗（${result.reason}）`, state: 'fail' }
        } catch (error) {
          next = { plain: `翻譯失敗：${String(error)}`, state: 'fail' }
        }

        await update($, memItems, list =>
          list.map(one => (one.file === item.file ? { ...one, ...next } : one)),
        )
      }),
    )
  } catch (error) {
    $.ui.toast(`讀取記憶失敗：${String(error)}`)
  } finally {
    await update($, memBusy, () => false)
  }
}

const openBoard = ($: any) => $.ui.open({ id: BOARD_PANE, title: BOARD_TITLE })

const ASK_TAIL = 6000
const ASK_MAX = 40
const PROMPT_TAIL = 1500
const NEXT_MAX = 3
const NEXT_LABEL_MAX = 24
const NEXT_DETAIL_MAX = 120
const NEXT_PROMPT_MAX = 600
// suggestions the person acts on need real judgment: a mid-size model, not the cheapest
const NEXT_MODEL = 'sonnet'
const SUGGEST_TIMEOUT_MS = 60000
// how long a press shows 產生中 before the timer has taken it; past this the button is back
const SUGGEST_PICKUP_MS = 6000
const ASK_PROMPT =
  '下面是使用者最後送出的訊息，和 AI 助理的回覆。請做兩件事：\n' +
  '1. 判斷回覆結尾是否在等使用者做決定、回答問題或提供東西（例如「要我動手嗎？」「要不要一起刪掉？」「請截圖給我」）。' +
  '如果是，用一句 30 字以內、讓人一眼看懂要決定什麼的話寫在 ask，例如「要不要刪掉 next-steps-app 草稿」。\n' +
  '2. 寫出使用者最可能接著送出的 2 到 3 則訊息，放在 next。回覆裡有列出選項時，優先照那些選項寫，' +
  '而且彼此要有明顯差別（例如：照做、換個做法、先確認）。每則包含：\n' +
  '   label：20 字以內、看了就知道要做什麼的標題，要有具體對象' +
  '（例如「把按鈕外框拿掉，只留滑鼠移過變色」，不要只寫「調整按鈕」）；\n' +
  '   detail：一到兩句、60 字以內，說明選了之後 AI 會做什麼、結果會怎樣；\n' +
  '   prompt：使用者會直接送出的完整訊息，用使用者的口吻，具體到 AI 不用再追問就能做；\n' +
  '   recommended：只有一則是 true，其餘 false。回覆裡標了（建議）的選項就選它；沒有標就選你判斷最好的一則。\n' +
  '全部用繁體中文（台灣用語）。只回 JSON，不要其他文字：' +
  '{"waiting": true 或 false, "ask": "...", "next": [{"label": "...", "detail": "...", "prompt": "...", "recommended": true 或 false}]}\n\n'

// one model call each time the person presses 產生建議: what this session now waits on
// the person for, and the few messages the person is likely to send next
async function findAsk($: any, asked: string, answer: string, seq: number) {
  let ask: string | undefined
  let next: Suggestion[] | undefined
  // how the call went, kept in the status file and told to the person when it fails
  let outcome = ''
  const started: number = await $.clock.now()

  await save($, { suggestAt: started })

  try {
    const result = await $.model.complete({
      model: NEXT_MODEL,
      prompt: `${ASK_PROMPT}使用者：\n${asked.slice(-PROMPT_TAIL)}\n\n回覆：\n${answer.slice(-ASK_TAIL)}`,
      effort: 'low',
      maxTokens: 2000,
      timeoutMs: SUGGEST_TIMEOUT_MS,
    })

    outcome = result.isAnswered ? 'answered' : `not answered: ${String(result.reason)}`

    const text: string = result.isAnswered ? result.text : ''
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
      waiting?: boolean
      ask?: string
      next?: Array<{ label?: unknown; detail?: unknown; prompt?: unknown; recommended?: unknown }>
    }

    ask = json.waiting && typeof json.ask === 'string' ? cleanText(json.ask).slice(0, ASK_MAX) || undefined : undefined

    const items = (Array.isArray(json.next) ? json.next : [])
      .map(item => ({
        label: cleanText(String(item?.label ?? '')).slice(0, NEXT_LABEL_MAX),
        detail: cleanText(String(item?.detail ?? '')).slice(0, NEXT_DETAIL_MAX) || undefined,
        prompt: cleanText(String(item?.prompt ?? '')).slice(0, NEXT_PROMPT_MAX),
        recommended: item?.recommended === true,
      }))
      .filter(item => item.label && item.prompt)
      .slice(0, NEXT_MAX)

    next = items.length > 0 ? items : undefined
    outcome = next ? `ok: ${next.length}` : `${outcome}, no suggestions in the reply`
  } catch (error) {
    outcome = outcome ? `${outcome}, unreadable: ${String(error)}` : `failed: ${String(error)}`
  }

  const took = Math.round(((await $.clock.now()) - started) / 1000)
  const isStale = seq !== askSeq || me?.status !== 'idle'

  // the person already sent the next message: these suggestions answer the old one
  await save($, {
    suggestAt: undefined,
    suggestNoteAt: started,
    suggestNote: `${new Date(started).toLocaleTimeString()} ${took}s ${isStale ? 'stale' : outcome}`,
    ...(isStale ? {} : { ask, next }),
  })
  if (!isStale && !next) {
    $.ui.toast(`沒能產生建議（${took} 秒）：${outcome.slice(0, 80)}`)
  }
}

// a suggestion goes into the composer as a draft: the person edits or sends it
async function fillPrompt($: any, text: string) {
  try {
    const filled = await $.prompt.fill({ text })

    if (!filled?.isFilled) {
      $.ui.toast('無法填入輸入框')
    }
  } catch (error) {
    $.ui.toast(`無法填入：${String(error)}`)
  }
}

// the band's button and /suggest do no work themselves: where they run is not the timer's load,
// which holds this session's row. They leave the request in host-held state; the timer takes it.
async function requestSuggest($: any) {
  const at: number = await $.clock.now()

  await update($, suggestAsk, () => at)
  await openBoard($)
}

// on the timer's load: a request newer than the last one taken asks for suggestions
async function takeRequest($: any) {
  if (me === null) {
    return
  }

  const fromFile = Number(await $.fs.read(requestOf(me.id)).catch(() => '0')) || 0
  const fromState = (await read($, suggestAsk)) || 0
  const request = Math.max(fromFile, fromState)

  if (takenRequest === null) {
    // the first look after a load: a request already there is an old one
    takenRequest = request
  } else if (request > takenRequest) {
    takenRequest = request
    void recoverAsk($)
  }
}

// a request not yet taken, or a call under way: what the band and the board show as 產生中
const isSuggestingFor = (row: Row | undefined, askedAt: number, now: number) =>
  row?.suggestAt !== undefined || (askedAt > 0 && now - askedAt < SUGGEST_PICKUP_MS && !(row?.suggestNoteAt && row.suggestNoteAt >= askedAt))

// reads the last exchange back and asks for suggestions about it
async function recoverAsk($: any) {
  if (me === null || me.status !== 'idle') {
    $.ui.toast('回答還沒結束，等這輪跑完再產生建議')
    return
  }

  const seq = askSeq
  const messages: Array<{ role: string; text: string; toolResults?: unknown[] }> = await $.session
    .messages()
    .catch(() => [])
  // the person's last prompt: a user row that is no tool result
  let at = messages.length - 1

  while (at >= 0) {
    const m = messages[at]

    if (m && m.role === 'user' && !m.toolResults?.length && cleanText(m.text) !== '' && !isSlashCommand(m.text)) {
      break
    }

    at -= 1
  }

  if (at < 0) {
    $.ui.toast('這個對話還沒有可以參考的問答')
    return
  }

  const answer = messages
    .slice(at + 1)
    .filter(m => m.role === 'assistant')
    .map(m => m.text)
    .filter(Boolean)
    .join('\n\n')

  if (answer.trim() === '') {
    $.ui.toast('找不到最後一則回答')
    return
  }

  const asked = cleanText(messages[at]?.text ?? '')

  await findAsk($, asked, answer, seq)
}

// a reload can land while the previous load's suggestion call is still out: that load writes
// its result to this session's file afterwards, so take it in before the next write covers it
async function adoptLate($: any) {
  if (me === null || me.status !== 'idle' || me.ask !== undefined || me.next !== undefined) {
    return
  }

  const disk = await $.fs
    .read(fileOf(me.id))
    .then((text: string) => JSON.parse(text) as Row)
    .catch(() => undefined)

  if (disk?.status === 'idle' && (disk.ask !== undefined || disk.next !== undefined)) {
    me = { ...me, ask: disk.ask, next: disk.next }
  }
}

async function tick($: any) {
  try {
    const usage = await $.session.usage().catch(() => undefined)
    const limits: Limit[] = (usage?.rateLimits ?? [])
      .filter((limit: Limit) => limit.kind === 'five_hour' || limit.kind === 'seven_day')
      .map((limit: Limit) => ({
        kind: limit.kind,
        percentUsed: limit.percentUsed,
        resetsAt: limit.resetsAt,
      }))

    await adoptLate($)
    await takeRequest($)

    await save($, {
      renders,
      listLen,
      usd: usage?.cost?.usd,
      ctx: usage?.context?.percent,
      ...(limits.length > 0 ? { limits, limitsAt: await $.clock.now() } : {}),
    })
    await refresh($)
  } catch (error) {
    if (!hasWarned) {
      hasWarned = true
      $.ui.toast(`session-board: ${String(error)}`)
    }
  }
}

async function ensure($: any) {
  if (me === null) {
    const id: string = await $.session.id()
    const cwd: string = await $.session.cwd()
    const now: number = await $.clock.now()
    const before = await $.fs
      .read(fileOf(id))
      .then((text: string) => JSON.parse(text) as Row)
      .catch(() => undefined)

    // a reload or a resume keeps what this session already counted
    me = {
      id,
      label: before?.label ?? (cwd.split(/[\\/]/).filter(Boolean).pop() ?? id.slice(0, 6)),
      status: 'idle',
      startedAt: now,
      updatedAt: now,
      tin: before?.tin,
      tout: before?.tout,
      tcache: before?.tcache,
      // what the last answer left waiting survives the reload that follows an edit
      ask: before?.ask,
      next: before?.next,
    }
    hasName = before !== undefined && before.label !== undefined
    await update($, selfId, () => id)
  }

  if (timer === null) {
    timer = $.clock.every(TICK_MS, () => tick($))
  }

  await tick($)
}

export const register: Register = on => {
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)

    return {
      sections: [
        ...composed.sections,
        { id: 'session-board:zh-tw', text: ZH_TW_RULE, scope: 'session' as const },
      ],
    }
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: '在右側開啟工作台：這個對話的狀態與下一步建議', immediate: true })
    await $.command.register({ name: 'suggest', description: '產生這個對話的下一步建議（同資訊列的「產生建議」按鈕）', immediate: true })
    await $.command.register({ name: 'board-others', description: '切換工作台是否顯示其他對話（所有對話共用這個設定）', immediate: true })
    const stored = await $.store.get(SHOW_OTHERS_KEY).catch(() => undefined)
    await update($, showOthers, () => stored === true)
    await ensure($)

    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    await openBoard($)

    return {}
  })

  // typed, or run by the band's button: leaves the request for this session's timer to take
  on('command.run', { command: 'suggest' }, async $ => {
    await requestSuggest($)

    return { text: '已送出：正在產生下一步建議，結果會出現在右側工作台。' }
  })

  on('command.run', { command: 'board-others' }, async $ => {
    const value = !(await read($, showOthers))

    await $.store.set(SHOW_OTHERS_KEY, value)
    await update($, showOthers, () => value)
    $.ui.toast(value ? '工作台會顯示其他對話（新開的對話也一樣）' : '工作台只顯示這個對話')

    return {}
  })

  on('prompt.submit', async ($, e, next) => {
    await ensure($)

    if (isSlashCommand(typeof e.text === 'string' ? e.text : '')) {
      return next(e)
    }

    const now: number = await $.clock.now()
    const text = typeof e.text === 'string' ? cleanText(e.text) : ''
    const isNaming = !hasName && text !== ''

    hasName = hasName || isNaming
    askSeq += 1
    await save($, {
      status: 'running',
      startedAt: now,
      ask: undefined,
      next: undefined,
      ...(isNaming ? { label: text.slice(0, LABEL_STORE) } : {}),
    })

    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    const todos: Array<{ status: string }> = Array.isArray(e.todos) ? e.todos : []

    await ensure($)
    await save($, {
      done: todos.filter(todo => todo.status === 'completed').length,
      total: todos.length,
    })

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await ensure($)

    const usage = e.usage
    // a subagent's turn ending leaves the main loop running
    const isMain = e.agentId === undefined

    // suggestions come only from the band's button: nothing is spent when the person does not ask

    await save($, {
      ...(isMain ? { status: 'idle' as const } : {}),
      ...(usage
        ? {
            tin: (me?.tin ?? 0) + usage.input_tokens + usage.cache_creation_input_tokens,
            tout: (me?.tout ?? 0) + usage.output_tokens,
            tcache: (me?.tcache ?? 0) + usage.cache_read_input_tokens,
          }
        : {}),
    })

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    await save($, { status: 'ended' })

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: MEM_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const items = await read($, memItems)
    const busy = await read($, memBusy)
    const open = await read($, memOpen)

    return (
      <Box flexDirection="column" gap={1}>
        <Box gap={2}>
          <Text bold>記憶筆記（白話版）</Text>
          <Text dimColor>{busy ? '翻譯中…' : `${items.length} 條`}</Text>
          {busy ? null : (
            <Button key="again" plain label="↻ 重新翻譯" onPress={() => loadMemory($)} />
          )}
        </Box>
        {items.length === 0 && !busy ? <Text dimColor>這個專案還沒有記憶檔。</Text> : null}
        {items.map(item => {
          const isOpen = open.includes(item.file)

          return (
            <Box key={item.file} flexDirection="column">
              <Text bold color="#93c5fd">{item.file.replace(/\.md$/, '')}</Text>
              <Text color={item.state === 'fail' ? '#fca5a5' : undefined} dimColor={item.state === 'wait'}>
                {item.state === 'wait' ? '翻譯中…' : item.plain}
              </Text>
              <Button
                key={`raw-${item.file}`}
                plain
                dimColor
                label={isOpen ? '▾ 收起原文' : '▸ 看原文'}
                onPress={() =>
                  update($, memOpen, list =>
                    list.includes(item.file) ? list.filter(f => f !== item.file) : [...list, item.file],
                  )
                }
              />
              {isOpen ? <Text dimColor>{item.raw}</Text> : null}
            </Box>
          )
        })}
      </Box>
    )
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, rows)

    renders += 1
    listLen = list.length

    if (e.props.hasSurvey || list.length === 0) {
      return next(e)
    }

    const mine = await read($, selfId)
    const isConfirming = await read($, confirming)
    const isCompacting = await read($, compacting)
    const now: number = await $.clock.now()
    const isSuggesting = isSuggestingFor(list.find(row => row.id === mine), await read($, suggestAsk), now)
    const { Box, Button, Text } = $.ui.resolve(e)
    const running = list.filter(row => row.status === 'running').length
    // this conversation's own question is in its pane: the band counts the others
    const isShowingOthers = await read($, showOthers)
    const waiting = isShowingOthers
      ? list.filter(row => row.id !== mine && row.status !== 'running' && row.ask !== undefined).length
      : 0
    const priced = list.filter(row => row.usd !== undefined)
    const total = priced.reduce((sum, row) => sum + (row.usd ?? 0), 0)
    const self = list.find(row => row.id === mine)

    // the account's windows are shared: show the freshest reading any session has
    const fresh = list
      .filter(row => row.limits !== undefined && row.limitsAt !== undefined)
      .sort((a, b) => (b.limitsAt ?? 0) - (a.limitsAt ?? 0))[0]
    const five = fresh?.limits?.find(limit => limit.kind === 'five_hour')
    const seven = fresh?.limits?.find(limit => limit.kind === 'seven_day')

    const Pill = (props: { key: string; bg: string; fg: string; text: string }) => (
      <Text key={props.key} backgroundColor={props.bg} color={props.fg} bold>
        {` ${props.text} `}
      </Text>
    )
    const quota = (key: string, name: string, limit: Limit, tint?: string[]) => {
      const [bg = '', fg = ''] = tint ?? heat(limit.percentUsed)

      return Pill({
        key,
        bg,
        fg,
        text: `${name} ${cells(limit.percentUsed, PILL_BAR)} ${Math.round(limit.percentUsed)}% · ${until(limit.resetsAt, now)}`,
      })
    }

    // the remote surfaces draw vector capsules; the terminal keeps its colored text
    const Svg = e.surface === 'terminal' ? null : ($.ui.resolve(e) as any).Svg
    const capsules = Svg
      ? [
          five ? { key: 'five', alt: `5 小時額度 ${Math.round(five.percentUsed)}%`, ...quotaPill('5h', 'gauge', heatHue(five.percentUsed), five, now) } : null,
          seven
            ? {
                key: 'seven',
                alt: `7 天額度 ${Math.round(seven.percentUsed)}%`,
                ...quotaPill('7d', 'calendar', seven.percentUsed < 85 ? HUES.purple : HUES.red, seven, now),
              }
            : null,
          self?.tin !== undefined ? { key: 'in', alt: `輸入 ${count(self.tin)}`, ...countPill('up', HUES.pink, count(self.tin)) } : null,
          self?.tout !== undefined ? { key: 'out', alt: `輸出 ${count(self.tout)}`, ...countPill('down', HUES.teal, count(self.tout)) } : null,
          self?.tcache !== undefined
            ? { key: 'cache', alt: `快取 ${count(self.tcache)}`, ...countPill('layers', HUES.indigo, count(self.tcache)) }
            : null,
          self?.ctx !== undefined
            ? {
                key: 'ctx',
                alt: `上下文 ${self.ctx}%`,
                ...pill(heatHue(self.ctx), [
                  { kind: 'icon', name: 'gauge' },
                  { kind: 'text', text: '空間', dim: true },
                  { kind: 'bar', percent: self.ctx },
                  { kind: 'text', text: `${Math.round(self.ctx)}%`, bold: true },
                ]),
              }
            : null,
          self?.usd !== undefined && list.length < 2
            ? {
                key: 'usd',
                alt: money(self.usd),
                ...countPill('coin', HUES.gold, `$${self.usd.toFixed(2)}`),
              }
            : null,
        ].filter(c => c !== null)
      : []

    return (
      <Box flexDirection="column">
        {Svg ? (
          <Box flexDirection="column">
            <Box gap={1} flexWrap="wrap">
              {capsules.filter(c => ROW_QUOTA.includes(c.key)).map(c => (
                <Box key={c.key}>
                  <Svg source={c.source} alt={c.alt} width={c.width} height={c.height} />
                </Box>
              ))}
            </Box>
            <Box gap={1} flexWrap="wrap" alignItems="center">
              {[
                ...capsules.filter(c => !ROW_QUOTA.includes(c.key)),
                {
                  key: 'count',
                  alt: `${list.length} 個對話，${running} 執行中`,
                  ...countPill('chat', running > 0 ? HUES.green : HUES.slate, `${list.length} 對話 · ${running} 執行中`),
                },
                waiting > 0
                  ? { key: 'waiting', alt: `其他 ${waiting} 個對話在等你`, ...countPill('help', HUES.amber, `其他 ${waiting} 個在等你`) }
                  : null,
                priced.length >= 2
                  ? { key: 'total', alt: `合計 ${money(total)}`, ...countPill('coin', HUES.gold, `合計 $${total.toFixed(2)}`) }
                  : null,
              ]
                .filter(c => c !== null)
                .map(c => (
                  <Box key={c.key}>
                    <Svg source={c.source} alt={c.alt} width={c.width} height={c.height} />
                  </Box>
                ))}
            </Box>
          </Box>
        ) : (
        <Box gap={1} flexWrap="wrap">
          {five ? quota('five', '5h', five) : null}
          {seven
            ? quota('seven', '7d', seven, seven.percentUsed < 85 ? ['#3b0764', '#d8b4fe'] : undefined)
            : null}
          {self?.tin !== undefined
            ? Pill({ key: 'in', bg: '#831843', fg: '#f9a8d4', text: `↑ ${count(self.tin)}` })
            : null}
          {self?.tout !== undefined
            ? Pill({ key: 'out', bg: '#134e4a', fg: '#5eead4', text: `↓ ${count(self.tout)}` })
            : null}
          {self?.tcache !== undefined
            ? Pill({ key: 'cache', bg: '#1e3a8a', fg: '#93c5fd', text: `快取 ${count(self.tcache)}` })
            : null}
          {self?.ctx !== undefined
            ? Pill({ key: 'ctx', bg: heat(self.ctx)[0] ?? '', fg: heat(self.ctx)[1] ?? '', text: `上下文 ${cells(self.ctx, PILL_BAR)} ${Math.round(self.ctx)}%` })
            : null}
          {self?.usd !== undefined && list.length < 2
            ? Pill({ key: 'usd', bg: '#78350f', fg: '#fcd34d', text: money(self.usd) })
            : null}
        </Box>
        )}
        {Svg ? (
          <Box gap={1} flexWrap="wrap" alignItems="center">
            {[
              { key: 'board', icon: 'panel' as const, label: '工作台', isHot: false, onPress: () => openBoard($) },
              { key: 'memory', icon: 'book' as const, label: '記憶', isHot: false, onPress: () => loadMemory($) },
              {
                key: 'compact',
                icon: 'scissors' as const,
                label: isCompacting ? '整理中…' : '整理重點',
                isHot: isCompacting || (self?.ctx ?? 0) >= COMPACT_HINT_PERCENT,
                onPress: () => (isCompacting ? undefined : update($, confirming, value => !value)),
              },
              {
                key: 'suggest',
                icon: 'sparkles' as const,
                label: isSuggesting
                  ? `產生中 ${self?.suggestAt ? Math.max(0, Math.round((now - self.suggestAt) / 1000)) : 0}s`
                  : '產生建議',
                isHot: isSuggesting,
                onPress: () => (isSuggesting ? undefined : void requestSuggest($)),
              },
              ...GUIDE.filter(g => 'fill' in g).map(g => ({
                key: g.key,
                icon: ({ plan: 'list', verify: 'check', goal: 'check' } as const)[g.key as 'plan'],
                label: g.label,
                isHot: false,
                onPress: () => void fillPrompt($, (g as { fill: string }).fill),
              })),
              {
                key: 'help',
                icon: 'help' as const,
                label: '說明',
                isHot: false,
                onPress: () => {
                  void update($, helpOpen, () => true)
                  void openBoard($)
                },
              },
            ].map(b => (
              <Box
                key={`chip-${b.key}`}
                alignItems="center"
                gap={1}
                paddingX={1}
                borderStyle="round"
                borderColor={b.isHot ? '#d97706' : (BUTTON_COLOR[b.key] ?? '#64748b')}
                marginLeft={GROUP_START.includes(b.key) ? 2 : 0}
                hover={{ borderColor: HOVER_COLOR }}
              >
                {SECONDARY.includes(b.key) ? null : (
                  <Svg
                    source={iconSvg(b.icon, { dark: BUTTON_COLOR[b.key] ?? '#cbd5e1', light: BUTTON_COLOR[b.key] ?? '#475569' })}
                    alt={b.label}
                    width={14}
                    height={14}
                  />
                )}
                <Button key={b.key} plain label={b.label} hover={{ bold: true }} onPress={b.onPress}>
                  <Text color={BUTTON_COLOR[b.key]} bold={b.isHot}>{b.label}</Text>
                </Button>
              </Box>
            ))}
          </Box>
        ) : (
        <Box gap={2}>
          <Text bold>{`工作階段 ${list.length}`}</Text>
          <Text color={running > 0 ? '#4ade80' : undefined} dimColor={running === 0}>
            {`● ${running} 執行中`}
          </Text>
          {waiting > 0 ? <Text color="#fbbf24" bold>{`❓ 其他 ${waiting} 個在等你`}</Text> : null}
          {priced.length >= 2 ? (
            <Text color="#fbbf24">{`合計 ${money(total)}`}</Text>
          ) : null}
          <Button key="board" plain dimColor label="🗂 工作台" onPress={() => openBoard($)} />
          <Button key="memory" plain dimColor label="📖 記憶" onPress={() => loadMemory($)} />
          {isCompacting ? (
            <Text color="#fbbf24">✂ 整理中…</Text>
          ) : (
            <Button
              key="compact"
              plain
              dimColor={(self?.ctx ?? 0) < COMPACT_HINT_PERCENT}
              label="✂ 整理重點"
              onPress={() => update($, confirming, value => !value)}
            />
          )}
          <Button
            key="suggest"
            plain
            dimColor={!isSuggesting}
            label={isSuggesting ? '✨ 產生中…' : '✨ 產生建議'}
            onPress={() => (isSuggesting ? undefined : void requestSuggest($))}
          />
          {GUIDE.filter(g => 'fill' in g).map(g => (
            <Button key={g.key} plain dimColor label={g.label} onPress={() => void fillPrompt($, (g as { fill: string }).fill)} />
          ))}
          <Button
            key="help"
            plain
            dimColor
            label="？說明"
            onPress={() => {
              void update($, helpOpen, () => true)
              void openBoard($)
            }}
          />
        </Box>
        )}
        {isConfirming && !isCompacting ? (
          <Box gap={1}>
            <Text color="#fbbf24">
              {`✂ 要整理重點嗎？目前上下文 ${self?.ctx ?? '?'}%，整理後細節會被濃縮，無法還原。`}
            </Text>
            <Button key="yes" variant="primary" label="確定" onPress={() => runCompact($)} />
            <Button
              key="no"
              variant="secondary"
              label="取消"
              onPress={() => update($, confirming, () => false)}
            />
          </Box>
        ) : null}
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: BOARD_PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const list = await read($, rows)
    const mine = await read($, selfId)
    const now: number = await $.clock.now()
    const isShowingOthers = await read($, showOthers)
    const isAll = isShowingOthers && (await read($, boardAll))
    const isSuggesting = isSuggestingFor(list.find(row => row.id === mine), await read($, suggestAsk), now)
    const isWaiting = (row: Row) => row.status !== 'running' && row.ask !== undefined
    const others = list.filter(row => row.id !== mine)
    const othersWaiting = others.filter(isWaiting).length
    const othersRunning = others.filter(row => row.status === 'running').length
    const shown = isAll ? list : list.filter(row => row.id === mine)
    const groups = [
      { key: 'waiting', title: '❓ 等你回覆', color: '#fbbf24', items: shown.filter(isWaiting) },
      { key: 'running', title: '● 執行中', color: '#4ade80', items: shown.filter(row => row.status === 'running') },
      { key: 'idle', title: '○ 閒置', color: '#94a3b8', items: shown.filter(row => row.status !== 'running' && !isWaiting(row)) },
    ]
    const othersNote = [
      `其他 ${others.length} 個對話`,
      othersRunning > 0 ? `${othersRunning} 執行中` : '',
      othersWaiting > 0 ? `${othersWaiting} 在等你` : '',
    ]
      .filter(Boolean)
      .join(' · ')

    const isHelp = await read($, helpOpen)

    return (
      <Box flexDirection="column" gap={1}>
        {isHelp ? (
          <Box key="guide" flexDirection="column" gap={1}>
            <Box gap={1} alignItems="center">
              <Text bold>按鈕說明</Text>
              <Button key="guide-close" plain dimColor label="收起 ✕" onPress={() => update($, helpOpen, () => false)} />
            </Box>
            {GUIDE.map(g => (
              <Box key={g.key} flexDirection="column" borderStyle="round" borderColor="#475569" paddingX={1}>
                <Text bold>{g.label}</Text>
                <Text>{`做什麼：${g.what}`}</Text>
                <Text>{`什麼時候用：${g.when}`}</Text>
                <Text dimColor>{`點了會怎樣：${g.effect}`}</Text>
              </Box>
            ))}
          </Box>
        ) : null}
        {isShowingOthers && others.length > 0 ? (
          <Box key="scope" gap={1} alignItems="center">
            <Text dimColor>{isAll ? '全部對話' : othersNote}</Text>
            <Button
              key="scope-toggle"
              plain
              dimColor
              label={isAll ? '◂ 只看這個對話' : '展開全部 ▸'}
              hover={{ color: HOVER_COLOR, dimColor: false }}
              onPress={() => update($, boardAll, value => !value)}
            />
          </Box>
        ) : null}
        {shown.length === 0 ? <Text dimColor>這個對話還沒有狀態。</Text> : null}
        {groups.map(group =>
          group.items.length === 0 ? null : (
            <Box key={group.key} flexDirection="column" gap={1}>
              <Text bold color={group.color}>{`${group.title}  ${group.items.length}`}</Text>
              {group.items.map(row => {
                const isRunning = row.status === 'running'
                const facts = [
                  isRunning ? `已跑 ${clock(now - row.startedAt)}` : '',
                  row.usd !== undefined ? money(row.usd) : '',
                  row.ctx !== undefined ? `上下文 ${row.ctx}%` : '',
                ].filter(Boolean)

                return (
                  <Box key={row.id} flexDirection="column" borderStyle="round" borderColor={group.color} paddingX={1}>
                    <Text bold color={isRunning ? group.color : undefined}>
                      {`${row.label}${row.id === mine ? '（這個對話）' : ''}`}
                    </Text>
                    {group.key === 'waiting' ? <Text color={group.color}>{`→ ${row.ask}`}</Text> : null}
                    {/* only this session's composer can take a suggestion */}
                    {row.id === mine && !isRunning && row.next ? (
                      <Box flexDirection="column" marginY={1} gap={1}>
                        <Text dimColor>下一步（點標題填入輸入框）：</Text>
                        {row.next.map((item, i) => (
                          <Box
                            key={`next-${i}`}
                            flexDirection="column"
                            paddingX={1}
                            borderStyle="round"
                            borderColor={item.recommended ? RECOMMEND_COLOR : '#475569'}
                            hover={{ borderColor: HOVER_COLOR }}
                          >
                            <Box gap={1} alignItems="center">
                              <Button
                                key={`next-${i}-b`}
                                plain
                                hotkey={String(i + 1)}
                                label={item.label}
                                hover={{ color: HOVER_COLOR, bold: true }}
                                onPress={() => fillPrompt($, item.prompt)}
                              />
                              {item.recommended ? <Text color={RECOMMEND_COLOR} bold>★ 建議</Text> : null}
                            </Box>
                            {item.detail ? <Text dimColor>{item.detail}</Text> : null}
                          </Box>
                        ))}
                      </Box>
                    ) : null}
                    {row.id === mine && !isRunning && !row.next ? (
                      <Box key="ask-again" marginY={1}>
                        <Text dimColor>
                          {isSuggesting ? '正在產生下一步建議…' : '還沒有建議：按輸入框上方的「產生建議」'}
                        </Text>
                      </Box>
                    ) : null}
                    {isRunning && barOf(row, now) !== '' ? <Text color="#38bdf8">{barOf(row, now)}</Text> : null}
                    <Text dimColor>{facts.join(' · ')}</Text>
                  </Box>
                )
              })}
            </Box>
          ),
        )}
      </Box>
    )
  })
}
