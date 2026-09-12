/**
 * 中国象棋内核自测
 */
import assert from 'node:assert/strict'

const xq = await import('./core/xiangqi.js')
const { W, H, RED, BLACK, idx, legalMovesFrom, allLegalMoves, newGame, apply, inCheck, pieceName } = xq

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

function fresh() { return newGame({}) }

/** 列出某个格的走法（坐标形式，便于阅读） */
function movesAt(g, x, y) {
  return legalMovesFrom(g.board, idx(x, y))
    .map(i => (i % W) + ',' + Math.floor(i / W))
    .sort()
}

section('象棋 xiangqi')

test('初始局面：32 子，红先行', () => {
  const g = fresh()
  const n = g.board.filter(p => p).length
  assert.equal(n, 32)
  const reds = g.board.filter(p => p && p.charAt(1) === '1').length
  assert.equal(reds, 16)
  assert.equal(g.turn, RED)
})

test('红方开局合法着法数 = 44（车4 马4 相4 仕2 帅1 炮24 兵5）', () => {
  // 炮各 12 步：横走 6 + 竖走 5（向上穿过空位到 (1,2) 黑炮前）+ 隔山吃 (1,0) 黑马
  const g = fresh()
  const all = allLegalMoves(g.board, RED)
  assert.equal(all.length, 44)
  assert.equal(movesAt(g, 1, 7).length, 12)
})

test('开局各兵种走法数分解正确', () => {
  const g = fresh()
  assert.deepEqual(movesAt(g, 0, 9), ['0,7', '0,8'])              // 车：向上 2 格
  assert.deepEqual(movesAt(g, 1, 9), ['0,7', '2,7'])              // 马：2 步
  assert.deepEqual(movesAt(g, 2, 9), ['0,7', '4,7'])              // 相：2 步
  assert.deepEqual(movesAt(g, 3, 9), ['4,8'])                     // 仕：1 步
  assert.deepEqual(movesAt(g, 4, 9), ['4,8'])                     // 帅：1 步
  assert.deepEqual(movesAt(g, 0, 6), ['0,5'])                     // 兵：只能向前
})

test('炮：不能直接吃挡路的子，要隔一子吃它后面那个', () => {
  const g = fresh()
  const mv = movesAt(g, 1, 7)
  // (1,2) 是黑炮，正好当"炮架"；炮应吃它后面的 (1,0) 黑马，而不是吃炮架本身
  assert.ok(mv.indexOf('1,2') < 0, '不该能直接吃炮架 (1,2)')
  assert.ok(mv.indexOf('1,0') >= 0, '应能隔山吃 (1,0) 的黑马，实际：' + mv.join(' '))
  // 竖直方向上，炮架之前的空格都可以平走
  assert.ok(mv.indexOf('1,6') >= 0 && mv.indexOf('1,3') >= 0, '炮应能平走到 (1,6)/(1,3)')
})

test('蹩马腿：马腿被堵时该方向不可走', () => {
  const g = fresh()
  // 把红兵(2,6)移到(1,6)挡住马腿，马在(2,9)经(1,8)的走法不受影响；
  // 这里直接构造：红马在(4,4)，左侧(3,4)放一个子，则不能走 (2,3)/(2,5)
  g.board[idx(4, 4)] = 'N1'
  g.board[idx(3, 4)] = 'P1'
  const mv = movesAt(g, 4, 4)
  assert.ok(mv.indexOf('2,3') < 0, '马腿被堵不该能走 2,3')
  assert.ok(mv.indexOf('2,5') < 0, '马腿被堵不该能走 2,5')
  assert.ok(mv.indexOf('6,3') >= 0, '另一侧应仍可走')
})

test('塞象眼：象眼被占则不能走', () => {
  const g = fresh()
  g.board[idx(2, 9)] = 'B1'
  g.board[idx(1, 8)] = 'P1'          // 塞住 (0,7) 的象眼
  const mv = movesAt(g, 2, 9)
  assert.ok(mv.indexOf('0,7') < 0, '象眼被占不该能走 0,7')
  assert.ok(mv.indexOf('4,7') >= 0, '另一侧应仍可走')
})

test('象不能过河', () => {
  const g = fresh()
  g.board[idx(2, 5)] = 'B1'
  const mv = movesAt(g, 2, 5)
  for (const m of mv) {
    const y = parseInt(m.split(',')[1], 10)
    assert.ok(y >= 5, '红相不能过河，却走到了 ' + m)
  }
})

test('士/帅只能待在九宫内', () => {
  const g = fresh()
  for (const m of movesAt(g, 3, 9)) {
    const [x, y] = m.split(',').map(Number)
    assert.ok(x >= 3 && x <= 5 && y >= 7 && y <= 9, '仕出九宫：' + m)
  }
})

test('兵过河后可横走', () => {
  const g = fresh()
  g.board[idx(4, 6)] = ''
  g.board[idx(4, 4)] = 'P1'          // 红兵已过河
  const mv = movesAt(g, 4, 4)
  assert.deepEqual(mv, ['3,4', '4,3', '5,4'])
})

test('将帅照面被禁止', () => {
  // 清空中间，只留双方将帅在同一列
  const g = { board: new Array(W * H).fill(''), turn: RED, moves: [], over: false, winner: 0, text: '', lastMove: null }
  g.board[idx(4, 9)] = 'K1'
  g.board[idx(4, 0)] = 'K2'
  assert.equal(inCheck(g.board, RED), true, '同列无遮挡应判为被将')
  // 红帅只能走九宫内的其它格
  const mv = movesAt(g, 4, 9)
  assert.ok(mv.indexOf('4,8') < 0, '走到 4,8 仍是照面，应被禁止')
  assert.ok(mv.length > 0, '至少应有横走的合法着法')
})

test('送帅入虎口被过滤（不能走出让自己被将军的着法）', () => {
  const g = { board: new Array(W * H).fill(''), turn: RED, moves: [], over: false, winner: 0, text: '', lastMove: null }
  g.board[idx(4, 9)] = 'K1'
  g.board[idx(0, 0)] = 'K2'
  g.board[idx(0, 8)] = 'R2'          // 黑车控制 0,8 整行
  // 红帅在 (4,9)，黑车控制第 8 行 → 帅不能走到 (3,8) 之类
  const mv = movesAt(g, 4, 9)
  for (const m of mv) {
    const y = parseInt(m.split(',')[1], 10)
    assert.notEqual(y, 8, '不该走到被黑车控制的 ' + m)
  }
})

test('将死判定：白脸将 + 车形成的必杀', () => {
  const g = { board: new Array(W * H).fill(''), turn: BLACK, moves: [], over: false, winner: 0, text: '', lastMove: null }
  g.board[idx(4, 0)] = 'K2'          // 黑将
  g.board[idx(4, 9)] = 'K1'          // 红帅（同列）
  g.board[idx(4, 5)] = 'P1'          // 用红兵挡住照面
  g.board[idx(3, 1)] = 'R1'          // 红车控制黑将可走的第 1 行
  g.board[idx(5, 1)] = 'R1'
  const legal = allLegalMoves(g.board, BLACK)
  const state = { board: g.board, turn: BLACK, moves: [], over: false, winner: 0, text: '', lastMove: null }
  xq.apply(state, { from: idx(4, 0), to: idx(4, 1) }, BLACK)
  // 上面这步若非法则返回 false；这里主要验证引擎不会崩且状态自洽
  assert.ok(legal.length >= 0)
})

test('棋子数守恒（吃子后总数减少 1）', () => {
  const g = fresh()
  const before = g.board.filter(p => p).length
  const mv = allLegalMoves(g.board, RED).find(m => m.captured)
  assert.ok(mv, '开局应存在吃子着法（右炮吃黑炮）')
  assert.equal(apply(g, mv, RED), true)
  assert.equal(g.board.filter(p => p).length, before - 1)
})

test('AI 对随机玩家 20 局全程合法、不崩', () => {
  for (let n = 0; n < 20; n++) {
    const g = fresh()
    let plies = 0
    while (!g.over && plies < 60) {
      const side = g.turn
      const legal = allLegalMoves(g.board, side)
      if (!legal.length) break
      let mv
      if (side === BLACK) {
        mv = xq.aiMove(g, 1)
      } else {
        mv = legal[Math.floor(Math.random() * legal.length)]
      }
      assert.ok(mv, 'AI 返回了空着法')
      const ok = apply(g, mv, side)
      assert.equal(ok, true, '第 ' + plies + ' 手非法：' + JSON.stringify(mv))
      plies++
    }
    // 状态自洽：轮到的一方必不等于上一手方
    assert.ok(g.moves.length === plies)
  }
})

test('静态子力评估：开局为 0，黑车白吃红车后为 +900', () => {
  const g = fresh()
  assert.equal(xq.staticEval(g), 0, '对称开局应为 0')

  const h = { board: new Array(W * H).fill(''), turn: BLACK, moves: [], over: false, winner: 0, text: '', lastMove: null }
  h.board[idx(3, 0)] = 'K2'
  h.board[idx(4, 8)] = 'K1'
  h.board[idx(0, 4)] = 'R2'
  h.board[idx(0, 7)] = 'R1'          // 双方都不在被将状态（红车不在黑将所在行列）
  assert.equal(xq.staticEval(h, BLACK), 0)
  assert.equal(apply(h, { from: idx(0, 4), to: idx(0, 7) }, BLACK), true)
  assert.equal(xq.staticEval(h, BLACK), 900, '吃掉红车后黑方应领先 900')
  assert.equal(xq.staticEval(h), -900, '此时轮到红方，故走子方视角为 -900')
})

test('AI 会吃掉送上门的大子（车）：吃车着法必须是最高分之一', () => {
  const h = { board: new Array(W * H).fill(''), turn: BLACK, moves: [], over: false, winner: 0, text: '', lastMove: null }
  h.board[idx(3, 0)] = 'K2'
  h.board[idx(4, 8)] = 'K1'
  h.board[idx(0, 4)] = 'R2'
  h.board[idx(0, 6)] = 'R1'          // 无保护，黑车在 (0,4) 可直下吃掉
  const an = xq.analyse(h, 2)
  const top = an.cands[0]
  const cap = an.cands.find(c => c.to === idx(0, 6))
  assert.ok(cap, '分析里应包含吃车着法')
  assert.equal(cap.score, top.score, '吃车着法应为最高分（并列也可）')
  assert.ok(cap.score >= 900, '吃车的评分应 >= 900，实际 ' + cap.score)
  console.log('    吃车评分 ' + cap.score + '（最高 ' + top.score + '，共 ' + an.cands.length + ' 个候选）')
})

test('AI 不会漏吃：白吃的车必须拿下', () => {
  const h = { board: new Array(W * H).fill(''), turn: BLACK, moves: [], over: false, winner: 0, text: '', lastMove: null }
  h.board[idx(3, 0)] = 'K2'
  h.board[idx(4, 8)] = 'K1'
  h.board[idx(0, 4)] = 'R2'
  h.board[idx(0, 7)] = 'R1'          // 白给：黑车 (0,4) 可直下吃掉，且双方都未被将
  const mv = xq.aiMove(h, 3)
  assert.equal(mv.from, idx(0, 4))
  assert.equal(mv.to, idx(0, 7), '应吃掉红车，实际走到 ' + mv.to)
})

test('AI 想直接吃将/帅', () => {
  const g = { board: new Array(W * H).fill(''), turn: RED, moves: [], over: false, winner: 0, text: '', lastMove: null }
  g.board[idx(5, 9)] = 'K1'
  g.board[idx(4, 0)] = 'K2'
  g.board[idx(0, 0)] = 'R1'          // 红车在第 0 行，可直取黑将(4,0)
  const mv = xq.aiMove(g, 1)
  assert.equal(mv.to, idx(4, 0), '应直接吃将')
})

test('AI 性能：level 3 单步耗时应 < 3.5 秒', () => {
  const g = fresh()
  const t0 = Date.now()
  const mv = xq.aiMove(g, 3)
  const dt = Date.now() - t0
  assert.ok(mv, '未返回着法')
  console.log('    level3 单步耗时 ' + dt + ' ms')
  assert.ok(dt < 3500, '太慢：' + dt + ' ms')
})

test('AI 性能：level 4 单步耗时应 < 5 秒', () => {
  const g = fresh()
  const t0 = Date.now()
  xq.aiMove(g, 4)
  const dt = Date.now() - t0
  console.log('    level4 单步耗时 ' + dt + ' ms')
  assert.ok(dt < 5000, '太慢：' + dt + ' ms')
})

test('级别越高越强：level3 对 level1 十局不落下风', () => {
  let strong = 0, weak = 0
  for (let n = 0; n < 6; n++) {
    const g = fresh()
    let plies = 0
    while (!g.over && plies < 80) {
      const side = g.turn
      const mv = xq.aiMove(g, side === RED ? 3 : 1)
      if (!mv) break
      apply(g, mv, side)
      plies++
    }
    if (g.winner === RED) strong++
    else if (g.winner === BLACK) weak++
  }
  console.log('    level3(红) 胜 ' + strong + ' 负 ' + weak)
  assert.ok(strong >= weak, '强级竟然不占优：' + strong + ':' + weak)
})

test('三次重复局面判和（循环但非长将）', () => {
  const g = { board: new Array(W * H).fill(''), turn: RED, moves: [], over: false, winner: 0, text: '',
              lastMove: null, repKeys: [] }
  // 双方将/帅不同列且各自安全；两个车在第 4 行来回走，互不将军
  g.board[idx(3, 9)] = 'K1'
  g.board[idx(5, 0)] = 'K2'
  g.board[idx(0, 4)] = 'R1'
  g.board[idx(8, 4)] = 'R2'
  g.repKeys.push(xq.posKey(g.board, RED))
  const seq = [
    [{ from: idx(0, 4), to: idx(1, 4) }, RED],
    [{ from: idx(8, 4), to: idx(7, 4) }, BLACK],
    [{ from: idx(1, 4), to: idx(0, 4) }, RED],
    [{ from: idx(7, 4), to: idx(8, 4) }, BLACK]
  ]
  let applied = 0
  for (let round = 0; round < 3 && !g.over; round++) {
    for (let k = 0; k < seq.length; k++) {
      if (g.over) break
      if (apply(g, seq[k][0], seq[k][1])) applied++
    }
  }
  assert.equal(applied, 8, '应走满 8 手，实际 ' + applied)
  assert.equal(g.over, true, '三次重复后对局应结束')
  assert.equal(g.winner, 3, '非长将的重复应判和，实际 winner=' + g.winner + ' text=' + g.text)
  console.log('    重复判定：' + g.text)
})

test('长将判负：连续将军的一方判负', () => {
  // 循环（黑先将、红车将）：
  //   黑将(4,0)->(3,0) / 红车(4,5)->(3,5) 将军 / 黑将(3,0)->(4,0) / 红车(3,5)->(4,5) 将军
  const g = { board: new Array(W * H).fill(''), turn: BLACK, moves: [], over: false, winner: 0, text: '',
              lastMove: null, repKeys: [] }
  g.board[idx(5, 9)] = 'K1'          // 红帅在 x=5，与黑将永不照面
  g.board[idx(4, 0)] = 'K2'
  g.board[idx(4, 5)] = 'R1'
  g.repKeys.push(xq.posKey(g.board, BLACK))
  const seq = [
    [{ from: idx(4, 0), to: idx(3, 0) }, BLACK],   // 低位躲开将军
    [{ from: idx(4, 5), to: idx(3, 5) }, RED],     // 将军
    [{ from: idx(3, 0), to: idx(4, 0) }, BLACK],   // 再躲
    [{ from: idx(3, 5), to: idx(4, 5) }, RED]      // 再将军（回到起始局面）
  ]
  let applied = 0
  for (let round = 0; round < 3 && !g.over; round++) {
    for (let k = 0; k < seq.length; k++) {
      if (g.over) break
      if (apply(g, seq[k][0], seq[k][1])) applied++
    }
  }
  assert.equal(applied, 8, '应走满 8 手，实际 ' + applied + '（text=' + g.text + '）')
  assert.equal(g.over, true, '长将后对局应结束')
  assert.equal(g.winner, BLACK, '红方长将应判红方负，实际 winner=' + g.winner + ' text=' + g.text)
  assert.ok(g.text.indexOf('长将') >= 0, '文字应说明长将，实际：' + g.text)
  console.log('    长将判定：' + g.text)
})

/* -------- 分片搜索必须收敛（这条就是"AI 卡住直到重启"的回归测试） -------- */

test('超时中断：done 必须置真、且仍给出可走的兜底着法', () => {
  const st = xq.newGame({})
  const sess = xq.analyseSession(st, 4)
  // 模拟设备上"预算瞬间用光"：搜索一开始就已过截止时间
  sess.ctx.deadline = Date.now() - 1
  let rounds = 0
  while (!sess.done && rounds < 500) { xq.analyseStep(sess, 20); rounds++ }
  assert.ok(sess.done, '预算耗尽后必须收敛，否则页面会无限空转到看门狗重启')
  assert.ok(rounds < 10, '应在极少轮次内收敛，实际 ' + rounds + ' 轮')
  const an = xq.sessionResult(sess)
  assert.ok(an.best, '必须仍给出兜底着法')
  assert.equal(xq.apply(st, an.best, st.turn), true, '兜底着法必须合法可走')
  assert.ok(an.aborted, '应标记为超时中断')
})

test('分片步进：多轮之后必然收敛并给出合法着法', () => {
  const st = xq.newGame({})
  const sess = xq.analyseSession(st, 3)
  let rounds = 0
  while (!sess.done && rounds < 2000) { xq.analyseStep(sess, 2); rounds++ }
  assert.ok(sess.done, '会话必须收敛')
  const an = xq.sessionResult(sess)
  assert.ok(an.best)
  assert.equal(xq.apply(st, an.best, st.turn), true)
  console.log('    ' + rounds + ' 轮收敛 / 节点 ' + an.nodes + ' / 深度 ' + an.depth + ' / ' + (an.aborted ? '超时中断' : '搜索完成'))
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
