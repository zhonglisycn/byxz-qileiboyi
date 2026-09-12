/**
 * 游戏内核自测（Node 环境，纯逻辑，不依赖 Vela 系统接口）
 *
 * 运行：bash tools/run-tests.sh
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

/* ============================ 井字棋 ============================ */
const ttt = await import('./core/ttt.js')

section('井字棋 ttt')

test('横线判胜', () => {
  const g = ttt.newGame(1)
  ;[0, 3, 1, 4, 2].forEach(i => ttt.play(g, i))
  assert.equal(g.winner, 1)
  assert.deepEqual(g.winCells, [0, 1, 2])
})

test('对角线判胜', () => {
  const g = ttt.newGame(1)
  ;[0, 1, 4, 2, 8].forEach(i => ttt.play(g, i))
  assert.equal(g.winner, 1)
  assert.deepEqual(g.winCells, [0, 4, 8])
})

test('满盘平局', () => {
  const g = ttt.newGame(1)
  // X O X / X O O / O X X
  ;[0, 1, 2, 4, 3, 5, 7, 6, 8].forEach(i => ttt.play(g, i))
  assert.equal(g.winner, 3)
})

test('非法落子被拒绝', () => {
  const g = ttt.newGame(1)
  assert.equal(ttt.play(g, 4), true)
  assert.equal(ttt.play(g, 4), false)
  assert.equal(ttt.play(g, 99), false)
})

test('大师级 AI 执先手对随机走子 300 局绝不输（井字棋完美对弈是和棋，随机方偶尔走对会和）', () => {
  let lost = 0, win = 0
  for (let n = 0; n < 300; n++) {
    const g = ttt.newGame(1)
    while (g.winner === 0) {
      if (g.turn === 1) ttt.play(g, ttt.aiMove(g, 3))
      else {
        const es = ttt.empties(g.board)
        ttt.play(g, es[Math.floor(Math.random() * es.length)])
      }
    }
    if (g.winner === 2) lost++
    if (g.winner === 1) win++
  }
  assert.equal(lost, 0, '大师 AI 输了 ' + lost + ' 局')
  assert.ok(win >= 270, '对随机方胜率应 >=90%，实际 ' + win + '/300')
})

test('大师级 AI 执后手对随机走子 300 局绝不输', () => {
  let lost = 0
  for (let n = 0; n < 300; n++) {
    const g = ttt.newGame(2)
    while (g.winner === 0) {
      if (g.turn === 2) ttt.play(g, ttt.aiMove(g, 3))
      else {
        const es = ttt.empties(g.board)
        ttt.play(g, es[Math.floor(Math.random() * es.length)])
      }
    }
    if (g.winner === 1) lost++
  }
  assert.equal(lost, 0, '后手大师输了 ' + lost + ' 局')
})

test('大师级走法在全部可达局面下与穷举全解一致（294778 个局面）', () => {
  const LINES = ttt.LINES
  function win(b) {
    for (const L of LINES) { const v = b[L[0]]; if (v && v === b[L[1]] && v === b[L[2]]) return v }
    for (let i = 0; i < 9; i++) if (b[i] === 0) return 0
    return 3
  }
  function exact(b, turn, me, d) {
    const w = win(b)
    if (w === me) return 10 - d
    if (w === 3) return 0
    if (w) return d - 10
    const es = []
    for (let i = 0; i < 9; i++) if (b[i] === 0) es.push(i)
    const vals = es.map(i => { b[i] = turn; const v = exact(b, turn === 1 ? 2 : 1, me, d + 1); b[i] = 0; return v })
    return turn === me ? Math.max.apply(null, vals) : Math.min.apply(null, vals)
  }
  let bad = 0, checked = 0
  function walk(b, turn) {
    if (win(b)) return
    const es = []
    for (let i = 0; i < 9; i++) if (b[i] === 0) es.push(i)
    const truth = es.map(i => { b[i] = turn; const v = exact(b, turn === 1 ? 2 : 1, turn, 1); b[i] = 0; return v })
    const best = Math.max.apply(null, truth)
    const g = ttt.newGame(turn)
    g.board = b.slice()
    g.turn = turn
    const idx = es.indexOf(ttt.aiMove(g, 3))
    checked++
    if (idx < 0 || truth[idx] < best) bad++
    for (const i of es) { b[i] = turn; walk(b, turn === 1 ? 2 : 1); b[i] = 0 }
  }
  walk([0, 0, 0, 0, 0, 0, 0, 0, 0], 1)
  assert.equal(bad, 0, bad + '/' + checked + ' 个局面的走法不是最优')
  assert.ok(checked > 200000, '局面数异常：' + checked)
})

test('AI 会立刻成三（有胜势必走）', () => {
  const g = ttt.newGame(1)
  // X: 0,1  O: 3,4  -> X 应走 2 获胜
  ttt.play(g, 0); ttt.play(g, 3)
  ttt.play(g, 1); ttt.play(g, 4)
  assert.equal(g.turn, 1)
  assert.equal(ttt.aiMove(g, 3), 2)
})

test('AI 会挡住对手的成三（普通级也挡）', () => {
  const g = ttt.newGame(1)
  // O 已有 3,4 ；轮到 X 走；X 落完后轮到 O
  ttt.play(g, 0)   // X
  ttt.play(g, 3)   // O
  ttt.play(g, 8)   // X 形成 0-4-8 的杀棋
  // 轮到 O，必须堵在 4
  assert.equal(ttt.aiMove(g, 2), 4)
})

/* ============================ 汇总 ============================ */
const failed = results.filter(r => !r.ok)
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
