/**
 * 军棋（陆战棋）内核
 *
 * 棋盘：5 列 × 12 行（索引 i = y * 5 + x），中间 y=5/6 之间是「山界」。
 *   上半场 = 行 0..5，下半场 = 行 6..11（1 号玩家执下半场，2 号玩家执上半场）
 *   大本营：(1,0) (3,0) (1,11) (3,11)      —— 里面的棋子不能再移动
 *   行营：每方 5 个，位于 (1,1)(3,1)(2,2)(1,3)(3,3) 及其上下镜像
 *   前沿：行 5 / 行 6
 *
 * 连线（按原版棋盘图逐像素测出）：
 *   · 所有相邻格上下左右都连通（公路）
 *   · 上半场行 1↔2、2↔3、3↔4、4↔5 之间以及下半场行 6↔7…9↔10 之间还有斜线连通
 *   · 行 5↔6（山界）只在 x=0、2、4 三列可通
 *
 * 铁路：x=0/2/4 三列纵贯全程（也是唯一能过山界的通路）；行 1、3、8、10 各有横贯的铁路。
 *   普通棋子沿铁路只能直行，工兵可以在铁路上任意转弯。
 *
 * 棋子编码：两位字符串 = 阵营(1|2) + 代号
 *   S 司令12  J 军长11  Z 师长10  L 旅长9  T 团长8  Y 营长7
 *   N 连长6   P 排长5   G 工兵4   B 炸弹   M 地雷   F 军旗
 */

import { pick } from './rnd.js'

export const W = 5
export const H = 12
export const RED = 1
export const BLACK = 2

export const RANK = {
  S: 12, J: 11, Z: 10, L: 9, T: 8, Y: 7, N: 6, P: 5, G: 4,
  B: 0, M: 0, F: 0
}

const NAME = {
  S: '司令', J: '军长', Z: '师长', L: '旅长', T: '团长', Y: '营长',
  N: '连长', P: '排长', G: '工兵', B: '炸弹', M: '地雷', F: '军旗'
}

/** 每方 25 子 */
export const ROSTER = [
  'S', 'J', 'Z', 'Z', 'L', 'L', 'T', 'T', 'Y', 'Y',
  'N', 'N', 'N', 'P', 'P', 'P', 'G', 'G', 'G',
  'B', 'B', 'M', 'M', 'M', 'F'
]

export function otherSide(s) { return s === RED ? BLACK : RED }
export function idx(x, y) { return y * W + x }
export function px(i) { return i % W }
export function py(i) { return Math.floor(i / W) }
export function typeOf(p) { return p ? p.charAt(1) : '' }
export function sideOf(p) { return p ? parseInt(p.charAt(0), 10) : 0 }
export function pieceName(p) { return p ? NAME[typeOf(p)] : '' }
export function rankOf(p) { return p ? RANK[typeOf(p)] : 0 }

/** 该阵营的本场行范围 */
export function halfRows(side) { return side === RED ? [6, 11] : [0, 5] }

const HQ = [idx(1, 0), idx(3, 0), idx(1, 11), idx(3, 11)]
const CAMP_TOP = [idx(1, 1), idx(3, 1), idx(2, 2), idx(1, 3), idx(3, 3)]
const CAMP_BOTTOM = [idx(1, 10), idx(3, 10), idx(2, 9), idx(1, 8), idx(3, 8)]
const CAMPS = CAMP_TOP.concat(CAMP_BOTTOM)

export function isCamp(i) { return CAMPS.indexOf(i) >= 0 }
export function isHq(i) { return HQ.indexOf(i) >= 0 }
export function campsOf(side) { return side === RED ? CAMP_BOTTOM : CAMP_TOP }
export function hqsOf(side) { return side === RED ? [idx(1, 11), idx(3, 11)] : [idx(1, 0), idx(3, 0)] }
export function frontRow(side) { return side === RED ? 6 : 5 }

/* ------------------------------------------------------------------ */
/* 连线表                                                              */
/* ------------------------------------------------------------------ */

/** 斜线连通的相邻行对 */
const DIAG_ROW_PAIRS = [[1, 2], [2, 3], [3, 4], [4, 5], [6, 7], [7, 8], [8, 9], [9, 10]]

function buildAdj() {
  const adj = []
  for (let i = 0; i < W * H; i++) adj.push([])
  const link = (a, b) => { adj[a].push(b); adj[b].push(a) }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      if (x < W - 1) link(i, idx(x + 1, y))          // 横向
      if (y < H - 1) {
        if (y === 5) {
          // 山界：只有 x=0/2/4 能过去
          if (x === 0 || x === 2 || x === 4) link(i, idx(x, y + 1))
        } else {
          link(i, idx(x, y + 1))                     // 纵向
        }
      }
    }
  }
  // 斜线
  for (let k = 0; k < DIAG_ROW_PAIRS.length; k++) {
    const y1 = DIAG_ROW_PAIRS[k][0]
    const y2 = DIAG_ROW_PAIRS[k][1]
    for (let x = 0; x < W; x++) {
      if (x < W - 1) link(idx(x, y1), idx(x + 1, y2))
      if (x > 0) link(idx(x, y1), idx(x - 1, y2))
    }
  }
  return adj
}

const ADJ = buildAdj()

/** 铁路边 */
function buildRail() {
  const rail = []
  for (let i = 0; i < W * H; i++) rail.push(false)
  const mark = (a, b) => { rail[a] = true; rail[b] = true }
  const railCols = [0, 2, 4]
  for (let c = 0; c < railCols.length; c++) {
    const x = railCols[c]
    for (let y = 0; y < H - 1; y++) mark(idx(x, y), idx(x, y + 1))
  }
  const railRows = [1, 3, 8, 10]
  for (let r = 0; r < railRows.length; r++) {
    const y = railRows[r]
    for (let x = 0; x < W - 1; x++) mark(idx(x, y), idx(x + 1, y))
  }
  return rail
}

const RAIL = buildRail()
export function isRail(i) { return RAIL[i] }

/** 两个相邻格之间是否铁路边（用于直行/转弯判定） */
function railEdge(a, b) {
  if (!RAIL[a] || !RAIL[b]) return false
  const x1 = px(a)
  const y1 = py(a)
  const x2 = px(b)
  const y2 = py(b)
  // 水平铁路：同行且是铁路行
  if (y1 === y2) {
    const railRows = [1, 3, 8, 10]
    return railRows.indexOf(y1) >= 0 && Math.abs(x1 - x2) === 1
  }
  // 垂直铁路：同列且是铁路列
  if (x1 === x2) {
    const railCols = [0, 2, 4]
    return railCols.indexOf(x1) >= 0 && Math.abs(y1 - y2) === 1
  }
  return false
}

export function neighbors(i) { return ADJ[i] }

/* ------------------------------------------------------------------ */
/* 开局                                                                */
/* ------------------------------------------------------------------ */

/**
 * 默认阵型：30 个格位（从后排到前沿、每排自左向右），空字符串表示该格不放子。
 * 约束：军旗在大本营、地雷在后两排、炸弹不在第一排。共 25 子、5 个空格。
 */
export function defaultFormation() {
  return [
    'M', 'F', 'M', 'M', '',      // 后排（含两个大本营）
    'S', 'J', 'Z', '', '',
    'Z', 'L', 'T', 'B', 'Y',
    'L', 'T', 'B', 'N', 'G',
    'Y', 'N', 'P', 'G', 'P',
    'P', 'G', 'N', '', ''
  ]
}

/** 摆放顺序：己方 30 格（0 = 最后排最左，按行优先） */
export function cellsOf(side) {
  const out = []
  const rows = side === RED ? [11, 10, 9, 8, 7, 6] : [0, 1, 2, 3, 4, 5]
  for (let r = 0; r < rows.length; r++) {
    for (let x = 0; x < W; x++) out.push(idx(x, rows[r]))
  }
  return out
}

/** 校验并应用阵型（formation 为 30 项，空字符串表示该格不放子） */
export function validateFormation(side, formation) {
  const cells = cellsOf(side)
  let flag = 0
  let mines = 0
  const count = {}
  for (let k = 0; k < cells.length; k++) {
    const t = formation[k]
    if (!t) continue
    count[t] = (count[t] || 0) + 1
    const i = cells[k]
    if (t === 'F') {
      flag++
      if (!isHq(i)) return '军旗必须放置在大本营中'
    }
    if (t === 'M') {
      mines++
      const y = py(i)
      const okRow = side === RED ? (y === 11 || y === 10) : (y === 0 || y === 1)
      if (!okRow) return '地雷必须放置在后两排'
    }
    if (t === 'B' && py(i) === frontRow(side)) return '炸弹不能放置在第一排'
  }
  if (flag !== 1) return '必须且只能放置 1 面军旗'
  if (mines !== 3) return '必须放置 3 颗地雷'
  for (let k = 0; k < ROSTER.length; k++) {
    const t = ROSTER[k]
    const need = ROSTER.filter(v => v === t).length
    if ((count[t] || 0) !== need) return '棋子数量不符：' + NAME[t] + ' 需要 ' + need + ' 个'
  }
  return ''
}

export function newGame(opts) {
  const o = opts || {}
  const variant = o.variant === 'flip' ? 'flip' : 'hidden'
  const board = new Array(W * H).fill('')
  const faceUp = new Array(W * H).fill(true)       // 明棋（默认全部可见，暗棋由界面按阵营隐藏）
  const state = {
    board: board,
    faceUp: faceUp,
    revealed: {},                 // 暗棋/翻翻棋里已经亮明过的格子
    variant: variant,
    turn: BLACK,                  // 2 号先手（上半场）
    colors: { 1: null, 2: null }, // 翻翻棋的定色结果
    over: false,
    winner: 0,
    text: '',
    moves: [],
    last: null,
    lastBattle: null,
    opts: o
  }
  if (variant === 'flip') {
    setupFlip(state)
  } else {
    setupHidden(state)
  }
  return state
}

/** 暗棋：双方各按默认阵型摆好 */
function setupHidden(state) {
  const f1 = defaultFormation()
  placeFormation(state, RED, f1)
  placeFormation(state, BLACK, defaultFormation())
  state.turn = BLACK
}

export function placeFormation(state, side, formation) {
  const cells = cellsOf(side)
  for (let k = 0; k < cells.length; k++) {
    const t = formation[k]
    if (t) state.board[cells[k]] = side + t
  }
}

/** 翻翻棋：50 子打乱铺在 56 个非大本营格上，全部背面朝下 */
function setupFlip(state) {
  const cells = []
  for (let i = 0; i < W * H; i++) if (!isHq(i)) cells.push(i)
  // 洗牌
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = cells[i]; cells[i] = cells[j]; cells[j] = t
  }
  const all = []
  for (let k = 0; k < ROSTER.length; k++) {
    all.push(RED + ROSTER[k])
    all.push(BLACK + ROSTER[k])
  }
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const t = all[i]; all[i] = all[j]; all[j] = t
  }
  for (let k = 0; k < all.length; k++) {
    state.board[cells[k]] = all[k]
    state.faceUp[cells[k]] = false
  }
  state.turn = RED
}

/** 翻翻棋是否已定色 */
export function colorOf(state, player) { return state.colors[player] }

/* ------------------------------------------------------------------ */
/* 走法生成                                                            */
/* ------------------------------------------------------------------ */

/** 目标格能否被 color 方吃掉/落子（行营里的敌子不可攻击；大本营内的己方棋子不能动） */
function canEnter(state, from, to, side) {
  const p = state.board[to]
  if (!p) return true
  if (sideOf(p) === side) return false
  if (isCamp(to)) return false            // 行营是安全岛
  return true
}

/** 铁路直行/转弯 */
function railMoves(state, from, side) {
  const out = []
  const type = typeOf(state.board[from])
  if (!RAIL[from]) return out

  if (type === 'G') {
    // 工兵：铁路上任意转弯
    const seen = {}
    const queue = [from]
    seen[from] = true
    while (queue.length) {
      const cur = queue.shift()
      const nb = ADJ[cur]
      for (let k = 0; k < nb.length; k++) {
        const nx = nb[k]
        if (seen[nx]) continue
        if (!railEdge(cur, nx)) continue
        const q = state.board[nx]
        if (!q) {
          seen[nx] = true
          out.push(nx)
          queue.push(nx)
        } else if (sideOf(q) !== side && !isCamp(nx)) {
          seen[nx] = true
          out.push(nx)               // 可以吃，但不能穿过
        } else {
          seen[nx] = true            // 被挡住
        }
      }
    }
    return out
  }

  // 其他棋子：沿铁路直行
  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]]
  const x0 = px(from)
  const y0 = py(from)
  for (let d = 0; d < 4; d++) {
    let x = x0
    let y = y0
    let cur = from
    while (true) {
      x += dirs[d][0]
      y += dirs[d][1]
      if (x < 0 || x >= W || y < 0 || y >= H) break
      const nx = idx(x, y)
      if (!railEdge(cur, nx)) break
      const q = state.board[nx]
      if (!q) {
        out.push(nx)
      } else {
        if (sideOf(q) !== side && !isCamp(nx)) out.push(nx)
        break
      }
      cur = nx
    }
  }
  return out
}

/** 某个格子的棋子合法目标 */
export function legalMoves(state, from) {
  const p = state.board[from]
  if (!p) return []
  const side = sideOf(p)
  const type = typeOf(p)
  if (type === 'M' || type === 'F') return []      // 地雷、军旗不能动
  if (isHq(from)) return []                         // 大本营里的棋子不能动
  if (!state.faceUp[from]) return []                // 未翻开的子不能动

  const set = {}
  // 公路：一步
  const nb = ADJ[from]
  for (let k = 0; k < nb.length; k++) {
    if (canEnter(state, from, nb[k], side)) set[nb[k]] = true
  }
  // 铁路
  const rm = railMoves(state, from, side)
  for (let k = 0; k < rm.length; k++) set[rm[k]] = true

  const out = []
  for (const k in set) out.push(parseInt(k, 10))
  return out
}

/** 翻翻棋：可以翻开的格子 */
export function flippable(state) {
  const out = []
  for (let i = 0; i < state.board.length; i++) {
    if (state.board[i] && !state.faceUp[i]) out.push(i)
  }
  return out
}

export function allLegalMoves(state, player) {
  const out = []
  const side = state.variant === 'flip' ? state.colors[player] : player
  if (!side) {
    // 还没定色：只能翻棋
    const fs = flippable(state)
    for (let k = 0; k < fs.length; k++) out.push({ flip: fs[k] })
    return out
  }
  for (let i = 0; i < state.board.length; i++) {
    const p = state.board[i]
    if (!p || sideOf(p) !== side) continue
    const tg = legalMoves(state, i)
    for (let k = 0; k < tg.length; k++) out.push({ from: i, to: tg[k] })
  }
  // 翻翻棋里"翻开一枚暗子"永远是可选的（暗子翻开可能属于任意一方）
  if (state.variant === 'flip') {
    const fs = flippable(state)
    for (let k = 0; k < fs.length; k++) out.push({ flip: fs[k] })
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 战斗判定                                                            */
/* ------------------------------------------------------------------ */

/**
 * 战斗结果
 * 返回 { result: 'win'|'lose'|'both'|'blocked', text }
 * 以"进攻方 atk"视角
 */
export function judgeBattle(atk, def, minesCleared) {
  const ta = typeOf(atk)
  const td = typeOf(def)
  const na = NAME[ta]
  const nd = NAME[td]

  if (ta === 'F' || td === 'F') {
    // 军旗：必须先挖光对方地雷
    return minesCleared
      ? { result: 'win', text: '扛旗成功！' }
      : { result: 'blocked', text: '必须先挖光对方地雷才能扛旗' }
  }
  if (ta === 'M') return { result: 'blocked', text: '地雷不能移动' }

  // 炸弹：同归于尽（对军旗无效，上面已处理）
  if (ta === 'B' || td === 'B') return { result: 'both', text: '炸弹同归于尽（' + na + ' ↔ ' + nd + '）' }

  if (td === 'M') {
    // 只有工兵能挖雷
    return ta === 'G'
      ? { result: 'win', text: '工兵挖掉地雷' }
      : { result: 'lose', text: na + ' 撞上地雷被炸掉' }
  }

  const ra = RANK[ta] || 0
  const rd = RANK[td] || 0
  if (ra > rd) return { result: 'win', text: na + ' 吃掉 ' + nd }
  if (ra < rd) return { result: 'lose', text: na + ' 被 ' + nd + ' 吃掉' }
  return { result: 'both', text: '同级 ' + na + ' 同归于尽' }
}

function countMines(state, side) {
  let c = 0
  for (let i = 0; i < state.board.length; i++) {
    const p = state.board[i]
    if (p && sideOf(p) === side && typeOf(p) === 'M') c++
  }
  return c
}

/** 己方是否还有可动棋子（地雷/军旗不算） */
function hasMovable(state, side) {
  for (let i = 0; i < state.board.length; i++) {
    const p = state.board[i]
    if (!p || sideOf(p) !== side) continue
    const t = typeOf(p)
    if (t === 'M' || t === 'F') continue
    if (isHq(i)) continue
    return true
  }
  return false
}

/* ------------------------------------------------------------------ */
/* 落子                                                                */
/* ------------------------------------------------------------------ */

export function apply(state, move, byPlayer) {
  if (state.over || !move) return false

  if (state.variant === 'flip') return applyFlip(state, move, byPlayer)

  const side = state.turn
  if (byPlayer && byPlayer !== side) return false
  const p = state.board[move.from]
  if (!p || sideOf(p) !== side) return false
  if (legalMoves(state, move.from).indexOf(move.to) < 0) return false

  const def = state.board[move.to]
  const foe = otherSide(side)
  const mineLeft = countMines(state, foe)
  const j = def ? judgeBattle(p, def, mineLeft === 0) : { result: 'win', text: '' }

  state.last = { from: move.from, to: move.to }
  if (!def) {
    state.board[move.to] = p
    state.board[move.from] = ''
    state.lastBattle = null
    state.moves.push({ from: move.from, to: move.to, captured: '' })
  } else if (j.result === 'blocked') {
    return false
  } else if (j.result === 'win') {
    state.board[move.to] = p
    state.board[move.from] = ''
    state.lastBattle = { text: j.text, win: true }
    state.moves.push({ from: move.from, to: move.to, captured: def })
  } else if (j.result === 'lose') {
    state.board[move.from] = ''
    state.lastBattle = { text: j.text, win: false }
    state.moves.push({ from: move.from, to: move.to, captured: p, suicide: true })
  } else {
    state.board[move.from] = ''
    state.board[move.to] = ''
    state.lastBattle = { text: j.text, win: false, both: true }
    state.moves.push({ from: move.from, to: move.to, captured: def + '/' + p, both: true })
  }

  state.turn = otherSide(side)
  finish(state)
  return true
}

function applyFlip(state, move, byPlayer) {
  const player = state.turn
  if (byPlayer && byPlayer !== player) return false

  if (move.flip !== undefined) {
    const i = move.flip
    if (!state.board[i] || state.faceUp[i]) return false
    state.faceUp[i] = true
    state.revealed[i] = true
    const color = sideOf(state.board[i])
    if (!state.colors[player]) {
      // 定色：翻到什么颜色，自己就是什么颜色
      state.colors[player] = color
      state.colors[otherSide(player)] = otherSide(color)
      state.lastBattle = { text: '定色：' + (color === RED ? '红方' : '黑方'), win: true }
    } else {
      state.lastBattle = { text: '翻开 ' + (color === RED ? '红' : '黑') + '方 ' + pieceName(state.board[i]), win: false }
    }
    state.moves.push({ flip: i })
    state.turn = otherSide(player)
    finish(state)
    return true
  }

  const side = state.colors[player]
  if (!side) return false
  const p = state.board[move.from]
  if (!p || sideOf(p) !== side) return false
  if (legalMoves(state, move.from).indexOf(move.to) < 0) return false

  const def = state.board[move.to]
  const mineLeft = countMines(state, otherSide(side))
  const j = def ? judgeBattle(p, def, mineLeft === 0) : { result: 'win', text: '' }
  if (j.result === 'blocked') return false

  state.last = { from: move.from, to: move.to }
  if (!def || j.result === 'win') {
    state.board[move.to] = p
    state.board[move.from] = ''
  } else if (j.result === 'lose') {
    state.board[move.from] = ''
  } else {
    state.board[move.from] = ''
    state.board[move.to] = ''
  }
  state.lastBattle = def ? { text: j.text, win: j.result === 'win' } : null
  state.moves.push({ from: move.from, to: move.to, captured: def || '' })
  state.turn = otherSide(player)
  finish(state)
  return true
}

function finish(state) {
  // 军旗被扛 / 无子可动 → 判负
  for (let player = 1; player <= 2; player++) {
    const side = state.variant === 'flip' ? state.colors[player] : player
    if (!side) continue
    let flag = false
    let movable = false
    for (let i = 0; i < state.board.length; i++) {
      const p = state.board[i]
      if (!p || sideOf(p) !== side) continue
      const t = typeOf(p)
      if (t === 'F') flag = true
      if (t !== 'M' && t !== 'F') movable = true
    }
    if (!flag) {
      state.over = true
      state.winner = otherSide(side)
      state.text = (side === RED ? '红方' : '黑方') + '军旗被扛，' + (state.winner === RED ? '红方' : '黑方') + '获胜'
      return
    }
    if (!movable) {
      state.over = true
      state.winner = otherSide(side)
      state.text = (side === RED ? '红方' : '黑方') + '无子可动，' + (state.winner === RED ? '红方' : '黑方') + '获胜'
      return
    }
  }
}

export function result(state) {
  if (state.over) return { over: true, winner: state.winner, text: state.text }
  const side = state.variant === 'flip' ? state.colors[state.turn] : state.turn
  if (!side) return { over: false, winner: 0, text: '请翻开第一枚棋子定色' }
  return { over: false, winner: 0, text: (side === RED ? '红方' : '黑方') + '行棋' }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/** 对手未知棋子的期望强度（暗棋里 AI 不许偷看） */
function expectedRank(state, i, mySide) {
  const p = state.board[i]
  if (!p) return 0
  const foe = otherSide(mySide)
  if (sideOf(p) === mySide) return rankOf(p)
  if (state.faceUp[i] || state.revealed[i]) {
    if (typeOf(p) === 'F') return 100      // 军旗：能扛就赢
    if (typeOf(p) === 'M') return -1       // 地雷
    return rankOf(p)
  }
  // 未知敌子：按平均值估计
  return 6
}

function evalMove(state, from, to, side) {
  const p = state.board[from]
  const t = typeOf(p)
  const def = state.board[to]
  let s = 0

  if (!def) {
    // 空位：往前压、进营加分，别在行营外晃
    if (isCamp(to)) s += 12
    const dy = side === RED ? py(from) - py(to) : py(to) - py(from)
    s += dy * 1.5
    if (t === 'G') s += 2
    // 离开危险位置
    if (dangerous(state, from, side)) s += 8
    return s
  }

  const er = expectedRank(state, to, side)
  const mr = rankOf(p)

  if (t === 'B') {
    // 炸弹：换掉对方大子才划算
    s += er >= 9 ? 40 : (er >= 0 ? 8 : 5)
    if (typeOf(def) === 'M') s -= 10
    return s
  }
  if (typeOf(def) === 'M') return -20            // 未知地雷风险
  if (er < 0) return -30                          // 已知地雷
  if (er === 100) s += 999                        // 能扛旗
  if (mr > er) s += 10 + er * 2                   // 吃掉比自己小的
  else if (mr === er) s += er - 4                 // 同归于尽，越大越亏
  else s -= 25                                    // 大概率送死
  if (isCamp(to)) s -= 200                        // 不该走到这（行营不能吃）
  return s
}

/** 该格是否处在敌方威胁下（粗略） */
function dangerous(state, i, side) {
  const nb = ADJ[i]
  for (let k = 0; k < nb.length; k++) {
    const j = nb[k]
    const q = state.board[j]
    if (q && sideOf(q) !== side) {
      const er = expectedRank(state, j, side)
      if (er > rankOf(state.board[i])) return true
    }
  }
  return false
}

export function aiMove(state, level) {
  const player = state.turn
  const side = state.variant === 'flip' ? state.colors[player] : player
  const lv = level || 1

  if (state.variant === 'flip' && !side) {
    const fs = flippable(state)
    if (!fs.length) return null
    return { flip: pick(fs) }
  }

  const moves = allLegalMoves(state, player)
  if (!moves.length) return null

  // 能直接扛旗就走
  for (let k = 0; k < moves.length; k++) {
    const m = moves[k]
    if (m.flip !== undefined) continue
    const def = state.board[m.to]
    if (def && typeOf(def) === 'F') {
      const mineLeft = countMines(state, otherSide(side))
      if (mineLeft === 0) return m
    }
  }

  const scored = moves.map(m => {
    if (m.flip !== undefined) return { m: m, score: 3 }   // 翻棋保守
    return { m: m, score: evalMove(state, m.from, m.to, side) }
  })

  if (lv <= 1) {
    // 弱级：在候选里随机
    const top = scored.slice().sort((a, b) => b.score - a.score)
    const k = Math.max(1, Math.ceil(top.length * 0.5))
    return top[Math.floor(Math.random() * k)].m
  }

  scored.sort((a, b) => b.score - a.score)
  if (lv === 2) return scored[0].m

  // 高手：对前几名做一步前瞻（避免送吃）
  const top = scored.slice(0, 5)
  for (let k = 0; k < top.length; k++) {
    const cand = top[k].m
    if (cand.flip !== undefined) continue
    const tmp = { ...state, board: state.board.slice(), faceUp: state.faceUp.slice() }
    apply(tmp, cand, player)
    let worst = 0
    const replies = allLegalMoves(tmp, state.turn)
    for (let r = 0; r < replies.length; r++) {
      const m2 = replies[r]
      if (m2.flip !== undefined) continue
      if (m2.to !== cand.to) continue               // 只看对刚落地那格的报复
      const v = evalMove(tmp, m2.from, m2.to, sideOf(tmp.board[m2.from]))
      if (v > worst) worst = v
    }
    top[k].score -= worst * 0.8
  }
  top.sort((a, b) => b.score - a.score)
  return top[0].m
}


const IMG_NAME = {
  S: 'siling', J: 'junzhang', Z: 'shizhang', L: 'lvzhang', T: 'tuanzhang',
  Y: 'yingzhang', N: 'lianzhang', P: 'paizhang', G: 'gongbing',
  B: 'zhadan', M: 'dlei', F: 'junqi'
}

/** 棋子图片（复用原版素材） */
export function pieceImage(p) {
  if (!p) return ''
  const t = typeOf(p)
  const s = sideOf(p)
  const n = IMG_NAME[t]
  if (!n) return ''
  return '/common/chess/jq/' + (s === RED ? 'r_' : 'b_') + n + '.png'
}

export const MINES_CLEARED_HINT = '必须先挖光对方地雷才能扛旗'
