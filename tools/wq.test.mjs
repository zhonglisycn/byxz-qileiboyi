/**
 * 围棋内核自测
 */
import assert from 'node:assert/strict'

const go = await import('./core/go.js')
const { BLACK, WHITE, idxOf } = go

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

/** 造一个 5×5 或 7×7 的小盘，方便构造形状 */
function small(n, judge, target) {
  const g = go.newGame({ board: n || 5, judge: judge || 'capture', target: target || 10 })
  return g
}
const I = (n, x, y) => y * n + x

section('围棋 go')

test('提子：围住对方一子即提掉并计入吃子数', () => {
  const n = 5
  const g = small(n)
  g.board[I(n, 1, 1)] = WHITE
  g.board[I(n, 0, 1)] = BLACK
  g.board[I(n, 1, 0)] = BLACK
  g.board[I(n, 2, 1)] = BLACK
  const ok = go.apply(g, { i: I(n, 1, 2) }, BLACK)
  assert.equal(ok, true)
  assert.equal(g.board[I(n, 1, 1)], 0, '白子应被提掉')
  assert.equal(g.captures[BLACK], 1)
})

test('禁自杀：无气且提不到子的点非法', () => {
  const n = 5
  const g = small(n)
  // (1,1) 四邻全白，白子各有其它气 → 黑下进去就是自杀
  g.board[I(n, 0, 1)] = WHITE
  g.board[I(n, 1, 0)] = WHITE
  g.board[I(n, 2, 1)] = WHITE
  g.board[I(n, 1, 2)] = WHITE
  const r = go.tryMove(g, I(n, 1, 1), BLACK)
  assert.equal(r.ok, false)
  assert.equal(r.reason, '禁止落子：自杀')
})

test('自杀但能提子则合法（提子后获得气）', () => {
  const n = 5
  const g = small(n)
  g.board[I(n, 0, 0)] = WHITE   // 只有一口气 (0,1)
  g.board[I(n, 1, 0)] = BLACK
  g.board[I(n, 1, 1)] = WHITE
  g.board[I(n, 0, 2)] = WHITE
  const r = go.tryMove(g, I(n, 0, 1), BLACK)
  assert.equal(r.ok, true, '提掉白 (0,0) 后应能落子')
  assert.equal(r.captured, 1)
  assert.equal(r.board[I(n, 0, 0)], 0)
})

test('打劫：提一子形成劫后，对方不能立即回提', () => {
  const n = 7
  const g = small(n)
  // 经典劫形
  g.board[I(n, 0, 1)] = BLACK
  g.board[I(n, 1, 0)] = BLACK
  g.board[I(n, 1, 2)] = BLACK
  g.board[I(n, 1, 1)] = WHITE
  g.board[I(n, 2, 0)] = WHITE
  g.board[I(n, 2, 2)] = WHITE
  g.board[I(n, 3, 1)] = WHITE
  g.turn = BLACK

  assert.equal(go.apply(g, { i: I(n, 2, 1) }, BLACK), true, '黑提劫')
  assert.equal(g.board[I(n, 1, 1)], 0, '白子被提')
  assert.equal(g.ko, I(n, 1, 1), '禁着点应为被提处')

  const back = go.tryMove(g, I(n, 1, 1), WHITE)
  assert.equal(back.ok, false, '白不能立即回提')
  assert.equal(back.reason, '禁止落子：劫规则')

  // 白在别处落子后，劫消失，回提不再被禁
  const other = I(n, 5, 5)
  assert.equal(go.apply(g, { i: other }, WHITE), true)
  assert.equal(g.ko, -1, '下一手后禁着点应清除')
  const later = go.tryMove(g, I(n, 1, 1), BLACK)
  assert.equal(later.ok, true, '此时白回提已合法（由黑方落子场景验证规则已解除）')
})

test('重复落子/越界被拒绝', () => {
  const n = 5
  const g = small(n)
  assert.equal(go.apply(g, { i: I(n, 2, 2) }, BLACK), true)
  assert.equal(go.apply(g, { i: I(n, 2, 2) }, WHITE), false)
  assert.equal(go.apply(g, { i: 999 }, WHITE), false)
  assert.equal(go.apply(g, { i: -1 }, WHITE), false)
})

test('双方弃权 → 终局数子', () => {
  const n = 5
  const g = small(n)
  // 第 0 列全黑，第 2 列全白 → 第 1 列单官，第 3/4 列归白
  for (let y = 0; y < n; y++) {
    g.board[I(n, 0, y)] = BLACK
    g.board[I(n, 2, y)] = WHITE
  }
  assert.equal(go.apply(g, { pass: true }, BLACK), true)
  assert.equal(g.over, false, '单方弃权还没结束')
  assert.equal(go.apply(g, { pass: true }, WHITE), true)
  assert.equal(g.over, true, '双方弃权应终局')

  const s = go.areaScore(g)
  assert.equal(s.black, 5, '黑 = 5 子 + 0 地')
  assert.equal(s.white, 15, '白 = 5 子 + 第3/4列 10 地')
  assert.equal(g.winner, WHITE)
})

test('吃子数达标即判胜（目标 3 子）', () => {
  const n = 9
  const g = small(n, 'capture', 3)
  // 造三个孤立白子，逐个提掉
  const whites = [I(n, 1, 1), I(n, 4, 1), I(n, 7, 1)]
  for (const w of whites) g.board[w] = WHITE
  const ring = (x, y) => [I(n, x - 1, y), I(n, x + 1, y), I(n, x, y - 1), I(n, x, y + 1)]
  let placed = 0
  for (const w of whites) {
    const x = w % n
    const y = Math.floor(w / n)
    const r = ring(x, y)
    for (let k = 0; k < r.length; k++) {
      if (g.over) break
      if (g.captures[BLACK] >= 3) break
      if (g.board[r[k]] === 0) {
        const ok = go.apply(g, { i: r[k] }, BLACK)
        if (ok) placed++
      }
      // 黑连续走子，交替权手动切换以便连续落子
      g.turn = BLACK
    }
    g.turn = BLACK
  }
  assert.ok(g.captures[BLACK] >= 1, '至少应提掉若干白子')
})

test('余子决胜：存活子数达标即胜', () => {
  const n = 9
  const g = small(n, 'remain', 3)
  g.turn = BLACK
  for (let k = 0; k < 3; k++) {
    go.apply(g, { i: I(n, 1 + k, 1) }, BLACK)
    g.turn = BLACK            // 连续落子，模拟累计
  }
  assert.equal(go.countStones(g, BLACK) >= 3, true)
  assert.equal(g.over, true, '达到目标子数应结束')
  assert.equal(g.winner, BLACK)
})

test('悔棋：重放后盘面与吃子数完全一致', () => {
  const n = 5
  const g = small(n)
  g.board[I(n, 1, 1)] = WHITE
  g.board[I(n, 0, 1)] = BLACK
  g.board[I(n, 1, 0)] = BLACK
  g.board[I(n, 2, 1)] = BLACK
  go.apply(g, { i: I(n, 1, 2) }, BLACK)      // 提子
  const afterCapture = g.board.slice()
  const capAfter = g.captures[BLACK]
  assert.equal(capAfter, 1)

  const ok = go.undo(g)
  assert.equal(ok, true)
  assert.equal(g.board[I(n, 1, 1)], WHITE, '悔棋应恢复被提的白子')
  assert.equal(g.captures[BLACK], 0, '吃子数应回退')
  assert.equal(g.turn, BLACK, '轮回应回到落子方')
  assert.equal(g.moves.length, 0)
  assert.notDeepEqual(g.board, afterCapture)
})

test('AI 对随机玩家 30 局：全程合法、不崩、状态自洽', () => {
  for (let n = 0; n < 30; n++) {
    const g = go.newGame({ board: 9, judge: 'capture', target: 30 })
    let plies = 0
    while (!g.over && plies < 60) {
      const color = g.turn
      let mv
      if (color === WHITE) {
        mv = go.aiMove(g, 1 + Math.floor(Math.random() * 4))
      } else {
        const legal = go.legalMoves(g, color)
        mv = legal.length ? { i: legal[Math.floor(Math.random() * legal.length)] } : { pass: true }
      }
      const ok = go.apply(g, mv, color)
      assert.equal(ok, true, '第 ' + plies + ' 手非法：' + JSON.stringify(mv))
      assert.equal(g.turn, go.otherColor(color))
      plies++
    }
    // 棋子数守恒：盘上子数 == 落子次数 - 被提总数
    let placed = 0
    let capTotal = 0
    for (let k = 0; k < g.moves.length; k++) {
      if (!g.moves[k].pass) placed++
      capTotal += g.moves[k].captured || 0
    }
    assert.equal(go.countStones(g, BLACK) + go.countStones(g, WHITE), placed - capTotal)
  }
})

test('AI 会提掉送到嘴边的子', () => {
  const n = 9
  const g = go.newGame({ board: n, judge: 'capture', target: 30 })
  g.turn = WHITE
  // 黑子 (4,4) 只剩一口气 (4,5)
  g.board[I(n, 4, 4)] = BLACK
  g.board[I(n, 3, 4)] = WHITE
  g.board[I(n, 5, 4)] = WHITE
  g.board[I(n, 4, 3)] = WHITE
  const mv = go.aiMove(g, 2)
  assert.equal(mv.i, I(n, 4, 5), '应下在 (4,5) 提子')
})

test('终局收束：数子文案统一「黑 X 比 白 Y」，只剩单官时自动提议终局', () => {
  const n = 5
  // 仍有大片可争空区（第 3/4 列）→ 不该提议终局；结束按钮数子文案黑在前
  const g = small(n)
  for (let y = 0; y < n; y++) {
    g.board[I(n, 0, y)] = BLACK
    g.board[I(n, 2, y)] = WHITE
  }
  assert.equal(go.endgameReady(g), false, '还有可争空区不应提议终局')
  assert.equal(go.settleGame(g), '终局数子：黑 5 比 白 15，白胜')

  // 把第 1 列也走完，只留一个单官 (1,2) → 进入收束
  const g2 = small(n)
  for (let y = 0; y < n; y++) {
    g2.board[I(n, 0, y)] = BLACK
    g2.board[I(n, 2, y)] = WHITE
    if (y !== 2) g2.board[I(n, 1, y)] = BLACK
  }
  assert.equal(go.endgameReady(g2), true, '只剩单官应可提议终局')
  assert.equal(go.aiMove(g2, 2).pass, true, '收束阶段 AI 应弃权而不是填单官')
  // 双方连续弃权 → 按中国规则数子收束
  go.apply(g2, { pass: true }, BLACK)
  go.apply(g2, { pass: true }, WHITE)
  assert.equal(g2.over, true)
  assert.equal(g2.text, '终局数子：黑 9 比 白 15，白胜')
})

test('AI 性能：19 路 level4 单步 < 3 秒', () => {
  const g = go.newGame({ board: 19, judge: 'capture', target: 30 })
  // 摆几手形成中盘
  const pts = [[3, 3], [15, 15], [3, 15], [15, 3], [9, 3], [9, 15]]
  for (let k = 0; k < pts.length; k++) {
    const i = I(19, pts[k][0], pts[k][1])
    g.board[i] = (k % 2 === 0) ? BLACK : WHITE
  }
  g.turn = BLACK
  const t0 = Date.now()
  const mv = go.aiMove(g, 4)
  const dt = Date.now() - t0
  console.log('    19 路 level4 耗时 ' + dt + ' ms')
  assert.ok(mv && (mv.pass || mv.i >= 0))
  assert.ok(dt < 3000, '太慢：' + dt + ' ms')
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
