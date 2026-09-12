/**
 * 国际象棋（8×8）规则 + AI —— 纯 ESM，状态可 JSON.stringify
 *
 * 坐标约定：[x, y]，x = 0..7 自左向右（a..h），y = 0..7 自上向下。
 *   黑方在 y = 0,1（向 y 增大方向前进）；白方在 y = 6,7（向 y 减小方向前进）。
 *   扁平索引 i = y * 8 + x，与页面 64 格一一对应。
 *
 * 棋子编码：'wK' 'wQ' 'wR' 'wB' 'wN' 'wP' / 'bK' ... 空格为 null。
 * 走法对象：{ from:[x,y], to:[x,y], promo:'q'|'r'|'b'|'n'|null, castle:'k'|'q'|null }
 *
 * 对外契约：newGame / aiMove / apply / result（名称与签名固定）。
 * 另导出 legalMoves / legalMovesFrom / inCheck / undo 供界面与测试使用。
 * 仅依赖 ./rnd.js，禁止引用 @system.* 与 ./util.js。
 */
import { pickBest } from './rnd.js'

export const WHITE = 1
export const BLACK = 2

function makeStart() {
  const b = new Array(64)
  for (let i = 0; i < 64; i++) b[i] = null
  const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']
  for (let x = 0; x < 8; x++) {
    b[x] = 'b' + back[x]          // y=0 黑方底线
    b[8 + x] = 'bP'
    b[48 + x] = 'wP'
    b[56 + x] = 'w' + back[x]     // y=7 白方底线
  }
  return b
}

function idx(x, y) { return y * 8 + x }
function onB(x, y) { return x >= 0 && x < 8 && y >= 0 && y < 8 }
function mirror(i) { return (7 - ((i / 8) | 0)) * 8 + (i % 8) }

export function colorOf(p) { return p ? (p[0] === 'w' ? WHITE : BLACK) : 0 }
function typeOf(p) { return p ? p[1] : '' }
function opp(c) { return c === WHITE ? BLACK : WHITE }
function mk(fx, fy, tx, ty) {
  return { from: [fx, fy], to: [tx, ty], promo: null, castle: null }
}

/** 补全/修正状态（存档、手工摆子后调用；公开入口都会先调用它） */
function ensure(st) {
  if (!st.board) st.board = makeStart()
  if (!st.kings) st.kings = { 1: -1, 2: -1 }
  for (let c = 1; c <= 2; c++) {
    const want = c === 1 ? 'wK' : 'bK'
    const k = st.kings[c]
    if (!(k >= 0 && st.board[k] === want)) {
      let found = -1
      for (let i = 0; i < 64; i++) { if (st.board[i] === want) { found = i; break } }
      st.kings[c] = found
    }
  }
  if (!st.castling) st.castling = { wk: true, wq: true, bk: true, bq: true }
  if (st.ep === undefined) st.ep = -1
  if (st.halfmove === undefined) st.halfmove = 0
  if (st.fullmove === undefined) st.fullmove = 1
  if (!st.history) st.history = []
  if (st.over === undefined) st.over = false
  if (st.winner === undefined) st.winner = 0
  if (st.reason === undefined) st.reason = ''
  if (!st.clocks) { const b = (st.baseMinutes || 30) * 60; st.clocks = { 1: b, 2: b } }
  // 重复局面检测用的局面键序列（含轮走方 / 易位权 / 吃过路兵权）
  if (!st.posKeys || !st.posKeys.length) st.posKeys = [posKey(st)]
}

/**
 * 局面键：棋盘 + 轮走方 + 易位权 + 吃过路兵权。
 * 只有"确实存在己方兵可吃过路"时才把 ep 计入，避免同一局面被误判为不同。
 */
function posKey(st) {
  const b = st.board
  let s = ''
  for (let i = 0; i < 64; i++) s += b[i] || '.'
  s += '|' + st.turn
  const c = st.castling
  s += '|' + (c.wk ? 'K' : '') + (c.wq ? 'Q' : '') + (c.bk ? 'k' : '') + (c.bq ? 'q' : '')
  let ep = '-'
  if (st.ep >= 0) {
    const ex = st.ep % 8, ey = (st.ep / 8) | 0
    const pawn = st.turn === WHITE ? 'wP' : 'bP'
    if ((onB(ex - 1, ey) && b[idx(ex - 1, ey)] === pawn) ||
        (onB(ex + 1, ey) && b[idx(ex + 1, ey)] === pawn)) ep = String(st.ep)
  }
  return s + '|' + ep
}

/** 当前局面在 posKeys 中出现的次数（三次重复判和用） */
function repetitionCount(st) {
  const keys = st.posKeys
  if (!keys || !keys.length) return 0
  const cur = keys[keys.length - 1]
  let n = 0
  for (let i = 0; i < keys.length; i++) if (keys[i] === cur) n++
  return n
}

/** 某格是否被 by 方攻击 */
function attacked(st, x, y, by) {
  const b = st.board
  const wx = by === WHITE ? 'wP' : 'bP'
  const wy = by === WHITE ? y + 1 : y - 1   // 攻击方兵所在行
  if (onB(x - 1, wy) && b[idx(x - 1, wy)] === wx) return true
  if (onB(x + 1, wy) && b[idx(x + 1, wy)] === wx) return true

  const nx = by === WHITE ? 'wN' : 'bN'
  const NO = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
  for (let i = 0; i < 8; i++) {
    const px = x + NO[i][0], py = y + NO[i][1]
    if (onB(px, py) && b[idx(px, py)] === nx) return true
  }

  const kx = by === WHITE ? 'wK' : 'bK'
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      if (dx === 0 && dy === 0) continue
      const px = x + dx, py = y + dy
      if (onB(px, py) && b[idx(px, py)] === kx) return true
    }
  }

  const rq = by === WHITE ? ['wR', 'wQ'] : ['bR', 'bQ']
  const bq = by === WHITE ? ['wB', 'wQ'] : ['bB', 'bQ']
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
  for (let i = 0; i < 8; i++) {
    const dx = D[i][0], dy = D[i][1]
    const rookLine = dx === 0 || dy === 0
    const list = rookLine ? rq : bq
    let px = x + dx, py = y + dy
    while (onB(px, py)) {
      const p = b[idx(px, py)]
      if (p) {
        if (list.indexOf(p) >= 0) return true
        break
      }
      px += dx; py += dy
    }
  }
  return false
}

function inCheckRaw(st, color) {
  const k = st.kings[color]
  if (!(k >= 0)) return false
  return attacked(st, k % 8, (k / 8) | 0, opp(color))
}

/** 公开：是否被将军 */
export function inCheck(st, color) {
  ensure(st)
  return inCheckRaw(st, color || st.turn)
}

function addPawn(out, fx, fy, tx, ty) {
  if (ty === 0 || ty === 7) {
    const ps = ['q', 'r', 'b', 'n']
    for (let i = 0; i < ps.length; i++) {
      const m = mk(fx, fy, tx, ty); m.promo = ps[i]; out.push(m)
    }
  } else {
    out.push(mk(fx, fy, tx, ty))
  }
}

function addCastles(st, color, out) {
  const y = color === WHITE ? 7 : 0
  const kp = st.kings[color]
  if (kp !== idx(4, y)) return
  const foe = opp(color)
  if (attacked(st, 4, y, foe)) return
  const king = color === WHITE ? 'wK' : 'bK'
  const rook = color === WHITE ? 'wR' : 'bR'
  if (st.board[idx(4, y)] !== king) return
  const kRight = color === WHITE ? st.castling.wk : st.castling.bk
  const qRight = color === WHITE ? st.castling.wq : st.castling.bq
  if (kRight && st.board[idx(7, y)] === rook &&
      !st.board[idx(5, y)] && !st.board[idx(6, y)] &&
      !attacked(st, 5, y, foe) && !attacked(st, 6, y, foe)) {
    const m = mk(4, y, 6, y); m.castle = 'k'; out.push(m)
  }
  if (qRight && st.board[idx(0, y)] === rook &&
      !st.board[idx(1, y)] && !st.board[idx(2, y)] && !st.board[idx(3, y)] &&
      !attacked(st, 3, y, foe) && !attacked(st, 2, y, foe)) {
    const m = mk(4, y, 2, y); m.castle = 'q'; out.push(m)
  }
}

// 方向常量提到模块级：原来写在 genPseudo 的循环里，每搜一个节点、每枚棋子都要重建
// 这些数组（含 RD.concat(BD)），小堆设备上就是成千上万的临时对象 + GC 风暴。
const KNIGHT_DIRS = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]
const KING_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
const ROOK_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]]
const BISHOP_DIRS = [[1, 1], [1, -1], [-1, 1], [-1, -1]]
const QUEEN_DIRS = ROOK_DIRS.concat(BISHOP_DIRS)

function genPseudo(st, color) {
  const b = st.board
  const out = []
  const dir = color === WHITE ? -1 : 1
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = idx(x, y)
      const p = b[i]
      if (!p || colorOf(p) !== color) continue
      const t = p[1]
      if (t === 'N' || t === 'K') {
        const O = t === 'N' ? KNIGHT_DIRS : KING_DIRS
        for (let k = 0; k < 8; k++) {
          const nx2 = x + O[k][0], ny2 = y + O[k][1]
          if (!onB(nx2, ny2)) continue
          const q = b[idx(nx2, ny2)]
          if (!q || colorOf(q) !== color) out.push(mk(x, y, nx2, ny2))
        }
      } else if (t === 'R' || t === 'B' || t === 'Q') {
        const O = t === 'R' ? ROOK_DIRS : (t === 'B' ? BISHOP_DIRS : QUEEN_DIRS)
        for (let k = 0; k < O.length; k++) {
          const dx = O[k][0], dy = O[k][1]
          let nx2 = x + dx, ny2 = y + dy
          while (onB(nx2, ny2)) {
            const q = b[idx(nx2, ny2)]
            if (!q) out.push(mk(x, y, nx2, ny2))
            else {
              if (colorOf(q) !== color) out.push(mk(x, y, nx2, ny2))
              break
            }
            nx2 += dx; ny2 += dy
          }
        }
      } else if (t === 'P') {
        const ny2 = y + dir
        if (onB(x, ny2) && !b[idx(x, ny2)]) {
          addPawn(out, x, y, x, ny2)
          const startY = color === WHITE ? 6 : 1
          const ny3 = y + 2 * dir
          if (y === startY && !b[idx(x, ny3)]) out.push(mk(x, y, x, ny3))
        }
        const caps = [-1, 1]
        for (let k = 0; k < 2; k++) {
          const nx2 = x + caps[k]
          if (!onB(nx2, ny2)) continue
          const q = b[idx(nx2, ny2)]
          if (q && colorOf(q) !== color) addPawn(out, x, y, nx2, ny2)
          else if (!q && st.ep === idx(nx2, ny2)) out.push(mk(x, y, nx2, ny2))
        }
      }
    }
  }
  addCastles(st, color, out)
  return out
}

/** 在 st 上执行走法（不做合法性校验），返回可回滚记录 */
function doMove(st, m) {
  const b = st.board
  const fx = m.from[0], fy = m.from[1], tx = m.to[0], ty = m.to[1]
  const fi = idx(fx, fy), ti = idx(tx, ty)
  const p = b[fi]
  const color = colorOf(p)
  const t = p[1]
  const rec = {
    from: fi, to: ti, piece: p, capPiece: b[ti], capIdx: ti,
    castling: { wk: st.castling.wk, wq: st.castling.wq, bk: st.castling.bk, bq: st.castling.bq },
    ep: st.ep, half: st.halfmove, full: st.fullmove,
    king: st.kings[color], promo: m.promo || null, rookFrom: -1, rookTo: -1
  }
  // 吃过路兵
  if (t === 'P' && tx !== fx && !b[ti]) {
    const ci = idx(tx, fy)
    rec.capIdx = ci
    rec.capPiece = b[ci]
    b[ci] = null
  }
  let np = p
  if (t === 'P' && (ty === 0 || ty === 7)) {
    np = (color === WHITE ? 'w' : 'b') + (m.promo || 'q').toUpperCase()
  }
  b[fi] = null
  b[ti] = np
  // 王车易位同步移动车
  if (t === 'K' && (tx - fx === 2 || fx - tx === 2)) {
    const rf = tx === 6 ? idx(7, fy) : idx(0, fy)
    const rt = tx === 6 ? idx(5, fy) : idx(3, fy)
    b[rt] = b[rf]
    b[rf] = null
    rec.rookFrom = rf
    rec.rookTo = rt
  }
  if (t === 'K' && rec.king === fi) st.kings[color] = ti
  // 易位权按“王/车离开或落点被占”失效
  if (fi === idx(4, 7) || ti === idx(4, 7)) { st.castling.wk = false; st.castling.wq = false }
  if (fi === idx(4, 0) || ti === idx(4, 0)) { st.castling.bk = false; st.castling.bq = false }
  if (fi === idx(0, 7) || ti === idx(0, 7)) st.castling.wq = false
  if (fi === idx(7, 7) || ti === idx(7, 7)) st.castling.wk = false
  if (fi === idx(0, 0) || ti === idx(0, 0)) st.castling.bq = false
  if (fi === idx(7, 0) || ti === idx(7, 0)) st.castling.bk = false
  // 过路兵目标格
  st.ep = (t === 'P' && (ty - fy === 2 || fy - ty === 2)) ? idx(fx, (fy + ty) / 2) : -1
  st.halfmove = (t === 'P' || rec.capPiece) ? 0 : st.halfmove + 1
  if (color === BLACK) st.fullmove++
  st.turn = opp(color)
  return rec
}

function undoMove(st, rec) {
  const b = st.board
  b[rec.from] = rec.piece
  b[rec.to] = null
  if (rec.capPiece) b[rec.capIdx] = rec.capPiece
  if (rec.rookFrom >= 0) { b[rec.rookFrom] = b[rec.rookTo]; b[rec.rookTo] = null }
  // 逐字段还原，避免每个节点新建一个 castling 对象（搜索里这是热路径）
  st.castling.wk = rec.castling.wk
  st.castling.wq = rec.castling.wq
  st.castling.bk = rec.castling.bk
  st.castling.bq = rec.castling.bq
  st.ep = rec.ep
  st.halfmove = rec.half
  st.fullmove = rec.full
  const color = colorOf(rec.piece)
  if (rec.king >= 0) st.kings[color] = rec.king
  st.turn = color
}

/** 生成合法走法；onlyFrom 可选 [x,y] 只取该子的走法 */
function genLegalRaw(st, color, onlyFrom) {
  const list = genPseudo(st, color)
  const out = []
  for (let k = 0; k < list.length; k++) {
    const m = list[k]
    if (onlyFrom && (m.from[0] !== onlyFrom[0] || m.from[1] !== onlyFrom[1])) continue
    const rec = doMove(st, m)
    const kk = st.kings[color]
    let ok = true
    if (kk >= 0 && attacked(st, kk % 8, (kk / 8) | 0, opp(color))) ok = false
    undoMove(st, rec)
    if (ok) out.push(m)
  }
  return out
}

/** 公开：某一方全部合法走法 */
export function legalMoves(st, color) {
  ensure(st)
  return genLegalRaw(st, color || st.turn)
}

/** 公开：某格棋子的合法走法 */
export function legalMovesFrom(st, x, y) {
  ensure(st)
  return genLegalRaw(st, st.turn, [x, y])
}

/**
 * 子力不足判和（死局）：
 *   K vs K、K+单轻子 vs K（象或马）、双方各一象且象在同色格。
 * 其余情况（如 K+N vs K+N、K+B vs K+N）尚有将死可能，不自动判和。
 */
function insufficient(st) {
  const b = st.board
  const minors = []
  for (let i = 0; i < 64; i++) {
    const p = b[i]
    if (!p) continue
    const t = p[1]
    if (t === 'P' || t === 'R' || t === 'Q') return false
    if (t === 'N' || t === 'B') minors.push(i)
  }
  if (minors.length <= 1) return true
  if (minors.length === 2) {
    const a = minors[0], c = minors[1]
    // 双方各一只象且位于同色格 -> 死局
    if (b[a][1] === 'B' && b[c][1] === 'B' && b[a][0] !== b[c][0]) {
      const ca = ((a % 8) + ((a / 8) | 0)) % 2
      const cc = ((c % 8) + ((c / 8) | 0)) % 2
      if (ca === cc) return true
    }
  }
  return false
}

/** 五十步规则：连续 100 个半回合（50 回合）无吃子且无兵移动 */
function fiftyMove(st) { return st.halfmove >= 100 }

/** 三次重复局面 */
function threefold(st) { return repetitionCount(st) >= 3 }

function finalize(st) {
  st.check = inCheckRaw(st, st.turn)
  const legal = genLegalRaw(st, st.turn)
  if (!legal.length) {
    st.over = true
    if (st.check) { st.winner = opp(st.turn); st.reason = '将死' }
    else { st.winner = 'draw'; st.reason = '逼和' }
    return
  }
  if (insufficient(st)) { st.over = true; st.winner = 'draw'; st.reason = '子力不足，和棋'; return }
  if (fiftyMove(st)) { st.over = true; st.winner = 'draw'; st.reason = '五十步规则，和棋'; return }
  if (threefold(st)) { st.over = true; st.winner = 'draw'; st.reason = '三次重复局面，和棋'; return }
  st.over = false
  st.winner = 0
  st.reason = ''
}

/** 新开局 */
export function newGame(opts) {
  opts = opts || {}
  const base = (opts.baseMinutes || 30) * 60
  const st = {
    board: makeStart(),
    turn: WHITE,
    castling: { wk: true, wq: true, bk: true, bq: true },
    ep: -1,
    kings: { 1: idx(4, 7), 2: idx(4, 0) },
    halfmove: 0,
    fullmove: 1,
    history: [],
    lastMove: null,
    over: false,
    winner: 0,
    reason: '',
    check: false,
    mode: opts.mode === 'pvp' ? 'pvp' : 'ai',
    useTimer: !!opts.useTimer,
    baseMinutes: opts.baseMinutes || 30,
    addSeconds: opts.addSeconds || 0,
    clocks: { 1: base, 2: base }
  }
  return st
}

/** 落子；非法或已结束返回 false。走法需来自 legalMoves/aiMove */
export function apply(st, m, byPlayer) {
  ensure(st)
  if (!m || !m.from || !m.to) return false
  if (st.over) return false
  const legal = genLegalRaw(st, st.turn)
  let found = null
  for (let i = 0; i < legal.length; i++) {
    const L = legal[i]
    if (L.from[0] !== m.from[0] || L.from[1] !== m.from[1]) continue
    if (L.to[0] !== m.to[0] || L.to[1] !== m.to[1]) continue
    if (L.promo != null) {
      if ((m.promo || 'q') === L.promo) { found = L; break }
    } else { found = L; break }
  }
  if (!found) return false
  const mover = st.turn
  const clocks = (st.useTimer && st.clocks) ? { 1: st.clocks[1], 2: st.clocks[2] } : null
  const rec = doMove(st, found)
  if (st.useTimer && st.clocks) st.clocks[mover] += st.addSeconds || 0
  rec.clocks = clocks
  rec.move = {
    from: [found.from[0], found.from[1]],
    to: [found.to[0], found.to[1]],
    promo: found.promo || null,
    castle: found.castle || null
  }
  st.history.push(rec)
  st.lastMove = rec.move
  // 记录落子后的局面键（仅在正式落子时维护，搜索用的 doMove/undoMove 不碰）
  st.posKeys.push(posKey(st))
  finalize(st)
  return true
}

/** 悔一步（界面用；AI 对局回退两步由界面调用两次） */
export function undo(st) {
  ensure(st)
  const rec = st.history.pop()
  if (!rec) return false
  undoMove(st, rec)
  if (st.posKeys && st.posKeys.length > 1) st.posKeys.pop()
  if (rec.clocks) st.clocks = { 1: rec.clocks[1], 2: rec.clocks[2] }
  st.over = false
  st.winner = 0
  st.reason = ''
  const h = st.history[st.history.length - 1]
  st.lastMove = h ? h.move : null
  st.check = inCheckRaw(st, st.turn)
  return true
}

/** 结果；不修改状态。winner: 0（未结束）|1|2|'draw' */
export function result(st) {
  ensure(st)
  if (st.over) return { over: true, winner: st.winner, text: st.reason || '' }
  const check = inCheckRaw(st, st.turn)
  const legal = genLegalRaw(st, st.turn)
  if (!legal.length) {
    if (check) return { over: true, winner: opp(st.turn), text: '将死' }
    return { over: true, winner: 'draw', text: '逼和' }
  }
  if (insufficient(st)) return { over: true, winner: 'draw', text: '子力不足，和棋' }
  if (fiftyMove(st)) return { over: true, winner: 'draw', text: '五十步规则，和棋' }
  if (threefold(st)) return { over: true, winner: 'draw', text: '三次重复局面，和棋' }
  return { over: false, winner: 0, text: check ? '将军' : '' }
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

const VAL = { P: 100, N: 320, B: 330, R: 500, Q: 900, K: 20000 }

/* 子力位置表（白方视角，索引 0 = a8 … 63 = h1；黑方镜像取用） */
const PST = {
  P: [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0
  ],
  N: [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50
  ],
  B: [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20
  ],
  R: [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0
  ],
  Q: [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20
  ],
  K: [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20
  ]
}

const MATE = 100000
let _deadline = 0
let _abort = false
let _nodes = 0

function timeUp() {
  if (_abort) return true
  _nodes++
  if ((_nodes & 127) === 0 && Date.now() > _deadline) _abort = true
  return _abort
}

/** 白方视角静态评估 */
function evalWhite(st) {
  const b = st.board
  let s = 0
  for (let i = 0; i < 64; i++) {
    const p = b[i]
    if (!p) continue
    const t = p[1]
    const v = VAL[t] + PST[t][p[0] === 'w' ? i : mirror(i)]
    s += p[0] === 'w' ? v : -v
  }
  return s
}
function evalSide(st) { return st.turn === WHITE ? evalWhite(st) : -evalWhite(st) }

function isCapture(st, m) {
  if (st.board[idx(m.to[0], m.to[1])]) return true
  const p = st.board[idx(m.from[0], m.from[1])]
  return !!(p && p[1] === 'P' && m.from[0] !== m.to[0])
}

function orderMoves(st, moves) {
  const b = st.board
  const n = moves.length
  if (n < 2) return moves
  // 边算分边插入排序：原来给每个着法造一个 {m,s} 包装对象再 sort，
  // 热路径上每节点几十个临时对象，小堆设备上是主要开销来源。
  for (let i = 0; i < n; i++) {
    const m = moves[i]
    const p = b[idx(m.from[0], m.from[1])]
    const cap = b[idx(m.to[0], m.to[1])]
    let s = 0
    if (cap) s += 10 * VAL[cap[1]] - VAL[p[1]]
    if (m.promo) s += 800
    if (m.castle) s += 40
    m._s = s
  }
  for (let i = 1; i < n; i++) {
    const mv = moves[i]
    const s = mv._s
    let j = i - 1
    while (j >= 0 && moves[j]._s < s) { moves[j + 1] = moves[j]; j-- }
    moves[j + 1] = mv
  }
  return moves
}

function quiesce(st, alpha, beta, ply) {
  if (timeUp()) return 0
  const side = st.turn
  const stand = evalSide(st)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  const all = genPseudo(st, side)
  const caps = []
  for (let i = 0; i < all.length; i++) { if (isCapture(st, all[i])) caps.push(all[i]) }
  if (!caps.length) return alpha
  const ms = orderMoves(st, caps)
  for (let i = 0; i < ms.length; i++) {
    const rec = doMove(st, ms[i])
    // 走完自己不能正被将军：原来靠 genLegalRaw 预筛，等于每个着法多跑一趟 doMove/undo
    if (inCheckRaw(st, side)) { undoMove(st, rec); continue }
    const v = -quiesce(st, -beta, -alpha, ply + 1)
    undoMove(st, rec)
    if (_abort) return alpha
    if (v > alpha) alpha = v
    if (alpha >= beta) break
  }
  return alpha
}

function negamax(st, depth, alpha, beta, ply) {
  if (timeUp()) return 0
  if (depth <= 0) return quiesce(st, alpha, beta, ply)
  const side = st.turn
  const pseudo = genPseudo(st, side)
  if (!pseudo.length) return inCheckRaw(st, side) ? (-MATE + ply) : 0
  const ms = orderMoves(st, pseudo)
  let best = -Infinity
  let any = false
  for (let i = 0; i < ms.length; i++) {
    const rec = doMove(st, ms[i])
    if (inCheckRaw(st, side)) { undoMove(st, rec); continue }
    any = true
    const v = -negamax(st, depth - 1, -beta, -alpha, ply + 1)
    undoMove(st, rec)
    if (_abort) return 0
    if (v > best) best = v
    if (best > alpha) alpha = best
    if (alpha >= beta) break
  }
  if (!any) return inCheckRaw(st, side) ? (-MATE + ply) : 0
  return best
}

/** 普通：1 层贪心（带随机抖动） */
function greedyMove(st, moves) {
  const cands = []
  for (let i = 0; i < moves.length; i++) {
    const rec = doMove(st, moves[i])
    const sc = -evalSide(st)
    undoMove(st, rec)
    cands.push({ score: sc + Math.random() * 40, move: moves[i] })
  }
  const best = pickBest(cands)
  return best ? best.move : moves[0]
}

/* ------------------------------------------------------------------ */
/* 可分片的搜索会话（手环上关键：单次 JS 阻塞必须很短，否则看门狗重启）   */
/* ------------------------------------------------------------------ */

/** 每档的迭代深度与总预算（毫秒真实时间；到点就交回上一层已算完的结果） */
export const AI_LEVELS = [
  { depth: 1, budget: 80 },
  { depth: 2, budget: 180 },
  { depth: 3, budget: 280 }
]

/** 建会话：根着法排序一次，之后 analyseStep 一片一片地搜 */
export function analyseSession(state, level) {
  ensure(state)
  const lv = Math.max(1, Math.min(3, level || 1))
  const cfg = AI_LEVELS[lv - 1]
  const root = orderMoves(state, genLegalRaw(state, state.turn))
  _deadline = Date.now() + cfg.budget
  _abort = false
  _nodes = 0
  return {
    state: state, level: lv, maxDepth: cfg.depth, budget: cfg.budget,
    root: root, depth: 1, idx: 0, alpha: -Infinity,
    bestThis: null, bestScore: -Infinity,
    best: root.length ? root[0] : null,
    doneDepth: 0, aborted: false,
    done: root.length === 0
  }
}

/** 推进一片：最多 sliceMs 毫秒就返回（done=false 表示还要再来一片） */
export function analyseStep(sess, sliceMs) {
  if (sess.done) return sess
  const st = sess.state
  const t0 = Date.now()
  const slice = sliceMs || 10
  while (!sess.done) {
    if (sess.idx >= sess.root.length) {
      // 这一层搜完：采纳结果，进下一层
      if (sess.bestThis) sess.best = sess.bestThis
      sess.doneDepth = sess.depth
      sess.depth++
      if (sess.depth > sess.maxDepth) { sess.done = true; break }
      sess.idx = 0
      sess.alpha = -Infinity
      sess.bestThis = null
      sess.bestScore = -Infinity
      // 上一层的最优着法先搜：深一层时的剪枝效率高很多
      const first = sess.best
      const rest = []
      for (let i = 0; i < sess.root.length; i++) if (sess.root[i] !== first) rest.push(sess.root[i])
      sess.root = first ? [first].concat(rest) : rest
      continue
    }
    if (Date.now() - t0 >= slice) break
    if (Date.now() > _deadline) { _abort = true; sess.aborted = true; break }
    const m = sess.root[sess.idx]
    const rec = doMove(st, m)
    const v = -negamax(st, sess.depth - 1, -Infinity, -sess.alpha, 1)
    undoMove(st, rec)
    sess.idx++
    if (_abort) break
    if (v > sess.bestScore) { sess.bestScore = v; sess.bestThis = m }
    if (v > sess.alpha) sess.alpha = v
  }
  if (_abort) sess.done = true
  return sess
}

export function sessionResult(sess) {
  return {
    depth: sess.doneDepth,
    nodes: _nodes,
    aborted: sess.aborted,
    best: sess.best,
    bestScore: sess.bestScore
  }
}

/** 同步跑完一个会话（测试/基准/兼容用；页面请用 analyseSession + analyseStep） */
export function analyse(state, level) {
  const sess = analyseSession(state, level)
  while (!sess.done) analyseStep(sess, 1000000)
  return sessionResult(sess)
}

/**
 * AI 走子：level 1 普通（贪心） / 2 高级 / 3 大师（迭代加深 + alpha-beta）
 * 无合法着法返回 null。带真实时间预算，卡不住。
 */
export function aiMove(state, level) {
  ensure(state)
  const lv = Math.max(1, Math.min(3, level || 1))
  const moves = genLegalRaw(state, state.turn)
  if (!moves.length) return null
  if (moves.length === 1) return moves[0]
  if (lv === 1) return greedyMove(state, moves)
  const an = analyse(state, lv)
  return an.best || moves[0]
}
