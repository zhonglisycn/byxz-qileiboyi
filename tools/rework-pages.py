# -*- coding: utf-8 -*-
"""
把 8 个对局页统一改成：
  1) 底部方向键行 -> 贴在棋盘四边的悬浮键（44×44，放大后才出现）
  2) 缩放档位重排：棋盘更宽更矮（视口 184×272），格子更大，同时减少渲染格数
  3) 缩放按钮做成棋盘左上角的悬浮小胶囊（一直可见）
"""
import io
import os
import re

R = r"C:/Users/39830/Documents/zcode/fangcun-chess"

VIEW_W, VIEW_H = 184, 272
BTN = 44

# 每种棋的全新缩放档位（从"最省渲染"到"最大"）
ZOOMS = {
    "xq":   [(20, 20), (30, 30), (42, 42)],
    "wq":   [(18, 18), (26, 26), (36, 36)],
    "gjxq": [(22, 22), (32, 32), (46, 46)],
    "jq":   [(34, 22), (34, 34), (34, 46)],
    "dsq":  [(26, 26), (36, 36), (50, 50)],
    "fxq":  [(12, 12), (20, 20), (30, 30)],
}
WZQ_FULL = 18   # 五子棋各路的"全盘"档统一 18px

OVERLAY = '''        <!-- 悬浮方向键：放大后贴在棋盘四边，44×44 好点 -->
        <div class="pad-overlay" style="left: 0px; top: {{padMidTop}}px" if="{{panL}}" @click="doPan(-1, 0)">
          <text class="pad-glyph">‹</text>
        </div>
        <div class="pad-overlay" style="left: {{padRightX}}px; top: {{padMidTop}}px" if="{{panR}}" @click="doPan(1, 0)">
          <text class="pad-glyph">›</text>
        </div>
        <div class="pad-overlay" style="left: {{padMidX}}px; top: 0px" if="{{panU}}" @click="doPan(0, -1)">
          <text class="pad-glyph">˄</text>
        </div>
        <div class="pad-overlay" style="left: {{padMidX}}px; top: {{padBottomY}}px" if="{{panD}}" @click="doPan(0, 1)">
          <text class="pad-glyph">˅</text>
        </div>
        <!-- 缩放：棋盘左上角悬浮胶囊 -->
        <div class="zoom-chip" @click="cycleZoom">
          <text class="zoom-chip-text">{{zoomName}}</text>
        </div>
'''

PAD_FIELDS = "    padMidTop: 0, padRightX: 0, padMidX: 0, padBottomY: 0,\n"

PANSTATE_EXTRA = """    this.padMidTop = Math.round((this.vp.vh - %d) / 2)
    this.padRightX = this.vp.vw - %d
    this.padMidX = Math.round((this.vp.vw - %d) / 2)
    this.padBottomY = this.vp.vh - %d
""" % (BTN, BTN, BTN, BTN)


def find_block(t, start_pat):
    """从 start_pat 处找到该 <div> 的配对大括号（按标签深度，忽略自闭合）"""
    i = t.index(start_pat)
    depth = 0
    j = i
    while j < len(t):
        m = re.compile(r'<div\b|</div>').search(t, j)
        if not m:
            break
        if m.group(0) == '</div>':
            depth -= 1
            if depth == 0:
                return i, m.end()
        else:
            depth += 1
        j = m.end()
    raise ValueError('找不到配对的 </div>')


def patch(rel):
    p = os.path.join(R, rel)
    t = io.open(p, encoding="utf-8").read()
    name = os.path.basename(rel).replace('.ux', '')
    log = []

    # --- 1) 删掉底部 pad-row ---
    if '<div class="pad-row">' in t:
        s, e = find_block(t, '<div class="pad-row">')
        # 连同前面的空行一起删
        while s > 0 and t[s - 1] in '\n\r ':
            s -= 1
        t = t[:s] + t[e:]
        log.append('删掉 pad-row')

    # --- 2) 在 vbox 内插入悬浮键 ---
    if 'pad-overlay' not in t:
        vz = t.index('class="vbox"')
        # vbox 的结束：vbox 之后第一处 "\n      </div>"（缩进 6 空格）
        close = t.index('\n      </div>', vz)
        t = t[:close + 1] + OVERLAY + t[close + 1:]
        log.append('插入悬浮方向键')

    # --- 3) 视口尺寸 ---
    t2 = t.replace('176, 336', '%d, %d' % (VIEW_W, VIEW_H))
    t2 = t2.replace('176, 300', '%d, %d' % (VIEW_W, VIEW_H))
    if t2 != t:
        t = t2
        log.append('视口 -> %dx%d' % (VIEW_W, VIEW_H))

    # --- 4) 缩放档位 ---
    if name in ZOOMS:
        z = ZOOMS[name]
        new_table = 'const ZOOMS = [\n' + ''.join(
            "  { cw: %d, ch: %d, name: '%s' },\n" % (cw, ch, n)
            for (cw, ch), n in zip(z, ['全盘', '中', '大'])) + ']'
        t = re.sub(r'const ZOOMS = \[[^\]]*\]', new_table, t, count=1)
        log.append('档位 %s' % z)
    elif name == 'wzq':
        t = re.sub(r'const full = [^\n]*',
                   'const full = %d' % WZQ_FULL, t, count=1)
        t = t.replace('{ cw: 24, ch: 24, name: \'中\' }', '{ cw: 28, ch: 28, name: \'中\' }')
        t = t.replace('{ cw: 36, ch: 36, name: \'大\' }', '{ cw: 38, ch: 38, name: \'大\' }')
        log.append('档位 full=%d/28/38' % WZQ_FULL)
    elif name == 'ttt':
        t = t.replace('makeView(3, 3, 56, 56', 'makeView(3, 3, 60, 60')
        log.append('井字棋格子 60px')

    # --- 5) private 里加悬浮键位置字段 ---
    if 'padMidTop' not in t:
        m = re.search(r'( *panL: false, panR: false, panU: false, panD: false,)', t)
        if m:
            t = t[:m.end()] + '\n' + PAD_FIELDS.rstrip('\n') + t[m.end():]
            log.append('加 padMidTop 等字段')
        else:
            log.append('!! 没找到 panL 字段声明')

    # --- 6) updatePanState 里计算位置 ---
    if 'this.padMidTop = ' not in t:
        m = re.search(r'(updatePanState\(\)\s*\{)', t)
        if m:
            t = t[:m.end()] + '\n' + PANSTATE_EXTRA + t[m.end():]
            log.append('updatePanState 计算位置')
        else:
            log.append('!! 没找到 updatePanState')

    io.open(p, "w", encoding="utf-8").write(t)
    print(('%-6s ' % name) + ' | '.join(log))


for n in ['xq', 'wq', 'wzq', 'gjxq', 'jq', 'dsq', 'fxq', 'ttt']:
    patch('src/pages/%s/%s.ux' % (n, n))

# base.css 补 zoom-chip 样式
p = os.path.join(R, 'src/common/style/base.css')
t = io.open(p, encoding="utf-8").read()
if '.zoom-chip' not in t:
    t = t.replace("/* ---------- 列表项 ---------- */", """/* 缩放胶囊（棋盘左上角常驻） */
.zoom-chip {
  position: absolute;
  left: 0px;
  top: 0px;
  height: 30px;
  padding-left: 10px;
  padding-right: 10px;
  border-radius: 15px;
  background-color: rgba(16, 18, 22, 0.72);
  align-items: center;
  justify-content: center;
}

.zoom-chip-text { font-size: 14px; color: #ffffff; text-align: center; }

/* ---------- 列表项 ---------- */""")
    io.open(p, "w", encoding="utf-8").write(t)
    print("base.css 已补 .zoom-chip")
