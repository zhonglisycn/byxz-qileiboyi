/**
 * 围棋内核：19 路（可配），提子 / 禁止自杀 / 打劫（简单劫）/ 终局数子
 *
 * 棋盘一维数组，0 空 / 1 黑 / 2 白；i = y * n + x
 * 走法：{ i: 索引 } 或 { pass: true }
 */

import { pick } from './rnd.js'

export const BLACK = 1
export const WHITE = 2

export function otherColor(c) { return c === BLACK ? WHITE : BLACK }

export function newGame(opts) {
  const n = (opts && opts.board) ? opts.board : 19
  return {
    n: n,
    board: new Array(n * n).fill(0),
    turn: BLACK,
    captures: { 1: 0, 2: 0 },     // 各方累计提子数
    passes: 0,
    moves: [],
    ko: -1,                        // 劫争禁着点
    over: false,
    winner: 0,
    text: '',
    last: -1,
    opts: opts || {}
  }
}

export function inBoard(g, x, y) { return x >= 0 && x < g.n && y >= 0 && y < g.n }

function neighbors(g, i) {
  const n = g.n
  const x = i % n
  const y = Math.floor(i / n)
  const out = []
  if (x > 0) out.push(i - 1)
  if (x < n - 1) out.push(i + 1)
  if (y > 0) out.push(i - n)
  if (y < n - 1) out.push(i + n)
  return out
}

/** 收集 i 所在棋串（同色连通块）与它的气 */
export function group(board, n, i) {
  const color = board[i]
  if (!color) return { stones: [], libs: [] }
  const stones = []
  const libs = []
  const seen = {}
  const libSeen = {}
  const stack = [i]
  seen[i] = true
  while (stack.length) {
    const cur = stack.pop()
    stones.push(cur)
    const x = cur % n
    const y = Math.floor(cur / n)
    const nb = []
    if (x > 0) nb.push(cur - 1)
    if (x < n - 1) nb.push(cur + 1)
    if (y > 0) nb.push(cur - n)
    if (y < n - 1) nb.push(cur + n)
    for (let k = 0; k < nb.length; k++) {
      const j = nb[k]
      if (board[j] === 0) {
        if (!libSeen[j]) { libSeen[j] = true; libs.push(j) }
      } else if (board[j] === color && !seen[j]) {
        seen[j] = true
        stack.push(j)
      }
    }
  }
  return { stones: stones, libs: libs }
}

/** 该点是否是自己的真眼（四面己方，且对角至少三面己方 —— 简化判据） */
function isOwnEye(g, i, color) {
  const board = g.board
  if (board[i] !== 0) return false
  const n = g.n
  const x = i % n
  const y = Math.floor(i / n)
  const orth = []
  if (x > 0) orth.push(i - 1)
  if (x < n - 1) orth.push(i + 1)
  if (y > 0) orth.push(i - n)
  if (y < n - 1) orth.push(i + n)
  let bad = 0
  for (let k = 0; k < orth.length; k++) {
    if (board[orth[k]] !== color) bad++
  }
  if (bad > 1) return false
  if (bad === 0) return true
  // 边上/角上：有一个方向出界，此时只需三面己方
  const isEdge = (x === 0 || x === n - 1 || y === 0 || y === n - 1)
  return isEdge
}

/**
 * 尝试落子：返回 {ok, board, captured, ko} 或 {ok:false, reason}
 * 不改动传入的棋盘
 */
export function tryMove(g, i, color) {
  const n = g.n
  if (i < 0 || i >= n * n) return { ok: false, reason: '目标位置超出棋盘' }
  if (g.board[i] !== 0) return { ok: false, reason: '该位置已有棋子' }
  if (i === g.ko) return { ok: false, reason: '禁止落子：劫规则' }

  const board = g.board.slice()
  board[i] = color
  const foe = otherColor(color)

  // 提掉相邻的对方死串（记录被提位置，悔棋时精确还原）
  let captured = 0
  const taken = []
  const nb = neighbors(g, i)
  for (let k = 0; k < nb.length; k++) {
    const j = nb[k]
    if (board[j] === foe) {
      const gp = group(board, n, j)
      if (gp.libs.length === 0) {
        for (let s = 0; s < gp.stones.length; s++) {
          board[gp.stones[s]] = 0
          taken.push(gp.stones[s])
        }
        captured += gp.stones.length
      }
    }
  }

  // 禁自杀
  const mine = group(board, n, i)
  if (mine.libs.length === 0) return { ok: false, reason: '禁止落子：自杀' }

  // 简单劫：提一子、且自己是一子一气的棋串时，被提点成为禁着
  let ko = -1
  if (captured === 1 && mine.stones.length === 1 && mine.libs.length === 1) {
    for (let k = 0; k < nb.length; k++) {
      if (g.board[nb[k]] === foe) { ko = nb[k]; break }
    }
  }

  return { ok: true, board: board, captured: captured, taken: taken, ko: ko }
}

export function isLegal(g, i, color) {
  return tryMove(g, i, color || g.turn).ok
}

/** 附近有子的空点（AI 候选），盘面全空时给星位与中心 */
export function candidatePoints(g) {
  const n = g.n
  const board = g.board
  let any = false
  for (let i = 0; i < board.length; i++) if (board[i]) { any = true; break }
  if (!any) {
    const k = n >= 19 ? 3 : 2
    const list = []
    const pts = [[k, k], [n - 1 - k, k], [k, n - 1 - k], [n - 1 - k, n - 1 - k], [Math.floor(n / 2), Math.floor(n / 2)]]
    for (let p = 0; p < pts.length; p++) {
      const x = pts[p][0]
      const y = pts[p][1]
      if (x >= 0 && x < n && y >= 0 && y < n) list.push(y * n + x)
    }
    return list
  }
  const out = []
  const R = 2
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      if (board[i]) continue
      let near = false
      for (let dy = -R; dy <= R && !near; dy++) {
        for (let dx = -R; dx <= R; dx++) {
          const nx = x + dx
          const ny = y + dy
          if (nx < 0 || nx >= n || ny < 0 || ny >= n) continue
          if (board[ny * n + nx]) { near = true; break }
        }
      }
      if (near) out.push(i)
    }
  }
  return out
}

export function legalMoves(g, color) {
  const c = color || g.turn
  const out = []
  const cands = candidatePoints(g)
  for (let k = 0; k < cands.length; k++) {
    if (tryMove(g, cands[k], c).ok) out.push(cands[k])
  }
  return out
}

export function apply(state, move, byPlayer) {
  if (state.over || !move) return false
  const color = state.turn
  if (byPlayer && byPlayer !== color) return false

  if (move.pass) {
    state.moves.push({ pass: true, color: color })
    state.passes++
    state.turn = otherColor(color)
    state.last = -1
    if (state.passes >= 2) settle(state)
    else checkJudge(state)
    return true
  }

  const r = tryMove(state, move.i, color)
  if (!r.ok) return false

  const prevKo = state.ko
  state.board = r.board
  state.captures[color] += r.captured
  state.ko = r.ko
  state.last = move.i
  state.passes = 0
  state.moves.push({
    i: move.i,
    color: color,
    captured: r.captured,
    taken: r.taken,
    prevKo: prevKo
  })
  state.turn = otherColor(color)
  checkJudge(state)
  return true
}

export function undo(state) {
  if (!state.moves.length) return false
  const m = state.moves.pop()
  const color = m.color
  if (m.pass) {
    state.passes = Math.max(0, state.passes - 1)
  } else {
    const foe = otherColor(color)
    state.board[m.i] = 0
    const taken = m.taken || []
    for (let k = 0; k < taken.length; k++) state.board[taken[k]] = foe
    state.captures[color] -= m.captured || 0
    state.ko = (m.prevKo === undefined) ? -1 : m.prevKo
    const prev = state.moves.length ? state.moves[state.moves.length - 1] : null
    state.last = (prev && !prev.pass) ? prev.i : -1
  }
  state.turn = color
  state.over = false
  state.winner = 0
  state.text = ''
  return true
}

/** 主动结束对局（界面"结束对局"按钮）→ 终局数子 */
export function settleGame(state) {
  settle(state)
  return state.text
}

/** 吃子数 / 余子决胜两种判定 */
function checkJudge(state) {
  const mode = (state.opts && state.opts.judge) || 'capture'
  const target = (state.opts && state.opts.target) || 10
  if (mode === 'capture') {
    if (state.captures[BLACK] >= target) {
      state.over = true
      state.winner = BLACK
      state.text = '黑方吃子达到 ' + target + ' 子，获胜'
    } else if (state.captures[WHITE] >= target) {
      state.over = true
      state.winner = WHITE
      state.text = '白方吃子达到 ' + target + ' 子，获胜'
    }
  } else {
    const bc = countStones(state, BLACK)
    const wc = countStones(state, WHITE)
    if (bc >= target) {
      state.over = true
      state.winner = BLACK
      state.text = '黑方存活 ' + bc + ' 子，达到目标获胜'
    } else if (wc >= target) {
      state.over = true
      state.winner = WHITE
      state.text = '白方存活 ' + wc + ' 子，达到目标获胜'
    }
  }
}

export function countStones(state, color) {
  let c = 0
  for (let i = 0; i < state.board.length; i++) if (state.board[i] === color) c++
  return c
}

/** 数子（中国规则）：己方棋子 + 只被己方包围的空点 */
export function areaScore(state) {
  const n = state.n
  const board = state.board
  const owner = new Array(board.length).fill(0)   // 0 未知 / 1 黑地 / 2 白地 / 3 单官
  const visited = new Array(board.length).fill(false)
  let black = 0
  let white = 0

  for (let i = 0; i < board.length; i++) {
    if (board[i] === BLACK) black++
    else if (board[i] === WHITE) white++
  }

  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0 || visited[i]) continue
    const region = []
    const stack = [i]
    visited[i] = true
    let touchBlack = false
    let touchWhite = false
    while (stack.length) {
      const cur = stack.pop()
      region.push(cur)
      const x = cur % n
      const y = Math.floor(cur / n)
      const nb = []
      if (x > 0) nb.push(cur - 1)
      if (x < n - 1) nb.push(cur + 1)
      if (y > 0) nb.push(cur - n)
      if (y < n - 1) nb.push(cur + n)
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k]
        if (board[j] === BLACK) touchBlack = true
        else if (board[j] === WHITE) touchWhite = true
        else if (!visited[j]) { visited[j] = true; stack.push(j) }
      }
    }
    if (touchBlack && !touchWhite) black += region.length
    else if (touchWhite && !touchBlack) white += region.length
  }
  return { black: black, white: white, diff: black - white }
}

function settle(state) {
  const s = areaScore(state)
  state.over = true
  if (s.black > s.white) {
    state.winner = BLACK
    state.text = '终局数子：黑 ' + s.black + ' 比 白 ' + s.white + '，黑胜'
  } else if (s.white > s.black) {
    state.winner = WHITE
    state.text = '终局数子：黑 ' + s.black + ' 比 白 ' + s.white + '，白胜'
  } else {
    state.winner = 3
    state.text = '终局数子：黑 ' + s.black + ' 比 白 ' + s.white + '，和棋'
  }
}

/**
 * 终局收束判据：盘面是否"只剩单官 / 已无点可下"。
 * 原味收束：双方把有争夺价值的点走完后，剩下的空点只分两种——
 *   1) 单官（同时挨着黑白两色的窄空区，填了也没收益）；
 *   2) 某一方的目（只被单色包围，属于该方地域，无需去填）。
 * 当所有空区都落入这两类、且盘上双方都有子时，即可直接提议终局数子。
 * 若还有无主的大空（开局/中盘）或面积 > 2 的中性空区（还打得起来），返回 false。
 */
export function endgameReady(state) {
  const n = state.n
  const board = state.board
  let black = 0
  let white = 0
  for (let i = 0; i < board.length; i++) {
    if (board[i] === BLACK) black++
    else if (board[i] === WHITE) white++
  }
  if (!black || !white) return false

  const visited = new Array(board.length).fill(false)
  for (let i = 0; i < board.length; i++) {
    if (board[i] !== 0 || visited[i]) continue
    const stack = [i]
    visited[i] = true
    let size = 0
    let touchBlack = false
    let touchWhite = false
    while (stack.length) {
      const cur = stack.pop()
      size++
      const x = cur % n
      const y = Math.floor(cur / n)
      const nb = []
      if (x > 0) nb.push(cur - 1)
      if (x < n - 1) nb.push(cur + 1)
      if (y > 0) nb.push(cur - n)
      if (y < n - 1) nb.push(cur + n)
      for (let k = 0; k < nb.length; k++) {
        const j = nb[k]
        if (board[j] === BLACK) touchBlack = true
        else if (board[j] === WHITE) touchWhite = true
        else if (!visited[j]) { visited[j] = true; stack.push(j) }
      }
    }
    if (!touchBlack && !touchWhite) return false            // 无主大空：棋局还在布局
    if (touchBlack && touchWhite && size > 2) return false  // 中性空区过大：仍有得下
  }
  return true
}

export function result(state) {
  return {
    over: state.over,
    winner: state.winner,
    text: state.text || (state.turn === BLACK ? '黑方行棋' : '白方行棋')
  }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

/** 数一下某点周围对方处于"打吃"（只剩一口气）的棋串 */
function atariTargets(g, i, color) {
  const board = g.board
  const foe = otherColor(color)
  const nb = neighbors(g, i)
  const counted = {}
  let stones = 0
  let groups = 0
  for (let k = 0; k < nb.length; k++) {
    const j = nb[k]
    if (board[j] !== foe || counted[j]) continue
    const gp = group(board, g.n, j)
    for (let s = 0; s < gp.stones.length; s++) counted[gp.stones[s]] = true
    if (gp.libs.length === 1) { stones += gp.stones.length; groups++ }
  }
  return { stones: stones, groups: groups }
}

/** 自己处于打吃状态的棋串规模（用于判断救棋价值） */
function ownAtariSize(g, i, color) {
  const board = g.board
  const nb = neighbors(g, i)
  const counted = {}
  let stones = 0
  for (let k = 0; k < nb.length; k++) {
    const j = nb[k]
    if (board[j] !== color || counted[j]) continue
    const gp = group(board, g.n, j)
    for (let s = 0; s < gp.stones.length; s++) counted[gp.stones[s]] = true
    if (gp.libs.length === 1) stones += gp.stones.length
  }
  return stones
}

function scorePoint(g, i, color, lastMove) {
  const n = g.n
  const board = g.board
  // 不填自己的眼
  if (isOwnEye(g, i, color)) return -1000

  const r = tryMove(g, i, color)
  if (!r.ok) return -Infinity

  let s = 0
  s += r.captured * 14                                    // 提子

  const mine = group(r.board, n, i)
  if (mine.libs.length === 1) s -= mine.stones.length * 7  // 自己变打吃
  if (mine.libs.length === 2) s -= 2

  const at = atariTargets(g, i, color)
  s += at.stones * 4 + at.groups * 3                       // 打吃对方

  const save = ownAtariSize(g, i, color)
  if (save) s += save * 6                                  // 接回自己被打吃的棋

  if (lastMove >= 0) {
    const d = Math.abs((i % n) - (lastMove % n)) + Math.abs(Math.floor(i / n) - Math.floor(lastMove / n))
    s += Math.max(0, 4 - d)                                // 跟着走，别乱下
  } else {
    const cx = Math.floor(n / 2)
    const d = Math.abs((i % n) - cx) + Math.abs(Math.floor(i / n) - cx)
    s += Math.max(0, 6 - Math.floor(d / 2))                // 开局占中
  }
  s += Math.random() * 1.5
  return s
}

/**
 * AI 落子
 * level 1 黄毛小儿：随机（会提子但常犯傻）
 * level 2 遛弯大叔：启发式评分
 * level 3 退休大爷：启发式 + 对手最佳应手检查
 * level 4 流浪棋手：启发式 + 更严格的自保与应手检查
 */
export function aiMove(state, level) {
  const lv = level || 1
  const color = state.turn
  const cands = candidatePoints(state)
  const legal = []
  for (let k = 0; k < cands.length; k++) {
    if (tryMove(state, cands[k], color).ok) legal.push(cands[k])
  }
  if (!legal.length) return { pass: true }

  // 收束阶段（只剩单官/无点可下）：不再随手填单官，直接弃权，
  // 由双方连续弃权触发中国规则数子，完成终局收束。
  if (endgameReady(state)) {
    let canCapture = false
    for (let k = 0; k < legal.length; k++) {
      if (tryMove(state, legal[k], color).captured > 0) { canCapture = true; break }
    }
    if (!canCapture) return { pass: true }
  }

  if (lv <= 1) {
    // 弱级：还是会吃子，但基本随机
    const cap = []
    for (let k = 0; k < legal.length; k++) {
      const r = tryMove(state, legal[k], color)
      if (r.ok && r.captured > 0) cap.push(legal[k])
    }
    if (cap.length && Math.random() < 0.7) return { i: pick(cap) }
    return { i: pick(legal) }
  }

  const scored = []
  for (let k = 0; k < legal.length; k++) {
    scored.push({ i: legal[k], score: scorePoint(state, legal[k], color, state.last) })
  }

  if (lv === 2) {
    let best = scored[0]
    for (let k = 1; k < scored.length; k++) if (scored[k].score > best.score) best = scored[k]
    return { i: best.i }
  }

  // 3/4 级：看对手的应手，避免送吃
  scored.sort((a, b) => b.score - a.score)
  const top = scored.slice(0, lv >= 4 ? 6 : 4)
  const foe = otherColor(color)
  for (let k = 0; k < top.length; k++) {
    const cand = top[k]
    const r = tryMove(state, cand.i, color)
    const tmp = {
      n: state.n,
      board: r.board,
      turn: foe,
      captures: state.captures,
      ko: r.ko,
      last: cand.i,
      passes: 0,
      moves: []
    }
    // 对手能找到的最大收益（提子或打吃）
    let worst = 0
    const foeCands = candidatePoints(tmp)
    for (let m = 0; m < foeCands.length; m++) {
      const rr = tryMove(tmp, foeCands[m], foe)
      if (!rr.ok) continue
      let gain = rr.captured * 12
      const at = atariTargets(tmp, foeCands[m], foe)
      gain += at.stones * 4
      if (gain > worst) worst = gain
    }
    top[k].score -= worst * (lv >= 4 ? 0.9 : 0.6)
  }

  let best = top[0]
  for (let k = 1; k < top.length; k++) if (top[k].score > best.score) best = top[k]
  return { i: best.i }
}

/** 界面辅助：某点的棋串气数（用于显示"打吃"提示） */
export function libertiesAt(state, i) {
  if (!state.board[i]) return 0
  return group(state.board, state.n, i).libs.length
}
