#!/usr/bin/env bash
# 游戏内核对拍：把 src/common/core 下的模块拷到临时 ESM 目录，逐个跑 tools/*.test.mjs
#
# 说明：util.js 依赖 @system.storage，不能在 Node 里跑，这里换成一个桩（内存实现），
# 这样依赖它的 ui.js 也能被测试导入。
set -e
cd "$(dirname "$0")/.."

TESTS=$(ls tools/*.test.mjs 2>/dev/null || true)
if [ -z "$TESTS" ]; then echo "没有找到测试文件"; exit 0; fi

fail=0
for t in $TESTS; do
  name=$(basename "$t" .test.mjs)
  TMP=".ct-$name"
  rm -rf "$TMP" 2>/dev/null || true
  mkdir -p "$TMP/core"
  printf '{ "type": "module" }' > "$TMP/package.json"
  for f in src/common/core/*.js; do
    b=$(basename "$f")
    [ "$b" = "util.js" ] && continue
    cp "$f" "$TMP/core/$b"
    # 相对导入补扩展名（Node ESM 需要显式扩展名）
    sed -i "s/from '\(\.[^']*\)'/from '\1'/" "$TMP/core/$b" 2>/dev/null || true
  done
  # 桩 util.js
  cat > "$TMP/core/util.js" <<'STUB'
const mem = {}
export function saveKey(key, value, cb) { mem[key] = value; if (cb) cb(true) }
export function loadKey(key, cb) { cb(mem[key] !== undefined, mem[key]) }
export function dropKey(key, cb) { delete mem[key]; if (cb) cb(true) }
STUB
  cp "$t" "$TMP/"
  echo ""
  echo "############ $name ############"
  ( cd "$TMP" && node "$name.test.mjs" ) || fail=1
done

echo ""
if [ "$fail" = "0" ]; then echo "全部测试通过"; else echo "存在失败用例"; exit 1; fi
