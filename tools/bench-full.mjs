/**
 * 整局 AI 对 AI 基准：按默认设置（等级/盘面）从头下到结束，逐步计时。
 *
 * 为什么要有这个：bench-ai.mjs 只测开局固定局面的 3 步，残局（棋盘快满、候选点多、
 * 将军/吃子分支多）才是真正会卡死手环的地方。这里打满整局，暴露最慢的那一步。
 *
 * 用法：拷到带 package.json type:module 的目录后 node bench-full.mjs [棋种...]
 * 判读：桌面耗时 × 10~20 ≈ 手环耗时；单步超过 ~50ms 桌面就可能在手环上明显卡顿。
 */
const LEVEL = parseInt(process.env.LV || '1', 10)
const MAX_STEPS = 400
const BUDGET_MS = 40000

const games = {
  ttt: async () => {
    const m = await import('./core/ttt.js')
    return { m, st: m.newGame(1), lv: LEVEL, name: '井字棋', apply: (m, st, mv) => m.playKeepHistory(st, mv.i !== undefined ? mv.i : mv) }
  },
  wzq: async () => {
    const m = await import('./core/gomoku.js')
    return { m, st: m.newGame({ board: 15 }), lv: LEVEL, name: '五子棋15', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  },
  wq: async () => {
    const m = await import('./core/go.js')
    return {
      m, st: m.newGame({ board: 19, judge: 'capture', target: 10 }), lv: LEVEL, name: '围棋19',
      apply: (m, st, mv) => m.apply(st, mv, st.turn)
    }
  },
  xq: async () => {
    const m = await import('./core/xiangqi.js')
    return { m, st: m.newGame({}), lv: LEVEL, name: '象棋', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  },
  gjxq: async () => {
    const m = await import('./core/chess8.js')
    return { m, st: m.newGame({}), lv: LEVEL, name: '国际象棋', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  },
  jq: async () => {
    const m = await import('./core/junqi.js')
    return { m, st: m.newGame({ variant: 'hidden' }), lv: LEVEL, name: '军棋暗棋', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  },
  dsq: async () => {
    const m = await import('./core/jungle.js')
    return { m, st: m.newGame({}), lv: LEVEL, name: '斗兽棋', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  },
  fxq: async () => {
    const m = await import('./core/aeroplane.js')
    return { m, st: m.newGame({}), lv: LEVEL, name: '飞行棋', apply: (m, st, mv) => m.apply(st, mv, st.turn) }
  }
}

function result(m, st) {
  try { return m.result(st) } catch (e) { return null }
}

const only = process.argv.slice(2)
for (const key of Object.keys(games)) {
  if (only.length && only.indexOf(key) < 0) continue
  let ctx
  try { ctx = await games[key]() } catch (e) { console.log(key + ': setup 失败 ' + e.message); continue }
  const { m, st, lv, name } = ctx
  const times = []
  let steps = 0
  let over = 0
  const t0 = Date.now()
  while (steps < MAX_STEPS) {
    const r = result(m, st)
    if (r && r.over) break
    let mv = null
    const a = Date.now()
    try { mv = m.aiMove(st, lv) } catch (e) { console.log('  ' + key + ' aiMove 抛错: ' + e.message); break }
    const dt = Date.now() - a
    times.push(dt)
    if (dt > 50) over++
    if (mv === undefined || mv === null) break
    try { ctx.apply(m, st, mv) } catch (e) { console.log('  ' + key + ' apply 抛错: ' + e.message); break }
    steps++
    if (Date.now() - t0 > BUDGET_MS) { console.log('  ' + key + ' 超过 ' + (BUDGET_MS / 1000) + 's 预算，提前停止'); break }
  }
  if (!times.length) { console.log(name.padEnd(12) + ' 没有测到步数'); continue }
  const sorted = times.slice().sort((a, b) => a - b)
  const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || sorted[sorted.length - 1]
  const mx = sorted[sorted.length - 1]
  console.log(
    name.padEnd(10) + ' 步数 ' + String(times.length).padStart(3) +
    '  平均 ' + String(avg).padStart(4) + 'ms' +
    '  p95 ' + String(p95).padStart(4) + 'ms' +
    '  最慢 ' + String(mx).padStart(5) + 'ms' +
    '  >50ms 的步数 ' + over +
    '  （手环约 ×10~20）'
  )
}
