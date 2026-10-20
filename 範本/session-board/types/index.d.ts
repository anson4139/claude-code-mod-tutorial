export type Limit = {
  kind: string
  percentUsed: number
  resetsAt?: string
}

export type Mem = {
  file: string
  raw: string
  plain: string
  state: 'wait' | 'done' | 'fail'
}

export type Suggestion = { label: string; detail?: string; prompt: string; recommended?: boolean }

export type Row = {
  id: string
  label: string
  status: 'running' | 'idle' | 'ended'
  startedAt: number
  updatedAt: number
  done?: number
  total?: number
  usd?: number
  ctx?: number
  tin?: number
  tout?: number
  tcache?: number
  limits?: Limit[]
  limitsAt?: number
  renders?: number
  listLen?: number
  ask?: string
  next?: Suggestion[]
  suggestAt?: number
  suggestNote?: string
  suggestNoteAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'session-board': {
      rows: Row[]
      selfId: string
      confirming: boolean
      compacting: boolean
      memItems: Mem[]
      memBusy: boolean
      memOpen: string[]
      boardAll: boolean
      showOthers: boolean
      suggestAsk: number
      helpOpen: boolean
    }
  }
}
