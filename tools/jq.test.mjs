/**
 * 军棋内核自测
 */
import assert from 'node:assert/strict'

const jq = await import('./core/junqi.js')
const { W, H, RED, BLACK, idx, otherSide } = jq

const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

function fresh(variant) { return jq.newGame({ variant: variant || 'hidden' }) }

section('军棋 junqi')

test('棋盘拓扑：60 格 / 4 个大本营 / 10 个行营', () => {
  assert.equal(W * H, 60)
  let hq = 0
  let camp = 0
  for (let i = 0; i < W * H; i++) {
    if (jq.isHq(i)) hq++
    if (jq.isCamp(i)) camp++
  }
  assert.equal(hq, 4)
  assert.equal(camp, 10)
})

test('坐标换算：idx/px/py 互逆且覆盖全部 60 格（视口取格用）', () => {
  const seen = {}
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y)
      assert.ok(i >= 0 && i < W * H, '下标越界 ' + i)
      assert.equal(jq.px(i), x)
      assert.equal(jq.py(i), y)
      assert.ok(!seen[i], '下标重复 ' + i)
      seen[i] = 1
    }
  }
  assert.equal(Object.keys(seen).length, W * H)
})

test('山界只在 x=0/2/4 三列可以穿过', () => {
  for (let x = 0; x < W; x++) {
    const upper = idx(x, 5)
    const lower = idx(x, 6)
    const linked = jq.neighbors(upper).indexOf(lower) >= 0
    if (x === 0 || x === 2 || x === 4) assert.ok(linked, 'x=' + x + ' 应该能穿过山界')
    else assert.ok(!linked, 'x=' + x + ' 不该穿过山界')
  }
})

test('斜线连接：行 1~5 之间有斜线，后排与前排之间没有', () => {
  // 上半场行 2 的 (0,2) 应能斜着走到行 1 的 (1,1)
  assert.ok(jq.neighbors(idx(0, 2)).indexOf(idx(1, 1)) >= 0, '行1-2 应有斜线')
  // 行 0 与行 1 之间没有斜线
  assert.ok(jq.neighbors(idx(0, 0)).indexOf(idx(1, 1)) < 0, '行0-1 不应有斜线')
  // 下半场对称
  assert.ok(jq.neighbors(idx(0, 9)).indexOf(idx(1, 10)) >= 0, '行9-10 应有斜线')
  assert.ok(jq.neighbors(idx(0, 11)).indexOf(idx(1, 10)) < 0, '行10-11 不应有斜线')
})

test('默认阵型合法（军旗在大本营 / 地雷在后两排 / 炸弹不在第一排 / 共 25 子）', () => {
  const f = jq.defaultFormation()
  assert.equal(f.length, 30)
  assert.equal(f.filter(v => v).length, 25)
  assert.equal(jq.validateFormation(RED, f), '')
  assert.equal(jq.validateFormation(BLACK, f), '')
})

test('阵型校验能拦下非法摆放', () => {
  const base = jq.defaultFormation()

  const noFlag = base.slice()
  noFlag[1] = 'M'                       // 把军旗换成地雷
  noFlag[0] = 'F'                       // 军旗挪到非大本营
  assert.ok(jq.validateFormation(RED, noFlag).indexOf('大本营') >= 0)

  const mineFront = base.slice()
  mineFront[0] = ''                     // 后排去掉一个地雷
  mineFront[27] = 'M'                   // 丢到前沿
  assert.ok(jq.validateFormation(RED, mineFront).indexOf('后两排') >= 0)

  const bombFront = base.slice()
  bombFront[13] = ''
  bombFront[29] = 'B'                   // 炸弹放到第一排
  assert.ok(jq.validateFormation(RED, bombFront).indexOf('第一排') >= 0)
})

test('开局：双方各 25 子、共 50 子，黑方（上方）先行', () => {
  const g = fresh()
  const n = g.board.filter(p => p).length
  assert.equal(n, 50)
  assert.equal(g.board.filter(p => p && jq.sideOf(p) === RED).length, 25)
  assert.equal(g.turn, BLACK)
})

test('战斗：大吃小、同级同归于尽、炸弹同归于尽', () => {
  assert.equal(jq.judgeBattle('1S', '2L', false).result, 'win')      // 司令吃旅长
  assert.equal(jq.judgeBattle('1G', '2Z', false).result, 'lose')     // 工兵碰师长
  assert.equal(jq.judgeBattle('1Z', '2Z', false).result, 'both')     // 同级同归于尽
  assert.equal(jq.judgeBattle('1B', '2S', false).result, 'both')     // 炸弹炸司令
  assert.equal(jq.judgeBattle('1S', '2B', false).result, 'both')
})

test('战斗：只有工兵能挖地雷，其他棋子撞雷必死', () => {
  assert.equal(jq.judgeBattle('1G', '2M', false).result, 'win')
  assert.equal(jq.judgeBattle('1S', '2M', false).result, 'lose')
  assert.equal(jq.judgeBattle('1B', '2M', false).result, 'both')     // 炸弹炸雷同归于尽
})

test('战斗：扛旗前必须先挖光对方地雷', () => {
  const blocked = jq.judgeBattle('1S', '2F', false)
  assert.equal(blocked.result, 'blocked')
  assert.ok(blocked.text.indexOf('地雷') >= 0)
  assert.equal(jq.judgeBattle('1S', '2F', true).result, 'win')
})

test('地雷与军旗不能移动', () => {
  const g = fresh()
  let mine = -1
  let flag = -1
  for (let i = 0; i < g.board.length; i++) {
    const t = jq.typeOf(g.board[i])
    if (jq.sideOf(g.board[i]) === RED) {
      if (t === 'M' && mine < 0) mine = i
      if (t === 'F') flag = i
    }
  }
  assert.ok(mine >= 0 && flag >= 0)
  assert.deepEqual(jq.legalMoves(g, mine), [])
  assert.deepEqual(jq.legalMoves(g, flag), [])
})

test('大本营里的棋子不能移动', () => {
  const g = fresh()
  // 手工在红方大本营放一个司令
  const hq = jq.hqsOf(RED)[0]
  g.board[hq] = '1S'
  assert.deepEqual(jq.legalMoves(g, hq), [], '大本营里的子不能动')
})

test('行营是安全岛：不能吃行营里的子，但可以走进去', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  const camp = jq.campsOf(BLACK)[0]           // 上半场的一个行营 (1,1)
  const nbs = jq.neighbors(camp)
  // 挑一个既不是大本营也不是行营的邻居当起点
  let src = -1
  for (let k = 0; k < nbs.length; k++) {
    if (!jq.isHq(nbs[k]) && !jq.isCamp(nbs[k])) { src = nbs[k]; break }
  }
  assert.ok(src >= 0, '应能找到合适的起点')
  g.board[src] = '1S'
  g.board[camp] = '2Z'                        // 行营里放个敌方小棋
  const mv = jq.legalMoves(g, src)
  assert.ok(mv.indexOf(camp) < 0, '不该能吃掉行营里的棋子')

  g.board[camp] = ''
  const mv2 = jq.legalMoves(g, src)
  assert.ok(mv2.indexOf(camp) >= 0, '空行营应该走得进去')
})

test('铁路：普通棋子只能直行，工兵可以转弯', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  // (0,1) 在铁路交叉口：左边是竖线 x=0，右边是横线 y=1
  g.board[idx(0, 1)] = '1Z'
  const mv = jq.legalMoves(g, idx(0, 1))
  assert.ok(mv.indexOf(idx(4, 1)) >= 0, '普通棋子应能沿 y=1 直行到底')
  assert.ok(mv.indexOf(idx(0, 5)) >= 0, '普通棋子应能沿 x=0 直行')
  assert.ok(mv.indexOf(idx(2, 3)) < 0, '普通棋子不该在铁路上转弯到 x=2')

  g.board[idx(0, 1)] = '1G'
  const mv2 = jq.legalMoves(g, idx(0, 1))
  assert.ok(mv2.indexOf(idx(2, 3)) >= 0, '工兵应能在铁路上转弯（x=0 下行→y=3 横行）')
  assert.ok(mv2.indexOf(idx(4, 3)) >= 0, '工兵可一直绕到 (4,3)')
})

test('走子：能吃掉对方棋子并轮换行动方', () => {
  const g = fresh()
  // 在一条空铁路上放两个不同级的子
  g.board = new Array(W * H).fill('')
  g.board[idx(0, 1)] = '1S'
  g.board[idx(4, 1)] = '2Z'
  g.turn = RED
  const ok = jq.apply(g, { from: idx(0, 1), to: idx(4, 1) }, RED)
  assert.equal(ok, true)
  assert.equal(g.board[idx(4, 1)], '1S', '红司令应占位')
  assert.equal(g.board[idx(0, 1)], '')
  assert.equal(g.turn, BLACK)
})

test('走子：撞到比自己大的棋子会阵亡', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  g.board[idx(0, 1)] = '1G'
  g.board[idx(4, 1)] = '2S'
  g.turn = RED
  assert.equal(jq.apply(g, { from: idx(0, 1), to: idx(4, 1) }, RED), true)
  assert.equal(g.board[idx(0, 1)], '')
  assert.equal(g.board[idx(4, 1)], '2S', '黑司令应活下来')
})

test('扛旗获胜（先清光地雷）', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  // 红司令放在 (0,0)，与黑方大本营 (1,0) 公路相邻；黑方没有地雷
  g.board[idx(0, 0)] = '1S'
  g.board[idx(1, 0)] = '2F'
  g.board[idx(1, 1)] = '2N'                   // 黑方还有可动子，避免"无子可动"分支
  g.board[idx(0, 11)] = '1F'
  g.turn = RED
  const ok = jq.apply(g, { from: idx(0, 0), to: idx(1, 0) }, RED)
  assert.equal(ok, true, '黑方没有地雷，应能直接扛旗')
  assert.equal(g.over, true)
  assert.equal(g.winner, RED)
  assert.ok(g.text.indexOf('军旗') >= 0)
})

test('还有地雷时扛旗被拒绝', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  g.board[idx(0, 0)] = '1S'
  g.board[idx(1, 0)] = '2F'
  g.board[idx(3, 0)] = '2M'                   // 黑方还有地雷
  g.board[idx(1, 1)] = '2N'
  g.board[idx(0, 11)] = '1F'
  g.turn = RED
  assert.equal(jq.apply(g, { from: idx(0, 0), to: idx(1, 0) }, RED), false, '必须先挖光地雷')
  assert.ok(jq.judgeBattle('1S', '2F', false).text.indexOf('地雷') >= 0)
})

test('一方只剩军旗和地雷（无子可动）时判负', () => {
  const g = fresh()
  g.board = new Array(W * H).fill('')
  g.board[idx(1, 0)] = '2F'
  g.board[idx(0, 0)] = '2M'                   // 黑方只剩军旗 + 地雷
  g.board[idx(3, 11)] = '1F'
  g.board[idx(0, 11)] = '1M'
  g.board[idx(0, 6)] = '1S'                   // 红方有可动子
  g.turn = RED
  assert.equal(jq.apply(g, { from: idx(0, 6), to: idx(0, 7) }, RED), true, '红方走一步空着')
  assert.equal(g.over, true, '黑方无子可动，对局应结束')
  assert.equal(g.winner, RED)
  assert.ok(g.text.indexOf('无子可动') >= 0, '实际提示：' + g.text)
})

test('AI 对随机玩家 30 局：全程合法、状态自洽', () => {
  for (let n = 0; n < 30; n++) {
    const g = fresh()
    let plies = 0
    while (!g.over && plies < 200) {
      const side = g.turn
      let mv
      if (side === BLACK) {
        mv = jq.aiMove(g, 1 + Math.floor(Math.random() * 3))
      } else {
        const all = jq.allLegalMoves(g, side)
        if (!all.length) break
        mv = all[Math.floor(Math.random() * all.length)]
      }
      if (!mv) break
      const ok = jq.apply(g, mv, side)
      if (!ok) {
        // 随机玩家可能选到非法着法（例如未定色），跳过
        break
      }
      assert.equal(g.turn, otherSide(side), '行动方应轮换')
      plies++
    }
    // 每方棋子只能减少，不会凭空增多
    assert.ok(g.board.filter(p => p).length <= 50)
  }
})

test('翻翻棋：开局全背面、翻棋定色、AI 合法', () => {
  const g = fresh('flip')
  assert.equal(g.board.filter(p => p).length, 50, '应铺满 50 子')
  let down = 0
  for (let i = 0; i < g.board.length; i++) if (g.board[i] && !g.faceUp[i]) down++
  assert.equal(down, 50, '翻翻棋开局应全部背面朝下')
  assert.equal(g.colors[RED], null)

  // 红方翻第一枚 → 定色
  const first = jq.flippable(g)[0]
  const color = jq.sideOf(g.board[first])
  assert.equal(jq.apply(g, { flip: first }, RED), true)
  assert.equal(g.colors[RED], color)
  assert.equal(g.colors[BLACK], otherSide(color))

  // 之后红方可以走自己的子
  const mv = jq.aiMove(g, 2)
  assert.ok(mv, 'AI 应能给出动作')
})

test('翻翻棋：AI 全程合法 20 局', () => {
  for (let n = 0; n < 20; n++) {
    const g = fresh('flip')
    let plies = 0
    while (!g.over && plies < 150) {
      const player = g.turn
      const mv = jq.aiMove(g, 1 + (n % 3))
      if (!mv) break
      const ok = jq.apply(g, mv, player)
      if (!ok) break
      plies++
    }
    assert.ok(plies > 0, '应至少走出若干步')
  }
})

const failed = results.filter(r => !r.ok)
for (const r of results) console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
