#!/usr/bin/env node
/**
 * 从 Vela 模拟器截图（走官方 gRPC 通道）
 *
 * 用法：
 *   node tools/emulator-shot.cjs [虚拟机名] [输出png]
 *   node tools/emulator-shot.cjs band10 tools/preview/out/_emu.png
 *
 * 前提：模拟器已启动（node tools/emulator.cjs startbg band10）
 */
const os = require('os')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const name = process.argv[2] || 'band10'
const out = path.resolve(ROOT, process.argv[3] || 'tools/preview/out/_emu.png')

const { VvdManager } = require(path.join(ROOT, 'node_modules', '@aiot-toolkit', 'emulator'))

async function main() {
  const vm = new VvdManager({
    sdkHome: path.resolve(os.homedir(), '.vela', 'sdk'),
    vvdHome: path.resolve(os.homedir(), '.vela', 'vvd')
  })
  // 已启动时 startVvd 会直接返回现有实例与 agent
  const res = await vm.startVvd({ vvdName: name })
  const agent = await res.getAgent()
  // 先点一下把屏幕唤醒（手环息屏后截图会返回上一帧）
  try {
    await agent.sendMouse({ x: 106, y: 300, buttons: 1 })
    await new Promise(r => setTimeout(r, 120))
    await agent.sendMouse({ x: 106, y: 300, buttons: 0 })
    await new Promise(r => setTimeout(r, 600))
  } catch (e) { console.log('唤醒失败（忽略）: ' + (e.message || e)) }
  const buf = await agent.getScreenshot()
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buf)
  console.log('已截图 -> ' + out + '  (' + buf.length + ' 字节)')
  return res
}

main().then(r => process.exit(0)).catch(e => { console.error('截图失败:', e && (e.message || e)); process.exit(1) })
