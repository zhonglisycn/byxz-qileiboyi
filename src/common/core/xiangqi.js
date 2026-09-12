/**
 * 中国象棋内核
 *   完整走法：蹩马腿 / 塞象眼 / 炮翻山 / 过河兵 / 九宫限制 / 将帅照面
 *   AI：negamax + alpha-beta + MVV 走法排序 + 静态搜索（吃子延伸），限时迭代
 *
 * 棋盘 9 列 × 10 行，索引 i = y * 9 + x
 * 棋子编码：'' 表示空；否则两位字符串 = 类型 + 阵营
 *   类型 K 将/帅  A 士/仕  B 象/相  N 马  R 车  C 炮  P 兵/卒
 *   阵营 1 = 红（下方 y 7..9），2 = 黑（上方 y 0..2）
 *
 * 性能考量：搜索里一律在同一个 board 数组上 make/unmake，不拷贝棋盘；
 * 将军判定用"从将/帅所在格反向探测攻击"（只查车/炮/马/兵/将，因为士象永远打不到对方将），
 * 比"生成对方全部走法"快一个数量级——手环上才跑得动。
 */

export const W = 9
export const H = 10
export const RED = 1
export const BLACK = 2

export function otherSide(s) { return s === RED ? BLACK : RED }
export function inBoard(x, y) { return x >= 0 && x < W && y >= 0 && y < H }
export function idx(x, y) { return y * W + x }
export function px(i) { return i % W }
export function py(i) { return Math.floor(i / W) }
export function typeOf(p) { return p ? p.charAt(0) : '' }
export function sideOf(p) { return p ? parseInt(p.charAt(1), 10) : 0 }

function inPalace(x, y, side) {
  if (x < 3 || x > 5) return false
  return side === RED ? (y >= 7 && y <= 9) : (y >= 0 && y <= 2)
}
function ownHalf(y, side) { return side === RED ? y >= 5 : y <= 4 }
function enemyHalf(y, side) { return side === RED ? y <= 4 : y >= 5 }

const BACK_ROW = ['R', 'N', 'B', 'A', 'K', 'A', 'B', 'N', 'R']

export function newGame(opts) {
  const board = new Array(W * H).fill('')
  for (let x = 0; x < W; x++) {
    board[idx(x, 0)] = BACK_ROW[x] + '2'
    board[idx(x, 9)] = BACK_ROW[x] + '1'
  }
  board[idx(1, 2)] = 'C2'
  board[idx(7, 2)] = 'C2'
  board[idx(1, 7)] = 'C1'
  board[idx(7, 7)] = 'C1'
  for (let x = 0; x < W; x += 2) {
    board[idx(x, 3)] = 'P2'
    board[idx(x, 6)] = 'P1'
  }
  const st = {
    board: board,
    turn: RED,
    moves: [],
    over: false,
    winner: 0,
    text: '',
    lastMove: null,
    repKeys: [],
    opts: opts || {}
  }
  st.repKeys.push(posKey(board, RED))
  return st
}

export function posKey(board, turn) {
  return board.join(',') + '|' + turn
}

/* ------------------------------------------------------------------ */
/* 走法生成（伪合法：不考虑走后是否被将军）                             */
/* ------------------------------------------------------------------ */

const ORTHO = [[0, -1], [0, 1], [-1, 0], [1, 0]]
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]]
// 马的 8 个落点 + 对应的"马腿"偏移
const KNIGHT = [
  [1, -2, 0, -1], [-1, -2, 0, -1], [1, 2, 0, 1], [-1, 2, 0, 1],
  [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0]
]

/** 把 from 处棋子的伪合法目标写进 out */
function genFrom(board, from, out) {
  const p = board[from]
  if (!p) return
  const t = typeOf(p)
  const side = sideOf(p)
  const x = px(from)
  const y = py(from)

  const add = (nx, ny) => {
    if (!inBoard(nx, ny)) return false
    const q = board[idx(nx, ny)]
    if (q && sideOf(q) === side) return false
    out.push(idx(nx, ny))
    return !q
  }

  if (t === 'K') {
    for (let d = 0; d < 4; d++) {
      const nx = x + ORTHO[d][0]
      const ny = y + ORTHO[d][1]
      if (inPalace(nx, ny, side)) add(nx, ny)
    }
    return
  }
  if (t === 'A') {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIAG[d][0]
      const ny = y + DIAG[d][1]
      if (inPalace(nx, ny, side)) add(nx, ny)
    }
    return
  }
  if (t === 'B') {
    for (let d = 0; d < 4; d++) {
      const nx = x + DIAG[d][0] * 2
      const ny = y + DIAG[d][1] * 2
      if (!inBoard(nx, ny)) continue
      if (!ownHalf(ny, side)) continue
      if (board[idx(x + DIAG[d][0], y + DIAG[d][1])]) continue   // 塞象眼
      add(nx, ny)
    }
    return
  }
  if (t === 'N') {
    for (let d = 0; d < 8; d++) {
      const nx = x + KNIGHT[d][0]
      const ny = y + KNIGHT[d][1]
      if (!inBoard(nx, ny)) continue
      if (board[idx(x + KNIGHT[d][2], y + KNIGHT[d][3])]) continue  // 蹩马腿
      add(nx, ny)
    }
    return
  }
  if (t === 'R') {
    for (let d = 0; d < 4; d++) {
      let nx = x + ORTHO[d][0]
      let ny = y + ORTHO[d][1]
      while (add(nx, ny)) { nx += ORTHO[d][0]; ny += ORTHO[d][1] }
    }
    return
  }
  if (t === 'C') {
    for (let d = 0; d < 4; d++) {
      let nx = x + ORTHO[d][0]
      let ny = y + ORTHO[d][1]
      let screen = false
      while (inBoard(nx, ny)) {
        const q = board[idx(nx, ny)]
        if (!screen) {
          if (!q) out.push(idx(nx, ny))
          else screen = true
        } else if (q) {
          if (sideOf(q) !== side) out.push(idx(nx, ny))
          break
        }
        nx += ORTHO[d][0]
        ny += ORTHO[d][1]
      }
    }
    return
  }
  if (t === 'P') {
    const fwd = side === RED ? -1 : 1
    add(x, y + fwd)
    if (enemyHalf(y, side)) { add(x - 1, y); add(x + 1, y) }
  }
}

export function pseudoMovesFrom(board, from) {
  const out = []
  genFrom(board, from, out)
  return out
}

export function kingIndex(board, side) {
  const target = 'K' + side
  for (let i = 0; i < board.length; i++) if (board[i] === target) return i
  return -1
}

/**
 * sq 格是否被 bySide 攻击。
 * 只需要覆盖能打到将/帅的兵种：车、炮、马、兵、将（含将帅照面）。
 * 士/象永远无法攻击对方将/帅（不能出九宫 / 不能过河），故可跳过。
 */
export function isAttacked(board, sq, bySide) {
  if (sq < 0) return false
  const x = px(sq)
  const y = py(sq)

  // 直线：车 / 将（贴脸或同列照面）/ 炮（隔一子）
  for (let d = 0; d < 4; d++) {
    const dx = ORTHO[d][0]
    const dy = ORTHO[d][1]
    let nx = x + dx
    let ny = y + dy
    let dist = 1
    let screen = false
    while (inBoard(nx, ny)) {
      const q = board[idx(nx, ny)]
      if (q) {
        const s = sideOf(q)
        const t = typeOf(q)
        if (!screen) {
          if (s === bySide) {
            if (t === 'R') return true
            if (t === 'K') {
              // 贴脸一格，或同一列/行无遮挡（将帅照面）
              if (dist === 1) return true
              if (dx === 0) return true
            }
          }
          screen = true
        } else {
          if (s === bySide && t === 'C') return true
          break
        }
      }
      nx += dx
      ny += dy
      dist++
    }
  }

  // 马：反向 8 个位置，注意对方的马腿
  for (let d = 0; d < 8; d++) {
    const hx = x + KNIGHT[d][0]
    const hy = y + KNIGHT[d][1]
    if (!inBoard(hx, hy)) continue
    if (board[idx(hx, hy)] !== 'N' + bySide) continue
    // 从马的位置看向 sq 的马腿：与 KNIGHT[d] 反向
    const legX = hx - Math.sign(KNIGHT[d][0]) * (Math.abs(KNIGHT[d][0]) === 2 ? 1 : 0)
    const legY = hy - Math.sign(KNIGHT[d][1]) * (Math.abs(KNIGHT[d][1]) === 2 ? 1 : 0)
    if (inBoard(legX, legY) && board[idx(legX, legY)]) continue
    return true
  }

  // 兵/卒：红兵向上吃，黑卒向下吃；过河后可横吃
  const pawn = 'P' + bySide
  const back = bySide === RED ? 1 : -1        // 兵在 sq 的哪一侧才能吃到 sq
  if (inBoard(x, y + back) && board[idx(x, y + back)] === pawn) return true
  const pawnY = y
  if (inBoard(x - 1, pawnY) && board[idx(x - 1, pawnY)] === pawn && enemyHalf(pawnY, bySide)) return true
  if (inBoard(x + 1, pawnY) && board[idx(x + 1, pawnY)] === pawn && enemyHalf(pawnY, bySide)) return true

  return false
}

/** 某方是否被将军（含将帅照面） */
export function inCheck(board, side) {
  const kp = kingIndex(board, side)
  if (kp < 0) return true
  return isAttacked(board, kp, otherSide(side))
}

/** 走后自己是否安全（内部用 make/unmake 以避免拷贝） */
function moveIsLegal(board, from, to, side) {
  const moving = board[from]
  const captured = board[to]
  board[to] = moving
  board[from] = ''
  const bad = isAttacked(board, kingIndex(board, side), otherSide(side))
  board[from] = moving
  board[to] = captured
  return !bad
}

export function legalMovesFrom(board, from) {
  const p = board[from]
  if (!p) return []
  const side = sideOf(p)
  const raw = pseudoMovesFrom(board, from)
  const out = []
  for (let k = 0; k < raw.length; k++) {
    if (moveIsLegal(board, from, raw[k], side)) out.push(raw[k])
  }
  return out
}

export function allLegalMoves(board, side) {
  const out = []
  for (let i = 0; i < board.length; i++) {
    const p = board[i]
    if (!p || sideOf(p) !== side) continue
    const tg = legalMovesFrom(board, i)
    for (let k = 0; k < tg.length; k++) {
      out.push({ from: i, to: tg[k], captured: board[tg[k]] || '' })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* 对局                                                                */
/* ------------------------------------------------------------------ */

function finish(state) {
  const side = state.turn
  if (kingIndex(state.board, side) < 0) {
    state.over = true
    state.winner = otherSide(side)
    state.text = state.winner === RED ? '红方获胜' : '黑方获胜'
    return
  }
  const has = allLegalMoves(state.board, side)
  if (!has.length) {
    state.over = true
    state.winner = otherSide(side)
    const who = otherSide(side) === RED ? '红方' : '黑方'
    state.text = inCheck(state.board, side) ? (who + '将死，获胜') : (who + '困毙，获胜')
    return
  }
  checkRepetition(state)
}

/**
 * 重复局面判定（原汁原味）：
 * 同一局面（含轮走方）出现 3 次时——
 *   · 若其中一方在这段循环里每手都在将军 → 该方「长将判负」
 *   · 否则判和
 */
function checkRepetition(state) {
  const keys = state.repKeys
  if (!keys || keys.length < 5) return
  const key = keys[keys.length - 1]
  const idxs = []
  for (let i = keys.length - 1; i >= 0 && idxs.length < 3; i--) {
    if (keys[i] === key) idxs.push(i)
  }
  if (idxs.length < 3) return
  idxs.reverse()
  const from = idxs[0]
  const to = idxs[2]
  // 这段循环里各方走了多少手、其中多少手是将军
  const cnt = { 1: 0, 2: 0 }
  const chk = { 1: 0, 2: 0 }
  for (let j = from; j < to; j++) {
    const m = state.moves[j]
    if (!m) continue
    // 走这手之前轮到谁：由局面键推出的轮走方取反
    const mover = keys[j].charAt(keys[j].length - 1) === '1' ? RED : BLACK
    cnt[mover]++
    if (m.chk) chk[mover]++
  }
  let perpetual = 0
  if (cnt[RED] > 0 && chk[RED] === cnt[RED]) perpetual = RED
  else if (cnt[BLACK] > 0 && chk[BLACK] === cnt[BLACK]) perpetual = BLACK

  state.over = true
  if (perpetual) {
    state.winner = otherSide(perpetual)
    state.text = (perpetual === RED ? '红方' : '黑方') + '长将，判负'
  } else {
    state.winner = 3
    state.text = '三次重复局面，判和'
  }
}

export function apply(state, move, byPlayer) {
  if (state.over || !move) return false
  // 兼容旧存档 / 手工构造的状态
  if (!state.repKeys) state.repKeys = [posKey(state.board, state.turn)]
  const side = state.turn
  if (byPlayer && byPlayer !== side) return false
  const p = state.board[move.from]
  if (!p || sideOf(p) !== side) return false
  if (legalMovesFrom(state.board, move.from).indexOf(move.to) < 0) return false

  const captured = state.board[move.to]
  state.board[move.to] = p
  state.board[move.from] = ''
  state.moves.push({ from: move.from, to: move.to, captured: captured })
  state.lastMove = { from: move.from, to: move.to }
  state.turn = otherSide(side)
  // 记录走后局面 + 这一手是否形成将军（用于长将/重复判定）
  const gave = inCheck(state.board, state.turn)
  state.moves[state.moves.length - 1].chk = gave
  state.repKeys.push(posKey(state.board, state.turn))
  finish(state)
  return true
}

export function undo(state) {
  if (!state.moves.length) return false
  const m = state.moves.pop()
  state.board[m.from] = state.board[m.to]
  state.board[m.to] = m.captured || ''
  state.turn = sideOf(state.board[m.from])
  state.over = false
  state.winner = 0
  state.text = ''
  const n = state.moves.length
  state.lastMove = n ? { from: state.moves[n - 1].from, to: state.moves[n - 1].to } : null
  if (state.repKeys && state.repKeys.length > 1) state.repKeys.pop()
  return true
}

export function result(state) {
  return {
    over: state.over,
    winner: state.winner,
    text: state.text || (state.turn === RED ? '红方行棋' : '黑方行棋')
  }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

const VAL = { K: 100000, R: 900, N: 400, C: 450, A: 200, B: 200, P: 100 }

function evaluate(board, side) {
  let s = 0
  for (let i = 0; i < board.length; i++) {
    const p = board[i]
    if (!p) continue
    const t = typeOf(p)
    const ps = sideOf(p)
    let v = VAL[t] || 0
    const x = px(i)
    const y = py(i)
    if (t === 'P') {
      if (enemyHalf(y, ps)) v += 40 + (ps === RED ? (4 - y) : (y - 5)) * 10
    } else if (t === 'N' || t === 'C') {
      v += (4 - Math.abs(x - 4)) * 4
    }
    s += (ps === side ? v : -v)
  }
  return s
}

/** MVV：吃子优先，被吃子价值越高越先搜 */
function orderMoves(board, moves) {
  for (let i = 0; i < moves.length; i++) {
    const cap = board[moves[i].to]
    moves[i]._s = cap ? (VAL[typeOf(cap)] || 0) : 0
  }
  moves.sort((a, b) => b._s - a._s)
  return moves
}

function genPseudo(board, side) {
  const out = []
  for (let i = 0; i < board.length; i++) {
    const p = board[i]
    if (!p || sideOf(p) !== side) continue
    const tg = []
    genFrom(board, i, tg)
    for (let k = 0; k < tg.length; k++) out.push({ from: i, to: tg[k], _s: 0 })
  }
  return out
}

const MATE = 90000

/**
 * 静态搜索：只搜吃子，避免"地平线效应"下出昏着。
 * 王的位置由 ctx.kings 增量维护，不重复扫描棋盘。
 */
function quiesce(board, side, alpha, beta, ctx, qd) {
  ctx.nodes++
  if ((ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) ctx.abort = true
  if (ctx.abort) return 0

  let stand = evaluate(board, side)
  if (qd <= 0) return stand
  if (stand >= beta) return stand
  if (stand > alpha) alpha = stand

  const moves = genPseudo(board, side)
  const caps = []
  for (let i = 0; i < moves.length; i++) if (board[moves[i].to]) caps.push(moves[i])
  orderMoves(board, caps)

  let best = stand
  for (let i = 0; i < caps.length; i++) {
    const m = caps[i]
    const cap = board[m.to]
    const moving = board[m.from]
    const isKing = moving.charAt(0) === 'K'
    board[m.to] = moving
    board[m.from] = ''
    if (isKing) ctx.kings[side] = m.to
    if (isAttacked(board, ctx.kings[side], otherSide(side))) {
      board[m.from] = moving
      board[m.to] = cap
      if (isKing) ctx.kings[side] = m.from
      continue
    }
    const v = -quiesce(board, otherSide(side), -beta, -alpha, ctx, qd - 1)
    board[m.from] = moving
    board[m.to] = cap
    if (isKing) ctx.kings[side] = m.from
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
    if (ctx.abort) break
  }
  return best
}

/**
 * negamax + alpha-beta。
 * ply 从根算起，用于"越快将死越好"的杀棋计分：-(MATE - ply)。
 */
function search(board, side, depth, alpha, beta, ctx, ply) {
  ctx.nodes++
  if ((ctx.nodes & 127) === 0 && Date.now() > ctx.deadline) ctx.abort = true
  if (ctx.abort) return 0
  if (depth <= 0) return quiesce(board, side, alpha, beta, ctx, 3)

  const moves = orderMoves(board, genPseudo(board, side))
  let any = false
  let best = -Infinity

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i]
    const cap = board[m.to]
    const moving = board[m.from]
    const isKing = moving.charAt(0) === 'K'
    board[m.to] = moving
    board[m.from] = ''
    if (isKing) ctx.kings[side] = m.to
    if (isAttacked(board, ctx.kings[side], otherSide(side))) {
      board[m.from] = moving
      board[m.to] = cap
      if (isKing) ctx.kings[side] = m.from
      continue
    }
    any = true
    const v = -search(board, otherSide(side), depth - 1, -beta, -alpha, ctx, ply + 1)
    board[m.from] = moving
    board[m.to] = cap
    if (isKing) ctx.kings[side] = m.from
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
    if (ctx.abort) break
  }

  if (!any) return -(MATE - ply)      // 无着法：被将死或困毙，都是负
  return best
}

/* ------------------------------------------------------------------ */
/* 可分片的搜索会话（手环上关键：单次 JS 阻塞必须很短，否则看门狗重启）   */
/* ------------------------------------------------------------------ */

/** 每档的搜索深度与总预算；预算很小，靠"分片"把总时长摊到多个 tick 上 */
export const AI_LEVELS = [
  { depth: 2, budget: 60 },
  { depth: 2, budget: 100 },
  { depth: 3, budget: 160 },
  { depth: 3, budget: 240 }
]

/**
 * 建一个搜索会话：把根着法排好序，之后用 analyseStep 一次搜一个。
 * 这样页面可以在每步之间 setTimeout 让出线程，单次阻塞只有几毫秒。
 */
export function analyseSession(state, level) {
  const lv = Math.max(1, Math.min(AI_LEVELS.length, level || 1))
  const cfg = AI_LEVELS[lv - 1]
  const side = state.turn
  const board = state.board
  const ctx = {
    deadline: Date.now() + cfg.budget,
    nodes: 0,
    abort: false,
    kings: { 1: kingIndex(board, RED), 2: kingIndex(board, BLACK) }
  }
  const ordered = orderMoves(board, genPseudo(board, side))
  // 兜底着法：预算很小或局面很复杂时，可能一个根着法都没搜完就被迫中断，
  // 这时必须还能给出一个合法着法（否则 AI 会白走一步、卡住不出手）。
  const legal = allLegalMoves(board, side)
  return {
    state: state,
    side: side,
    level: lv,
    depth: cfg.depth,
    budget: cfg.budget,
    ctx: ctx,
    ordered: ordered,
    idx: 0,
    alpha: -Infinity,
    bestScore: -Infinity,
    best: legal.length ? { from: legal[0].from, to: legal[0].to } : null,
    cands: [],
    done: ordered.length === 0
  }
}

/** 推进搜索会话：最多用 sliceMs 毫秒，然后返回（未完成则 done=false） */
export function analyseStep(sess, sliceMs) {
  if (sess.done) return sess
  const state = sess.state
  const board = state.board
  const side = sess.side
  const t0 = Date.now()
  const slice = sliceMs || 12

  while (sess.idx < sess.ordered.length) {
    if (Date.now() - t0 >= slice) break
    if (Date.now() > sess.ctx.deadline) { sess.ctx.abort = true; break }
    const m = sess.ordered[sess.idx]
    const cap = board[m.to]
    const moving = board[m.from]
    const isKing = moving.charAt(0) === 'K'
    board[m.to] = moving
    board[m.from] = ''
    if (isKing) sess.ctx.kings[side] = m.to
    if (isAttacked(board, sess.ctx.kings[side], otherSide(side))) {
      board[m.from] = moving
      board[m.to] = cap
      if (isKing) sess.ctx.kings[side] = m.from
      sess.idx++
      continue
    }
    const v = -search(board, otherSide(side), sess.depth - 1, -Infinity, -sess.alpha, sess.ctx, 1)
    board[m.from] = moving
    board[m.to] = cap
    if (isKing) sess.ctx.kings[side] = m.from
    sess.idx++
    // 被超时中断的那一步，分数是残值（search 会直接返回 0），不能当成候选
    if (sess.ctx.abort) break
    const exact = v > sess.alpha
    sess.cands.push({ from: m.from, to: m.to, score: v, captured: cap || '', exact: exact })
    if (v > sess.bestScore) { sess.bestScore = v; sess.best = { from: m.from, to: m.to } }
    if (v > sess.alpha) sess.alpha = v
  }
  // 收尾：搜完 **或者超时中断** 都必须置 done。
  // 这里漏掉 abort 会导致页面每次调用都"没搜完又不推进"，无限空转到看门狗重启。
  if (sess.idx >= sess.ordered.length || sess.ctx.abort) sess.done = true
  return sess
}

/** 会话结束后的整理（给界面/测试用） */
export function sessionResult(sess) {
  const cands = sess.cands.slice()
  cands.sort(function (a, b) { return b.score - a.score })
  for (let i = 0; i < cands.length; i++) cands[i].name = moveName(sess.state.board, cands[i])
  return {
    depth: sess.depth,
    nodes: sess.ctx.nodes,
    aborted: sess.ctx.abort,
    cands: cands,
    best: sess.best,
    bestScore: sess.bestScore,
    bestName: sess.best ? moveName(sess.state.board, sess.best) : ''
  }
}

/**
 * 局面分析：一次搜索同时给出最优着法、评分、以及候选列表（界面用来显示"AI 决策 · 评分"）。
 * 注意：cands 里被剪枝的着法返回的只是分数上界，只有 `best` 是严格最优的。
 *
 * level 1 路边一条：2 层 + 大幅随机
 * level 2 菜鸟：3 层
 * level 3 混的人：4 层
 * level 4 棋圣：5 层
 * 统一带时间上限，保证手环上不会卡住。
 */
export function analyse(state, level) {
  // 同步版：把所有分片一次跑完（测试与兼容用；页面请用 analyseSession/analyseStep）
  const sess = analyseSession(state, level)
  while (!sess.done) analyseStep(sess, 1000000)
  return sessionResult(sess)
}

/** AI 选子（返回 {from,to}，无着法返回 null） */
export function aiMove(state, level) {
  const lv = level || 1
  const side = state.turn
  const board = state.board

  // 能直接吃将/帅就别算了
  const quick = genPseudo(board, side)
  for (let i = 0; i < quick.length; i++) {
    if (typeOf(board[quick[i].to]) === 'K') return { from: quick[i].from, to: quick[i].to }
  }

  const an = analyse(state, lv)
  if (!an.best) {
    const legal = allLegalMoves(board, side)
    if (!legal.length) return null
    return { from: legal[0].from, to: legal[0].to }
  }

  if (lv <= 1) {
    // 低难度：在接近最优的一批着法里随机，会主动送子，保证玩家能赢
    const near = []
    for (let i = 0; i < an.cands.length; i++) {
      if (an.cands[i].score >= an.bestScore - 80 && an.cands[i].exact) near.push(an.cands[i])
    }
    if (!near.length) return an.best
    const c = near[Math.floor(Math.random() * near.length)]
    return { from: c.from, to: c.to }
  }
  return an.best
}

/** 纯静态子力评估（默认走子方视角，可指定阵营） */
export function staticEval(state, side) {
  return evaluate(state.board, side || state.turn)
}

/** 把着法写成"车二平五"这样的中文记法（尽力而为，仅用于显示） */
const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九']
export function moveName(board, mv) {
  const p = board[mv.from] || ''
  const name = pieceName(p)
  if (!name) return ''
  const s = sideOf(p)
  const fx = px(mv.from)
  const tx = px(mv.to)
  const fy = py(mv.from)
  const ty = py(mv.to)
  const fileNo = (x) => CN_NUM[s === RED ? x : 8 - x]
  let verb
  if (fx === tx && fy !== ty) verb = '进'
  else if (fx !== tx && fy === ty) verb = '平'
  else verb = '退'
  const dst = verb === '平' ? fileNo(tx) : CN_NUM[Math.abs(ty - fy) - 1]
  return name + fileNo(fx) + verb + dst
}

export function hintsFor(state, from) {
  const tg = legalMovesFrom(state.board, from)
  const captures = {}
  for (let i = 0; i < tg.length; i++) captures[tg[i]] = !!state.board[tg[i]]
  return { targets: tg, captures: captures }
}

export function movableSet(state) {
  const set = {}
  for (let i = 0; i < state.board.length; i++) {
    const p = state.board[i]
    if (p && sideOf(p) === state.turn && legalMovesFrom(state.board, i).length) set[i] = true
  }
  return set
}

const RED_IMG = { K: 'r_shuai', A: 'r_shi', B: 'r_xiang', N: 'r_ma', R: 'r_che', C: 'r_pao', P: 'r_bing' }
const BLACK_IMG = { K: 'b_jiang', A: 'b_shi', B: 'b_xiang', N: 'b_ma', R: 'b_che', C: 'b_pao', P: 'b_zu' }

export function pieceImage(p) {
  if (!p) return ''
  const t = typeOf(p)
  const s = sideOf(p)
  const name = (s === RED ? RED_IMG : BLACK_IMG)[t]
  return name ? '/common/chess/' + name + '.png' : ''
}

const RED_NAME = { K: '帅', A: '仕', B: '相', N: '马', R: '车', C: '炮', P: '兵' }
const BLACK_NAME = { K: '将', A: '士', B: '象', N: '马', R: '车', C: '炮', P: '卒' }

export function pieceName(p) {
  if (!p) return ''
  const s = sideOf(p)
  return (s === RED ? RED_NAME : BLACK_NAME)[typeOf(p)] || ''
}

export function sideName(s) { return s === RED ? '红方' : '黑方' }
