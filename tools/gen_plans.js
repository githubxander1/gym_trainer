// 生成 data/plans.js：8 个预设计划，所有 exId 均按中文名从 exercises.json 解析，保证有效。
// 用法：node tools/gen_plans.js
const fs = require('fs');
const path = require('path');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'exercises.json'), 'utf8'));

const byZh = {};
data.forEach((x) => { if (x.nameZh) byZh[x.nameZh] = x.id; });
function id(name) {
  if (byZh[name]) return byZh[name];
  const hit = data.find((x) => x.nameZh && x.nameZh.includes(name));
  return hit ? hit.id : null;
}

// 主项（真实动作）：ex(name, sets, mode, val, rest)
function ex(name, sets, mode, val, rest) {
  const e = id(name);
  if (!e) throw new Error('未找到动作: ' + name);
  return { kind: 'exercise', exId: e, sets, mode, reps: mode === 'rep' ? val : 12, workSec: mode === 'time' ? val : 30, restSec: rest };
}
// 拉伸/说明项（可带 exId 或纯文字）
function st(name, desc, dur, exName) {
  const e = exName ? id(exName) : null;
  return { kind: 'stretch', name, desc, dur, exId: e || undefined };
}

const PLANS = [
  {
    id: 'mon-push', name: '周一 · 胸·肩·手臂', tags: [], level: '新手',
    intro: '主攻推类肌群：上胸 + 中胸 + 肩前/中束 + 三头。用健身房一体机做杠铃卧推，哑铃雕细节，折叠椅做臂屈伸，最后钻石俯卧撑收尾。',
    warmup: [ st('肩部环绕', '双臂前后画圈各 15 次，激活肩袖', 60), st('徒手开合臂', '双臂侧平举开合 20 次', 30) ],
    items: [
      ex('杠铃卧推', 4, 'rep', 8, 30), ex('哑铃上斜卧推', 4, 'rep', 8, 30), ex('哑铃飞鸟', 3, 'rep', 12, 30),
      ex('哑铃下斜卧推', 3, 'rep', 12, 30), ex('哑铃侧上举', 3, 'rep', 12, 30), ex('哑铃站姿交替过顶推举', 3, 'rep', 10, 30),
      ex('凳臂屈伸', 3, 'rep', 10, 30), ex('绳索下压', 3, 'rep', 12, 30), ex('钻石俯卧撑', 3, 'rep', 12, 30),
    ],
    cooldown: [ st('胸大肌拉伸', '靠门框或墙，手臂外展贴墙，身体前压 20 秒', 20), st('三头肌拉伸', '单臂过头顶屈肘，另一手轻压肘 20 秒', 20), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸') ],
  },
  {
    id: 'wed-pull', name: '周三 · 背·臂·核心', tags: [], level: '新手',
    intro: '主攻拉类肌群：背阔 + 背厚度 + 二头 + 后束 + 核心。一体机引体/划船/高位下拉，加单臂划船纠正左右失衡，反向飞鸟平衡推日，再加平板支撑转体练核心。',
    warmup: [ st('肩带激活', '招财猫或弹力带外旋 15 次，激活肩袖', 60) ],
    items: [
      ex('引体向上', 4, 'rep', 8, 30), ex('杠杆俯身划船', 4, 'rep', 10, 30), ex('绳索站姿高位下拉', 3, 'rep', 12, 30),
      ex('哑铃单臂俯身划船', 3, 'rep', 12, 30), ex('哑铃反向飞鸟', 3, 'rep', 12, 30), ex('哑铃二头弯举', 3, 'rep', 12, 25),
      ex('哑铃锤式弯举', 3, 'rep', 12, 25), ex('卷腹', 3, 'rep', 15, 25), ex('前平板支撑转体', 3, 'time', 45, 20),
    ],
    cooldown: [ st('背阔肌拉伸', '双手上举交扣，向一侧侧屈 20 秒', 20), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸') ],
  },
  {
    id: 'fri-legs', name: '周五 · 腿·臀', tags: [], level: '新手',
    intro: '主攻下肢：股四 + 臀 + 腘绳肌 + 小腿 + 核心。杠铃深蹲打底，臀桥练臀，箭步蹲与单腿动作雕线条，躺姿腿弯举孤立腘绳肌，提踵练小腿。',
    warmup: [ st('下肢动态激活', '摆腿 + 触趾 + 髋绕环 各 1 分钟', 90) ],
    items: [
      ex('杠铃深蹲', 4, 'rep', 10, 30), ex('杠铃臀桥', 3, 'rep', 12, 30), ex('哑铃直腿硬拉', 3, 'rep', 12, 30),
      ex('哑铃箭步蹲', 3, 'rep', 12, 30), ex('杠杆躺姿腿弯举', 3, 'rep', 12, 30), ex('侧弓步蹲', 3, 'rep', 12, 30),
      ex('自重站姿提踵', 3, 'rep', 15, 25), ex('哑铃站姿提踵', 3, 'rep', 15, 25), ex('俄罗斯转体', 3, 'rep', 20, 25),
    ],
    cooldown: [ st('腘绳肌拉伸', '坐姿或站姿勾脚前屈 20 秒', 20, '腿上腘绳肌拉伸'), st('臀桥拉伸', '仰卧抱单膝靠近胸部 20 秒', 20), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸') ],
  },
  {
    id: 'cardio-hiit', name: '有氧燃脂（HIIT）', tags: [], level: '新手',
    intro: '高心率循环：计时动作为主，短休息多组次，提升心肺与燃脂。热身可慢跑 2 分钟。',
    warmup: [ st('全身激活', '开合跳轻松 2 分钟 + 原地慢跑，活动全身', 120) ],
    items: [
      ex('开合跳', 4, 'time', 40, 15), ex('波比跳', 4, 'time', 30, 20), ex('登山者', 4, 'time', 40, 15),
      ex('高膝靠墙', 4, 'time', 40, 15), ex('上下踢腿', 3, 'time', 40, 15),
    ],
    cooldown: [ st('腘绳肌拉伸', '坐姿或站姿勾脚前屈 20 秒', 20, '腿上腘绳肌拉伸'), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸'), st('放松拉伸', '摇摆蛙拉伸放松髋部 20 秒', 20, '摇摆蛙拉伸') ],
  },
  {
    id: 'bodyweight', name: '徒手健身（全身自重）', tags: [], level: '新手',
    intro: '不用任何器械，纯靠自重覆盖全身。适合在家、出差或户外，随时随地开练。',
    warmup: [ st('动态激活', '触趾 + 手臂画圈 + 体转 各 1 分钟', 90) ],
    items: [
      ex('深俯卧撑', 3, 'rep', 12, 30), ex('反向超伸展', 3, 'rep', 15, 30), ex('自重站姿提踵', 3, 'rep', 15, 25),
      ex('前平板支撑转体', 3, 'time', 45, 20), ex('俄罗斯转体', 3, 'rep', 20, 25), ex('低臀桥地面', 3, 'rep', 15, 30),
      ex('登山者', 3, 'time', 30, 15), ex('屈曲腿仰卧起坐', 3, 'rep', 15, 25), ex('侧弓步蹲', 3, 'rep', 12, 30),
    ],
    cooldown: [ st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸'), st('放松拉伸', '摇摆蛙拉伸放松髋部 20 秒', 20, '摇摆蛙拉伸'), st('手腕拉伸', '手腕拉伸放松', 20, '侧腕拉拉伸') ],
  },
  {
    id: 'dumbbell', name: '哑铃健身（全身哑铃）', tags: [], level: '新手',
    intro: '一对哑铃练遍全身：下肢 + 推 + 拉 + 核心。居家或健身房都适用。',
    warmup: [ st('动态激活', '肩部环绕 + 徒手深蹲空杆感 2 分钟', 120) ],
    items: [
      ex('哑铃高脚杯深蹲', 3, 'rep', 12, 30), ex('哑铃罗马尼亚硬拉', 3, 'rep', 12, 30), ex('哑铃坐姿肩上推举', 3, 'rep', 12, 30),
      ex('哑铃飞鸟', 3, 'rep', 12, 30), ex('哑铃侧上举', 3, 'rep', 12, 30), ex('哑铃锤式弯举', 3, 'rep', 12, 25),
      ex('哑铃硬拉', 3, 'rep', 12, 30), ex('低臀桥地面', 3, 'rep', 15, 30),
    ],
    cooldown: [ st('腘绳肌拉伸', '坐姿或站姿勾脚前屈 20 秒', 20, '腿上腘绳肌拉伸'), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸'), st('椅腿伸展', '坐姿勾脚拉伸大腿前侧 20 秒', 20, '椅腿伸展拉伸') ],
  },
  {
    id: 'home-tone', name: '居家哑铃塑形', tags: [], level: '新手',
    intro: '适中强度，侧重臀腿线条、核心稳定与上肢紧致。哑铃重量适中即可，居家即可完成。',
    warmup: [ st('动态激活 + 骨盆倾斜', '肩部环绕 + 站立骨盆前后倾 各 1 分钟', 90) ],
    items: [
      ex('侧弓步蹲', 3, 'rep', 12, 30), ex('低臀桥地面', 3, 'rep', 15, 30), ex('哑铃高脚杯深蹲', 3, 'rep', 12, 30),
      ex('深俯卧撑', 3, 'rep', 10, 30), ex('哑铃侧上举', 3, 'rep', 12, 30), ex('俄罗斯转体', 3, 'rep', 15, 25),
      ex('前平板支撑转体', 3, 'time', 30, 20), ex('单腿桥伸展腿', 3, 'rep', 12, 30),
    ],
    cooldown: [ st('臀桥拉伸', '仰卧抱单膝靠近胸部 20 秒', 20), st('跑者拉伸', '小腿后侧拉伸', 20, '跑者拉伸'), st('手腕拉伸', '手腕拉伸放松', 20, '侧腕拉拉伸') ],
  },
];

// 校验：所有 exercise 必须解析到 exId
let bad = 0;
PLANS.forEach((p) => p.items.concat(p.warmup, p.cooldown).forEach((b) => {
  if (b.kind === 'exercise' && !b.exId) { console.error('缺失动作:', p.id, b); bad++; }
}));
if (bad) { console.error('有 ' + bad + ' 个动作未解析，终止'); process.exit(1); }

const out = '// 自动生成，请勿手改。改完请用 tools/gen_plans.js 重新生成。\nwindow.PRESET_PLANS = ' + JSON.stringify(PLANS, null, 2) + ';\n';
fs.writeFileSync(path.join(__dirname, '..', 'data', 'plans.js'), out, 'utf8');
console.log('已生成 data/plans.js，共 ' + PLANS.length + ' 个预设计划，全部 exId 校验通过。');
