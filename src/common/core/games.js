/**
 * 棋种注册表 —— 主菜单、设置页、规则页共用一份元数据。
 * 规则文案取自原版「方寸棋阁」内置的规则说明内容。
 */

export const GAMES = [
  {
    key: 'ttt',
    name: '井字棋',
    icon: '/common/icon/ttt.png',
    boardDesc: '3×3',
    levels: ['新兵', '下士', '大师'],
    modes: ['ai', 'pvp'],
    timer: false,
    save: true,
    help: [
      { h: '基本规则', p: '1. 双方轮流落子，X 先行\n2. 任意一行 / 一列 / 斜线先连成三子者获胜\n3. 九格下满仍无三子连珠，判平局' },
      { h: '难度说明', p: '1. 新兵：随手乱下\n2. 下士：会赢也会堵，但仍有疏忽\n3. 大师：完全搜索，理论上永不失误' }
    ]
  },
  {
    key: 'wzq',
    name: '五子棋',
    icon: '/common/map/wzq15.png',
    boardDesc: '15 / 17 / 19 路',
    levels: ['菜鸟', '普通', '高手'],
    modes: ['ai', 'pvp'],
    timer: true,
    save: true,
    help: [
      { h: '基本规则', p: '1. 双方轮流落子，黑棋先行\n2. 棋子落在棋盘交叉点上\n3. 先连成五子者获胜' },
      { h: '时间规则', p: '1. 双人对战可开启时间限制\n2. 超时判负' }
    ]
  },
  {
    key: 'wq',
    name: '围棋',
    icon: '/common/map/wq19.png',
    boardDesc: '19×19',
    levels: ['黄毛小儿', '遛弯大叔', '退休大爷', '流浪棋手'],
    modes: ['ai', 'pvp', 'fun'],
    timer: true,
    save: true,
    help: [
      { h: '基本规则', p: '1. 双方轮流落子，黑棋先行\n2. 棋子落在交叉点上\n3. 无气不能落子\n4. 禁止全局同形（打劫）' },
      { h: '死活常识', p: '1. 一口气的棋必须立即救\n2. 两口以上可选择策略应对' },
      { h: '胜负判定', p: '1. 吃子数：适合快棋，进攻型\n2. 余子决胜：存活棋子数达到目标数量，存活多者获胜，适合慢棋、围地型' }
    ]
  },
  {
    key: 'xq',
    name: '象棋',
    icon: '/common/ui/xq.png',
    boardDesc: '9×10',
    levels: ['路边一条', '菜鸟', '混的人', '棋圣'],
    modes: ['ai', 'pvp'],
    timer: true,
    save: true,
    help: [
      { h: '基本规则', p: '1. 双方轮流走棋，红棋先行\n2. 棋子只能按规则移动\n3. 困毙对方（无子可走）也获胜' },
      { h: '棋子走法', p: '1. 将/帅：九宫内直走一格\n2. 士/仕：九宫内斜走一格\n3. 象/相：走田字，不能过河\n4. 马：走日字，可被蹩腿\n5. 车：横竖直线任意格\n6. 炮：直线走，隔子吃\n7. 兵/卒：过河前只能前进，过河后可平移' },
      { h: '胜负', p: '1. 吃掉对方将/帅即获胜\n2. 将帅不能照面\n3. 无合法走法判负' }
    ]
  },
  {
    key: 'gjxq',
    name: '国际象棋',
    icon: '/common/chess/gjxq/b_knight.png',
    boardDesc: '8×8',
    levels: ['普通', '高级', '大师'],
    modes: ['ai', 'pvp'],
    timer: true,
    save: true,
    help: [
      { h: '基本规则', p: '1. 双方轮流走棋，白棋先行\n2. 吃掉对方国王即获胜\n3. 可以逼和达成平局' },
      { h: '棋子走法', p: '1. 国王：任意方向走一格\n2. 王后：横竖斜任意格\n3. 主教：斜走任意格\n4. 骑士：走 L 形，可跨越\n5. 城堡：横竖任意格\n6. 兵：直走一格，斜吃' },
      { h: '特殊规则', p: '1. 王车易位：国王和车都未移动过\n2. 兵升变：到达底线可升变\n3. 吃过路兵：特定条件下可吃' }
    ]
  },
  {
    key: 'jq',
    name: '军棋',
    icon: '/common/ui/jq.png',
    boardDesc: '5×12 · 翻翻棋 / 暗棋',
    levels: ['新兵', '下士'],
    modes: ['ai', 'pvp'],
    timer: true,
    save: true,
    help: [
      { h: '棋子级别', p: '1. 司令 > 军长 > 师长 > 旅长 > 团长 > 营长\n2. 连长 > 排长 > 工兵\n3. 同级棋子相遇，同归于尽\n4. 工兵挖地雷，挖到军旗获胜\n5. 炸弹炸任何子，双方消失\n6. 军旗需要在排完地雷后被吃' },
      { h: '棋盘规则', p: '1. 行营是安全岛，不能吃行营中的棋子\n2. 工兵可在铁路线上任意转弯\n3. 其他棋子铁路上只能直走\n4. 必须先挖光对方地雷才能扛旗' },
      { h: '暗棋布阵', p: '1. 双方轮流排兵布阵，初始按默认阵型摆放\n2. 选中 A 棋子再选 B 棋子可交换位置\n3. 炸弹不能放置在第一排\n4. 地雷必须放置在后两排\n5. 军旗必须放置在大本营中' }
    ]
  },
  {
    key: 'dsq',
    name: '斗兽棋',
    icon: '/common/chess/dsq/b_shi.png',
    boardDesc: '7×9 · 河流 / 陷阱',
    levels: ['菜鸟', '普通', '高手'],
    modes: ['ai', 'pvp'],
    timer: true,
    save: true,
    help: [
      { h: '棋子等级', p: '1. 象 > 狮 > 虎 > 豹 > 狼 > 狗 > 猫 > 鼠\n2. 大吃小，同级吃方存活\n3. 鼠可以吃象' },
      { h: '河流规则', p: '1. 只有鼠可入河\n2. 水中鼠不能吃岸上象\n3. 岸上棋子不能吃水中鼠\n4. 狮虎可跳河\n5. 河中有鼠则不能跳' },
      { h: '陷阱规则', p: '1. 进入敌方陷阱失去战斗力\n2. 离开陷阱后恢复' },
      { h: '胜利条件', p: '1. 进入对方兽穴\n2. 吃光对方棋子\n3. 对方无子可动' }
    ]
  },
  {
    key: 'fxq',
    name: '飞行棋',
    icon: '/common/chess/fxq/fxqg.png',
    boardDesc: '4 方 · 每人 4 机',
    levels: ['普通', '高手'],
    modes: ['ai', 'pvp'],
    timer: false,
    save: true,
    help: [
      { h: '基本规则', p: '1. 四方玩家轮流掷骰子，按点数移动棋子\n2. 每方 4 枚棋子，需掷出起飞点数才能起飞\n3. 所有棋子到达终点者获胜\n4. 掷出 6 点可再掷一次' },
      { h: '起飞与移动', p: '1. 掷出指定点数可将棋子移出基地到起飞点\n2. 按骰子点数顺时针移动棋子\n3. 每次只能移动一枚棋子\n4. 步数超出终点时需要往回走' },
      { h: '跳跃与飞行', p: '1. 同色跳跃：落在同色格子上可跳跃 4 格\n2. 虚线飞行：特定位置可快速飞到对面\n3. 终点跑道内不能跳跃' },
      { h: '撞机与叠机', p: '1. 落在敌方叠子上，双方所有棋子返回基地\n2. 多枚己方棋子可重叠在同一位置' }
    ]
  }
]

export function byKey(key) {
  for (let i = 0; i < GAMES.length; i++) if (GAMES[i].key === key) return GAMES[i]
  return GAMES[0]
}

/** 时间限制预设（分钟） */
export const TIME_PRESETS = [15, 30, 45, 60]

/** 默认设置 */
export function defaultOptions(game) {
  return {
    game: game.key,
    board: game.key === 'wzq' ? 15 : (game.key === 'wq' ? 19 : 0),
    level: 1,
    mode: 'ai',
    // 军棋玩法：'flip' 翻翻棋 / 'hidden' 暗棋
    variant: game.key === 'jq' ? 'hidden' : '',
    // 围棋胜负判定：'capture' 吃子数 / 'remain' 余子决胜
    judge: game.key === 'wq' ? 'capture' : '',
    // 围棋吃子目标
    target: 10,
    useTimer: false,
    baseMinutes: 30,
    addSeconds: 5,
    // 飞行棋起飞点数
    takeoff: 6
  }
}
