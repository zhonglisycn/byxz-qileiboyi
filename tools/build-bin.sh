#!/usr/bin/env bash
# 一键构建：编译 → 产出可直接安装的 .bin
#
# 原理：aiot-toolkit 的 build 会产出 .rpk，而手环安装包 .bin 与 .rpk 完全同构
# （都是带 META-INF/CERT 的 ZIP，连 ZIP 注释里的 toolkit 版本号格式都一样），
# 所以这里只是把 .rpk 复制成 .bin 名字。
set -e
cd "$(dirname "$0")/.."

NAME="棋类博弈_byxz"

echo "=== 1/4 运行游戏内核测试 ==="
bash tools/run-tests.sh

echo ""
echo "=== 2/4 页面静态检查（模板字段/方法/import）==="
node tools/check-ux.mjs

echo ""
echo "=== 3/4 编译快应用（--enable-jsc 生成字节码）==="
npx aiot build --enable-jsc

echo ""
echo "=== 4/4 输出 .bin ==="
RPK=$(ls dist/*.rpk | head -1)
OUT="dist/$NAME.bin"
cp "$RPK" "$OUT"
ls -la "$OUT"
echo ""
echo "完成：$OUT"
echo "（同目录的 .rpk 内容完全相同，只是扩展名不同）"
