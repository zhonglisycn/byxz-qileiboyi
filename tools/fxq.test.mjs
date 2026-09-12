/**
 * 飞行棋内核自测（Node，纯逻辑）
 *
 *   与 tools/core.test.mjs 同一套极简 test/section 写法，自包含。
 *   随机数用可播种的 mulberry32 覆盖 Math.random，保证可复现。
 *
 * 运行（见任务说明）：
 *   TMP=.ct-fxq; rm -rf $TMP; mkdir -p $TMP/core
 *   echo '{ "type": "module" }' > $TMP/package.json
 *   for f in src/common/core/*.js; do b=$(basename $f); [ "$b" = "util.js" ] && continue; cp $f $TMP/core/; done
 *   cp tools/fxq.test.mjs $TMP/; (cd $TMP && node fxq.test.mjs)
 */
import assert from 'node:assert/strict'
import * as A from './core/aeroplane.js'

/* ---------- 固定种子随机 ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0
    let t = Math.imul(a ^ a >>> 15, 1 | a)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}
const SEED = 20240912
Math.random = mulberry32(SEED)

/* ---------- 迷你测试框架 ---------- */
const results = []
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }) }
  catch (e) { results.push({ name, ok: false, msg: e && e.message }) }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

/* ---------- 便捷 ---------- */
function pos(g, p, k) { return g.planes[(p - 1) * 4 + k] }
function setPos(g, p, k, v) { g.planes[(p - 1) * 4 + k] = v }
function setDice(g, d) { g.dice = d; g.rolled = true }
const LAST = A.LAST

/* ============================ 基础 ============================ */
section('基础')

test('新局：红先、四方各 4 枚在基地', () => {
  const g = A.newGame({ mode: 'ai', takeoff: 6 })
  assert.equal(g.turn, 1)
  assert.equal(g.planes.length, 16)
  for (let i = 0; i < 16; i++) assert.equal(g.planes[i], -1)
  assert.equal(g.takeoff, 6)
  assert.equal(A.result(g).over, false)
})

test('起飞点数默认 6，可设 1/5，非法值回退 6', () => {
  assert.equal(A.newGame({}).takeoff, 6)
  assert.equal(A.newGame({ takeoff: 1 }).takeoff, 1)
  assert.equal(A.newGame({ takeoff: 5 }).takeoff, 5)
  assert.equal(A.newGame({ takeoff: 3 }).takeoff, 6)
})

test('掷骰子范围 1..6，并置 rolled', () => {
  const g = A.newGame({})
  for (let n = 0; n < 300; n++) {
    g.rolled = false
    const d = A.roll(g)
    assert.ok(d >= 1 && d <= 6, '点数越界 ' + d)
    assert.equal(g.rolled, true)
    assert.equal(g.dice, d)
  }
})

test('同种子可复现', () => {
  const seq = () => { const r = mulberry32(7); const out = []; for (let i = 0; i < 8; i++) out.push(Math.floor(r() * 6) + 1); return out.join(',') }
  assert.equal(seq(), seq())
})

/* ============================ 起飞 ============================ */
section('起飞条件')

test('非起飞点数：基地内飞机不能起飞，无合法动作', () => {
  const g = A.newGame({ takeoff: 6 })
  setDice(g, 3)
  assert.deepEqual(A.legalMoves(g), [])
})

test('起飞点数：4 枚均可起飞，落点在起点(pos=0)', () => {
  const g = A.newGame({ takeoff: 6 })
  setDice(g, 6)
  assert.equal(A.legalMoves(g).length, 4)
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 0)
})

test('起飞点数为 1 时也按配置生效', () => {
  const g = A.newGame({ takeoff: 1 })
  setDice(g, 1)
  assert.equal(A.legalMoves(g).length, 4)
  assert.equal(A.apply(g, { plane: 2 }, 1), true)
  assert.equal(pos(g, 1, 2), 0)
})

/* ============================ 移动 ============================ */
section('移动')

test('普通前进：前进骰子点数', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 0)
  setDice(g, 2) // 2 非 4 倍数、非飞行格
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 2)
})

test('超出终点弹回：LAST-2 走 6 -> LAST-4', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, LAST - 2) // 55
  setDice(g, 6)             // 61 -> 57-4 = 53
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), LAST - 4)
})

test('到达终点：LAST-1 走 1 -> LAST，且该机完成', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, LAST - 1)
  setDice(g, 1)
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), LAST)
  assert.deepEqual(A.doneCounts(g), [1, 0, 0, 0])
})

test('完成的飞机不再可动', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, LAST)
  setPos(g, 1, 1, 0)
  setDice(g, 2)
  const ms = A.legalMoves(g)
  assert.equal(ms.length, 1)
  assert.equal(ms[0].plane, 1)
})

test('同色连续跳跃：落在同色格后一路 +4 直到环尾', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 0)
  setDice(g, 4) // pos 4 同色 -> 8 -> 12 … -> 48（再 +4 越出环，停）
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 48)
})

test('同色连续跳跃：非 4 倍数落点不跳、跳到环尾(48)即停不越界', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 0)
  setDice(g, 2) // 落到 pos 2，非 4 倍数，不触发跳跃
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 2)

  const h = A.newGame({})
  setPos(h, 1, 0, 44)
  setDice(h, 4) // 44+4=48，是环上最后一个同色格，再 +4 会越界故原地停
  assert.equal(A.apply(h, { plane: 0 }, 1), true)
  assert.equal(pos(h, 1, 0), 48)
})

test('虚线飞行：固定格 +12', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 16) // 走 2 到 18（飞行格）-> 30
  setDice(g, 2)
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 30)
})

/* ============================ 撞机 / 叠机 ============================ */
section('撞机与叠机')

test('撞机：落点敌机全部回基地', () => {
  const g = A.newGame({})
  // P1 起点环下标 51；pos 13 -> abs 12，正是 P2 起点(pos 0)
  setPos(g, 1, 0, 10)
  setPos(g, 2, 0, 0)
  setPos(g, 2, 1, 0)
  setDice(g, 3) // P1: 10+3=13 -> abs (51+13)%52=12
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 13)
  assert.equal(pos(g, 2, 0), -1)
  assert.equal(pos(g, 2, 1), -1)
})

test('叠机：己方多机可同格共存', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 2)
  setPos(g, 1, 1, 0)
  setDice(g, 2)
  assert.equal(A.apply(g, { plane: 1 }, 1), true)
  assert.equal(pos(g, 1, 0), 2)
  assert.equal(pos(g, 1, 1), 2)
})

test('终点跑道内不会被撞，也不触发跳跃', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 53) // 起点跑道 pos 53，走 3 到 56（非终点）
  setDice(g, 3)
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(pos(g, 1, 0), 56)
})

/* ============================ 回合 ============================ */
section('回合与胜负')

test('掷出 6 点可再掷一次（同一方行动）', () => {
  const g = A.newGame({ takeoff: 6 })
  // 强制掷出 6
  const save = Math.random
  Math.random = () => 0.99
  assert.equal(A.roll(g), 6)
  Math.random = save
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(g.turn, 1, '掷 6 后仍是红方')
  assert.equal(g.rolled, false)
})

test('非 6 点过手给下一方', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, 0)
  setDice(g, 2)
  assert.equal(A.apply(g, { plane: 0 }, 1), true)
  assert.equal(g.turn, 2)
})

test('四方轮转 1->2->3->4->1', () => {
  const g = A.newGame({})
  for (let i = 0; i < 4; i++) {
    const p = g.turn
    setPos(g, p, 0, 0)
    setDice(g, 2)
    assert.equal(A.apply(g, { plane: 0 }, p), true)
    assert.equal(g.turn, p === 4 ? 1 : p + 1)
  }
})

test('无子可走时 pass 过手', () => {
  const g = A.newGame({ takeoff: 6 })
  setDice(g, 2) // 全在基地、非起飞点
  assert.equal(A.legalMoves(g).length, 0)
  assert.equal(A.pass(g), true)
  assert.equal(g.turn, 2)
})

test('四方齐到终点获胜，result 正确', () => {
  const g = A.newGame({})
  setPos(g, 1, 0, LAST)
  setPos(g, 1, 1, LAST)
  setPos(g, 1, 2, LAST)
  setPos(g, 1, 3, LAST - 1)
  setDice(g, 1)
  assert.equal(A.apply(g, { plane: 3 }, 1), true)
  const r = A.result(g)
  assert.equal(r.over, true)
  assert.equal(r.winner, 1)
  assert.ok(r.text.indexOf('红') >= 0)
})

test('乱序 byPlayer / 非法动作被拒绝且状态不变', () => {
  const g = A.newGame({})
  setDice(g, 2)
  assert.equal(A.apply(g, { plane: 0 }, 2), false, 'byPlayer 不符')
  assert.equal(A.apply(g, null, 1), false, '空动作')
  assert.equal(A.apply(g, { plane: 9 }, 1), false, '越界飞机')
  assert.equal(pos(g, 1, 0), -1)
  assert.equal(g.moves, 0)
})

/* ============================ AI ============================ */
section('AI')

test('AI 在无子可走时返回 null', () => {
  const g = A.newGame({ takeoff: 6 })
  const save = Math.random
  Math.random = () => 0.2 // -> 点数 2，非起飞点
  const mv = A.aiMove(g, 1)
  Math.random = save
  assert.equal(mv, null)
})

function invariants(g) {
  assert.equal(g.planes.length, 16)
  for (let p = 1; p <= 4; p++) {
    let n = 0
    for (let k = 0; k < 4; k++) {
      const v = g.planes[(p - 1) * 4 + k]
      assert.ok(v >= -1 && v <= LAST, 'pos 越界 ' + v)
      n++
    }
    assert.equal(n, 4, '每方恒 4 枚')
  }
  assert.ok(g.turn >= 1 && g.turn <= 4)
}

function playGame(lv, maxMoves, rng) {
  const g = A.newGame({ mode: 'ai', takeoff: 6 })
  let moves = 0
  while (!g.winner && moves < maxMoves) {
    moves++
    let mv
    if (g.turn === 1) {
      A.roll(g)
      const ms = A.legalMoves(g)
      mv = ms.length ? ms[Math.floor(rng() * ms.length)] : null
    } else {
      mv = A.aiMove(g, lv)
    }
    if (!mv) {
      assert.equal(A.pass(g), true, '无动作时必须能过手')
      invariants(g)
      continue
    }
    const legal = A.legalMoves(g)
    let found = false
    for (let i = 0; i < legal.length; i++) if (legal[i].plane === mv.plane) { found = true; break }
    assert.ok(found, 'AI 返回了非法动作 plane=' + (mv && mv.plane))
    assert.equal(A.apply(g, mv, g.turn), true, '合法动作应用失败')
    invariants(g)
  }
  if (g.winner) {
    for (let k = 0; k < 4; k++) assert.equal(g.planes[(g.winner - 1) * 4 + k], LAST)
    assert.equal(A.result(g).over, true)
  }
  return { g: g, moves: moves }
}

test('AI(普通) 自动驾驶：多局 200+ 步无异常、无非法、不变量成立', () => {
  const rng = mulberry32(1001)
  let finished = 0
  for (let n = 0; n < 30; n++) {
    const r = playGame(1, 400, rng)
    if (r.g.winner) finished++
  }
  assert.ok(finished > 0, '应有对局在 400 步内结束')
})

test('AI(高手) 自动驾驶：多局 200+ 步无异常、无非法、不变量成立', () => {
  const rng = mulberry32(2002)
  let finished = 0
  for (let n = 0; n < 30; n++) {
    const r = playGame(2, 400, rng)
    if (r.g.winner) finished++
  }
  assert.ok(finished > 0, '应有对局在 400 步内结束')
})

test('AI 单步永不返回非法动作（随机局面采样）', () => {
  const rng = mulberry32(3003)
  for (let n = 0; n < 40; n++) {
    const g = A.newGame({ mode: 'ai', takeoff: 6 })
    for (let s = 0; s < 120 && !g.winner; s++) {
      if (g.turn === 1) {
        A.roll(g)
        const ms = A.legalMoves(g)
        if (ms.length) A.apply(g, ms[Math.floor(rng() * ms.length)], 1)
        else A.pass(g)
      } else {
        const mv = A.aiMove(g, s % 2 ? 1 : 2)
        if (!mv) { A.pass(g); continue }
        const legal = A.legalMoves(g)
        let ok = false
        for (let i = 0; i < legal.length; i++) if (legal[i].plane === mv.plane) ok = true
        assert.ok(ok, '非法动作')
        A.apply(g, mv, g.turn)
      }
    }
  }
})

/* ============================ 汇总 ============================ */
const failed = results.filter(r => !r.ok)
for (const r of results) {
  console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
