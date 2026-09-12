/**
 * 飞行棋（aeroplane / Ludo 变体）纯规则内核
 *
 * 不依赖任何 @system.*，只 import ./rnd.js，可直接在 Node 里单测。
 *
 * ── 棋盘与坐标 ─────────────────────────────────────────────────
 * 逻辑棋盘 15×15（渲染时以 12px/格 铺满 180×180）。
 *   0..14 行（r，自上而下） / 0..14 列（c，自左而右）。
 * 标准「十字形」跑道：外环 52 格 + 每方 6 格终点跑道 + 中央 3×3 终点区。
 * 四角 6×6 为四方基地（停机坪）。
 *
 * 外环 RING 为 52 个 [r,c]，按顺时针连续（相邻格正交相接，四个凹角处
 * 为斜向过渡，与实体飞行棋一致）。RING 下标即「环下标」。
 *
 *   index : 0    1    2    3    4    5    6 .. 9   10   11   12   13
 *   cell  :(6,1)(6,2)(6,3)(6,4)(6,5)(5,6)(4,6)...(1,6)(0,6)(0,7)(0,8)(1,8)
 *   ... 13 起沿上臂右列下行，18 起沿右臂上行，25/26 沿右臂下行，
 *   31 起沿下臂右列下行，38 起沿下臂左列上行，44 起沿左臂下行，
 *   50 (7,0) → 51 (6,0) 回到环首。
 *
 * 每方起点（起飞点）在环上的下标相差 13：
 *   红=P1: 51 -> (6,0)   黄=P2: 12 -> (0,8)
 *   蓝=P3: 25 -> (8,14)  绿=P4: 38 -> (14,6)
 * 每方的终点跑道 HOME[p] 为其臂的中线 6 格，末端紧邻中央：
 *   红 (7,1)..(7,6) / 黄 (1,7)..(6,7) / 蓝 (7,13)..(7,8) / 绿 (13,7)..(8,7)
 *
 * ── 位置编码 pos ───────────────────────────────────────────────
 * 每枚飞机用「进度」表示：
 *   -1        : 停在基地
 *   0..51     : 在环上；环下标 = (START[owner] + pos) % 52
 *   52..57    : 在终点跑道；HOME[owner][pos-52]
 *   LAST(57)  : 已到终点（完成）
 * 步数超出 LAST 时按「撞墙弹回」：np = LAST - (np - LAST)。
 *
 * ── 特殊格（按 pos 定义，四方对称） ────────────────────────────
 * 同色跳跃：pos 为 4 的倍数且 pos+4<=51（即仍在环上），着陆后 +4，并且
 *           **连续跳跃**——新落点若仍是同色格则继续 +4，直到落点不是同色格
 *           或再 +4 会越出环（进入终点跑道）。用 guard 上限防止死循环。
 *           （环下标 i%4 决定颜色，起点 pos%4==0，故同色格恰为 4 的倍数）
 * 虚线飞行：FLY={18:30, 39:51}，着陆后 +12 飞到对面，飞行后不再触发跳跃。
 */

import { clone, pickBest } from './rnd.js'

export const SIZE = 15
export const RING_LEN = 52
export const HOME_LEN = 6
export const LAST = HOME_LEN + RING_LEN - 1 // 57

/** 外环 52 格坐标（顺时针） */
export const RING = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7],
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14],
  [8, 14], [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7],
  [14, 6], [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0],
  [6, 0]
]

/** 各方起飞点所在环下标，START[player]，下标 0 占位 */
export const START = [0, 51, 12, 25, 38]

/** 各方终点跑道 6 格，HOME[player] */
export const HOME = [
  null,
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]]
]

/** 各方基地停机槽 4 格，BASE[player] */
export const BASE = [
  null,
  [[2, 2], [2, 3], [3, 2], [3, 3]],
  [[2, 11], [2, 12], [3, 11], [3, 12]],
  [[11, 11], [11, 12], [12, 11], [12, 12]],
  [[11, 2], [11, 3], [12, 2], [12, 3]]
]

const NAMES = ['', '红方', '黄方', '蓝方', '绿方']
const COLOR_NAMES = ['', '红', '黄', '蓝', '绿']

/** 环下标颜色码 -> 玩家：环下标 %4 为 3/0/1/2 分别对应 红/黄/蓝/绿 */
export function codePlayer(code) {
  if (code === 3) return 1
  if (code === 0) return 2
  if (code === 1) return 3
  return 4
}

/** 环下标 -> 玩家人数（同色归属） */
export function ringOwner(ri) { return codePlayer(ri % 4) }

export function playerName(p) { return NAMES[p] || '' }
export function playerColorName(p) { return COLOR_NAMES[p] || '' }

/** 某玩家 pos 对应的环下标，不在环上返回 -1 */
export function ringOf(player, pos) {
  if (pos < 0 || pos > RING_LEN - 1) return -1
  return (START[player] + pos) % RING_LEN
}

/** 渲染坐标：玩家 p 的第 k 枚飞机在 pos 处的 [r,c] */
export function planeXY(player, k, pos) {
  if (pos < 0) return BASE[player][k]
  if (pos <= RING_LEN - 1) return RING[(START[player] + pos) % RING_LEN]
  return HOME[player][pos - RING_LEN]
}

/* ---------------- 15×15 静态布局（供页面渲染） ---------------- */
function buildLayout() {
  const L = new Array(SIZE * SIZE)
  for (let i = 0; i < L.length; i++) L[i] = { t: 0, o: 0, ri: -1 }
  for (let p = 1; p <= 4; p++) {
    for (let j = 0; j < 4; j++) {
      const b = BASE[p][j]
      L[b[0] * SIZE + b[1]] = { t: 4, o: p, ri: -1 }
    }
    for (let j = 0; j < HOME_LEN; j++) {
      const h = HOME[p][j]
      L[h[0] * SIZE + h[1]] = { t: 2, o: p, ri: -1 }
    }
  }
  for (let ri = 0; ri < RING.length; ri++) {
    const rc = RING[ri]
    L[rc[0] * SIZE + rc[1]] = { t: 1, o: ringOwner(ri), ri: ri }
  }
  for (let r = 6; r <= 8; r++) {
    for (let c = 6; c <= 8; c++) {
      const i = r * SIZE + c
      if (L[i].t === 0) L[i] = { t: 3, o: 0, ri: -1 }
    }
  }
  return L
}
/** LAYOUT[i]: {t:0 角基地/1 环/2 终点跑道/3 中央, o: 归属玩家, ri: 环下标} */
export const LAYOUT = buildLayout()

/** 该 pos 是否处于「同色跳跃」格 */
export function isJumpCell(pos) {
  return pos >= 0 && pos <= RING_LEN - 1 && pos % 4 === 0
}
/** 该 pos 是否处于「虚线飞行」格 */
export function isFlyCell(pos) {
  return FLY[pos] !== undefined
}
const FLY = { 18: 30, 39: 51 }

/* ============================================================= */
/* 状态构造                                                       */
/* ============================================================= */

/** opts: {mode:'ai'|'pvp', takeoff:6|1|5} */
export function newGame(opts) {
  opts = opts || {}
  const tk = opts.takeoff
  const takeoff = (tk === 1 || tk === 5 || tk === 6) ? tk : 6
  const planes = []
  for (let i = 0; i < 16; i++) planes.push(-1)
  return {
    mode: opts.mode === 'pvp' ? 'pvp' : 'ai',
    takeoff: takeoff,
    turn: 1,            // 1 红 2 黄 3 蓝 4 绿，红先
    dice: 0,            // 最近一次点数（用于显示）
    rolled: false,      // 当前方是否已掷骰、可走子
    planes: planes,     // 16 枚：(p-1)*4+k，值为 pos
    winner: 0,          // 0 未结束 / 1..4 获胜方
    rank: [],
    moves: 0,
    last: -1            // 最近移动的飞机下标，用于高亮
  }
}

/** 掷骰子（内核行为）。已掷过则返回当前点数，不重复掷。 */
export function roll(state) {
  if (!state || state.winner) return 0
  if (state.rolled) return state.dice
  const d = Math.floor(Math.random() * 6) + 1
  state.dice = d
  state.rolled = true
  return d
}

/** 当前方可选动作列表；无动作返回 []。动作 {plane, steps} */
export function legalMoves(state) {
  if (!state || state.winner || !state.rolled) return []
  const p = state.turn
  const d = state.dice
  const out = []
  for (let k = 0; k < 4; k++) {
    const pos = state.planes[(p - 1) * 4 + k]
    if (pos === LAST) continue                 // 已完成的飞机不能再动
    if (pos === -1) {
      if (d === state.takeoff) out.push({ plane: k, steps: d }) // 起飞
    } else {
      out.push({ plane: k, steps: d })         // 环上 / 终点跑道内均可走
    }
  }
  return out
}

/* ---------------- 内部：落点与特效 ---------------- */

function destOf(pos, d) {
  if (pos < 0) return 0
  let np = pos + d
  if (np > LAST) np = LAST - (np - LAST) // 超出终点弹回
  if (np < 0) np = 0
  return np
}

function jumpFly(np, takeoff) {
  if (takeoff || np < 0 || np > RING_LEN - 1) return np
  if (FLY[np] !== undefined) return FLY[np]
  // 同色连续跳跃：只要落点仍是同色格（pos%4==0）且再 +4 仍在环内，就继续跳。
  // 终点跑道（pos>51）不触发跳跃，故 +4 越出环即停；guard 防止意外死循环。
  let cur = np
  let guard = 0
  while (cur % 4 === 0 && cur + 4 <= RING_LEN - 1 && guard < 32) {
    cur += 4
    guard++
    if (FLY[cur] !== undefined) return FLY[cur] // 保险：链上若遇飞行格则起飞
  }
  return cur
}

/** 预览一步：返回落点 / 特效 / 被撞敌机分布（不改动 state） */
function preview(state, mv) {
  const p = state.turn
  const d = state.dice
  const k = mv.plane
  const pos = state.planes[(p - 1) * 4 + k]
  const isTake = pos === -1
  const raw = destOf(pos, d)
  const np = jumpFly(raw, isTake)
  const hit = [0, 0, 0, 0, 0]
  let captured = 0
  if (np >= 0 && np <= RING_LEN - 1) {
    const abs = (START[p] + np) % RING_LEN
    for (let q = 1; q <= 4; q++) {
      if (q === p) continue
      for (let kk = 0; kk < 4; kk++) {
        const qp = state.planes[(q - 1) * 4 + kk]
        if (qp < 0 || qp > RING_LEN - 1) continue
        if ((START[q] + qp) % RING_LEN === abs) { hit[q]++; captured++ }
      }
    }
  }
  return {
    np: np,
    isTake: isTake,
    jumped: !isTake && np > raw ? np - raw : 0,
    captured: captured,
    hit: hit,
    done: np === LAST
  }
}

function captureAt(state, p, np) {
  if (np < 0 || np > RING_LEN - 1) return
  const abs = (START[p] + np) % RING_LEN
  for (let q = 1; q <= 4; q++) {
    if (q === p) continue
    for (let k = 0; k < 4; k++) {
      const idx = (q - 1) * 4 + k
      const qp = state.planes[idx]
      if (qp < 0 || qp > RING_LEN - 1) continue
      if ((START[q] + qp) % RING_LEN === abs) state.planes[idx] = -1
    }
  }
}

function countDone(state, p) {
  let n = 0
  for (let k = 0; k < 4; k++) if (state.planes[(p - 1) * 4 + k] === LAST) n++
  return n
}

function countDoneAll(state) {
  const out = [0, 0, 0, 0]
  for (let p = 1; p <= 4; p++) out[p - 1] = countDone(state, p)
  return out
}
export { countDone, countDoneAll }

function nextTurn(p) { return p >= 4 ? 1 : p + 1 }

/**
 * 执行一步动作。byPlayer 必须等于 state.turn，动作必须合法。
 * 合法返回 true 并更新 state；否则返回 false 不做任何改动。
 */
export function apply(state, move, byPlayer) {
  if (!state || state.winner) return false
  if (byPlayer !== state.turn) return false
  if (!move || typeof move.plane !== 'number') return false
  const legal = legalMoves(state)
  let ok = false
  for (let i = 0; i < legal.length; i++) if (legal[i].plane === move.plane) { ok = true; break }
  if (!ok) return false

  const p = state.turn
  const d = state.dice
  const idx = (p - 1) * 4 + move.plane
  const pr = preview(state, move)
  state.planes[idx] = pr.np
  state.last = idx
  captureAt(state, p, pr.np)
  state.moves++

  if (pr.np === LAST && countDone(state, p) === 4) {
    state.winner = p
    if (state.rank.indexOf(p) < 0) state.rank.push(p)
  }

  state.rolled = false
  // 掷出 6 点可再掷一次（仍由同方行动）
  if (!state.winner && d !== 6) state.turn = nextTurn(p)
  return true
}

/** 当前方掷出后无子可走时调用：过手给下一方 */
export function pass(state) {
  if (!state || state.winner || !state.rolled) return false
  if (legalMoves(state).length) return false
  state.rolled = false
  state.turn = nextTurn(state.turn)
  return true
}

/** 胜负结果 */
export function result(state) {
  if (!state || !state.winner) return { over: false, winner: 0, text: '' }
  return { over: true, winner: state.winner, text: NAMES[state.winner] + '获胜' }
}

/* ============================================================= */
/* AI                                                             */
/* ============================================================= */

/** 启发式评分：撞机 > 跳跃/飞行 > 起飞 > 前进最多 */
function scoreHeuristic(state, mv) {
  const pr = preview(state, mv)
  let s = 0
  if (pr.captured > 0) s += 1000 + pr.captured * 40
  s += pr.jumped * 22          // 跳跃 4 -> 88, 飞行 12 -> 264
  if (pr.isTake) s += 70
  if (pr.done) s += 220
  s += pr.np                    // 前进最多
  return s
}

/** 对手下一步对我方飞机的最大撞机数（一步前瞻） */
function riskAgainst(s2, me) {
  if (!s2 || s2.winner || s2.turn === me) return 0
  let worst = 0
  for (let d = 1; d <= 6; d++) {
    s2.rolled = true
    s2.dice = d
    const ms = legalMoves(s2)
    for (let i = 0; i < ms.length; i++) {
      const pr = preview(s2, ms[i])
      if (pr.hit[me] > worst) worst = pr.hit[me]
    }
  }
  return worst
}

/**
 * AI 动作。未掷骰时会先掷（内核行为）；无子可走返回 null。
 * level 1 = 普通（启发式）；level 2 = 高手（启发式 + 一步前瞻）。
 */
export function aiMove(state, level) {
  if (!state || state.winner) return null
  if (!state.rolled) roll(state)
  const moves = legalMoves(state)
  if (!moves.length) return null
  const lv = level >= 2 ? 2 : 1
  const me = state.turn
  const cands = []
  for (let i = 0; i < moves.length; i++) {
    let s = scoreHeuristic(state, moves[i])
    if (lv === 2) {
      const s2 = clone(state)
      apply(s2, moves[i], me)
      const risk = riskAgainst(s2, me)
      s -= risk * 130
      // 顺带奖励抢占更靠近终点的位置（前瞻里保持进攻性）
      s -= 0
    }
    cands.push({ mv: moves[i], score: s })
  }
  const best = pickBest(cands)
  return best ? best.mv : moves[0]
}

/** 便捷：静态各玩家已完成数 */
export function doneCounts(state) { return countDoneAll(state) }
