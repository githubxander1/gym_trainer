// node tools/check_log.js：训练记录日历的渲染、点击补记与本地存储回归检查。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert.match(html, /data-tab="log"/, '底部导航须有记录入口');
assert.match(html, /v=20261117c/, '静态资源版本号须更新，避免缓存旧脚本');

const storage = new Map();
const today = new Date();
const pad = (n) => String(n).padStart(2, '0');
const todayKey = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

function el(extra = {}) {
  return Object.assign({ textContent: '', title: '', value: '', innerHTML: '', style: {},
    classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {},
    addEventListener() {}, querySelectorAll: () => [] }, extra);
}
const tabs = ['library', 'knowledge', 'coverage', 'log', 'plan'].map((tab) => el({ dataset: { tab } }));
const view = el({
  querySelectorAll(sel) {
    if (sel === '.cal-cell[data-date]') {
      if (!this._cells) this._cells = new Map();
      return Array.from(this.innerHTML.matchAll(/data-date="([^"]+)"/g), (m) => {
        if (!this._cells.has(m[1])) {
          const b = el({ dataset: { date: m[1] } });
          b.onclick = null;
          this._cells.set(m[1], b);
        }
        return this._cells.get(m[1]);
      });
    }
    return [];
  },
});
const document = {
  getElementById(id) { return id === 'view' ? view : el(); },
  querySelectorAll(sel) { return sel === '.tab' ? tabs : []; },
  createElement: () => el(), body: { appendChild() {} }, addEventListener() {},
};
const window = Object.assign(new EventTarget(), {
  AppData: { load: async () => {}, all: () => [], get: () => null, bodyParts: () => [] },
  TrainerPlayer: { getMusicState: () => ({ message: '', enabled: false, index: 0, track: '', volume: 0.16 }), cycleMusic() {}, setMusicVolume() {}, start() {} },
  Coverage: { render() {} }, PRESET_PLANS: [], KNOWLEDGE: [],
});
const context = { window, document, console,
  localStorage: { getItem: (k) => storage.has(k) ? storage.get(k) : null, setItem: (k, v) => storage.set(k, v) },
  setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), context);

async function main() {
  await new Promise((r) => setImmediate(r));
  assert.ok(typeof tabs[3].onclick === 'function', '记录 tab 须绑定路由');
  tabs[3].onclick();
  assert.match(view.innerHTML, /训练记录/, '记录页须渲染日历');
  assert.match(view.innerHTML, new RegExp(todayKey), '日历须包含今天');
  const days = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  assert.equal(view.innerHTML.split('data-date=').length - 1, days, '日历天数须与当月一致');

  const cell = () => view.querySelectorAll('.cal-cell[data-date]').find((b) => b.dataset.date === todayKey);
  assert.ok(cell(), '今天须可点');
  cell().onclick();
  assert.ok(JSON.parse(storage.get('lianlian_train_days_v1')).includes(todayKey), '点击后须写入本地存储');
  assert.match(view.innerHTML, /本月 <b>1<\/b> 天/, '本月统计须更新');
  cell().onclick();
  assert.equal(JSON.parse(storage.get('lianlian_train_days_v1')).length, 0, '再次点击须取消记录');

  const player = fs.readFileSync(path.join(root, 'js/player.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  assert.match(player, /onFinish\(true\)/, '只有完整练完才回传完成标记');
  assert.match(player, /onFinish\(false\)/, '中途结束不得自动记训练');
  assert.match(app, /if \(completed && markToday\(\)\)/, '完成后自动记今天');
  console.log('训练日历渲染/补记/取消/本地存储与完成自动记录检查通过。');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
