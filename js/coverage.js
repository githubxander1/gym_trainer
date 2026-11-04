// 肌肉覆盖图：用 exercises 的 bodyPartZh（身体部位）做分区，纯前端 SVG 上色。
// 选 bodyPartZh 而非细肌群，是因为数据集对复合动作（如罗马尼亚硬拉）只标主部位（臀肌），
// 若按 targetZh 细算会把腘绳肌/斜方肌误报成缺口。另加「胸三维」指示灯补细维度。
// 绿色越深=该部位组数越多；红框=本次没练到（建议补）。
(function () {
  // 7 个需要覆盖的大部位（漏了会标红）
  const GAP = ['chest', 'shoulders', 'arms', 'core', 'back', 'thighs', 'calves'];
  const LABEL = {
    chest: '胸', shoulders: '肩', arms: '手臂', core: '腹/核心',
    back: '背', thighs: '大腿', calves: '小腿', neck: '颈'
  };

  // bodyPartZh -> 分区（前臂并入手臂，臀/腘绳/股四并入大腿，避免复合动作误报缺口）
  const BP_MAP = {
    '胸': ['chest'], '肩': ['shoulders'], '手臂': ['arms'], '前臂': ['arms'],
    '腰腹': ['core'], '背': ['back'], '大腿': ['thighs'], '小腿': ['calves'], '颈部': ['neck']
  };
  // targetZh -> bodyPartZh 兜底（个别动作缺 bodyPartZh 时用）
  const T2BP = {
    '胸肌': '胸', '三角肌': '肩', '肱二头肌': '手臂', '肱三头肌': '手臂', '腹肌': '腰腹',
    '上背肌': '背', '背阔肌': '背', '臀肌': '大腿', '股四头肌': '大腿', '腘绳肌': '大腿',
    '斜方肌': '背', '小腿': '小腿', '前臂': '手臂', '脊柱': '背'
  };

  function regionForExercise(ex) {
    if (!ex) return [];
    const b = ex.bodyPartZh || ex.bodyPart || '';
    if (BP_MAP[b]) return BP_MAP[b];
    const t = ex.targetZh || ex.target || '';
    if (T2BP[t]) return BP_MAP[T2BP[t]];
    return [];
  }

  // 计算一组计划里每个分区的累计组数
  function planLoads(ids) {
    const loads = {};
    (ids || []).forEach((pid) => {
      const p = (window.PRESET_PLANS || []).find((x) => x.id === pid);
      if (!p) return;
      (p.items || []).forEach((it) => {
        if (it.kind !== 'exercise' || !it.exId) return;
        const ex = window.AppData.get(it.exId);
        regionForExercise(ex).forEach((r) => { loads[r] = (loads[r] || 0) + (it.sets || 0); });
      });
    });
    return loads;
  }

  // 胸三维：从胸动作名称判断上/中/下是否都练到（回应"胸维度练全没"）
  function chestZones(ids) {
    const z = { upper: false, mid: false, lower: false };
    (ids || []).forEach((pid) => {
      const p = (window.PRESET_PLANS || []).find((x) => x.id === pid);
      if (!p) return;
      (p.items || []).forEach((it) => {
        if (it.kind !== 'exercise' || !it.exId) return;
        const ex = window.AppData.get(it.exId);
        if (!ex) return;
        const bp = ex.bodyPartZh || ex.bodyPart || '';
        if (bp !== '胸' && (ex.targetZh || '') !== '胸肌') return;
        const nm = ex.nameZh || ex.name || '';
        if (nm.includes('上斜') || nm.includes('上')) z.upper = true;
        else if (nm.includes('下斜') || nm.includes('下')) z.lower = true;
        else z.mid = true;
      });
    });
    return z;
  }

  // 身体分区覆盖形状（正面 cx~90，背面 cx~270）
  const SHAPES = [
    // 正面
    { r: 'chest', t: 'ellipse', cx: 90, cy: 80, rx: 32, ry: 24 },
    { r: 'shoulders', t: 'ellipse', cx: 52, cy: 78, rx: 13, ry: 15 },
    { r: 'shoulders', t: 'ellipse', cx: 128, cy: 78, rx: 13, ry: 15 },
    { r: 'arms', t: 'ellipse', cx: 50, cy: 110, rx: 9, ry: 18 },
    { r: 'arms', t: 'ellipse', cx: 130, cy: 110, rx: 9, ry: 18 },
    { r: 'arms', t: 'ellipse', cx: 46, cy: 140, rx: 7, ry: 17 },
    { r: 'arms', t: 'ellipse', cx: 134, cy: 140, rx: 7, ry: 17 },
    { r: 'core', t: 'rect', x: 72, y: 102, w: 36, h: 46, rx: 9 },
    { r: 'thighs', t: 'ellipse', cx: 72, cy: 210, rx: 15, ry: 44 },
    { r: 'thighs', t: 'ellipse', cx: 108, cy: 210, rx: 15, ry: 44 },
    { r: 'neck', t: 'rect', x: 82, y: 44, w: 16, h: 10, rx: 3 },
    // 背面
    { r: 'back', t: 'ellipse', cx: 270, cy: 72, rx: 30, ry: 18 },
    { r: 'shoulders', t: 'ellipse', cx: 232, cy: 80, rx: 13, ry: 15 },
    { r: 'shoulders', t: 'ellipse', cx: 308, cy: 80, rx: 13, ry: 15 },
    { r: 'back', t: 'ellipse', cx: 236, cy: 114, rx: 22, ry: 34 },
    { r: 'back', t: 'ellipse', cx: 304, cy: 114, rx: 22, ry: 34 },
    { r: 'back', t: 'ellipse', cx: 270, cy: 112, rx: 20, ry: 26 },
    { r: 'arms', t: 'ellipse', cx: 234, cy: 120, rx: 9, ry: 18 },
    { r: 'arms', t: 'ellipse', cx: 306, cy: 120, rx: 9, ry: 18 },
    { r: 'back', t: 'rect', x: 264, y: 94, w: 12, h: 70, rx: 4 },
    { r: 'thighs', t: 'ellipse', cx: 270, cy: 198, rx: 28, ry: 22 },
    { r: 'thighs', t: 'ellipse', cx: 252, cy: 242, rx: 14, ry: 38 },
    { r: 'thighs', t: 'ellipse', cx: 288, cy: 242, rx: 14, ry: 38 },
    { r: 'calves', t: 'ellipse', cx: 252, cy: 310, rx: 12, ry: 30 },
    { r: 'calves', t: 'ellipse', cx: 288, cy: 310, rx: 12, ry: 30 },
    { r: 'neck', t: 'rect', x: 262, y: 44, w: 16, h: 10, rx: 3 }
  ];

  function shapeSvg(sh, fill, fo, stroke) {
    const sw = stroke !== 'none' ? 2 : 0;
    const dash = stroke !== 'none' ? '4 3' : '';
    const common = `fill="${fill}" fill-opacity="${fo.toFixed(2)}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}"`;
    const tip = `<title>${LABEL[sh.r]}</title>`;
    if (sh.t === 'ellipse') {
      return `<ellipse cx="${sh.cx}" cy="${sh.cy}" rx="${sh.rx}" ry="${sh.ry}" ${common}>${tip}</ellipse>`;
    }
    return `<rect x="${sh.x}" y="${sh.y}" width="${sh.w}" height="${sh.h}" rx="${sh.rx}" ${common}>${tip}</rect>`;
  }

  function svgFor(loads) {
    const max = Math.max(1, ...Object.values(loads).map((v) => v || 0));
    const base = `
      <circle cx="90" cy="30" r="15" fill="#1c2230"/>
      <circle cx="270" cy="30" r="15" fill="#1c2230"/>
      <g fill="#161b24">
        <rect x="62" y="56" width="56" height="150" rx="24"/>
        <rect x="40" y="76" width="14" height="86" rx="7"/><rect x="126" y="76" width="14" height="86" rx="7"/>
        <rect x="66" y="190" width="18" height="150" rx="9"/><rect x="96" y="190" width="18" height="150" rx="9"/>
        <rect x="242" y="56" width="56" height="150" rx="24"/>
        <rect x="220" y="76" width="14" height="86" rx="7"/><rect x="306" y="76" width="14" height="86" rx="7"/>
        <rect x="246" y="190" width="18" height="150" rx="9"/><rect x="276" y="190" width="18" height="150" rx="9"/>
      </g>`;
    let shapes = '';
    SHAPES.forEach((sh) => {
      const load = loads[sh.r] || 0;
      let fill, fo = 1, stroke = 'none';
      if (load > 0) { fill = '#2dd4bf'; fo = 0.30 + 0.62 * (load / max); }
      else if (GAP.includes(sh.r)) { fill = '#2b313c'; stroke = '#ef4444'; }
      else { fill = '#2b313c'; }
      shapes += shapeSvg(sh, fill, fo, stroke);
    });
    return `<div class="cv-map"><svg viewBox="0 0 360 360" xmlns="http://www.w3.org/2000/svg">
      ${base}${shapes}
      <text x="90" y="356" text-anchor="middle" font-size="13" fill="#9aa7b8">正面</text>
      <text x="270" y="356" text-anchor="middle" font-size="13" fill="#9aa7b8">背面</text>
    </svg></div>`;
  }

  function statHtml(loads) {
    const covered = GAP.filter((r) => loads[r] > 0).length;
    const pct = Math.round((covered / GAP.length) * 100);
    return `<div class="cv-stat">
      <div class="cv-stat-num">${covered}/${GAP.length}</div>
      <div class="cv-stat-label">大部位覆盖 ${pct}%</div>
      <div class="cv-bar"><div class="cv-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  function chestZonesHtml(ids) {
    const z = chestZones(ids);
    const light = (on) => (on ? 'cv-light-on' : 'cv-light-off');
    return `<div class="cv-chest">
      <div class="cv-chest-title">胸三维覆盖</div>
      <div class="cv-chest-row">
        <span class="${light(z.upper)}">上胸 ${z.upper ? '✓' : '—'}</span>
        <span class="${light(z.mid)}">中胸 ${z.mid ? '✓' : '—'}</span>
        <span class="${light(z.lower)}">下胸 ${z.lower ? '✓' : '—'}</span>
      </div></div>`;
  }

  function listsHtml(loads) {
    const all = Object.keys(LABEL);
    const covered = all.filter((r) => loads[r] > 0).sort((a, b) => loads[b] - loads[a]);
    const gaps = GAP.filter((r) => !(loads[r] > 0));
    const coveredHtml = covered.map((r) =>
      `<div class="cv-item cv-ok"><span>${LABEL[r]}</span><b>${loads[r]}组</b></div>`).join('');
    const gapHtml = gaps.length
      ? gaps.map((r) => `<div class="cv-item cv-miss"><span>${LABEL[r]}</span><i>建议加动作</i></div>`).join('')
      : `<div class="cv-item cv-ok">无缺口 🎉</div>`;
    return `<div class="cv-lists">
      <div class="cv-col"><div class="cv-col-title cv-ok">已练到（${covered.length}）</div>${coveredHtml}</div>
      <div class="cv-col"><div class="cv-col-title cv-miss">待补（${gaps.length}）</div>${gapHtml}</div>
    </div>`;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function render(view) {
    const presets = window.PRESET_PLANS || [];
    const opts = presets.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('') +
      `<option value="__wx">📅 一三五（推 + 拉 + 腿）</option>` +
      `<option value="__all">全部预设计划</option>`;
    view.innerHTML = `<div class="section-title">肌肉覆盖图 · 一眼看练全没</div>
      <div class="cv-selector"><select id="cvSel">${opts}</select></div>
      <div id="cvBody"></div>
      <div class="cv-tip">绿色越深 = 该部位组数越多；<span class="cv-red">红框</span> = 本次没练到、建议补。悬停图形看部位名。</div>`;
    const sel = view.querySelector('#cvSel');
    function update() {
      const v = sel.value;
      let ids;
      if (v === '__wx') ids = ['mon-push', 'wed-pull', 'fri-legs'];
      else if (v === '__all') ids = presets.map((p) => p.id);
      else ids = [v];
      const loads = planLoads(ids);
      view.querySelector('#cvBody').innerHTML = svgFor(loads) + statHtml(loads) + chestZonesHtml(ids) + listsHtml(loads);
    }
    sel.onchange = update;
    sel.value = '__wx';
    update();
  }

  window.Coverage = { render };
})();
