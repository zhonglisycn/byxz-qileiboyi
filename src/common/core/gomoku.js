/**
 * 五子棋（Gomoku）规则 + AI —— 纯 ESM，无任何系统依赖，可在 Node 直接单测。
 * 棋盘 n×n（15 / 17 / 19 路），棋子落在交叉点上，一维数组：idx = y*n + x
 * 0 空 / 1 黑（先行） / 2 白
 *
 * 对外契约：
 *   newGame(opts) -> state
 *   aiMove(state, level) -> idx | null
 *   apply(state, move, byPlayer) -> boolean
 *   result(state) -> { over, winner: 0|1|2|'draw', text }
 *   isForbidden(state, idx) -> boolean        // 黑棋禁手点判定（供界面提示）
 * 另附 undo / tick（时间限制）/ empties / nearby / other 供界面使用。
 * 黑棋禁手（三三 / 四四 / 长连）：newGame({ forbidden:true }) 默认开启；
 * 黑棋走出禁手点即判负（winner=白），白棋无禁手。
 * 只依赖 ./rnd.js，禁止引用 @system.* 与 ./util.js。
 */
import { pickBest } from './rnd.js'

export const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]]
/** 与 games.js 中 levels 顺序保持一致 */
export const AI_LEVELS = ['菜鸟', '普通', '高手']

export function other(p) { return p === 1 ? 2 : 1 }

/** 只接受 5..25 的整数路数，其它一律回落到 15 路 */
function normalizeBoard(b) {
  const n = parseInt(b, 10)
  return (n >= 5 && n <= 25) ? n : 15
}

/**
 * 新开一局。
 * opts: { board:15|17|19, mode:'ai'|'pvp', useTimer, baseMinutes, addSeconds }
 */
export function newGame(opts) {
  opts = opts || {}
  const n = normalizeBoard(opts.board)
  const base = Math.max(1, parseInt(opts.baseMinutes, 10) || 30) * 60
  const inc = Math.max(0, parseInt(opts.addSeconds, 10) || 0)
  const board = new Array(n * n)
  for (let i = 0; i < n * n; i++) board[i] = 0
  return {
    n: n,
    board: board,
    turn: 1,            // 1 黑先 / 2 白
    first: 1,
    moves: [],          // 历史 [{ i, p }]，供悔棋与存档
    last: -1,
    winner: 0,          // 0 未结束 / 1 / 2 / 'draw'
    winLine: [],
    over: false,
    timeout: 0,
    foul: null,          // 禁手判负时 { i, reason }；否则 null
    forbidden: opts.forbidden !== false,   // 黑棋禁手，默认开启
    mode: opts.mode === 'pvp' ? 'pvp' : 'ai',
    timer: { on: !!opts.useTimer, base: base, inc: inc, remain: { 1: base, 2: base } }
  }
}

function at(board, n, x, y) {
  if (x < 0 || y < 0 || x >= n || y >= n) return -1
  return board[y * n + x]
}

/** 从 idx 出发检查是否成五（含长连），返回连线 idx 数组或 null */
export function checkWin(board, n, idx, p) {
  if (idx < 0 || idx >= n * n || board[idx] !== p) return null
  const x = idx % n
  const y = (idx / n) | 0
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0]
    const dy = DIRS[d][1]
    const line = [idx]
    let cx = x + dx
    let cy = y + dy
    while (at(board, n, cx, cy) === p) { line.push(cy * n + cx); cx += dx; cy += dy }
    cx = x - dx
    cy = y - dy
    while (at(board, n, cx, cy) === p) { line.unshift(cy * n + cx); cx -= dx; cy -= dy }
    if (line.length >= 5) return line
  }
  return null
}

/* ------------------------- 黑棋禁手（三三/四四/长连） ------------------------- */

/** 通过 idx、沿 (dx,dy) 的连续同色长度（含 idx 自身） */
function runLength(board, n, idx, dx, dy, p) {
  const x0 = idx % n
  const y0 = (idx / n) | 0
  let len = 1
  let x = x0 + dx
  let y = y0 + dy
  while (x >= 0 && y >= 0 && x < n && y < n && board[y * n + x] === p) { len++; x += dx; y += dy }
  x = x0 - dx
  y = y0 - dy
  while (x >= 0 && y >= 0 && x < n && y < n && board[y * n + x] === p) { len++; x -= dx; y -= dy }
  return len
}

/**
 * 方向 (dx,dy) 上以 center 为中心、±4 格内「成五点」的数量：
 * 某个空点落 me 后恰好连成五（不含长连）即算一个成五点。
 * 活四 = 2 个成五点；普通四 = 1 个。
 */
function winningPoints(board, n, center, dx, dy, me) {
  const x0 = center % n
  const y0 = (center / n) | 0
  let cnt = 0
  for (let t = -4; t <= 4; t++) {
    const x = x0 + dx * t
    const y = y0 + dy * t
    if (x < 0 || y < 0 || x >= n || y >= n) continue
    const j = y * n + x
    if (board[j] !== 0) continue
    board[j] = me
    const len = runLength(board, n, j, dx, dy, me)
    board[j] = 0
    if (len === 5) cnt++
  }
  return cnt
}

/**
 * 方向 (dx,dy) 上通过 idx 是否为「活三」：
 * 该方向恰有 3 颗己方子，且存在一个空点使落子后成为活四（>=2 个成五点）。
 * 跳三（如 ○●○●●）同样能构成活三。
 */
function isOpenThree(board, n, idx, dx, dy, me) {
  const x0 = idx % n
  const y0 = (idx / n) | 0
  let own = 0
  for (let t = -4; t <= 4; t++) {
    const x = x0 + dx * t
    const y = y0 + dy * t
    if (x < 0 || y < 0 || x >= n || y >= n) continue
    if (board[y * n + x] === me) own++
  }
  if (own !== 3) return false
  for (let t = -4; t <= 4; t++) {
    const x = x0 + dx * t
    const y = y0 + dy * t
    if (x < 0 || y < 0 || x >= n || y >= n) continue
    const j = y * n + x
    if (board[j] !== 0) continue
    board[j] = me
    const wp = winningPoints(board, n, j, dx, dy, me)
    board[j] = 0
    if (wp >= 2) return true
  }
  return false
}

/**
 * board 中 idx 已放黑子后的禁手判定。返回 '' / '三三' / '四四' / '长连'。
 * 恰好五连为胜（优先于长连），不算禁手。
 */
function foulAt(board, n, idx) {
  const me = 1
  let fours = 0
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0]
    const dy = DIRS[d][1]
    const len = runLength(board, n, idx, dx, dy, me)
    if (len === 5) return ''            // 成五为胜，五优先于禁手
    if (len >= 6) return '长连'          // 长连禁手
    if (winningPoints(board, n, idx, dx, dy, me) >= 1) fours++
  }
  if (fours >= 2) return '四四'
  if (fours === 0) {
    let threes = 0
    for (let d = 0; d < 4; d++) {
      if (isOpenThree(board, n, idx, DIRS[d][0], DIRS[d][1], me)) threes++
    }
    if (threes >= 2) return '三三'
  }
  return ''
}

/** 内部：在已有棋盘上临时落子判定（不改变调用方状态由外部保证） */
function foulIfPlaced(state, idx) {
  state.board[idx] = 1
  const r = foulAt(state.board, state.n, idx)
  state.board[idx] = 0
  return r
}

/**
 * 黑棋在 idx 落子是否构成禁手（三三/四四/长连）。白棋 / 开关关闭 / 非空点 / 已结束返回 false。
 * 不改变 state。
 */
export function isForbidden(state, idx) {
  if (!state || state.over) return false
  if (!state.forbidden) return false
  if (state.turn !== 1) return false
  const n = state.n
  if (typeof idx !== 'number' || !isFinite(idx)) return false
  idx = Math.floor(idx)
  if (idx < 0 || idx >= n * n) return false
  if (state.board[idx] !== 0) return false
  return foulIfPlaced(state, idx) !== ''
}

/** 同 isForbidden，但返回具体原因 '' / '三三' / '四四' / '长连'（供界面提示） */
export function forbiddenReason(state, idx) {
  if (!state || state.over || !state.forbidden || state.turn !== 1) return ''
  const n = state.n
  if (typeof idx !== 'number' || !isFinite(idx)) return ''
  idx = Math.floor(idx)
  if (idx < 0 || idx >= n * n || state.board[idx] !== 0) return ''
  return foulIfPlaced(state, idx)
}

/**
 * 落子。move 支持整数 idx 或 { i: idx }；byPlayer 传入（非 0）时校验是否轮到该方。
 * 非法（越界 / 重复 / 已结束 / 不是该方）一律返回 false 且不改动状态。
 * 黑棋禁手开启时，走出三三/四四/长连即判负（落子生效，winner=白，over=true）。
 */
export function apply(state, move, byPlayer) {
  if (!state || state.over) return false
  let idx = (move && typeof move === 'object') ? move.i : move
  if (typeof idx !== 'number' || !isFinite(idx)) return false
  idx = Math.floor(idx)
  const n = state.n
  if (idx < 0 || idx >= n * n) return false
  if (state.board[idx] !== 0) return false
  const p = state.turn
  if (byPlayer !== undefined && byPlayer !== null && byPlayer !== 0 && byPlayer !== p) return false

  state.board[idx] = p
  state.last = idx
  state.moves.push({ i: idx, p: p })
  // 费舍尔加秒：落子方获得本次加秒
  if (state.timer && state.timer.on) state.timer.remain[p] += state.timer.inc

  // 黑棋禁手：走出三三/四四/长连即判负（长连优先于普通连五以外的判定；成五为胜）
  if (p === 1 && state.forbidden) {
    const foul = foulAt(state.board, n, idx)
    if (foul) {
      state.winner = 2
      state.winLine = []
      state.over = true
      state.foul = { i: idx, reason: foul }
      return true
    }
  }

  const line = checkWin(state.board, n, idx, p)
  if (line) {
    state.winner = p
    state.winLine = line
    state.over = true
  } else if (state.moves.length >= n * n) {
    state.winner = 'draw'
    state.winLine = []
    state.over = true
  } else {
    state.turn = other(p)
  }
  return true
}

/** 胜负描述：{ over, winner:0|1|2|'draw', text } */
export function result(state) {
  if (state && state.over) {
    if (state.winner === 'draw') return { over: true, winner: 'draw', text: '棋盘已满，平局' }
    if (state.foul) return { over: true, winner: state.winner, text: '黑棋' + state.foul.reason + '禁手判负，白棋获胜' }
    return { over: true, winner: state.winner, text: state.winner === 1 ? '黑棋获胜' : '白棋获胜' }
  }
  const t = state ? state.turn : 1
  return { over: false, winner: 0, text: t === 1 ? '轮到黑棋' : '轮到白棋' }
}

/** 悔棋 count 步（返回实际步数）；清空胜负标记 */
export function undo(state, count) {
  if (!state) return 0
  const want = count || 1
  let done = 0
  while (done < want && state.moves.length) {
    const h = state.moves.pop()
    state.board[h.i] = 0
    state.turn = h.p
    done++
  }
  if (done) {
    state.winner = 0
    state.winLine = []
    state.over = false
    state.timeout = 0
    state.foul = null
    state.last = state.moves.length ? state.moves[state.moves.length - 1].i : -1
  }
  return done
}

/** 计时：当前回合方扣 dt 秒；归零则该方超时判负。返回是否本步超时 */
export function tick(state, dt) {
  if (!state || state.over) return false
  const t = state.timer
  if (!t || !t.on) return false
  const p = state.turn
  t.remain[p] -= (dt || 1)
  if (t.remain[p] <= 0) {
    t.remain[p] = 0
    state.winner = other(p)
    state.winLine = []
    state.over = true
    state.timeout = p
    return true
  }
  return false
}

export function empties(state) {
  const out = []
  const b = state.board
  for (let i = 0; i < b.length; i++) if (b[i] === 0) out.push(i)
  return out
}

/** 已有棋子附近 dist 格内的空点（候选着法）；空盘返回天元 */
export function nearby(state, dist) {
  const n = state.n
  const b = state.board
  const d = dist || 2
  const cand = []
  const seen = new Uint8Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (b[y * n + x] === 0) continue
      for (let dy = -d; dy <= d; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= n) continue
        for (let dx = -d; dx <= d; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= n) continue
          const j = ny * n + nx
          if (b[j] === 0 && !seen[j]) { seen[j] = 1; cand.push(j) }
        }
      }
    }
  }
  if (!cand.length) {
    const c = (n / 2) | 0
    cand.push(c * n + c)
  }
  return cand
}

/* ------------------------------- AI ------------------------------- */

/** 5 格窗口内己方子数 -> 势分（5 子即胜） */
const SHAPE = [0, 1, 24, 260, 4000, 10000000]

/** 在 idx 落 p 子的“势”：统计所有含该点的 5 格窗口，窗口被对手子阻断则不计 */
function pointScore(board, n, idx, p) {
  const x0 = idx % n
  const y0 = (idx / n) | 0
  let total = 0
  for (let d = 0; d < 4; d++) {
    const dx = DIRS[d][0]
    const dy = DIRS[d][1]
    for (let off = -4; off <= 0; off++) {
      let cnt = 0
      let ok = true
      for (let k = 0; k < 5; k++) {
        const t = off + k
        const x = x0 + dx * t
        const y = y0 + dy * t
        if (x < 0 || y < 0 || x >= n || y >= n) { ok = false; break }
        const v = board[y * n + x]
        if (v === p) cnt++
        else if (v !== 0) { ok = false; break }
      }
      if (ok) total += SHAPE[cnt]
    }
  }
  return total
}

/**
 * 找立即成五点，返回 idx 或 -1。
 * exactFive 为真时（黑棋禁手开启）要求恰好五连且无长连，避免 AI 自己走出长连禁手。
 */
function findWin(state, p, cands, exactFive) {
  const b = state.board
  const n = state.n
  for (let k = 0; k < cands.length; k++) {
    const i = cands[k]
    if (b[i] !== 0) continue
    b[i] = p
    let win
    if (exactFive) {
      let five = false
      let over = false
      for (let d = 0; d < 4; d++) {
        const len = runLength(b, n, i, DIRS[d][0], DIRS[d][1], p)
        if (len >= 6) { over = true; break }
        if (len === 5) five = true
      }
      win = five && !over
    } else {
      win = !!checkWin(b, n, i, p)
    }
    b[i] = 0
    if (win) return i
  }
  return -1
}

/** AI 内部：idx 对当前落子方是否禁手（仅黑棋禁手开启时有意义） */
function isFoulForMe(state, idx) {
  if (!state.forbidden) return false
  if (state.board[idx] !== 0) return true
  return foulIfPlaced(state, idx) !== ''
}

/** 启发式：进攻势 + 0.9×对手在此点的势（自然形成堵截） */
function heuristic(state, me, cands) {
  const b = state.board
  const n = state.n
  const foe = other(me)
  const out = []
  for (let k = 0; k < cands.length; k++) {
    const i = cands[k]
    if (b[i] !== 0) continue
    const atk = pointScore(b, n, i, me)
    const def = pointScore(b, n, i, foe)
    out.push({ i: i, score: atk + def * 0.9 })
  }
  return out
}

/** 高手：启发式取前 8，做一层搜索，扣掉对手最佳应手的威胁 */
function search1(state, me, cands) {
  const b = state.board
  const n = state.n
  const foe = other(me)
  const scored = heuristic(state, me, cands)
  if (!scored.length) return cands.length ? cands[0] : -1
  scored.sort(function (a, c) { return c.score - a.score })
  const top = scored.slice(0, 8)
  let best = top[0].i
  let bestVal = -Infinity
  for (let t = 0; t < top.length; t++) {
    const m = top[t].i
    b[m] = me
    const reply = nearby({ n: n, board: b }, 1)
    let foeBest = 0
    for (let k = 0; k < reply.length; k++) {
      const j = reply[k]
      if (b[j] !== 0) continue
      const v = pointScore(b, n, j, foe) + pointScore(b, n, j, me) * 0.8
      if (v > foeBest) foeBest = v
    }
    b[m] = 0
    const val = top[t].score - foeBest * 0.85
    if (val > bestVal) { bestVal = val; best = m }
  }
  return best
}

/**
 * AI 走子。level：1 菜鸟（随机 + 成五/堵五）/ 2 普通（启发式）/ 3 高手（启发式 + 一层搜索）。
 * 无棋可走返回 null；保证返回的着法一定合法（空点且在盘内）。
 */
export function aiMove(state, level) {
  if (!state || state.over) return null
  const b = state.board
  let any = false
  for (let i = 0; i < b.length; i++) if (b[i] === 0) { any = true; break }
  if (!any) return null

  const me = state.turn
  const foe = other(me)
  const cands = nearby(state, 2)
  const lv = level || 2
  // 黑棋禁手开启时必须回避禁手点，否则会自己判负
  const forbid = !!state.forbidden && me === 1

  // 能成五必成五
  const w = findWin(state, me, cands, forbid)
  if (w >= 0) return w
  // 对手能成五必须堵（含菜鸟的基本堵五）
  const blk = findWin(state, foe, cands, false)
  if (blk >= 0) return blk

  // 菜鸟：其余着法在候选点里随机（避开禁手）
  if (lv <= 1) {
    for (let t = 0; t < 12; t++) {
      const i = cands[Math.floor(Math.random() * cands.length)]
      if (!forbid || !isFoulForMe(state, i)) return i
    }
    for (let k = 0; k < cands.length; k++) {
      if (!forbid || !isFoulForMe(state, cands[k])) return cands[k]
    }
    return cands[0]
  }

  const ranked = heuristic(state, me, cands).sort(function (a, c) { return c.score - a.score })

  if (lv === 2) {
    const best = pickBest(ranked)
    if (best && (!forbid || !isFoulForMe(state, best.i))) return best.i
    for (let k = 0; k < ranked.length; k++) {
      if (!forbid || !isFoulForMe(state, ranked[k].i)) return ranked[k].i
    }
    return cands.length ? cands[0] : null
  }

  // 高手：一层搜索；若最优着法恰为禁手点，退而取启发式最优合法点
  const mv = search1(state, me, cands)
  if (mv >= 0 && (!forbid || !isFoulForMe(state, mv))) return mv
  for (let k = 0; k < ranked.length; k++) {
    if (!forbid || !isFoulForMe(state, ranked[k].i)) return ranked[k].i
  }
  return cands.length ? cands[0] : null
}
