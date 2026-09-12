/**
 * 五子棋内核自测（Node 环境，纯逻辑，不依赖 Vela 系统接口）。
 *
 * 独立运行：
 *   TMP=.ct-wzq; rm -rf $TMP; mkdir -p $TMP/core
 *   echo '{ "type": "module" }' > $TMP/package.json
 *   for f in src/common/core/*.js; do b=$(basename $f); [ "$b" = "util.js" ] && continue; cp $f $TMP/core/; done
 *   cp tools/wzq.test.mjs $TMP/; cd $TMP && node wzq.test.mjs
 */
import assert from 'node:assert/strict'

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

const gomoku = await import('./core/gomoku.js')
const { newGame, apply, aiMove, result, undo, tick, empties, isForbidden } = gomoku

/* ------------------------------ 小工具 ------------------------------ */

/** 双方交替落子（黑色先），返回 state */
function playSeqs(pairs) {
  const g = newGame({ board: 15 })
  for (let k = 0; k < pairs.length; k++) {
    const ok = apply(g, pairs[k])
    assert.equal(ok, true, '第 ' + (k + 1) + ' 手 ' + pairs[k] + ' 应合法')
  }
  return g
}

/** black 手数/white 手数 交替：黑白各自数组。forbidden 省略即默认开启 */
function interleave(black, white, board, forbidden) {
  const g = newGame({ board: board || 15, forbidden: forbidden })
  const mx = Math.max(black.length, white.length)
  for (let k = 0; k < mx; k++) {
    if (k < black.length) assert.equal(apply(g, black[k]), true, '黑 ' + black[k])
    if (k < white.length) assert.equal(apply(g, white[k]), true, '白 ' + white[k])
  }
  return g
}

function idx(x, y, n) { return y * n + x }

function countStones(g) {
  let c = 0
  for (let i = 0; i < g.board.length; i++) if (g.board[i] !== 0) c++
  return c
}

function randomMove(g) {
  const es = empties(g)
  return es[Math.floor(Math.random() * es.length)]
}

function legal(g, mv) {
  return Number.isInteger(mv) && mv >= 0 && mv < g.n * g.n && g.board[mv] === 0
}

/* ============================== 判胜 ============================== */

section('连五判胜 / 边界 / 平局')

test('横向五连判胜（棋盘边缘第 0 行）', () => {
  const g = interleave([idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)],
    [idx(5, 5, 15), idx(6, 5, 15), idx(7, 5, 15), idx(8, 5, 15)])
  const r = result(g)
  assert.equal(g.over, true)
  assert.equal(r.winner, 1)
  assert.equal(g.winLine.length >= 5, true)
})

test('纵向五连判胜（棋盘边缘第 0 列）', () => {
  const g = interleave([idx(0, 0, 15), idx(0, 1, 15), idx(0, 2, 15), idx(0, 3, 15), idx(0, 4, 15)],
    [idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)])
  assert.equal(result(g).winner, 1)
})

test('主对角线五连判胜', () => {
  const g = interleave([idx(0, 0, 15), idx(1, 1, 15), idx(2, 2, 15), idx(3, 3, 15), idx(4, 4, 15)],
    [idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)])
  assert.equal(result(g).winner, 1)
})

test('副对角线五连判胜（另一角边缘）', () => {
  const g = interleave([idx(4, 14, 15), idx(3, 13, 15), idx(2, 12, 15), idx(1, 11, 15), idx(0, 10, 15)],
    [idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15)])
  assert.equal(result(g).winner, 1)
})

test('棋盘下满且无五连为平局（棋子总数守恒）', () => {
  const n = 15
  // 2×2 砖块错位图案：p = (floor(x/2) + (y%2)) % 2，四个方向同色最长连续均为 2
  const black = []
  const white = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const p = (Math.floor(x / 2) + (y % 2)) % 2
      if (p === 0) black.push(idx(x, y, n))
      else white.push(idx(x, y, n))
    }
  }
  assert.equal(black.length, 113)
  assert.equal(white.length, 112)

  const g = newGame({ board: n })
  for (let k = 0; k < black.length; k++) {
    assert.equal(apply(g, black[k]), true, '黑第 ' + k + ' 手')
    assert.equal(countStones(g), g.moves.length, '黑下后子数应等于历史长度')
    if (k < white.length) {
      assert.equal(apply(g, white[k]), true, '白第 ' + k + ' 手')
      assert.equal(countStones(g), g.moves.length, '白下后子数应等于历史长度')
    }
  }
  const r = result(g)
  assert.equal(r.over, true)
  assert.equal(r.winner, 'draw', '平局判定错误，winner=' + r.winner + ' line=' + JSON.stringify(g.winLine))
  assert.equal(g.moves.length, n * n)
  assert.equal(countStones(g), n * n)
})

/* ============================ 非法落子 ============================ */

section('非法落子被拒绝')

test('越界 / 重复 / 非本回合落子 / 终局后落子均被拒绝', () => {
  const g = newGame({ board: 15 })
  assert.equal(apply(g, -1), false)
  assert.equal(apply(g, 15 * 15), false)
  assert.equal(apply(g, 1e9), false)
  assert.equal(apply(g, '4'), false)

  assert.equal(apply(g, 7), true)
  const before = countStones(g)
  const hist = g.moves.length
  assert.equal(apply(g, 7), false, '重复落子应被拒绝')
  assert.equal(apply(g, 7, 2), false)
  assert.equal(apply(g, 8, 1), false, '未轮到黑方，应被拒绝')
  assert.equal(countStones(g), before)
  assert.equal(g.moves.length, hist)

  // 终局后落子
  const h = interleave([idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)],
    [idx(6, 6, 15), idx(7, 6, 15), idx(8, 6, 15), idx(9, 6, 15)])
  assert.equal(h.over, true)
  const stones = countStones(h)
  assert.equal(apply(h, idx(10, 0, 15)), false, '终局后落子应被拒绝')
  assert.equal(countStones(h), stones)
})

test('byPlayer 与当前回合不符时被拒绝且状态不变', () => {
  const g = newGame({ board: 15 })
  assert.equal(apply(g, 3, 2), false)
  assert.equal(g.moves.length, 0)
  assert.equal(g.turn, 1)
})

/* ============================== 悔棋 ============================== */

section('悔棋与状态一致性')

test('悔棋恢复棋盘点数、回合与历史长度', () => {
  const g = newGame({ board: 15 })
  apply(g, 0)
  apply(g, 1)
  apply(g, 2)
  assert.equal(g.moves.length, 3)
  assert.equal(g.turn, 2)
  assert.equal(undo(g, 2), 2)
  assert.equal(g.moves.length, 1)
  assert.equal(countStones(g), 1)
  assert.equal(g.turn, 2, '撤销 2 手后轮到白方')
  assert.equal(g.board[1], 0)
  assert.equal(g.board[2], 0)
})

test('终局后悔棋可继续对弈', () => {
  const g = interleave([idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)],
    [idx(6, 6, 15), idx(7, 6, 15), idx(8, 6, 15), idx(9, 6, 15)])
  assert.equal(g.over, true)
  undo(g, 1)
  assert.equal(g.over, false)
  assert.equal(result(g).winner, 0)
  assert.equal(apply(g, idx(4, 0, 15)), true, '悔棋后可重新落子')
  assert.equal(result(g).winner, 1)
})

/* ============================== 时间 ============================== */

section('时间限制')

test('超时判负', () => {
  const g = newGame({ board: 15, useTimer: true, baseMinutes: 1, addSeconds: 0 })
  assert.equal(g.timer.on, true)
  assert.equal(g.timer.remain[1], 60)
  assert.equal(tick(g, 59), false)
  assert.equal(tick(g, 1), true, '第 60 秒应超时')
  const r = result(g)
  assert.equal(r.over, true)
  assert.equal(r.winner, 2, '黑方超时，白方胜')
  assert.equal(g.timeout, 1)
})

test('费舍尔加秒：落子方获得加秒', () => {
  const g = newGame({ board: 15, useTimer: true, baseMinutes: 1, addSeconds: 5 })
  apply(g, 0)
  assert.equal(g.timer.remain[1], 65)
  assert.equal(g.timer.remain[2], 60)
  apply(g, 1)
  assert.equal(g.timer.remain[2], 65)
})

test('结束后 tick 不再改变状态', () => {
  const g = interleave([idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15), idx(4, 0, 15)],
    [idx(6, 6, 15), idx(7, 6, 15), idx(8, 6, 15), idx(9, 6, 15)])
  assert.equal(tick(g, 9999), false)
  assert.equal(result(g).winner, 1)
})

/* =============================== AI =============================== */

section('AI 合法性与强弱')

test('AI 会立刻成五（有四连必成）', () => {
  const g = interleave([idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15)],
    [idx(0, 5, 15), idx(1, 5, 15), idx(2, 5, 15), idx(3, 5, 15)])
  assert.equal(g.turn, 1)
  assert.equal(aiMove(g, 3), idx(4, 0, 15), '高手应下成五点')
  assert.equal(aiMove(g, 1), idx(4, 0, 15), '菜鸟也应下成五点')
})

test('AI 会堵对手的成五（各难度均堵）', () => {
  // 白连四 0..3，黑不能让其成五；黑方无关子力
  const g = interleave([idx(0, 8, 15), idx(0, 10, 15), idx(0, 12, 15), idx(0, 14, 15)],
    [idx(0, 0, 15), idx(1, 0, 15), idx(2, 0, 15), idx(3, 0, 15)])
  assert.equal(g.turn, 1)
  for (const lv of [1, 2, 3]) {
    assert.equal(aiMove(g, lv), idx(4, 0, 15), 'level ' + lv + ' 应堵在 (4,0)')
  }
})

test('空盘 AI 只下天元且合法', () => {
  const g = newGame({ board: 15 })
  for (const lv of [1, 2, 3]) {
    const mv = aiMove(g, lv)
    assert.equal(mv, idx(7, 7, 15), '空盘应下天元，level ' + lv)
  }
})

test('AI 在随机局面下永不非法（各难度 × 400 局面）', () => {
  for (const lv of [1, 2, 3]) {
    for (let t = 0; t < 400; t++) {
      const g = newGame({ board: 15 })
      const steps = Math.floor(Math.random() * 40)
      for (let s = 0; s < steps && !g.over; s++) apply(g, randomMove(g))
      if (g.over) continue
      const mv = aiMove(g, lv)
      assert.ok(mv !== null, '棋局未结束不应返回 null')
      assert.ok(legal(g, mv), 'level ' + lv + ' 返回非法着法 ' + mv)
    }
  }
})

/** 与随机走子对弈一局，返回 state */
function gameVsRandom(level, aiPlayer) {
  const g = newGame({ board: 15 })
  let guard = 0
  while (!g.over && guard < 500) {
    guard++
    if (g.turn === aiPlayer) {
      const mv = aiMove(g, level)
      assert.ok(mv !== null, 'AI 返回 null 但棋局未结束')
      assert.ok(legal(g, mv), 'AI 非法落子 ' + mv + ' level ' + level)
      assert.equal(apply(g, mv, aiPlayer), true, 'AI 落子失败')
    } else {
      const mv = randomMove(g)
      assert.ok(legal(g, mv), '随机方非法落子')
      assert.equal(apply(g, mv), true)
    }
    assert.equal(countStones(g), g.moves.length, '棋子总数应恒等于历史长度')
  }
  return g
}

test('AI 对随机玩家 200 局：无异常、无非法落子', () => {
  function batch(level) {
    let win = 0, lose = 0, draw = 0
    for (let i = 0; i < 200; i++) {
      const aiPlayer = (i % 2 === 0) ? 1 : 2   // 黑白各半
      const g = gameVsRandom(level, aiPlayer)
      assert.equal(g.over, true, '对局应正常结束')
      if (g.winner === 'draw') draw++
      else if (g.winner === aiPlayer) win++
      else lose++
    }
    return { win, lose, draw }
  }
  const weak = batch(1)
  const strong = batch(3)
  console.log('    菜鸟 vs 随机: ' + weak.win + ' 胜 / ' + weak.lose + ' 负 / ' + weak.draw + ' 平')
  console.log('    高手 vs 随机: ' + strong.win + ' 胜 / ' + strong.lose + ' 负 / ' + strong.draw + ' 平')
  assert.ok(strong.win >= 180, '高手对随机应 >=90% 胜率，实际 ' + strong.win + '/200')
  assert.ok(strong.lose <= 2, '高手不应轻易输给随机，实际 ' + strong.lose)
  assert.ok(strong.win >= weak.win, '高手胜场不应低于菜鸟：' + strong.win + ' vs ' + weak.win)
})

test('高手级显著强于菜鸟级（直接对弈 200 局）', () => {
  let strongWin = 0, weakWin = 0, draw = 0
  for (let i = 0; i < 200; i++) {
    const sp = (i % 2 === 0) ? 1 : 2   // 高手黑白各半
    const wp = sp === 1 ? 2 : 1
    const g = newGame({ board: 15 })
    let guard = 0
    while (!g.over && guard < 600) {
      guard++
      const lv = g.turn === sp ? 3 : 1
      const mv = aiMove(g, lv)
      assert.ok(mv !== null, '棋局未结束不应返回 null')
      assert.ok(legal(g, mv), '非法着法 ' + mv)
      assert.equal(apply(g, mv), true)
    }
    assert.equal(g.over, true, '对局应正常结束')
    if (g.winner === 'draw') draw++
    else if (g.winner === sp) strongWin++
    else weakWin++
  }
  console.log('    高手 vs 菜鸟: ' + strongWin + ' 胜 / ' + weakWin + ' 负 / ' + draw + ' 平')
  assert.ok(strongWin >= 150, '高手对菜鸟应显著占优，实际 ' + strongWin + '/200')
  assert.ok(strongWin > weakWin + 80, '高手胜场应远多于菜鸟：' + strongWin + ' vs ' + weakWin)
})

test('平局判定后 aiMove 返回 null', () => {
  const g = newGame({ board: 15 })
  g.board[0] = 1
  g.board[1] = 2
  g.over = true
  g.winner = 'draw'
  assert.equal(aiMove(g, 3), null)
})

/* ============================== 禁手 ============================== */

section('黑棋禁手（三三 / 四四 / 长连）')

/** 白棋在棋盘左侧的分散落子，避免干扰黑棋禁手构造 */
function whiteSpread(k) {
  const out = []
  for (let t = 0; t < k; t++) out.push(idx(0, t * 2, 15))
  return out
}

test('三三：黑棋同点形成两个活三，落子即判负', () => {
  // 黑 (5,7)(6,7) 横向 + (7,5)(7,6) 纵向，落 (7,7) 同时成两个活三
  const g = interleave(
    [idx(5, 7, 15), idx(6, 7, 15), idx(7, 5, 15), idx(7, 6, 15), idx(7, 7, 15)],
    whiteSpread(4))
  assert.equal(g.over, true, '应该终局')
  assert.equal(g.winner, 2, '黑棋禁手应判白胜，winner=' + g.winner)
  assert.ok(g.foul && g.foul.reason === '三三', '禁手原因应为三三，实际 ' + (g.foul && g.foul.reason))
  assert.equal(result(g).winner, 2)
  assert.equal(g.board[idx(7, 7, 15)], 1, '禁手子仍应落在盘上')
})

test('四四：黑棋同点形成两个四，落子即判负', () => {
  // 横向 (4,7)(5,7)(6,7) + 纵向 (7,4)(7,5)(7,6)，落 (7,7) 同时成两个四
  const black = [
    idx(4, 7, 15), idx(5, 7, 15), idx(6, 7, 15),
    idx(7, 4, 15), idx(7, 5, 15), idx(7, 6, 15), idx(7, 7, 15)
  ]
  const g = interleave(black, whiteSpread(6))
  assert.equal(g.over, true)
  assert.equal(g.winner, 2, '黑棋四四禁手应判白胜，winner=' + g.winner)
  assert.ok(g.foul && g.foul.reason === '四四', '禁手原因应为四四，实际 ' + (g.foul && g.foul.reason))
})

test('长连：黑棋连成六子即判负（不是黑胜）', () => {
  // 黑 (4,7)(5,7)(6,7) 与 (8,7)(9,7)，落 (7,7) 连成六子
  const black = [
    idx(4, 7, 15), idx(5, 7, 15), idx(6, 7, 15),
    idx(8, 7, 15), idx(9, 7, 15), idx(7, 7, 15)
  ]
  const g = interleave(black, whiteSpread(5))
  assert.equal(g.over, true)
  assert.equal(g.winner, 2, '黑棋长连禁手应判白胜，winner=' + g.winner)
  assert.ok(g.foul && g.foul.reason === '长连', '禁手原因应为长连，实际 ' + (g.foul && g.foul.reason))
})

test('isForbidden：黑棋禁手点识别正确，普通点不误报', () => {
  const g = newGame({ board: 15 })
  const stones = [idx(5, 7, 15), idx(6, 7, 15), idx(7, 5, 15), idx(7, 6, 15)]
  for (const s of stones) g.board[s] = 1
  assert.equal(g.turn, 1)
  assert.equal(isForbidden(g, idx(7, 7, 15)), true, '(7,7) 应为禁手点')
  assert.equal(isForbidden(g, idx(8, 8, 15)), false, '(8,8) 不应误报')
  assert.equal(isForbidden(g, idx(5, 7, 15)), false, '已占点不算')
})

test('白棋：同样双活三形状不判禁手', () => {
  // 黑先下满 5 手、白 4 手，轮到白棋在 (7,7) 走出双活三形状
  const g = interleave(
    [idx(0, 0, 15), idx(0, 2, 15), idx(0, 4, 15), idx(0, 6, 15), idx(0, 8, 15)],
    [idx(5, 7, 15), idx(6, 7, 15), idx(7, 5, 15), idx(7, 6, 15)])
  assert.equal(g.turn, 2, '应轮到白棋')
  assert.equal(isForbidden(g, idx(7, 7, 15)), false, '白棋无禁手')
  assert.equal(apply(g, idx(7, 7, 15), 2), true)
  assert.equal(g.over, false, '白棋四子不成五，不应终局')
  assert.equal(result(g).winner, 0)
})

test('forbidden:false 关闭开关：三三不判负，isForbidden 返回 false', () => {
  const g = newGame({ board: 15, forbidden: false })
  assert.equal(g.forbidden, false)
  const black = [idx(5, 7, 15), idx(6, 7, 15), idx(7, 5, 15), idx(7, 6, 15)]
  const white = whiteSpread(4)
  for (let k = 0; k < 4; k++) {
    assert.equal(apply(g, black[k]), true)
    assert.equal(apply(g, white[k]), true)
  }
  assert.equal(g.turn, 1)
  assert.equal(isForbidden(g, idx(7, 7, 15)), false, '关闭开关后不应判禁手')
  assert.equal(apply(g, idx(7, 7, 15)), true)
  assert.equal(g.over, false, '关闭开关后不应终局')
  assert.equal(result(g).winner, 0)
})

test('forbidden:false 关闭开关：长连按普通连五判黑胜', () => {
  const g = interleave(
    [idx(4, 7, 15), idx(5, 7, 15), idx(6, 7, 15), idx(8, 7, 15), idx(9, 7, 15), idx(7, 7, 15)],
    whiteSpread(5), 15, false)
  assert.equal(g.over, true)
  assert.equal(g.winner, 1, '关开关时六连应判黑胜，winner=' + g.winner)
  assert.equal(g.foul, null)
})

/* ============================== 汇总 ============================== */

const failed = results.filter(r => !r.ok)
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
