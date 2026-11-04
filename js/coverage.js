// 肌肉覆盖图（细分区版）：按 exercises 的 targetZh 细肌群分区，纯前端 SVG 上色。
// 关键改进：把"整条腿"拆成 股四/臀/腘绳、"背"拆成 背阔肌/上背、"手臂"拆成 肱二/肱三，
// 这样能真实暴露「股四练得少」这类短板（粗分区会把整条腿标绿而掩盖）。
// 复合动作的次要肌群用 SECONDARY 手动补偿（数据集只标主部位，否则会误报缺口）。
// 绿色越深=该部位组数越多；红框=本次没练到（建议补）。悬停图形看部位名。
(function () {
  // 11 个大部位（漏了会标红）。一三五合计应全覆盖。
  const GAP = ['chest', 'delts', 'biceps', 'triceps', 'core', 'lats', 'upperback', 'quads', 'glutes', 'hamstrings', 'calves'];
  const LABEL = {
    chest: '胸', delts: '肩', biceps: '肱二头', triceps: '肱三头', core: '腹/核心',
    lats: '背阔肌', upperback: '上背', quads: '股四头', glutes: '臀', hamstrings: '腘绳', calves: '小腿', forearms: '前臂'
  };

  // targetZh（细肌群）-> 分区
  const PRIMAP = {
    '胸肌': 'chest', '三角肌': 'delts', '肱二头肌': 'biceps', '肱三头肌': 'triceps', '腹肌': 'core',
    '背阔肌': 'lats', '上背肌': 'upperback', '斜方肌': 'upperback', '股四头肌': 'quads', '臀肌': 'glutes',
    '腘绳肌': 'hamstrings', '小腿': 'calves', '外展肌': 'glutes', '核心稳定': 'core', '前臂': 'forearms'
  };
  // bodyPartZh 兜底（个别动作缺 targetZh 时用）；大腿/手臂按部位拆分
  const BODYMAP = {
    '胸': ['chest'], '肩': ['delts'], '手臂': ['biceps', 'triceps'], '腰腹': ['core'],
    '背': ['lats', 'upperback'], '大腿': ['quads', 'glutes'], '小腿': ['calves'], '颈部': ['forearms']
  };
  // 复合动作次要肌群补偿：数据集只标主部位，这里补上真正的协同肌，避免假缺口
  const SECONDARY = {
    '1760': ['glutes'],            // 高脚杯深蹲：股四主，臀次
    '1459': ['hamstrings'],        // 罗马尼亚硬拉：臀主，腘绳次（真正的主练腘绳动作）
    '0381': ['hamstrings'],        // 后箭步蹲：臀主，腘绳次
    '0293': ['lats'],              // 俯身划船：上背主，背阔次
    '0651': ['biceps', 'upperback'], // 引体：背阔主，二头+上背次
    '0314': ['delts'],             // 上斜卧推：胸主，前束次
    '0289': ['delts', 'triceps'],  // 卧推：胸主，前束+三头次
    '0404': ['triceps'],           // 肩上推举：肩主，三头次
    '0334': ['traps'],             // 侧平举：中束主，斜方次（traps 入 upperback 显示）
    '0380': ['traps']              // 反向飞鸟：后束主，斜方次
  };

  function regionForExercise(ex) {
    if (!ex) return [];
    const t = ex.targetZh || ex.target || '';
    if (PRIMAP[t]) return [PRIMAP[t]];
    const b = ex.bodyPartZh || ex.bodyPart || '';
    if (BODYMAP[b]) return BODYMAP[b].slice();
    return [];
  }

  // 计算一组计划里每个分区的累计组数（含次要肌群补偿）
  function planLoads(ids) {
    const loads = {};
    (ids || []).forEach((pid) => {
      const p = (window.PRESET_PLANS || []).find((x) => x.id === pid);
      if (!p) return;
      (p.items || []).forEach((it) => {
        if (it.kind !== 'exercise' || !it.exId) return;
        const ex = window.AppData.get(it.exId);
        const regs = regionForExercise(ex).concat(SECONDARY[it.exId] || []);
        regs.forEach((r) => { loads[r] = (loads[r] || 0) + (it.sets || 0); });
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

  // 身体分区覆盖形状（正面 cx~90，背面 cx~270）；r 为细分区键
  const SHAPES = [
    // 正面
    { r: 'chest', t: 'ellipse', cx: 90, cy: 80, rx: 32, ry: 24 },
    { r: 'delts', t: 'ellipse', cx: 52, cy: 78, rx: 13, ry: 15 },
    { r: 'delts', t: 'ellipse', cx: 128, cy: 78, rx: 13, ry: 15 },
    { r: 'biceps', t: 'ellipse', cx: 50, cy: 110, rx: 9, ry: 18 },
    { r: 'biceps', t: 'ellipse', cx: 130, cy: 110, rx: 9, ry: 18 },
    { r: 'biceps', t: 'ellipse', cx: 46, cy: 140, rx: 7, ry: 17 },
    { r: 'biceps', t: 'ellipse', cx: 134, cy: 140, rx: 7, ry: 17 },
    { r: 'core', t: 'rect', x: 72, y: 102, w: 36, h: 46, rx: 9 },
    { r: 'quads', t: 'ellipse', cx: 72, cy: 210, rx: 15, ry: 44 },
    { r: 'quads', t: 'ellipse', cx: 108, cy: 210, rx: 15, ry: 44 },
    // 背面
    { r: 'lats', t: 'ellipse', cx: 270, cy: 72, rx: 30, ry: 18 },
    { r: 'delts', t: 'ellipse', cx: 232, cy: 80, rx: 13, ry: 15 },
    { r: 'delts', t: 'ellipse', cx: 308, cy: 80, rx: 13, ry: 15 },
    { r: 'upperback', t: 'ellipse', cx: 236, cy: 114, rx: 22, ry: 34 },
    { r: 'upperback', t: 'ellipse', cx: 304, cy: 114, rx: 22, ry: 34 },
    { r: 'upperback', t: 'ellipse', cx: 270, cy: 112, rx: 20, ry: 26 },
    { r: 'triceps', t: 'ellipse', cx: 234, cy: 120, rx: 9, ry: 18 },
    { r: 'triceps', t: 'ellipse', cx: 306, cy: 120, rx: 9, ry: 18 },
    { r: 'upperback', t: 'rect', x: 264, y: 94, w: 12, h: 70, rx: 4 },
    { r: 'glutes', t: 'ellipse', cx: 270, cy: 198, rx: 28, ry: 22 },
    { r: 'hamstrings', t: 'ellipse', cx: 252, cy: 242, rx: 14, ry: 38 },
    { r: 'hamstrings', t: 'ellipse', cx: 288, cy: 242, rx: 14, ry: 38 },
    { r: 'calves', t: 'ellipse', cx: 252, cy: 310, rx: 12, ry: 30 },
    { r: 'calves', t: 'ellipse', cx: 288, cy: 310, rx: 12, ry: 30 }
  ];

  function shapeSvg(sh, fill, fo, stroke) {
    const sw = stroke !== 'none' ? 2 : 0;
    const dash = stroke !== 'none' ? '4 3' : '';
    const common = `fill="${fill}" fill-opacity="${fo.toFixed(2)}" stroke="${stroke}" stroke-width="${sw}" stroke-dasharray="${dash}"`;
    const tip = `<title>${LABEL[sh.r] || sh.r}</title>`;
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
      <div class="cv-tip">绿色越深 = 该部位组数越多；<span class="cv-red">红框</span> = 本次没练到、建议补。腿已拆为 股四/臀/腘绳，背拆为 背阔肌/上背，手臂拆为 肱二/肱三。悬停图形看部位名。</div>`;
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
