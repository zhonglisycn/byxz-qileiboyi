/**
 * 界面公共逻辑：字体缩放设置 + 棋盘视口计算
 *
 * 字体缩放：设置页把缩放系数存到 fc_font_scale，所有页面的文字都用 fs(n) 取实际字号。
 * 棋盘视口：棋盘放大后只显示一部分，用按钮平移/缩放。为了避免"格子露在视口外"
 * （Vela 没有可靠的 overflow 裁剪），视口只显示**完整的整格**，平移也按整格跳。
 */
import { loadKey, saveKey } from './util.js'

/* ------------------------------------------------------------------ */
/* 字体缩放                                                            */
/* ------------------------------------------------------------------ */

let scale = 1.15   // 默认比"标准"大一档：真机上 1.0 看起来偏小
let loaded = false

export const FONT_STEPS = [0.85, 1, 1.15, 1.3]
export const FONT_NAMES = ['小', '标准', '大', '特大']

export function fs(n) {
  return Math.round(n * scale)
}

export function getScale() { return scale }

export function setScale(s) {
  scale = s || 1
}

/** 首次使用时从存档读取缩放系数 */
export function ensureScale(cb) {
  if (loaded) { if (cb) cb(); return }
  loaded = true
  loadKey('fc_font_scale', (ok, v) => {
    const s = parseFloat(v)
    if (ok && s > 0.5 && s < 2) scale = s
    if (cb) cb()
  })
}

export function saveScale(s, cb) {
  scale = s
  saveKey('fc_font_scale', String(s), cb)
}

/* ------------------------------------------------------------------ */
/* 棋盘视口                                                            */
/* ------------------------------------------------------------------ */

/**
 * 建一个视口
 * @param cols/rows 棋盘列数行数
 * @param cw/ch     单格像素（放大后的尺寸）
 * @param vw/vh     视口可用像素（必须 >= cw / ch）
 */
export function makeView(cols, rows, cw, ch, maxW, maxH) {
  const visCols = Math.max(1, Math.min(cols, Math.floor(maxW / cw)))
  const visRows = Math.max(1, Math.min(rows, Math.floor(maxH / ch)))
  return {
    cols: cols, rows: rows,
    cw: cw, ch: ch,
    visCols: visCols, visRows: visRows,
    // 盒子只包住实际显示到的格子，外层容器负责居中
    vw: visCols * cw,
    vh: visRows * ch,
    ox: 0, oy: 0,
    canPanX: visCols < cols,
    canPanY: visRows < rows
  }
}

export function maxOx(v) { return Math.max(0, v.cols - v.visCols) }
export function maxOy(v) { return Math.max(0, v.rows - v.visRows) }

/** 平移（dh/dv 是"格"为单位），返回是否真的移动了 */
export function pan(v, dh, dv) {
  const nx = Math.max(0, Math.min(maxOx(v), v.ox + dh))
  const ny = Math.max(0, Math.min(maxOy(v), v.oy + dv))
  const moved = (nx !== v.ox || ny !== v.oy)
  v.ox = nx
  v.oy = ny
  return moved
}

export function canPan(v) { return v.canPanX || v.canPanY }

/** 以某格为中心把视口挪过去（点边缘时自动跟随） */
export function centerOn(v, x, y) {
  const hx = Math.floor(v.visCols / 2)
  const hy = Math.floor(v.visRows / 2)
  v.ox = Math.max(0, Math.min(maxOx(v), x - hx))
  v.oy = Math.max(0, Math.min(maxOy(v), y - hy))
}

/**
 * 生成要渲染的格子列表
 * cellInfo(x, y) 由调用方提供，返回 { cls, img, ... } 附加信息
 */
export function visibleCells(v, cellInfo) {
  const out = []
  for (let y = v.oy; y < v.oy + v.visRows && y < v.rows; y++) {
    for (let x = v.ox; x < v.ox + v.visCols && x < v.cols; x++) {
      const extra = cellInfo ? cellInfo(x, y) : {}
      // 透传调用方返回的所有字段（cls/img/txt/back 以及自定义字段都可用）
      const cell = {
        i: y * v.cols + x,
        x: (x - v.ox) * v.cw,
        y: (y - v.oy) * v.ch,
        w: v.cw,
        h: v.ch,
        cls: '',
        img: '',
        txt: '',
        back: 0
      }
      for (const k in extra) cell[k] = extra[k]
      out.push(cell)
    }
  }
  return out
}

/** 缩放档位切换时保持视线中心大致不变 */
export function zoomTo(base, level) {
  // base 提供 cols/rows/vw/vh，levels 是 [{cw, ch, vw, vh}...]
  return base
}
