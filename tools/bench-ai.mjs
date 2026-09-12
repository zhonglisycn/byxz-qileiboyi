/**
 * 各棋种 AI 单步耗时基准（Node）
 * 用途：手环上"同步长计算"会阻塞 JS 线程、可能触发看门狗重启，
 * 所以要把每步的阻塞时间压到很低的量级。桌面实测值 × 手环倍率（经验 10~20x）。
 *
 * 用法：node tools/bench-ai.mjs（需先拷到带 package.json type:module 的目录，见 tools/run-tests.sh 的做法）
 */
const games = {
  ttt: async () => {
    const m = await import('./core/ttt.js')
    const g = m.newGame(1)
    ;[0, 4, 8].forEach(i => m.playKeepHistory(g, i))
    return { m, st: g, lv: 3, name: 'ttt' }
  },
  gomoku: async () => {
    const m = await import('./core/gomoku.js')
    const st = m.newGame({ board: 19 })
    const seq = [180, 181, 200, 199, 162, 218, 219]
    for (const i of seq) m.apply(st, { i }, st.turn)
    return { m, st, lv: 3, name: 'gomoku' }
  },
  go: async () => {
    const m = await import('./core/go.js')
    const st = m.newGame({ board: 19, judge: 'capture', target: 30 })
    const pts = [[3, 3], [15, 15], [3, 15], [15, 3], [9, 3], [9, 15], [2, 9], [16, 9]]
    pts.forEach((p, k) => { st.board[p[1] * 19 + p[0]] = (k % 2 === 0) ? 1 : 2 })
    return { m, st, lv: 4, name: 'go' }
  },
  xiangqi: async () => {
    const m = await import('./core/xiangqi.js')
    const st = m.newGame({})
    const mv = [{ from: 58, to: 49 }, { from: 4, to: 13 }, { from: 55, to: 66 }]
    for (const v of mv) m.apply(st, v, st.turn)
    return { m, st, lv: 4, name: 'xiangqi' }
  },
  chess8: async () => {
    const m = await import('./core/chess8.js')
    const st = m.newGame({})
    const all = m.legalMoves(st, st.turn)
    m.apply(st, all[0], st.turn)
    return { m, st, lv: 3, name: 'chess8' }
  },
  jungle: async () => {
    const m = await import('./core/jungle.js')
    const st = m.newGame({})
    return { m, st, lv: 3, name: 'jungle' }
  },
  junqi: async () => {
    const m = await import('./core/junqi.js')
    const st = m.newGame({ variant: 'hidden' })
    return { m, st, lv: 2, name: 'junqi' }
  },
  aeroplane: async () => {
    const m = await import('./core/aeroplane.js')
    const st = m.newGame({})
    // 走几回合让局面展开
    for (let k = 0; k < 12; k++) {
      const mv = m.aiMove(st, 1)
      if (mv) m.apply(st, mv, st.turn)
    }
    return { m, st, lv: 2, name: 'aeroplane' }
  }
}

const only = process.argv.slice(2)
const rows = []
for (const key of Object.keys(games)) {
  if (only.length && only.indexOf(key) < 0) continue
  let ctx
  try { ctx = await games[key]() } catch (e) { rows.push([key, 'setup失败: ' + e.message]); continue }
  const { m, st, lv } = ctx
  const times = []
  for (let k = 0; k < 3; k++) {
    const t0 = Date.now()
    let mv = null
    try { mv = m.aiMove(st, lv) } catch (e) { rows.push([key, 'aiMove 抛错: ' + e.message]); mv = undefined }
    const dt = Date.now() - t0
    if (mv === undefined) break
    times.push(dt)
    if (mv && !mv.pass && !mv.flip) { try { m.apply(st, mv, st.turn) } catch (e) {} }
  }
  if (times.length) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length)
    const mx = Math.max.apply(null, times)
    rows.push([key + ' (lv' + lv + ')', avg + ' ms 平均 / ' + mx + ' ms 最大'])
  }
}
console.log('桌面实测（手环上通常再慢 10~20 倍）：')
for (const r of rows) console.log('  ' + r[0].padEnd(18) + r[1])
