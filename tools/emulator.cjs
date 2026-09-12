#!/usr/bin/env node
/**
 * Vela 模拟器管理脚本（封装 @aiot-toolkit/emulator，绕开交互式提问）
 *
 * 用法：
 *   node tools/emulator.cjs setup          # 写 versions.json + 创建小米手环10 虚拟机
 *   node tools/emulator.cjs list           # 列出已创建的虚拟机
 *   node tools/emulator.cjs start <name>   # 启动（前台，Ctrl-C 退出；日志直接打印）
 *   node tools/emulator.cjs startbg <name> # 后台启动并把日志写到 .emulator.log
 *   node tools/emulator.cjs stop <name>
 *
 * 前置：SDK 已在 ~/.vela/sdk（emulator / qa / skins / system-images / modem_simulator）。
 * 这些资源由官方 CDN 提供：
 *   https://vela-ide.cnbj3-fusion.mi-fds.com/vela-ide/...
 * 也可以直接跑 `npx aiot initEmulatorEnv` 让工具链自己下（会全量重下）。
 */
const os = require('os')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SDK_HOME = path.resolve(os.homedir(), '.vela', 'sdk')
const VVD_HOME = path.resolve(os.homedir(), '.vela', 'vvd')

// 与 @aiot-toolkit/emulator 的 constants.js 保持一致
const SDK_VERSIONS = {
  name: '版本管理',
  emulator: '0.1.0',
  qa: '0.0.1',
  skins: '0.0.10',
  'system-images': '20250716',
  modem_simulator: '0.0.3'
}

function req() {
  return require(path.join(ROOT, 'node_modules', '@aiot-toolkit', 'emulator'))
}

function makeManager() {
  const { VvdManager } = req()
  return new VvdManager({ sdkHome: SDK_HOME, vvdHome: VVD_HOME })
}

/** 写 versions.json，让工具链认为 SDK 已完整（否则会触发全量重下） */
function writeVersions() {
  const p = path.join(SDK_HOME, 'versions.json')
  fs.mkdirSync(SDK_HOME, { recursive: true })
  fs.writeFileSync(p, JSON.stringify(SDK_VERSIONS, null, 1))
  console.log('已写 ' + p)
}

function checkSDK() {
  const need = ['emulator', 'qa', 'skins', 'system-images', 'modem_simulator']
  const miss = need.filter(d => !fs.existsSync(path.join(SDK_HOME, d)))
  if (miss.length) {
    console.log('缺少 SDK 部件: ' + miss.join(', '))
    console.log('请先准备（见 README 或跑 npx aiot initEmulatorEnv）')
    return false
  }
  return true
}

async function setup(name, imageType, skinName) {
  writeVersions()
  if (!checkSDK()) process.exit(1)
  const vm = makeManager()
  const { VelaImageType, IVvdArchType } = req()

  const img = imageType || VelaImageType.VELA_MIWEAR_WATCH_5
  const imageDir = path.resolve(SDK_HOME, 'system-images', img)
  if (!fs.existsSync(imageDir)) {
    console.log('镜像目录不存在: ' + imageDir)
    process.exit(1)
  }

  // 找一个合适的皮肤（默认优先手环 10）
  const skins = await vm.getVelaSkinList()
  console.log('可用皮肤: ' + skins.map(s => s.name).join(', '))
  let skin = skins.find(s => s.name === (skinName || 'xiaomi_band_10')) ||
             skins.find(s => /band/.test(s.name))
  if (skin) console.log('使用皮肤: ' + skin.name + '  (' + skin.path + ')')

  const vvdName = name || 'band10'
  // 先删旧的同名虚拟机
  try { vm.deleteVvd(vvdName) } catch (e) {}

  const params = {
    name: vvdName,
    arch: IVvdArchType.arm,
    imageDir: imageDir,
    imageType: img,
    customLcdRadius: ''
  }
  if (skin) {
    params.skin = skin.name
    params['skin.path'] = skin.path
  } else {
    // 没有皮肤就显式给尺寸（小米手环 10：212×520 胶囊屏）
    params.width = '212'
    params.height = '520'
  }
  vm.createVvd(params)
  const cfg = path.join(VVD_HOME, vvdName + '.vvd', 'config.ini')
  console.log('已创建虚拟机 ' + vvdName + '，配置：')
  console.log(fs.readFileSync(cfg, 'utf-8').split('\n').filter(l => /lcd|skin|ram|arch|image|flavor|radius/.test(l)).join('\n'))
  console.log('\n启动：node tools/emulator.cjs startbg ' + vvdName)
}

function list() {
  const vm = makeManager()
  const vvds = vm.getVvdList ? vm.getVvdList() : []
  if (!vvds.length) { console.log('还没有创建任何虚拟机'); return }
  for (const v of vvds) {
    const info = vm.getVvdInfo(v)
    console.log(`${v}\t${info.imageType || '?'}\t${info.width || ''}x${info.height || ''}\t${info.skin || ''}`)
  }
}

async function start(vvdName, background) {
  const vm = makeManager()
  const { stdout, stderr } = background
    ? { stdout: fs.createWriteStream(path.join(ROOT, '.emulator.log')), stderr: fs.createWriteStream(path.join(ROOT, '.emulator.log')) }
    : { stdout: process.stdout, stderr: process.stderr }
  console.log('启动 ' + vvdName + '（首次启动要 1~3 分钟）')
  const res = await vm.startVvd({
    vvdName,
    stdoutCallback: msg => stdout.write(msg + '\n'),
    stderrCallback: msg => stderr.write(msg + '\n')
  })
  console.log('coldBoot=' + res.coldBoot + '  serial=' + (res.emulatorInstance && res.emulatorInstance.serialPort))
  return res
}

async function stop(vvdName) {
  const { getRunningVvds } = req()
  const run = await getRunningVvds()
  const e = run.find(x => x['avd.name'] === vvdName)
  if (!e) { console.log('该虚拟机没有在运行'); return }
  const { execFileSync } = require('child_process')
  console.log('杀掉 pid ' + e.pid)
  try { execFileSync('taskkill', ['/PID', String(e.pid), '/T', '/F'], { stdio: 'inherit' }) } catch (err) {}
}

const [cmd, arg1, arg2, arg3] = process.argv.slice(2)
if (cmd === 'setup') setup(arg1, arg2, arg3).catch(e => { console.error('失败:', e.message || e); process.exit(1) })
else if (cmd === 'list') list()
else if (cmd === 'start') start(arg1 || 'band10', false).catch(e => { console.error('失败:', e.message || e); process.exit(1) })
else if (cmd === 'startbg') start(arg1 || 'band10', true).then(() => process.exit(0)).catch(e => { console.error('失败:', e.message || e); process.exit(1) })
else if (cmd === 'stop') stop(arg1 || 'band10').catch(e => { console.error('失败:', e.message || e); process.exit(1) })
else {
  console.log(`用法：
  node tools/emulator.cjs setup [虚拟机名] [镜像类型] [皮肤名]
  node tools/emulator.cjs list
  node tools/emulator.cjs start   <虚拟机名>
  node tools/emulator.cjs startbg <虚拟机名>
  node tools/emulator.cjs stop    <虚拟机名>

默认：虚拟机名 band10，镜像 vela-miwear-watch-5.0，皮肤 xiaomi_band_10（212×520 胶囊屏）`)
}
