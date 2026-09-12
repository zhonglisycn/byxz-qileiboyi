/**
 * 纯函数工具（不依赖任何系统接口，便于在 Node 里直接单测游戏内核）
 */

/** 秒 -> mm:ss */
export function fmtClock(sec) {
  if (sec === null || sec === undefined || sec < 0) return '--:--'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s
}

/** 列表随机取一个 */
export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 在候选中挑分数最高的（同分随机，避免每局走法完全一样） */
export function pickBest(cands) {
  if (!cands || !cands.length) return null
  let best = -Infinity
  for (let i = 0; i < cands.length; i++) {
    if (cands[i].score > best) best = cands[i].score
  }
  const top = []
  for (let i = 0; i < cands.length; i++) {
    if (cands[i].score >= best - 1e-9) top.push(cands[i])
  }
  return top.length === 1 ? top[0] : top[Math.floor(Math.random() * top.length)]
}

/** 深拷贝纯数据（棋盘状态存档用） */
export function clone(o) {
  return JSON.parse(JSON.stringify(o))
}

/** 一维索引 -> "x,y" */
export function xy(i, w) {
  return (i % w) + ',' + Math.floor(i / w)
}

/** 数字裁剪 */
export function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v)
}
