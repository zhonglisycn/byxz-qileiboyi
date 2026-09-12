# -*- coding: utf-8 -*-
"""
把作者署名改成「模糊二维码byxz」，并移除二维码图片（用户不需要二维码）。
"""
import io
import os
import re

R = r"C:/Users/39830/Documents/zcode/fangcun-chess"
AUTHOR = "模糊二维码byxz"


def rw(rel, fn):
    p = os.path.join(R, rel)
    if not os.path.exists(p):
        print("跳过(不存在):", rel)
        return
    t = io.open(p, encoding="utf-8").read()
    t2 = fn(t)
    if t2 != t:
        io.open(p, "w", encoding="utf-8").write(t2)
        print("已改:", rel)
    else:
        print("未变:", rel)


# ---------- 关于页 ----------
def fix_about(t):
    # 作者行
    t = t.replace('<text class="k" style="font-size: {{fs(13, fontTick)}}px">byxz</text>',
                  '<text class="k" style="font-size: {{fs(13, fontTick)}}px">模糊二维码byxz</text>')
    # 底部二维码块 -> 只留署名文字
    t = re.sub(r'\s*<div class="qr-wrap">[\s\S]*?</div>\s*</div>',
               '\n    <div class="qr-wrap">\n      <text class="t-info" style="font-size: {{fs(11, fontTick)}}px">模糊二维码byxz</text>\n    </div>\n  </div>',
               t, count=1)
    # 去掉不再用到的样式
    t = t.replace("""  .qr {
    width: 96px;
    height: 96px;
    opacity: 0.85;
  }
""", "")
    return t


# ---------- 设置页 ----------
def fix_more(t):
    t = t.replace('      <image class="qr" src="/common/icon/qr.png"></image>\n', "")
    t = t.replace('<text class="t-info" style="font-size: {{fs(11, fontTick)}}px">byxz</text>',
                  '<text class="t-info" style="font-size: {{fs(11, fontTick)}}px">模糊二维码byxz</text>')
    t = t.replace("""  .qr {
    width: 62px;
    height: 62px;
    opacity: 0.5;
  }
""", "")
    return t


# ---------- manifest ----------
def fix_manifest(t):
    t = re.sub(r'"description": "[^"]*"', '"description": "八种棋类 · 人机 / 双人 · 模糊二维码byxz"', t)
    return t


# ---------- 主菜单：底部一行不再放作者名，避免超宽 ----------
def fix_index(t):
    t = t.replace("ver: 'byxz',", "ver: 'v5.1',")
    return t


rw("src/pages/about/about.ux", fix_about)
rw("src/pages/more/more.ux", fix_more)
rw("src/manifest.json", fix_manifest)
rw("src/pages/index/index.ux", fix_index)

# README：标题与署名
def fix_readme(t):
    t = t.replace("# 棋类博弈 · byxz", "# 棋类博弈")
    t = t.replace("`src/common/icon/qr.png` 是**占位二维码**（模糊化处理，不保证可扫）。换成自己的二维码时，\n直接覆盖该文件即可（建议 120×120 以上的正方形），设置页与关于页会自动缩放显示。",
                  "作者署名：**模糊二维码byxz**。")
    t = t.replace("作者：**模糊二维码byxz**", "作者署名：**模糊二维码byxz**")
    t = t.replace("`icon/` 含新生成的井字棋图标、黑白子、二维码）",
                  "`icon/` 含新生成的井字棋图标与黑白子）")
    return t


rw("README.md", fix_readme)

# 删除二维码图片与生成脚本
for rel in ["src/common/icon/qr.png", "tools/make-qr.py"]:
    p = os.path.join(R, rel)
    if os.path.exists(p):
        os.remove(p)
        print("已删除:", rel)

# 复核
for rel in ["src/pages/about/about.ux", "src/pages/more/more.ux", "src/manifest.json", "src/pages/index/index.ux", "README.md"]:
    t = io.open(os.path.join(R, rel), encoding="utf-8").read()
    if "byxz" in t and AUTHOR not in t:
        print("!! 仍有旧署名:", rel)
    if "qr.png" in t:
        print("!! 仍引用二维码:", rel)
print("完成")
