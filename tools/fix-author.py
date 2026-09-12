# -*- coding: utf-8 -*-
"""把作者署名统一成 byxz（作者名，不是 "by xz"）"""
import os
import io

R = r"C:/Users/39830/Documents/zcode/fangcun-chess"
FILES = [
    "src/manifest.json",
    "src/pages/about/about.ux",
    "src/pages/more/more.ux",
    "src/pages/index/index.ux",
    "tools/make-qr.py",
    "README.md",
]

n = 0
for rel in FILES:
    p = os.path.join(R, rel)
    if not os.path.exists(p):
        print("跳过（不存在）:", rel)
        continue
    t = io.open(p, encoding="utf-8").read()
    t2 = t.replace("by xz", "byxz")
    if t2 != t:
        io.open(p, "w", encoding="utf-8").write(t2)
        n += 1
        print("已改:", rel, "->", t.count("by xz"), "处")

print("共修改", n, "个文件")
# 复核
for rel in FILES:
    p = os.path.join(R, rel)
    if os.path.exists(p):
        t = io.open(p, encoding="utf-8").read()
        if "by xz" in t:
            print("!! 仍有残留:", rel)
