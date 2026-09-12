/**
 * 国际象棋内核自测（Node，自包含，不依赖 Vela 系统接口）
 *
 * 运行（隔离目录，避免与他人并行任务冲突）：
 *   cd /c/Users/39830/Documents/zcode/fangcun-chess
 *   TMP=.ct-gjxq; rm -rf $TMP; mkdir -p $TMP/core; echo '{ "type": "module" }' > $TMP/package.json
 *   for f in src/common/core/*.js; do b=$(basename $f); [ "$b" = "util.js" ] && continue; cp $f $TMP/core/; done
 *   cp tools/gjxq.test.mjs $TMP/; cd $TMP && node gjxq.test.mjs
 */
import assert from 'node:assert/strict'
import * as chess from './core/chess8.js'

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name, ok: true })
  } catch (e) {
    results.push({ name, ok: false, msg: e && e.message })
  }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

/* -------- 小工具 -------- */
function place(pieces, opts) {
  const st = chess.newGame({ mode: 'pvp' })
  for (let i = 0; i < 64; i++) st.board[i] = null
  for (let i = 0; i < pieces.length; i++) {
    const pc = pieces[i]
    st.board[pc[1] * 8 + pc[0]] = pc[2]
  }
  st.kings = { 1: -1, 2: -1 }
  st.turn = 1
  st.castling = { wk: false, wq: false, bk: false, bq: false }
  st.ep = -1
  st.history = []
  st.over = false
  st.winner = 0
  st.reason = ''
  if (opts) for (const k in opts) st[k] = opts[k]
  return st
}
function countKings(b, code) {
  let n = 0
  for (let i = 0; i < 64; i++) if (b[i] === code) n++
  return n
}
function from(st, x, y) { return chess.legalMovesFrom(st, x, y) }
function hasTo(ms, x, y) {
  return ms.some(function (m) { return m.to[0] === x && m.to[1] === y })
}
function perft(st, d) {
  const ms = chess.legalMoves(st)
  if (d === 1) return ms.length
  let n = 0
  for (let i = 0; i < ms.length; i++) {
    chess.apply(st, ms[i], false)
    n += perft(st, d - 1)
    chess.undo(st)
  }
  return n
}

/* ============================ 走法生成 ============================ */
section('走法生成 / perft')

test('初始局面白方合法着法为 20', () => {
  const st = chess.newGame({ mode: 'pvp' })
  assert.equal(chess.legalMoves(st).length, 20)
})

test('perft 深度 1 = 20', () => {
  assert.equal(perft(chess.newGame({ mode: 'pvp' }), 1), 20)
})

test('perft 深度 2 = 400', () => {
  assert.equal(perft(chess.newGame({ mode: 'pvp' }), 2), 400)
})

test('perft 深度 3 = 8902', () => {
  assert.equal(perft(chess.newGame({ mode: 'pvp' }), 3), 8902)
})

test('非法着法被 apply 拒绝', () => {
  const st = chess.newGame({ mode: 'pvp' })
  // a1 车被自己的兵挡住
  assert.equal(chess.apply(st, { from: [0, 7], to: [0, 5] }, true), false)
  // 空格起手
  assert.equal(chess.apply(st, { from: [4, 3], to: [4, 4] }, true), false)
  assert.equal(st.turn, 1)
})

test('骑士可跨越己方棋子（b1 -> a3/c3）', () => {
  const st = chess.newGame({ mode: 'pvp' })
  const ms = from(st, 1, 7)
  assert.equal(ms.length, 2)
  assert.ok(hasTo(ms, 0, 5) && hasTo(ms, 2, 5))
})

test('被阻挡的车不能动（a1 开局 0 着）', () => {
  const st = chess.newGame({ mode: 'pvp' })
  assert.equal(from(st, 0, 7).length, 0)
})

test('空旷棋盘上的车走 10 格（含吃子线）', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [0, 7, 'wR']])
  const ms = from(st, 0, 7)
  assert.equal(ms.length, 10)
  assert.ok(!hasTo(ms, 4, 7)) // 不能吃己方王
})

test('兵首步可走两格，之后只能一格', () => {
  const st = chess.newGame({ mode: 'pvp' })
  assert.equal(from(st, 4, 6).length, 2)
  const ms = from(st, 4, 6)
  const two = ms.filter(function (m) { return m.to[1] === 4 })[0]
  assert.ok(two)
  chess.apply(st, { from: two.from, to: two.to }, true)
  // 换黑走一步再换白
  const bm = chess.legalMoves(st)[0]
  chess.apply(st, bm, false)
  assert.equal(from(st, 4, 4).length, 1)
})

test('兵斜吃，不能直吃', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [4, 4, 'wP'], [3, 3, 'bP'], [5, 3, 'bP']])
  const ms = from(st, 4, 4)
  assert.ok(hasTo(ms, 3, 3))
  assert.ok(hasTo(ms, 5, 3))
  // 直进被挡（前方 4,3 有 bP）时不能前进
  const st2 = place([[4, 7, 'wK'], [4, 0, 'bK'], [4, 4, 'wP'], [4, 3, 'bP']])
  assert.equal(from(st2, 4, 4).length, 0)
})

/* ============================ 王车易位 ============================ */
section('王车易位')

test('满足条件时短易位可用并正确移动王车', () => {
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [4, 0, 'bK']], { castling: { wk: true, wq: false, bk: false, bq: false } })
  const ms = from(st, 4, 7)
  assert.ok(ms.some(function (m) { return m.castle === 'k' && m.to[0] === 6 }))
  const cm = ms.filter(function (m) { return m.castle === 'k' })[0]
  assert.equal(chess.apply(st, cm, true), true)
  assert.equal(st.board[62], 'wK')
  assert.equal(st.board[61], 'wR')
  assert.equal(st.board[63], null)
  assert.equal(st.castling.wk, false)
})

test('满足条件时长易位可用并正确移动王车', () => {
  const st = place([[4, 7, 'wK'], [0, 7, 'wR'], [4, 0, 'bK']], { castling: { wk: false, wq: true, bk: false, bq: false } })
  const ms = from(st, 4, 7)
  assert.ok(ms.some(function (m) { return m.castle === 'q' && m.to[0] === 2 }))
  const cm = ms.filter(function (m) { return m.castle === 'q' })[0]
  chess.apply(st, cm, true)
  assert.equal(st.board[58], 'wK')
  assert.equal(st.board[59], 'wR')
  assert.equal(st.board[56], null)
  assert.equal(st.castling.wq, false)
})

test('中间有子不可易位', () => {
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [5, 7, 'wB'], [4, 0, 'bK']], { castling: { wk: true, wq: false, bk: false, bq: false } })
  assert.ok(!from(st, 4, 7).some(function (m) { return m.castle === 'k' }))
})

test('王经过格被攻击不可易位', () => {
  // 黑车在 f8 控制 f1
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [5, 0, 'bR'], [0, 0, 'bK']], { castling: { wk: true, wq: false, bk: false, bq: false } })
  assert.ok(!from(st, 4, 7).some(function (m) { return m.castle === 'k' }))
})

test('王正被将军时不可易位', () => {
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [4, 0, 'bR'], [0, 0, 'bK']], { castling: { wk: true, wq: false, bk: false, bq: false } })
  assert.ok(!from(st, 4, 7).some(function (m) { return m.castle === 'k' }))
})

test('王/车动过后易位权失效（走王再回位不可易位）', () => {
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [4, 0, 'bK']], { castling: { wk: true, wq: false, bk: false, bq: false } })
  chess.apply(st, { from: [4, 7], to: [4, 6] }, true)   // K e1->e2
  chess.apply(st, { from: [4, 0], to: [0, 0] }, false)  // bK e8->a8
  chess.apply(st, { from: [4, 6], to: [4, 7] }, true)   // K e2->e1
  assert.ok(!from(st, 4, 7).some(function (m) { return m.castle === 'k' }))
})

test('黑方长易位也可用', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [0, 0, 'bR']], { castling: { wk: false, wq: false, bk: false, bq: true }, turn: 2 })
  const ms = from(st, 4, 0)
  assert.ok(ms.some(function (m) { return m.castle === 'q' && m.to[0] === 2 }))
})

/* ============================ 吃过路兵 / 升变 ============================ */
section('吃过路兵 / 升变')

test('吃过路兵：吃掉经过格的兵', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [4, 3, 'wP'], [3, 3, 'bP']], { ep: 2 * 8 + 3, turn: 1 })
  const ms = from(st, 4, 3)
  assert.ok(hasTo(ms, 3, 2), '应能吃 d6 过路兵')
  const em = ms.filter(function (m) { return m.to[0] === 3 && m.to[1] === 2 })[0]
  assert.equal(chess.apply(st, em, true), true)
  assert.equal(st.board[2 * 8 + 3], 'wP')
  assert.equal(st.board[3 * 8 + 3], null, '被吃的黑兵应消失')
})

test('没有过路兵标记时不能吃过路兵', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [4, 3, 'wP'], [3, 3, 'bP']], { ep: -1, turn: 1 })
  assert.ok(!hasTo(from(st, 4, 3), 3, 2))
})

test('兵升变为后可选择四种棋子', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [0, 1, 'wP']], { turn: 1 })
  const ms = from(st, 0, 1)
  const promos = ms.filter(function (m) { return m.to[0] === 0 && m.to[1] === 0 })
  assert.equal(promos.length, 4)
  const kinds = promos.map(function (m) { return m.promo }).sort().join('')
  assert.equal(kinds, 'bnqr')
})

test('升变后落到目标格为所选棋子', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [0, 1, 'wP']], { turn: 1 })
  const q = from(st, 0, 1).filter(function (m) { return m.promo === 'q' })[0]
  assert.equal(chess.apply(st, q, true), true)
  assert.equal(st.board[0], 'wQ')
})

test('黑兵升变到 y=7', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [7, 6, 'bP']], { turn: 2 })
  const n = from(st, 7, 6).filter(function (m) { return m.promo === 'n' })[0]
  assert.ok(n)
  chess.apply(st, n, true)
  assert.equal(st.board[7 * 8 + 7], 'bN')
})

/* ============================ 将军 / 将死 / 逼和 ============================ */
section('将军 / 将死 / 逼和')

test('必须过滤使自己被将军的着法（牵制子）', () => {
  // 白王 e1，白车 e2 被黑车 e8 牵制
  const st = place([[4, 7, 'wK'], [4, 6, 'wR'], [7, 0, 'bK'], [4, 0, 'bR']], { turn: 1 })
  const ms = from(st, 4, 6)
  assert.ok(ms.length > 0)
  for (let i = 0; i < ms.length; i++) {
    assert.equal(ms[i].to[0], 4, '被牵制的车只能沿 e 线移动')
  }
  assert.equal(ms.length, 6) // e3..e7 与吃 e8
})

test('王不能走到被攻击的格', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [3, 5, 'bR']], { turn: 1 })
  const ms = from(st, 4, 7)
  // 黑车控制第 3 列（x=3），白王不可走到 d1/d2
  assert.ok(!hasTo(ms, 3, 7))
  assert.ok(hasTo(ms, 4, 6), '王可前进到 e2（未被攻击）')
})

test('初始局面时不算将军', () => {
  const st = chess.newGame({ mode: 'pvp' })
  assert.equal(chess.inCheck(st, 1), false)
  assert.equal(chess.result(st).over, false)
})

test('后 + 王经典将死', () => {
  // 白 Kf6 Qg7，黑 Kh8，轮到黑
  const st = place([[5, 2, 'wK'], [6, 1, 'wQ'], [7, 0, 'bK']], { turn: 2 })
  assert.equal(chess.inCheck(st, 2), true)
  assert.equal(chess.legalMoves(st).length, 0)
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 1)
  assert.equal(r.text, '将死')
})

test('逼和（无合法着法且未被将军）判平局', () => {
  // 白 Kf6 Qg6，黑 Kh8，轮到黑：黑王无处可去且未被将军
  const st = place([[5, 2, 'wK'], [6, 2, 'wQ'], [7, 0, 'bK']], { turn: 2 })
  assert.equal(chess.inCheck(st, 2), false)
  assert.equal(chess.legalMoves(st).length, 0)
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw')
  assert.equal(r.text, '逼和')
})

test('apply 将死后状态与 result 一致', () => {
  const st = place([[5, 2, 'wK'], [6, 3, 'wQ'], [7, 0, 'bK']], { turn: 1 })
  // Qg5 -> g7 将死
  const m = from(st, 6, 3).filter(function (x) { return x.to[0] === 6 && x.to[1] === 1 })[0]
  assert.ok(m)
  assert.equal(chess.apply(st, m, true), true)
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 1)
  assert.equal(st.over, true)
  assert.equal(st.winner, 1)
})

/* ============================ 悔棋 ============================ */
section('悔棋')

test('悔棋完整还原棋盘、轮次与易位权', () => {
  const st = chess.newGame({ mode: 'pvp' })
  const before = JSON.stringify(st.board)
  const ms = chess.legalMoves(st)
  assert.equal(chess.apply(st, ms[0], true), true)
  assert.notEqual(JSON.stringify(st.board), before)
  assert.equal(chess.undo(st), true)
  assert.equal(JSON.stringify(st.board), before)
  assert.equal(st.turn, 1)
  assert.equal(st.history.length, 0)
})

test('悔棋还原吃过路兵与升变', () => {
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [4, 3, 'wP'], [3, 3, 'bP']], { ep: 2 * 8 + 3, turn: 1 })
  const before = JSON.stringify(st.board)
  const em = from(st, 4, 3).filter(function (m) { return m.to[0] === 3 && m.to[1] === 2 })[0]
  chess.apply(st, em, true)
  chess.undo(st)
  assert.equal(JSON.stringify(st.board), before)

  const p = place([[4, 7, 'wK'], [4, 0, 'bK'], [0, 1, 'wP']], { turn: 1 })
  const pb = JSON.stringify(p.board)
  const q = from(p, 0, 1).filter(function (m) { return m.promo === 'q' })[0]
  chess.apply(p, q, true)
  chess.undo(p)
  assert.equal(JSON.stringify(p.board), pb)
  assert.equal(p.board[1 * 8 + 0], 'wP')
})

/* ============================ 判和规则 ============================ */
section('判和规则')

test('五十步规则：连续 100 半回合无吃子且无兵动判和', () => {
  // 车王对王，车平移一步不涉及吃子/兵动
  const st = place([[4, 7, 'wK'], [0, 7, 'wR'], [4, 0, 'bK']], { turn: 1, halfmove: 99 })
  const m = from(st, 0, 7).filter(function (x) { return x.to[0] === 1 && x.to[1] === 7 })[0]
  assert.ok(m, '应有 Ra1-b1 的着法')
  assert.equal(chess.apply(st, m, true), true)
  assert.equal(st.halfmove, 100, '半回合计数应达到 100')
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw')
  assert.ok(/五十步/.test(r.text), '应提示五十步规则，实际：' + r.text)
  assert.equal(st.over, true)
  assert.equal(st.winner, 'draw')
})

test('三次重复局面判和（含轮走方/易位权/吃过路兵权）', () => {
  const st = chess.newGame({ mode: 'pvp' })
  // 白 b1 马 → c3 → b1，黑 b8 马 → c6 → b8，往返两轮回到初始局面（共出现 3 次）
  const seq = [
    [[1, 7], [2, 5]], [[1, 0], [2, 2]],
    [[2, 5], [1, 7]], [[2, 2], [1, 0]],
    [[1, 7], [2, 5]], [[1, 0], [2, 2]],
    [[2, 5], [1, 7]], [[2, 2], [1, 0]]
  ]
  for (let i = 0; i < seq.length; i++) {
    const s = seq[i]
    const m = chess.legalMoves(st).filter(function (x) {
      return x.from[0] === s[0][0] && x.from[1] === s[0][1] &&
        x.to[0] === s[1][0] && x.to[1] === s[1][1]
    })[0]
    assert.ok(m, '第 ' + (i + 1) + ' 手应有该着法')
    assert.equal(chess.apply(st, m, true), true)
    if (i < seq.length - 1) assert.equal(st.over, false, '第 ' + (i + 1) + ' 手不应提前结束')
  }
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw')
  assert.ok(/三次重复/.test(r.text), '应提示三次重复，实际：' + r.text)
})

test('子力不足判和：K+单象 vs K', () => {
  const st = place([[4, 7, 'wK'], [2, 7, 'wB'], [0, 0, 'bK']], { turn: 1 })
  assert.ok(chess.legalMoves(st).length > 0, '应有合法着法（非逼和）')
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw')
  assert.ok(/子力不足/.test(r.text), '应提示子力不足，实际：' + r.text)
})

test('子力不足判和：双方各一象且同色格', () => {
  // wB c1 与 bB f8 同在奇数色格（x+y 为奇）
  const st = place([[4, 7, 'wK'], [2, 7, 'wB'], [0, 0, 'bK'], [5, 0, 'bB']], { turn: 1 })
  assert.ok(chess.legalMoves(st).length > 0, '应有合法着法（非逼和）')
  const r = chess.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw')
  assert.ok(/子力不足/.test(r.text), '应提示子力不足，实际：' + r.text)
})

test('双方各一马（异色格无碍）不自动判和', () => {
  const st = place([[4, 7, 'wK'], [1, 7, 'wN'], [0, 0, 'bK'], [6, 0, 'bN']], { turn: 1 })
  const r = chess.result(st)
  assert.equal(r.winner, 0)
  assert.equal(r.over, false)
})

test('悔棋回退后判和状态被清除', () => {
  const st = place([[4, 7, 'wK'], [0, 7, 'wR'], [4, 0, 'bK']], { turn: 1, halfmove: 99 })
  const m = from(st, 0, 7).filter(function (x) { return x.to[0] === 1 && x.to[1] === 7 })[0]
  chess.apply(st, m, true)
  assert.equal(chess.result(st).over, true)
  assert.equal(chess.undo(st), true)
  assert.equal(st.halfmove, 99)
  assert.equal(chess.result(st).over, false)
})

/* ============================ AI ============================ */
section('AI')

test('AI 无棋可走返回 null', () => {
  const st = place([[5, 2, 'wK'], [6, 1, 'wQ'], [7, 0, 'bK']], { turn: 2 })
  assert.equal(chess.aiMove(st, 3), null)
})

test('AI 对随机玩家 50 局全程合法且无异常（普通级）', () => {
  for (let n = 0; n < 50; n++) {
    const st = chess.newGame({ mode: 'ai' })
    const aiSide = (n % 2 === 0) ? 2 : 1
    let plies = 0
    while (plies < 300) {
      const r = chess.result(st)
      if (r.over) break
      const ms = chess.legalMoves(st)
      assert.ok(ms.length > 0, '有可走棋时 legalMoves 不应为空')
      let mv
      if (st.turn === aiSide) {
        mv = chess.aiMove(st, 1)
        assert.ok(mv, 'AI 不应返回 null（第 ' + n + ' 局第 ' + plies + ' 手）')
        // AI 着法必须出现在合法着法表中
        const okList = ms.some(function (m) {
          return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] &&
            m.to[0] === mv.to[0] && m.to[1] === mv.to[1] &&
            (m.promo || null) === (mv.promo || null)
        })
        assert.ok(okList, 'AI 走出非法着法 ' + JSON.stringify(mv))
      } else {
        mv = ms[Math.floor(Math.random() * ms.length)]
      }
      assert.equal(chess.apply(st, mv, true), true, 'apply 拒绝了走法 ' + JSON.stringify(mv))
      assert.equal(countKings(st.board, 'wK'), 1, '白王数量异常')
      assert.equal(countKings(st.board, 'bK'), 1, '黑王数量异常')
      assert.ok(st.turn === 1 || st.turn === 2, '轮次必为 1/2')
      plies++
    }
  }
})

test('AI 高级 / 大师级在多个局面下着法合法', () => {
  const levels = [2, 2, 2, 2, 3, 3, 3, 3]
  for (let k = 0; k < levels.length; k++) {
    const st = chess.newGame({ mode: 'ai' })
    // 先随机走若干步制造中局
    const warm = 8 + k * 3
    for (let i = 0; i < warm; i++) {
      const r = chess.result(st)
      if (r.over) break
      const ms = chess.legalMoves(st)
      chess.apply(st, ms[Math.floor(Math.random() * ms.length)], true)
    }
    if (chess.result(st).over) continue
    const before = JSON.stringify(st.board)
    const mv = chess.aiMove(st, levels[k])
    assert.ok(mv, 'AI 返回 null（level ' + levels[k] + '）')
    const ms = chess.legalMoves(st)
    const ok = ms.some(function (m) {
      return m.from[0] === mv.from[0] && m.from[1] === mv.from[1] &&
        m.to[0] === mv.to[0] && m.to[1] === mv.to[1] && (m.promo || null) === (mv.promo || null)
    })
    assert.ok(ok, 'level ' + levels[k] + ' 走出非法着法 ' + JSON.stringify(mv))
    assert.equal(JSON.stringify(st.board), before, 'AI 搜索不得改变棋盘')
    assert.equal(chess.apply(st, mv, true), true)
  }
})

test('AI 能吃掉送上门的大子（高级）', () => {
  // 白后 d1 可吃黑后 d5（中间无子）
  const st = place([[4, 7, 'wK'], [4, 0, 'bK'], [3, 7, 'wQ'], [3, 3, 'bQ']], { turn: 1 })
  const mv = chess.aiMove(st, 2)
  const ate = mv && mv.to[0] === 3 && mv.to[1] === 3
  assert.ok(ate, 'AI 应吃掉无保护的黑后，实际 ' + JSON.stringify(mv))
})

test('AI 避免送王入死（被将军时走合法的应将）', () => {
  // 黑车 e8 将白王 e1，白方必须应将
  const st = place([[4, 7, 'wK'], [7, 7, 'wR'], [0, 0, 'bK'], [4, 0, 'bR']], { turn: 1 })
  const mv = chess.aiMove(st, 2)
  assert.ok(mv)
  assert.equal(chess.apply(st, mv, true), true)
  assert.equal(chess.inCheck(st, 1), false, '应将后不应仍被将军')
})

/* -------- 性能与"不卡死"（手环看门狗靠这几条守住） -------- */

test('分片搜索：一次 analyseStep 只阻塞很短时间', () => {
  const st = chess.newGame({ mode: 'pvp' })
  const sess = chess.analyseSession(st, 3)
  assert.ok(sess.root.length > 0, '应有根着法')
  let worst = 0
  let slices = 0
  const t0 = Date.now()
  while (!sess.done && slices < 5000) {
    const a = Date.now()
    chess.analyseStep(sess, 10)
    worst = Math.max(worst, Date.now() - a)
    slices++
  }
  const total = Date.now() - t0
  const an = chess.sessionResult(sess)
  console.log('    单片最慢 ' + worst + 'ms / 共 ' + slices + ' 片 / 整步 ' + total + 'ms / 深度 ' + an.depth)
  assert.ok(an.best, '分片搜索也要给出着法')
  assert.equal(chess.apply(st, an.best, st.turn), true, '分片给出的着法要合法')
  // 手环上单片若长期超过几十毫秒就会顶到看门狗
  assert.ok(worst < 120, '单片阻塞过长：' + worst + 'ms（应远小于看门狗阈值）')
})

test('AI 时间预算：level 3 同步整步不超过预算 + 余量', () => {
  const st = chess.newGame({ mode: 'pvp' })
  const t0 = Date.now()
  const mv = chess.aiMove(st, 3)
  const dt = Date.now() - t0
  console.log('    level3 单步 ' + dt + 'ms（预算 ' + chess.AI_LEVELS[2].budget + 'ms）')
  assert.ok(mv, '应有着法')
  assert.ok(dt < 800, 'level3 单步耗时过长：' + dt + 'ms')
})

test('AI 预算分档递增（低难度不会比高难度慢）', () => {
  assert.ok(chess.AI_LEVELS[0].budget <= chess.AI_LEVELS[1].budget)
  assert.ok(chess.AI_LEVELS[1].budget <= chess.AI_LEVELS[2].budget)
  assert.ok(chess.AI_LEVELS[0].depth <= chess.AI_LEVELS[2].depth)
})

test('分片搜索必须收敛：小片不空转、必给合法着法', () => {
  const st = chess.newGame({ mode: 'pvp' })
  const sess = chess.analyseSession(st, 3)
  let rounds = 0
  while (!sess.done && rounds < 5000) { chess.analyseStep(sess, 1); rounds++ }
  assert.ok(sess.done, '预算耗尽后必须收敛（否则页面会无限空转到看门狗重启）')
  const an = chess.sessionResult(sess)
  assert.ok(an.best, '必须仍给出兜底着法')
  assert.equal(chess.apply(st, an.best, st.turn), true, '兜底着法必须合法可走')
})

/* ============================ 汇总 ============================ */
const failed = results.filter(function (r) { return !r.ok })
for (let i = 0; i < results.length; i++) {
  const r = results[i]
  console.log((r.ok ? '  \u2713 ' : '  \u2717 ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
