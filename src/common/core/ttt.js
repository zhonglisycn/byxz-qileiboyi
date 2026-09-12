/**
 * 井字棋（三子棋）规则 + AI
 * 棋盘 3×3，一维数组：0 空 / 1 先手(X) / 2 后手(O)
 */

export const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]

export function newGame(starter) {
  return {
    board: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    turn: starter === 2 ? 2 : 1,
    first: starter === 2 ? 2 : 1,
    moves: 0,
    winner: 0,        // 0 未结束 / 1 X 胜 / 2 O 胜 / 3 平局
    winCells: [],
    last: -1
  }
}

export function other(p) { return p === 1 ? 2 : 1 }

export function empties(board) {
  const out = []
  for (let i = 0; i < 9; i++) if (board[i] === 0) out.push(i)
  return out
}

/** 判定胜负；返回 {winner, winCells} */
export function judge(board) {
  for (let i = 0; i < LINES.length; i++) {
    const L = LINES[i]
    const v = board[L[0]]
    if (v !== 0 && v === board[L[1]] && v === board[L[2]]) {
      return { winner: v, winCells: L.slice() }
    }
  }
  for (let i = 0; i < 9; i++) if (board[i] === 0) return { winner: 0, winCells: [] }
  return { winner: 3, winCells: [] }
}

export function isOver(g) { return g.winner !== 0 }

/** 落子（不检查合法性以外的规则，调用方负责 turn） */
export function play(g, idx) {
  if (g.winner !== 0 || idx < 0 || idx > 8 || g.board[idx] !== 0) return false
  g.board[idx] = g.turn
  g.last = idx
  g.moves++
  const r = judge(g.board)
  g.winner = r.winner
  g.winCells = r.winCells
  if (g.winner === 0) g.turn = other(g.turn)
  return true
}

export function undo(g) {
  if (g.moves <= 0) return false
  // 简化：按历史回退一格
  if (!g.history || !g.history.length) return false
  const h = g.history.pop()
  g.board[h.idx] = 0
  g.turn = h.p
  g.winner = 0
  g.winCells = []
  g.last = g.history.length ? g.history[g.history.length - 1].idx : -1
  g.moves--
  return true
}

/** 在 g 上落子并记录历史（供界面用） */
export function playKeepHistory(g, idx) {
  if (!g.history) g.history = []
  const p = g.turn
  if (play(g, idx)) { g.history.push({ idx: idx, p: p }); return true }
  return false
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

function winnerOf(board) {
  const r = judge(board)
  return r.winner
}

/** minimax（带 alpha-beta），以 me 为视角返回分数 */
function minimax(board, turn, me, depth, alpha, beta) {
  const r = judge(board)
  if (r.winner === me) return 10 - depth
  if (r.winner === other(me)) return depth - 10
  if (r.winner === 3) return 0

  const es = empties(board)
  if (turn === me) {
    let best = -Infinity
    for (let i = 0; i < es.length; i++) {
      board[es[i]] = turn
      const v = minimax(board, other(turn), me, depth + 1, alpha, beta)
      board[es[i]] = 0
      if (v > best) best = v
      if (best > alpha) alpha = best
      if (alpha >= beta) break
    }
    return best
  }
  let worst = Infinity
  for (let i = 0; i < es.length; i++) {
    board[es[i]] = turn
    const v = minimax(board, other(turn), me, depth + 1, alpha, beta)
    board[es[i]] = 0
    if (v < worst) worst = v
    if (worst < beta) beta = worst
    if (alpha >= beta) break
  }
  return worst
}

/** 立刻能连成三子的位置（me 下一手赢） */
function winningMove(board, me) {
  const es = empties(board)
  for (let i = 0; i < es.length; i++) {
    board[es[i]] = me
    const r = judge(board)
    board[es[i]] = 0
    if (r.winner === me) return es[i]
  }
  return -1
}

/**
 * AI 落子
 * level 1 = 新兵：随机，偶尔防守
 *       2 = 下士：会赢会挡，其余随机
 *       3 = 大师：完全 minimax，永不失误
 */
export function aiMove(g, level) {
  const me = g.turn
  const foe = other(me)
  const es = empties(g.board)
  if (!es.length) return -1

  const lv = level || 2

  // 新手：大概率乱下
  if (lv <= 1) {
    if (Math.random() < 0.55) return es[Math.floor(Math.random() * es.length)]
  }

  // 先赢
  const w = winningMove(g.board, me)
  if (w >= 0) return w
  // 再挡
  const b = winningMove(g.board, foe)
  if (b >= 0) {
    if (lv <= 1 && Math.random() < 0.35) return es[Math.floor(Math.random() * es.length)]
    return b
  }

  if (lv <= 2) {
    // 占据中心/角优先，仍是弱 AI
    const prefs = [4, 0, 2, 6, 8, 1, 3, 5, 7]
    for (let i = 0; i < prefs.length; i++) {
      if (g.board[prefs[i]] === 0) {
        if (Math.random() < 0.7) return prefs[i]
      }
    }
    return es[Math.floor(Math.random() * es.length)]
  }

  // 大师：minimax 全搜
  let bestScore = -Infinity
  let best = es[0]
  for (let i = 0; i < es.length; i++) {
    g.board[es[i]] = me
    const v = minimax(g.board, foe, me, 1, -Infinity, Infinity)
    g.board[es[i]] = 0
    if (v > bestScore) { bestScore = v; best = es[i] }
  }
  return best
}
