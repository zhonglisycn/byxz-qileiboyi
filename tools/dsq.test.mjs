/**
 * 斗兽棋内核自测（Node ESM，自包含）
 * 运行：node dsq.test.mjs（需先把 core/*.js 与 jungle.js 拷到 ./core/）
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as J from './core/jungle.js'

// ui.js 依赖 util.js（依赖 @system.storage，不进 Node），这里补一个最小桩以便验证视口几何
const here = path.dirname(fileURLToPath(import.meta.url))
const utilPath = path.join(here, 'core', 'util.js')
if (!fs.existsSync(utilPath)) {
  fs.writeFileSync(utilPath,
    "export function loadKey(opts, cb) { if (typeof cb === 'function') cb(false, '') }\n" +
    "export function saveKey() {}\n")
}
const UI = await import('./core/ui.js')

const results = []
function test(name, fn) {
  try {
    fn()
    results.push({ name: name, ok: true })
  } catch (e) {
    results.push({ name: name, ok: false, msg: e && e.message })
  }
}
function section(t) { console.log('\n=== ' + t + ' ===') }

/* ---------------- 构造工具 ---------------- */
function blank() {
  const st = J.newGame({ mode: 'pvp' })
  for (let i = 0; i < J.SIZE; i++) st.board[i] = 0
  st.history = []
  return st
}
function put(st, x, y, p, k, turn) {
  st.board[J.idx(x, y)] = J.makePiece(p, k)
  if (turn) st.turn = turn
}
function moves(st, p) { return J.legalMoves(st.board, p) }
function has(ms, fx, fy, tx, ty) {
  const from = J.idx(fx, fy), to = J.idx(tx, ty)
  for (let i = 0; i < ms.length; i++) if (ms[i].from === from && ms[i].to === to) return true
  return false
}
function mv(fx, fy, tx, ty) { return { from: J.idx(fx, fy), to: J.idx(tx, ty) } }

/* ================= 等级吃子 ================= */
section('等级吃子')

test('大吃小：红狮吃蓝狗', function () {
  const st = blank()
  put(st, 0, 8, 1, 7); put(st, 0, 7, 2, 3); st.turn = 1
  assert.ok(has(moves(st, 1), 0, 8, 0, 7), '应存在狮吃狗')
  assert.equal(J.apply(st, mv(0, 8, 0, 7)), true)
  assert.equal(st.board[J.idx(0, 7)], J.makePiece(1, 7))
  assert.equal(st.board[J.idx(0, 8)], 0)
})

test('小吃大非法：红猫吃蓝狮', function () {
  const st = blank()
  put(st, 0, 8, 1, 2); put(st, 0, 7, 2, 7); st.turn = 1
  assert.ok(!has(moves(st, 1), 0, 8, 0, 7), '猫不能吃狮')
  assert.equal(J.apply(st, mv(0, 8, 0, 7)), false)
})

test('鼠吃象', function () {
  const st = blank()
  put(st, 1, 7, 1, 1); put(st, 1, 6, 2, 8); st.turn = 1
  assert.ok(has(moves(st, 1), 1, 7, 1, 6), '鼠应能吃象')
  assert.equal(J.apply(st, mv(1, 7, 1, 6)), true)
  assert.equal(st.board[J.idx(1, 6)], J.makePiece(1, 1))
})

test('同级相遇吃方存活', function () {
  const st = blank()
  put(st, 0, 8, 1, 3); put(st, 0, 7, 2, 3); st.turn = 1
  assert.equal(J.apply(st, mv(0, 8, 0, 7)), true)
  assert.equal(st.board[J.idx(0, 7)], J.makePiece(1, 3))
  let blue = 0
  for (let i = 0; i < J.SIZE; i++) if (J.playerOf(st.board[i]) === 2) blue++
  assert.equal(blue, 0)
})

test('陷阱使进入方等级归 0', function () {
  const st = blank()
  put(st, 2, 7, 2, 8); st.turn = 1
  assert.equal(J.effRank(st.board, J.idx(2, 7)), 0, '蓝象进红陷阱应失去战力')
  put(st, 2, 8, 1, 1)   // 红鼠在兽穴左侧
  assert.ok(has(moves(st, 1), 2, 8, 2, 7), '红鼠应能吃掉陷阱里的蓝象')
  assert.equal(J.apply(st, mv(2, 8, 2, 7)), true)
})

test('己方陷阱不影响等级', function () {
  const st = blank()
  put(st, 2, 7, 1, 5)   // 红豹站红方陷阱（自家陷阱）
  assert.equal(J.effRank(st.board, J.idx(2, 7)), 5)
})

/* ================= 河流 ================= */
section('河流')

test('非鼠入河非法', function () {
  const st = blank()
  put(st, 0, 4, 1, 7); st.turn = 1   // 红狮在左岸陆地
  assert.ok(!has(moves(st, 1), 0, 4, 1, 4), '狮不能直接走进河里')
  assert.equal(J.apply(st, mv(0, 4, 1, 4)), false)
})

test('鼠入河合法', function () {
  const st = blank()
  put(st, 0, 4, 1, 1); st.turn = 1
  assert.ok(has(moves(st, 1), 0, 4, 1, 4), '鼠应能入河')
  assert.equal(J.apply(st, mv(0, 4, 1, 4)), true)
  assert.equal(st.board[J.idx(1, 4)], J.makePiece(1, 1))
})

test('河中鼠不能吃岸上象', function () {
  const st = blank()
  put(st, 1, 4, 1, 1)   // 红鼠在河
  put(st, 0, 4, 2, 8)   // 蓝象在岸
  st.turn = 1
  assert.ok(!has(moves(st, 1), 1, 4, 0, 4), '水中鼠不能吃岸上象')
  assert.equal(J.apply(st, mv(1, 4, 0, 4)), false)
})

test('岸上棋子不能吃河中鼠', function () {
  const st = blank()
  put(st, 0, 3, 1, 7)   // 红狮在左岸
  put(st, 1, 3, 2, 1)   // 蓝鼠在河
  st.turn = 1
  assert.ok(!has(moves(st, 1), 0, 3, 1, 3), '岸上子不能吃水中鼠')
})

test('狮跳河合法（横跳整条河）', function () {
  const st = blank()
  put(st, 0, 4, 1, 7); st.turn = 1
  assert.ok(has(moves(st, 1), 0, 4, 6, 4), '狮应能横跳河')
  assert.equal(J.apply(st, mv(0, 4, 6, 4)), true)
  assert.equal(st.board[J.idx(6, 4)], J.makePiece(1, 7))
})

test('虎跳河合法（竖跳整条河）', function () {
  const st = blank()
  put(st, 2, 2, 1, 6); st.turn = 1
  assert.ok(has(moves(st, 1), 2, 2, 2, 6), '虎应能竖跳河')
  assert.equal(J.apply(st, mv(2, 2, 2, 6)), true)
})

test('河中有鼠则狮虎不能跳', function () {
  const st = blank()
  put(st, 0, 4, 1, 7); put(st, 3, 4, 1, 1)  // 自家鼠挡在河中央
  st.turn = 1
  assert.ok(!has(moves(st, 1), 0, 4, 6, 4), '河中有鼠不能跳')
})

test('沿河岸不能"跳"（中间不是河）', function () {
  const st = blank()
  put(st, 0, 3, 1, 7)   // 左岸
  put(st, 0, 6, 2, 1)   // 下方
  st.turn = 1
  assert.ok(!has(moves(st, 1), 0, 3, 0, 6), '中间 (0,4)(0,5) 是陆地，不算跳河')
})

/* ================= 胜负 ================= */
section('胜负')

test('进入对方兽穴获胜', function () {
  const st = blank()
  put(st, 2, 0, 1, 7); put(st, 0, 8, 2, 1); st.turn = 1
  assert.ok(has(moves(st, 1), 2, 0, 3, 0), '应能走进蓝方兽穴')
  assert.equal(J.apply(st, mv(2, 0, 3, 0)), true)
  assert.equal(st.over, true)
  assert.equal(st.winner, 1)
  const r = J.result(st)
  assert.equal(r.over, true)
  assert.equal(r.winner, 1)
  assert.ok(typeof r.text === 'string' && r.text.length > 0)
})

test('不能进入自己兽穴', function () {
  const st = blank()
  put(st, 2, 8, 1, 7); st.turn = 1
  assert.ok(!has(moves(st, 1), 2, 8, 3, 8), '不能进自己兽穴')
  assert.equal(J.apply(st, mv(2, 8, 3, 8)), false)
})

test('吃光对方获胜', function () {
  const st = blank()
  put(st, 0, 8, 1, 7); put(st, 0, 7, 2, 3); st.turn = 1
  assert.equal(J.apply(st, mv(0, 8, 0, 7)), true)
  assert.equal(st.over, true)
  assert.equal(st.winner, 1)
})

test('对方无子可动判负', function () {
  const st = blank()
  // 蓝猫困在左上角，红狮/红虎封住两个出口（猫吃不动它们）
  put(st, 0, 0, 2, 2)
  put(st, 0, 1, 1, 7)
  put(st, 1, 0, 1, 6)
  put(st, 6, 8, 1, 2)   // 红方随便一枚可动子
  st.turn = 1
  assert.equal(J.legalMoves(st.board, 2).length, 0, '蓝方应无子可动')
  assert.equal(J.apply(st, mv(6, 8, 5, 8)), true)
  assert.equal(st.over, true)
  assert.equal(st.winner, 1)
})

/* ================= 悔棋 ================= */
section('悔棋')
test('undo 恢复棋子与被吃子', function () {
  const st = blank()
  put(st, 0, 8, 1, 7); put(st, 0, 7, 2, 3); st.turn = 1
  assert.equal(J.apply(st, mv(0, 8, 0, 7)), true)
  assert.equal(J.undo(st), true)
  assert.equal(st.board[J.idx(0, 8)], J.makePiece(1, 7))
  assert.equal(st.board[J.idx(0, 7)], J.makePiece(2, 3))
  assert.equal(st.turn, 1)
})

/* ================= 视口（放大 + 平移） ================= */
section('视口')

test('7×9 视口：全盘档整盘可见，放大档可平移到边角', function () {
  const full = UI.makeView(J.COLS, J.ROWS, 25, 25, 176, 336)
  assert.equal(full.visCols, J.COLS, '全盘档应完整显示 7 列')
  assert.equal(full.visRows, J.ROWS, '全盘档应完整显示 9 行')
  assert.equal(full.vw, 175)
  assert.equal(full.vh, 225)
  assert.equal(full.canPanX, false)
  assert.equal(full.canPanY, false)
  assert.equal(UI.visibleCells(full, function () { return {} }).length, J.SIZE)

  const big = UI.makeView(J.COLS, J.ROWS, 50, 50, 176, 336)
  assert.ok(big.visCols < J.COLS && big.visRows < J.ROWS, '放大后应只看到部分棋盘')
  assert.equal(UI.maxOx(big), J.COLS - big.visCols)
  assert.equal(UI.maxOy(big), J.ROWS - big.visRows)
  UI.pan(big, 99, 99)
  assert.equal(big.ox, UI.maxOx(big), '向右应平移到最右列')
  assert.equal(big.oy, UI.maxOy(big), '向下应平移到最下行')
  const cells = UI.visibleCells(big, function () { return {} })
  assert.equal(cells.length, big.visCols * big.visRows)
  assert.equal(cells[cells.length - 1].i, J.SIZE - 1, '平移到右下角应看到第 63 格')

  // 页面确实采用这套视口参数
  const ux = path.join(here, '..', 'src/pages/dsq/dsq.ux')
  if (fs.existsSync(ux)) {
    const src = fs.readFileSync(ux, 'utf8')
    assert.ok(src.indexOf('makeView(COLS, ROWS') >= 0, 'dsq.ux 应使用视口 makeView')
    assert.ok(src.indexOf('cw: 25, ch: 25') >= 0, '全盘档应为 25px')
    assert.ok(src.indexOf('cw: 50, ch: 50') >= 0, '大档应为 50px')
    assert.ok(src.indexOf('panL') >= 0 && src.indexOf('panR') >= 0, '应有方向键平移')
  }
})

/* ================= AI ================= */
section('AI 对随机玩家')

test('菜鸟/普通/高手各 100 局：无异常且绝无非法走法', function () {
  const levels = [1, 2, 3]
  let finished = 0, total = 0
  for (let li = 0; li < levels.length; li++) {
    const lv = levels[li]
    for (let n = 0; n < 100; n++) {
      total++
      const st = J.newGame({ mode: 'ai' })
      let guard = 0
      let ended = false
      while (!st.over && guard < 600) {
        guard++
        const p = st.turn
        const ms = J.legalMoves(st.board, p)
        if (!ms.length) break
        let m
        if (p === 2) {
          m = J.aiMove(st, lv)
          assert.ok(m, 'AI 返回 null 但仍有合法走法 lv' + lv)
          let ok = false
          for (let k = 0; k < ms.length; k++) {
            if (ms[k].from === m.from && ms[k].to === m.to) { ok = true; break }
          }
          assert.ok(ok, 'AI 走出非法着法 lv' + lv + ' ' + m.from + '->' + m.to)
        } else {
          m = ms[Math.floor(Math.random() * ms.length)]
        }
        const applied = J.apply(st, m)
        assert.equal(applied, true, '核心拒绝了合法着法 lv' + lv)
      }
      if (st.over) { ended = true; finished++ }
      assert.ok(st.board.length === J.SIZE, '棋盘长度异常')
    }
  }
  console.log('    完成对局 ' + finished + '/' + total)
  assert.ok(finished >= total * 0.9, '终局率过低：' + finished + '/' + total)
})

/* ================= 汇总 ================= */
const failed = results.filter(function (r) { return !r.ok })
for (let i = 0; i < results.length; i++) {
  const r = results[i]
  console.log((r.ok ? '  [OK] ' : '  [XX] ') + r.name + (r.ok ? '' : '  -> ' + r.msg))
}
console.log('\n' + (results.length - failed.length) + '/' + results.length + ' 通过')
if (failed.length) process.exit(1)
