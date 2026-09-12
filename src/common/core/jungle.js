/**
 * 斗兽棋（Jungle / Dou Shou Qi）纯逻辑内核
 * 无任何系统接口依赖，可在 Node 里直接单测；只 import ./rnd.js
 *
 * 棋盘：7 列 × 9 行，一维数组 i = y * 7 + x（x 从左到右，y 从上到下）
 *   红方（玩家 1，下方）先手，蓝方（玩家 2，上方）
 * 棋子编码：code = 玩家 * 10 + 等级
 *   等级 8 象 > 7 狮 > 6 虎 > 5 豹 > 4 狼 > 3 狗 > 2 猫 > 1 鼠
 * 兽穴：红 (3,8) / 蓝 (3,0)；进入对方兽穴立即获胜，不能进自己兽穴
 * 陷阱：红 (2,7)(3,7)(4,7) / 蓝 (2,1)(3,1)(4,1)；外方棋子进入后等级视为 0
 * 河流：y=3..5 且 x=1..5；只有鼠可入河；狮/虎可跳过整条河
 *
 * 开局：红方 y=8 由左至右 狮 猫 狗 [兽穴] 狼 豹 虎，y=7 的 x=1 放鼠，
 *       y=6 的 x=0 放象；蓝方按上下镜像（x 不变，y -> 8-y）摆放。
 *       （真实实体棋盘多用 180° 点对称；此处采用题面给定的上下镜像变体。）
 */
import { pick } from './rnd.js'

export const COLS = 7
export const ROWS = 9
export const SIZE = COLS * ROWS

export const RED = 1
export const BLUE = 2

/** 等级 -> 素材文件后缀 */
export const KIND = { 1: 'shu', 2: 'mao', 3: 'gou', 4: 'lang', 5: 'bao', 6: 'hu', 7: 'shi', 8: 'xiang' }
/** 等级 -> 中文名 */
export const KIND_NAME = { 1: '鼠', 2: '猫', 3: '狗', 4: '狼', 5: '豹', 6: '虎', 7: '狮', 8: '象' }

export function idx(x, y) { return y * COLS + x }
export function xOf(i) { return i % COLS }
export function yOf(i) { return Math.floor(i / COLS) }
export function other(p) { return p === 1 ? 2 : 1 }
export function makePiece(p, k) { return p * 10 + k }
export function playerOf(code) { return code ? Math.floor(code / 10) : 0 }
export function kindOf(code) { return code ? code % 10 : 0 }

export const RED_DEN = idx(3, 8)
export const BLUE_DEN = idx(3, 0)
export function denOf(p) { return p === 1 ? RED_DEN : BLUE_DEN }

export const RED_TRAPS = [idx(2, 7), idx(3, 7), idx(4, 7)]
export const BLUE_TRAPS = [idx(2, 1), idx(3, 1), idx(4, 1)]
const TRAP_OWNER = new Array(SIZE).fill(0)
for (let i = 0; i < RED_TRAPS.length; i++) TRAP_OWNER[RED_TRAPS[i]] = 1
for (let i = 0; i < BLUE_TRAPS.length; i++) TRAP_OWNER[BLUE_TRAPS[i]] = 2

/** 0=不是陷阱 1=红方陷阱 2=蓝方陷阱 */
export function trapOwner(i) { return TRAP_OWNER[i] }

/** 河流格：y=3..5 且 x=1..5 */
export function isRiver(x, y) { return y >= 3 && y <= 5 && x >= 1 && x <= 5 }
export function isRiverIdx(i) { return isRiver(xOf(i), yOf(i)) }

/** 棋子有效等级：站在对方陷阱上视为 0 */
export function effRank(board, i) {
  const c = board[i]
  if (!c) return 0
  const t = TRAP_OWNER[i]
  if (t && t !== playerOf(c)) return 0
  return kindOf(c)
}

/** from 处棋子能否吃掉 to 处的敌子（to 必须已有敌子） */
function canCapture(board, from, to) {
  const a = effRank(board, from)
  const d = effRank(board, to)
  if (a <= 0) return false        // 己方在对方陷阱里，无力进攻
  if (d <= 0) return true         // 对方在己方陷阱里，任意可吃
  if (a === 1 && d === 8) return true   // 鼠吃象
  return a >= d                    // 大吃小；同级吃方存活
}

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]

function inBoard(x, y) { return x >= 0 && x < COLS && y >= 0 && y < ROWS }

/** 狮/虎跳河：from->to 中间必须全是河面、河面无子、落点是陆地 */
function isJump(board, from, to) {
  const x1 = xOf(from), y1 = yOf(from), x2 = xOf(to), y2 = yOf(to)
  if (x1 === x2 && y1 === y2) return false
  if (x1 !== x2 && y1 !== y2) return false
  const dx = x2 === x1 ? 0 : (x2 > x1 ? 1 : -1)
  const dy = y2 === y1 ? 0 : (y2 > y1 ? 1 : -1)
  let x = x1 + dx, y = y1 + dy, crossed = false
  while (x !== x2 || y !== y2) {
    if (!inBoard(x, y)) return false
    if (!isRiver(x, y)) return false      // 中间必须整段是河
    if (board[idx(x, y)]) return false     // 河中有子（鼠）挡路
    crossed = true
    x += dx; y += dy
  }
  if (!crossed) return false
  if (isRiver(x2, y2)) return false        // 落点必须是陆地
  return true
}

/** 落点是否能去（空格，或可吃的敌子；水陆之间不可互吃） */
function destOk(board, from, to, mover) {
  const dest = board[to]
  if (!dest) return true
  if (playerOf(dest) === mover) return false
  if (isRiverIdx(from) !== isRiverIdx(to)) return false   // 岸上/水中不能互吃
  return canCapture(board, from, to)
}

/** 完整合法性判定 */
function isLegal(board, from, to, mover) {
  if (from < 0 || from >= SIZE || to < 0 || to >= SIZE || from === to) return false
  const piece = board[from]
  if (!piece || playerOf(piece) !== mover) return false
  if (to === denOf(mover)) return false                  // 不能进自己兽穴
  const dest = board[to]
  if (dest && playerOf(dest) === mover) return false     // 不能吃自己的子
  if (isRiverIdx(to) && kindOf(piece) !== 1) return false // 只有鼠能入河
  const dx = Math.abs(xOf(from) - xOf(to))
  const dy = Math.abs(yOf(from) - yOf(to))
  let ok = false
  if (dx + dy === 1) ok = true
  else {
    const k = kindOf(piece)
    if ((k === 6 || k === 7) && !isRiverIdx(from) && isJump(board, from, to)) ok = true
  }
  if (!ok) return false
  return destOk(board, from, to, mover)
}

function movesFrom(board, from, out) {
  const code = board[from]
  if (!code) return
  const mover = playerOf(code)
  const x = xOf(from), y = yOf(from)
  for (let d = 0; d < DIRS.length; d++) {
    const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
    if (!inBoard(nx, ny)) continue
    const t = idx(nx, ny)
    if (isLegal(board, from, t, mover)) out.push({ from: from, to: t })
  }
  const k = kindOf(code)
  if ((k === 6 || k === 7) && !isRiverIdx(from)) {
    for (let d = 0; d < DIRS.length; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1]
      if (!inBoard(nx, ny) || !isRiver(nx, ny)) continue
      let fx = nx + DIRS[d][0], fy = ny + DIRS[d][1]
      while (inBoard(fx, fy) && isRiver(fx, fy)) { fx += DIRS[d][0]; fy += DIRS[d][1] }
      if (!inBoard(fx, fy)) continue
      const t = idx(fx, fy)
      if (isLegal(board, from, t, mover)) out.push({ from: from, to: t })
    }
  }
}

/** 某方全部合法走法 [{from,to}] */
export function legalMoves(board, player) {
  const out = []
  for (let i = 0; i < SIZE; i++) {
    const c = board[i]
    if (c && playerOf(c) === player) movesFrom(board, i, out)
  }
  return out
}

function hasPieces(board, p) {
  for (let i = 0; i < SIZE; i++) if (board[i] && playerOf(board[i]) === p) return true
  return false
}

/** 标准开局（见文件头说明） */
export function initialBoard() {
  const b = new Array(SIZE).fill(0)
  const red = [
    [0, 8, 7], [1, 8, 2], [2, 8, 3], [4, 8, 4], [5, 8, 5], [6, 8, 6],
    [1, 7, 1],
    [0, 6, 8]
  ]
  for (let i = 0; i < red.length; i++) {
    const x = red[i][0], y = red[i][1], k = red[i][2]
    b[idx(x, y)] = makePiece(1, k)
  }
  for (let i = 0; i < red.length; i++) {
    const x = red[i][0], y = red[i][1], k = red[i][2]
    b[idx(x, ROWS - 1 - y)] = makePiece(2, k)
  }
  return b
}

function textOf(st) {
  if (!st.over) return '对局中'
  if (st.winner === 1) return '红方获胜'
  if (st.winner === 2) return '蓝方获胜'
  return '平局'
}

/** 新对局；opts: {mode:'ai'|'pvp', useTimer, baseMinutes, addSeconds} */
export function newGame(opts) {
  opts = opts || {}
  return {
    board: initialBoard(),
    turn: 1,
    first: 1,
    over: false,
    winner: 0,
    text: '',
    moves: 0,
    last: -1,
    from: -1,
    history: [],
    mode: opts.mode === 'pvp' ? 'pvp' : 'ai',
    useTimer: !!opts.useTimer,
    baseMinutes: opts.baseMinutes || 30,
    addSeconds: opts.addSeconds || 5
  }
}

/** 走子；byPlayer 省略时用 state.turn。返回 true/false */
export function apply(state, move, byPlayer) {
  if (!state || state.over || !move) return false
  const mover = (byPlayer === undefined || byPlayer === null) ? state.turn : byPlayer
  if (mover !== state.turn) return false
  const from = move.from, to = move.to
  if (!isLegal(state.board, from, to, mover)) return false
  const piece = state.board[from]
  const cap = state.board[to]
  state.board[from] = 0
  state.board[to] = piece
  state.moves = (state.moves || 0) + 1
  state.from = from
  state.last = to
  if (!state.history) state.history = []
  state.history.push({ from: from, to: to, cap: cap, piece: piece, turn: mover })

  const foe = other(mover)
  if (to === denOf(foe)) {
    state.over = true; state.winner = mover; state.text = textOf(state); return true
  }
  if (!hasPieces(state.board, foe) || legalMoves(state.board, foe).length === 0) {
    state.over = true; state.winner = mover; state.text = textOf(state); return true
  }
  state.turn = foe
  return true
}

/** 悔一步棋 */
export function undo(state) {
  if (!state || !state.history || !state.history.length) return false
  const h = state.history.pop()
  state.board[h.to] = h.cap
  state.board[h.from] = h.piece
  state.turn = h.turn
  state.over = false
  state.winner = 0
  state.text = ''
  state.moves = Math.max(0, (state.moves || 1) - 1)
  const prev = state.history.length ? state.history[state.history.length - 1] : null
  state.last = prev ? prev.to : -1
  state.from = prev ? prev.from : -1
  return true
}

/** {over, winner:0|1|2|'draw', text} */
export function result(state) {
  if (!state) return { over: false, winner: 0, text: '对局中' }
  return { over: !!state.over, winner: state.winner, text: state.text || textOf(state) }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

const VAL = [0, 2, 2, 3, 4, 5, 7, 8, 9]   // 按等级 1..8
const WIN = 1e9

/** 在 board 副本上走子，返回被吃子编码（0 表示无） */
function play(board, from, to) {
  const cap = board[to]
  const piece = board[from]
  board[from] = 0
  board[to] = piece
  return cap
}

function evaluate(board, me) {
  let s = 0
  for (let i = 0; i < SIZE; i++) {
    const c = board[i]
    if (!c) continue
    const p = playerOf(c), k = kindOf(c)
    const side = p === me ? 1 : -1
    s += side * VAL[k] * 10
    const den = p === 1 ? BLUE_DEN : RED_DEN
    const d = Math.abs(xOf(i) - xOf(den)) + Math.abs(yOf(i) - yOf(den))
    s += side * (12 - d) * 0.6
    const t = TRAP_OWNER[i]
    if (t && t !== p) s -= side * 25
  }
  return s
}

function argmax(cands) {
  let best = -Infinity
  for (let i = 0; i < cands.length; i++) if (cands[i].score > best) best = cands[i].score
  const top = []
  for (let i = 0; i < cands.length; i++) if (cands[i].score >= best - 1e-9) top.push(cands[i])
  return top.length === 1 ? top[0] : pick(top)
}

/** 菜鸟：多为随机，偶尔顺手吃子 */
function level1(board, me, moves) {
  if (Math.random() < 0.35) {
    const caps = []
    for (let i = 0; i < moves.length; i++) if (board[moves[i].to]) caps.push(moves[i])
    if (caps.length) return pick(caps)
  }
  return pick(moves)
}

/** 普通：吃子价值 + 靠近兽穴 + 避免被吃 */
function level2(board, me, moves) {
  const foe = other(me)
  const cands = []
  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi]
    const b2 = board.slice()
    const cap = play(b2, m.from, m.to)
    if (m.to === denOf(foe)) return m
    let sc = evaluate(b2, me)
    if (cap) sc += VAL[kindOf(cap)] * 12
    const piece = b2[m.to]
    const replies = legalMoves(b2, foe)
    let danger = 0
    for (let ri = 0; ri < replies.length; ri++) {
      if (replies[ri].to === m.to) {
        const v = VAL[kindOf(piece)]
        if (v > danger) danger = v
      }
    }
    sc -= danger * 6
    cands.push({ from: m.from, to: m.to, score: sc })
  }
  return argmax(cands)
}

/** 高手：启发式 + 2 层搜索（alpha-beta 剪枝） */
function level3(board, me, moves) {
  const foe = other(me)
  // 走法排序：吃子价值高的先试，利于剪枝
  moves.sort(function (a, b) {
    const va = board[a.to] ? VAL[kindOf(board[a.to])] : 0
    const vb = board[b.to] ? VAL[kindOf(board[b.to])] : 0
    return vb - va
  })
  const cands = []
  let alpha = -Infinity
  for (let mi = 0; mi < moves.length; mi++) {
    const m = moves[mi]
    if (m.to === denOf(foe)) return m
    const b2 = board.slice()
    const cap = play(b2, m.from, m.to)
    const bonus = cap ? VAL[kindOf(cap)] * 12 : 0
    let sc
    const replies = legalMoves(b2, foe)
    if (!replies.length) {
      sc = WIN
    } else {
      let worst = Infinity
      for (let ri = 0; ri < replies.length; ri++) {
        if (replies[ri].to === denOf(me)) { worst = -WIN; break }
        const b3 = b2.slice()
        play(b3, replies[ri].from, replies[ri].to)
        const v = evaluate(b3, me)
        if (v < worst) worst = v
        if (worst <= alpha - bonus) break    // 该走法已无法超越当前最优
      }
      sc = worst + bonus
    }
    if (sc > alpha) alpha = sc
    cands.push({ from: m.from, to: m.to, score: sc })
  }
  return argmax(cands)
}

/** AI 走子；无棋可走返回 null */
export function aiMove(state, level) {
  if (!state || state.over) return null
  const me = state.turn
  const moves = legalMoves(state.board, me)
  if (!moves.length) return null
  const lv = level || 2
  let mv
  if (lv <= 1) mv = level1(state.board, me, moves)
  else if (lv === 2) mv = level2(state.board, me, moves)
  else mv = level3(state.board, me, moves)
  return mv || moves[0]
}
