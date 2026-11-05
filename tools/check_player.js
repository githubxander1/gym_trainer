// node tools/check_player.js：音乐状态机、单侧跟练和计划时长回归检查。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const exercises = JSON.parse(fs.readFileSync(path.join(root, 'data/exercises.json'), 'utf8'));
const plansContext = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/plans.js'), 'utf8'), plansContext);
const plans = plansContext.window.PRESET_PLANS;
const source = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
const flush = () => new Promise((resolve) => setImmediate(resolve));

function runtime(saved = {}) {
  const audios = [], elements = new Map(), storage = new Map(Object.entries(saved));
  let playError = null;
  class FakeAudio extends EventTarget {
    constructor() { super(); this.src = ''; this.paused = true; this.duration = 120; this.currentTime = 0; audios.push(this); }
    load() { this.currentTime = 0; this.paused = true; }
    play() {
      if (playError) return Promise.reject(playError);
      this.paused = false;
      queueMicrotask(() => { if (!this.paused) this.dispatchEvent(new Event('playing')); });
      return Promise.resolve();
    }
    pause() { this.paused = true; }
    emit(type) { this.dispatchEvent(new Event(type)); }
  }
  const window = Object.assign(new EventTarget(), {
    soundOn: false,
    AppData: { get: (id) => exercises.find((e) => e.id === id) },
  });
  const document = Object.assign(new EventTarget(), {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', style: {}, innerHTML: '' });
      return elements.get(id);
    },
  });
  const context = {
    window, document, Audio: FakeAudio, Event, navigator: {}, console,
    localStorage: { getItem: (k) => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, v) },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  };
  // 仅在测试 VM 中暴露段列表，产品接口不增加调试入口。
  vm.runInNewContext(source.replace('    estimatePlanSec,', '    estimatePlanSec, buildSegments,'), context);
  return { player: window.TrainerPlayer, window, elements, audios, setError: (error) => { playError = error; } };
}

async function main() {
  const r = runtime();
  assert.equal(r.player.getMusicState().volume, 0.16, '首次使用须有默认音量');
  assert.equal(runtime({ lianlian_music_volume_v1: '0' }).player.getMusicState().volume, 0, '保留主动静音');
  let changes = 0;
  r.window.addEventListener('trainer-music-change', () => changes++);
  r.player.setMusicEnabled(true);
  await flush();
  const audio = r.audios[0];
  for (let i = 1; i <= 6; i++) {
    audio.emit('ended');
    await flush();
    assert.equal(r.player.getMusicState().index, i % 6, '顺序播放且末曲回到第一首');
    assert.equal(audio.paused, false);
  }
  audio.currentTime = audio.duration;
  audio.emit('timeupdate');
  audio.emit('ended');
  await flush();
  assert.equal(r.player.getMusicState().index, 1, '末尾兜底与 ended 不重复切歌');
  assert.ok(changes > 6, '自动切歌同步界面');
  r.player.setMusicEnabled(false);
  audio.emit('ended');
  await flush();
  assert.equal(r.player.getMusicState().index, 1, '关闭后不自动推进');

  const blocked = runtime();
  blocked.setError(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  blocked.player.setMusicEnabled(true);
  await flush();
  assert.match(blocked.player.getMusicState().message, /点击/);
  blocked.setError(null);
  blocked.player.cycleMusic();
  await flush();
  assert.equal(blocked.player.getMusicState().index, 0, '点击恢复当前曲，不跳曲');
  assert.equal(blocked.player.getMusicState().message, '');

  const broken = runtime();
  broken.setError(new Error('decode failed'));
  broken.player.setMusicEnabled(true);
  await flush();
  assert.match(broken.player.getMusicState().message, /加载失败/);
  assert.equal(broken.player.getMusicState().index, 5, '失败最多尝试一轮，防止死循环');
  broken.setError(null);
  broken.player.cycleMusic();
  await flush();
  assert.equal(broken.player.getMusicState().message, '');

  const paused = runtime();
  await paused.player.start([{ kind: 'exercise', exId: '0314', sets: 1, reps: 8, mode: 'rep' }], { innerHTML: '' }, () => {});
  await flush();
  paused.elements.get('pauseBtn').onclick();
  paused.audios[0].emit('ended');
  await flush();
  assert.equal(paused.player.getMusicState().index, 0, '训练暂停后不自动切歌');
  paused.elements.get('pauseBtn').onclick();
  await flush();
  assert.equal(paused.audios[0].paused, false, '训练继续时恢复音乐');
  paused.elements.get('stopBtn').onclick();
  assert.equal(paused.audios[0].paused, true);

  for (const plan of plans.slice(0, 3)) {
    const segments = r.player.buildSegments(plan);
    const work = segments.filter((s) => s.type === 'work');
    // 期望段数从计划数据推导：每个训练组 1 段 + 每个有氧收尾 1 段，避免写死数字随计划改动失效。
    const expectedSets = plan.items.reduce((n, b) => n + (b.kind === 'exercise' ? (b.sets || 0) : b.kind === 'cardio' ? 1 : 0), 0);
    assert.equal(work.length, expectedSets, `${plan.id} 每个训练组与有氧收尾各对应 1 个执行段`);
    for (const block of plan.items) {
      if (block.kind !== 'exercise') continue;
      assert.ok(exercises.some((e) => e.id === block.exId), '动作必须真实存在');
      if (block.sideMode !== 'alternatingSets') continue;
      const sides = work.filter((s) => s.ex && s.ex.id === block.exId).map((s) => s.side);
      assert.deepEqual(Array.from(sides), ['左侧', '右侧', '左侧', '右侧']);
    }
    const minutes = r.player.estimatePlanSec(plan) / 60;
    assert.ok(minutes >= 30 && minutes <= 70, `${plan.id} 时长 ${minutes.toFixed(1)} 分钟（含跳绳收尾）`);
    console.log(`${plan.name}: ${work.length} 段，含热身/休息/放松/跳绳约 ${minutes.toFixed(1)} 分钟`);
  }
  // 图库只允许真实动作（带可播放动图），不允许自造静态示意图占位。
  assert.ok(!exercises.some((e) => String(e.id).startsWith('local-')), '图库不应含自建占位动作');
  const tap = r.player.buildSegments(plans[1]).find((s) => s.ex && s.ex.id === '3699' && s.type === 'work');
  assert.ok(tap, '周三须含肩点(3699)');
  assert.equal(tap.repMs, 3000, '肩点节奏与估时一致');
  // 其他七个预设没有丢失，旧计划缺少单侧字段时仍按原组数跟练。
  assert.equal(plans.length, 10);
  console.log('音乐自动切歌/末尾兜底/关闭暂停/错误恢复、左右侧及计划时长检查通过。');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
