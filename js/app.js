// 主控制器：视图路由 + 动作库 + 计划编排 + 启动跟练
(function () {
  const LS_PLAN = 'lianlian_plan_v1';
  const LS_SOUND = 'lianlian_sound_v1';

  let plan = [];                 // [{exId, sets, mode:'rep'|'time', reps, workSec, restSec}]
  let currentTab = 'library';
  let filterPart = '全部';
  let filterEq = '全部';
  let keyword = '';
  let filterGoal = '全部';
  let planRoute = 'library';   // 'library' | 'detail' | 'custom'
  let planDetailId = null;

  const view = document.getElementById('view');
  const tabs = document.querySelectorAll('.tab');
  const planBadge = document.getElementById('planBadge');
  const soundBtn = document.getElementById('soundToggle');

  window.soundOn = localStorage.getItem(LS_SOUND) !== 'off';

  function updateSoundBtn() {
    soundBtn.textContent = window.soundOn ? '🔊' : '🔇';
    soundBtn.classList.toggle('off', !window.soundOn);
  }
  soundBtn.onclick = () => {
    window.soundOn = !window.soundOn;
    localStorage.setItem(LS_SOUND, window.soundOn ? 'on' : 'off');
    updateSoundBtn();
    if (!window.soundOn) { try { speechSynthesis.cancel(); } catch (e) {} }
  };

  // ---------- 预设计划（一/三/五 全身，约30分钟） ----------
  // 组间休息统一 ≤30s（有氧类更短），避免长时间空等
  const PRESETS = {
    '周一·全身A': [
      ['dumbbell goblet squat', 3, 'rep', 12, 30],
      ['deep push up', 3, 'rep', 12, 30],
      ['barbell bent over row', 3, 'rep', 12, 30],
      ['front plank with twist', 3, 'time', 45, 20],
      ['dumbbell seated shoulder press', 3, 'rep', 12, 30],
      ['russian twist', 3, 'rep', 20, 30],
      ['bodyweight standing calf raise', 3, 'rep', 15, 30],
    ],
    '周三·全身B': [
      ['wide grip pull-up', 3, 'rep', 8, 30],
      ['barbell lunge', 3, 'rep', 12, 30],
      ['dumbbell hammer curl', 3, 'rep', 12, 30],
      ['low glute bridge on floor', 3, 'rep', 15, 30],
      ['dumbbell lateral raise', 3, 'rep', 12, 30],
      ['burpee', 3, 'time', 30, 20],
      ['flexion leg sit up (bent knee)', 3, 'rep', 15, 30],
    ],
    '周五·全身C': [
      ['dumbbell romanian deadlift', 3, 'rep', 12, 30],
      ['diamond push-up', 3, 'rep', 10, 30],
      ['dumbbell fly', 3, 'rep', 12, 30],
      ['mountain climber', 3, 'time', 30, 20],
      ['weighted tricep dips', 3, 'rep', 10, 30],
      ['reverse crunch', 3, 'rep', 15, 30],
      ['high knee against wall', 3, 'time', 30, 20],
    ],
  };

  // ---------- 目标训练计划模板 ----------
  const GOALS = {
    '增肌': { cls: 'g-bulk',  label: '增肌' },
    '减脂': { cls: 'g-cut',   label: '减脂' },
    '练胸': { cls: 'g-chest', label: '练胸' },
    '全身': { cls: 'g-full',  label: '全身' },
  };
  const PLANS = [
    { id: 'bulk-fullbody', goal: '增肌', name: '新手全身增肌',
      intro: '适合新手的 4 周全身增肌，每周 3 次，循序渐进上重量。',
      restSec: 45,
      items: [['dumbbell goblet squat',3,12],['deep push up',3,12],['barbell bent over row',3,12],['dumbbell seated shoulder press',3,12],['barbell lunge',3,12],['dumbbell romanian deadlift',3,12],['dumbbell hammer curl',3,12],['bodyweight standing calf raise',3,15]] },
    { id: 'cut-hiit', goal: '减脂', name: '燃脂循环 HIIT',
      intro: '高心率循环训练，短休息多组次，适合减脂与提升心肺。',
      restSec: 20,
      items: [['burpee',3,15],['mountain climber',3,20],['dumbbell goblet squat',3,15],['deep push up',3,15],['high knee against wall',3,30],['dumbbell romanian deadlift',3,12]] },
    { id: 'chest-special', goal: '练胸', name: '胸肌专项',
      intro: '集中刺激胸大肌，推类+夹类组合，雕琢上胸与中缝。',
      restSec: 45,
      items: [['deep push up',3,15],['diamond push-up',3,12],['dumbbell fly',3,12],['chest dip on straight bar',3,8],['cable middle fly',3,12]] },
    { id: 'sample-fullbody', goal: '全身', name: '示例全身',
      intro: '极简入门：两个动作覆盖下肢与胸，每次 15–20 分钟。',
      restSec: 45,
      items: [['dumbbell goblet squat',3,12],['deep push up',3,12]] },
  ];
  // 休息建议：按动作类型给出更合理的组间休息（统一 ≤30s，避免空等）
  function suggestRest(ex) {
    const n = ((ex && (ex.name || '')) + ' ' + (ex && (ex.targetZh || ''))).toLowerCase();
    if (/(burpee|mountain climber|high knee|plank|jump|running|sprint|jog|climb|skip)/.test(n)) return 15; // 有氧/计时类：短休息
    if (/(curl|raise|fly|crunch|twist|dip|calf|lateral|sit up|reverse|glute|extension|leg raise|hip thrust|hip)/.test(n)) return 25; // 孤立/小肌群：中等
    return 30; // 复合/大肌群：封顶 30s
  }

  function resolveTemplate(tpl) {
    const items = [];
    for (const [nm, sets, reps] of tpl.items) {
      const ex = window.AppData.getByName(nm);
      if (!ex) continue;
      items.push({ exId: ex.id, sets, mode: 'rep', reps, workSec: 30, restSec: suggestRest(ex) });
    }
    return items;
  }
  function planStats(items) {
    const count = items.length;
    const groups = items.reduce((s, it) => s + (it.sets || 0), 0);
    const mins = Math.max(1, Math.round(estimateSec(items) / 60));
    return { count, groups, mins };
  }

  function loadPreset(name) {
    const def = PRESETS[name];
    if (!def) return;
    const items = [];
    for (const [nm, sets, mode, val, rest] of def) {
      const ex = window.AppData.getByName(nm);
      if (!ex) continue;
      items.push({
        exId: ex.id, sets, mode,
        reps: mode === 'rep' ? val : 12,
        workSec: mode === 'time' ? val : 30,
        restSec: rest,
      });
    }
    if (!items.length) { alert('该计划动作未在当前动作库中'); return; }
    plan = items;
    savePlan(); updateBadge(); renderPlanView();
  }

  // ---------- 计划持久化 ----------
  function savePlan() { localStorage.setItem(LS_PLAN, JSON.stringify(plan)); }
  function loadPlan() {
    try { plan = JSON.parse(localStorage.getItem(LS_PLAN)) || []; } catch (e) { plan = []; }
  }
  function updateBadge() {
    planBadge.textContent = plan.length;
    planBadge.hidden = plan.length === 0;
  }

  // ---------- 库（含分页，避免一次渲染上千张卡片导致卡顿） ----------
  const PAGE_SIZE = 60;
  let shown = PAGE_SIZE;

  function renderLibrary() {
    const parts = ['全部', ...window.AppData.bodyParts()];
    const partChips = parts.map((p) =>
      `<button class="chip ${p === filterPart ? 'active' : ''}" data-part="${p}">${p}</button>`).join('');
    const eqs = ['全部', ...equipList()];
    const eqChips = eqs.map((q) =>
      `<button class="chip ${q === filterEq ? 'active' : ''}" data-eq="${q}">${q}</button>`).join('');
    view.innerHTML = `
      <input class="search" id="searchInput" placeholder="搜索动作名 / 部位 / 器械" value="${esc(keyword)}" />
      <div class="filter-block">
        <div class="filter-label">按部位</div>
        <div class="chips" id="partChips">${partChips}</div>
      </div>
      <div class="filter-block">
        <div class="filter-label">按器械</div>
        <div class="chips" id="eqChips">${eqChips}</div>
      </div>
      <div class="list" id="list"></div>`;

    const input = document.getElementById('searchInput');
    const onSearch = () => { keyword = input.value.trim().toLowerCase(); shown = PAGE_SIZE; updateList(); };
    input.addEventListener('input', onSearch);
    input.addEventListener('compositionend', onSearch); // 拼音输入法提交后再过滤，避免中文搜不到
    view.querySelectorAll('#partChips .chip').forEach((c) => {
      c.onclick = () => { filterPart = c.dataset.part; shown = PAGE_SIZE; updateList(); };
    });
    view.querySelectorAll('#eqChips .chip').forEach((c) => {
      c.onclick = () => { filterEq = c.dataset.eq; shown = PAGE_SIZE; updateList(); };
    });
    shown = PAGE_SIZE;
    updateList();
  }

  function updateList() {
    const all = filtered();
    const visible = all.slice(0, shown);
    const listEl = document.getElementById('list');
    let html = visible.map((ex) => cardHtml(ex)).join('');
    if (!all.length) {
      html = `<div class="empty"><div class="big">🔍</div>没有匹配的动作</div>`;
    } else {
      const remaining = all.length - visible.length;
      if (remaining > 0) {
        html += `<button class="more-btn" id="moreBtn">加载更多（还有 ${remaining} 个）</button>`;
      }
    }
    listEl.innerHTML = html;
    const mb = document.getElementById('moreBtn');
    if (mb) mb.onclick = () => { shown += PAGE_SIZE; updateList(); };
    listEl.querySelectorAll('.add-btn').forEach((b) => {
      b.onclick = () => addToPlan(b.dataset.id);
    });
    listEl.querySelectorAll('.card').forEach((c) => {
      c.onclick = (e) => { if (e.target.classList.contains('add-btn')) return; openDetail(c.dataset.id); };
    });
  }

  function filtered() {
    let arr = window.AppData.all();
    if (filterPart !== '全部') arr = arr.filter((e) => e.bodyPartZh === filterPart);
    if (filterEq !== '全部') arr = arr.filter((e) => e.equipmentZh === filterEq);
    if (keyword) {
      arr = arr.filter((e) =>
        (e.nameZh || '').toLowerCase().includes(keyword) ||
        (e.name || '').toLowerCase().includes(keyword) ||
        (e.bodyPartZh || '').toLowerCase().includes(keyword) ||
        (e.equipmentZh || '').toLowerCase().includes(keyword) ||
        (e.targetZh || '').toLowerCase().includes(keyword));
    }
    return arr;
  }

  // 器械清单（用于筛选，常用在前）
  function equipList() {
    const set = new Set(window.AppData.all().map((e) => e.equipmentZh).filter(Boolean));
    const ORDER = ['自重', '哑铃', '杠铃', '壶铃', '弹力带', '绳索', '史密斯机'];
    return ORDER.filter((q) => set.has(q)).concat(Array.from(set).filter((q) => !ORDER.includes(q)));
  }

  function cardHtml(ex) {
    const inPlan = plan.some((p) => p.exId === ex.id);
    return `
      <div class="card" data-id="${ex.id}">
        <img class="thumb" src="${ex.image}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'">
        <div class="meta">
          <div class="name">${esc(ex.nameZh || ex.name)}</div>
          <div class="sub"><span class="tag">${esc(ex.bodyPartZh)}</span><span class="tag">${esc(ex.equipmentZh)}</span></div>
        </div>
        <button class="add-btn" data-id="${ex.id}" title="加入计划">${inPlan ? '✓' : '+'}</button>
      </div>`;
  }

  function openDetail(id) {
    const ex = window.AppData.get(id);
    if (!ex) return;
    const steps = (ex.stepsZh && ex.stepsZh.length) ? ex.stepsZh : (ex.instructionsZh || '').split('\n').filter(Boolean);
    const stepsHtml = steps.map((s) => `<li>${esc(s)}</li>`).join('') || '<li>（暂无中文要点）</li>';
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `
      <div class="sheet">
        <button class="close">关闭</button>
        <img class="sheet-gif" src="${ex.gif}" alt="" onerror="this.style.display='none'">
        <h3>${esc(ex.nameZh || ex.name)}</h3>
        <div class="sub" style="color:var(--text-dim);font-size:12px;margin-bottom:6px">
          <span class="tag">${esc(ex.bodyPartZh)}</span><span class="tag">${esc(ex.targetZh)}</span><span class="tag">${esc(ex.equipmentZh)}</span>
        </div>
        <div class="section-title">动作要点</div>
        <ol class="steps">${stepsHtml}</ol>
        <button class="primary-btn" id="sheetAdd">${plan.some(p => p.exId === id) ? '已在计划中' : '加入计划'}</button>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.close').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    const add = mask.querySelector('#sheetAdd');
    add.onclick = () => { addToPlan(id); mask.remove(); };
  }

  // ---------- 计划 ----------
  function addToPlan(id) {
    if (plan.some((p) => p.exId === id)) return;
    const ex = window.AppData.get(id);
    plan.push({ exId: id, sets: 3, mode: 'rep', reps: 12, workSec: 30, restSec: suggestRest(ex) });
    savePlan(); updateBadge();
    if (currentTab === 'plan') renderPlanView();
    if (currentTab === 'library') renderLibrary();
  }
  function removeFromPlan(id) {
    plan = plan.filter((p) => p.exId !== id);
    savePlan(); updateBadge(); renderCustomPlan();
  }
  function changeItem(id, field, delta) {
    const it = plan.find((p) => p.exId === id);
    if (!it) return;
    if (field === 'sets') it.sets = Math.max(1, it.sets + delta);
    else if (field === 'reps') it.reps = Math.min(50, Math.max(1, it.reps + delta));
    else if (field === 'work') it.workSec = Math.min(120, Math.max(5, it.workSec + delta));
    else if (field === 'rest') it.restSec = Math.min(30, Math.max(5, it.restSec + delta));
    savePlan(); renderCustomPlan();
  }
  function setMode(id, mode) {
    const it = plan.find((p) => p.exId === id);
    if (!it) return;
    it.mode = mode;
    savePlan(); renderCustomPlan();
  }
  function moveItem(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= plan.length) return;
    [plan[i], plan[j]] = [plan[j], plan[i]];
    savePlan(); renderCustomPlan();
  }

  function renderPlanView() {
    if (planRoute === 'detail' && planDetailId) renderPlanDetail(planDetailId);
    else if (planRoute === 'custom') renderCustomPlan();
    else renderPlanLibrary();
  }

  function renderPlanLibrary() {
    const goals = ['全部', ...Object.keys(GOALS)];
    const chips = goals.map((g) =>
      `<button class="chip ${g === filterGoal ? 'active' : ''}" data-goal="${g}">${g === '全部' ? '全部' : GOALS[g].label}</button>`).join('');

    let cards = '';
    if (plan.length) {
      const st = planStats(plan);
      cards += `
        <div class="plan-card custom" data-route="custom">
          <div class="pc-body">
            <div class="pc-name">我的计划（自定义）</div>
            <div class="pc-meta">${st.count} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟</div>
          </div>
          <div class="pc-go">编辑 ›</div>
        </div>`;
    }
    const list = (filterGoal === '全部' ? PLANS : PLANS.filter((p) => p.goal === filterGoal));
    cards += list.map((p) => {
      const st = planStats(resolveTemplate(p));
      const g = GOALS[p.goal];
      return `
        <div class="plan-card" data-plan="${p.id}">
          <span class="goal-tag ${g.cls}">${g.label}</span>
          <div class="pc-body">
            <div class="pc-name">${esc(p.name)}</div>
            <div class="pc-meta">${st.count} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟</div>
          </div>
          <div class="pc-go">›</div>
        </div>`;
    }).join('');

    view.innerHTML = `
      <div class="section-title">按目标选计划，点开看详情</div>
      <div class="chips" id="goalChips">${chips}</div>
      <div class="plan-list">${cards}</div>`;

    view.querySelectorAll('#goalChips .chip').forEach((c) => {
      c.onclick = () => { filterGoal = c.dataset.goal; renderPlanLibrary(); };
    });
    view.querySelectorAll('.plan-card[data-plan]').forEach((c) => {
      c.onclick = () => { planRoute = 'detail'; planDetailId = c.dataset.plan; renderPlanDetail(c.dataset.plan); };
    });
    const cc = view.querySelector('.plan-card.custom');
    if (cc) cc.onclick = () => { planRoute = 'custom'; renderCustomPlan(); };
  }

  function renderPlanDetail(id) {
    const tpl = PLANS.find((p) => p.id === id);
    if (!tpl) { planRoute = 'library'; planDetailId = null; renderPlanLibrary(); return; }
    const items = resolveTemplate(tpl);
    const st = planStats(items);
    const g = GOALS[tpl.goal];
    const rows = items.map((it) => {
      const ex = window.AppData.get(it.exId);
      const nm = ex ? (ex.nameZh || ex.name) : '?';
      return `<div class="pd-row" data-ex="${it.exId}">
        <div class="pd-name">${esc(nm)}</div>
        <div class="pd-set">${it.sets} 组 · ${it.reps} 次</div>
      </div>`;
    }).join('');

    view.innerHTML = `
      <button class="back-btn" id="backBtn">‹ 计划库</button>
      <div class="pd-head">
        <span class="goal-tag ${g.cls}">${g.label}</span>
        <h2 class="pd-title">${esc(tpl.name)}</h2>
      </div>
      <p class="pd-intro">${esc(tpl.intro)}</p>
      <div class="pd-summary">共 ${st.count} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟</div>
      <div class="section-title">动作清单</div>
      <div class="pd-list">${rows}</div>
      <button class="primary-btn" id="startBtn">▶ 开始跟练</button>
      <button class="ghost-btn" id="editBtn">编辑此计划</button>`;

    document.getElementById('backBtn').onclick = () => { planRoute = 'library'; planDetailId = null; renderPlanLibrary(); };
    view.querySelectorAll('.pd-row').forEach((r) => { r.onclick = () => openDetail(r.dataset.ex); });
    document.getElementById('startBtn').onclick = () => startTraining(items);
    document.getElementById('editBtn').onclick = () => {
      items.forEach((it) => { if (!plan.some((p) => p.exId === it.exId)) plan.push(it); });
      savePlan(); updateBadge();
      planRoute = 'custom'; renderCustomPlan();
    };
  }

  function renderCustomPlan() {
    const presetBtns = Object.keys(PRESETS).map((n) =>
      `<button class="preset-btn" data-preset="${n}">${n}</button>`).join('');

    if (!plan.length) {
      view.innerHTML = `
        <button class="back-btn" id="backBtn">‹ 计划库</button>
        <div class="section-title">快速开始 · 示例全身计划</div>
        <div class="presets">${presetBtns}</div>
        <div class="empty" style="padding:30px 20px"><div class="big">📋</div>也可以去「动作库」自己挑动作</div>`;
      bindPresets();
      document.getElementById('backBtn').onclick = () => { planRoute = 'library'; renderPlanLibrary(); };
      return;
    }

    const items = plan.map((it, i) => {
      const ex = window.AppData.get(it.exId);
      if (!ex) return '';
      const unitBtn = (m, label) =>
        `<button class="mode-btn ${it.mode === m ? 'on' : ''}" data-mode="${m}">${label}</button>`;
      const workStepper = it.mode === 'rep'
        ? `<button data-act="reps" data-d="-1">−</button><span class="val">${it.reps} 次</span><button data-act="reps" data-d="1">+</button>`
        : `<button data-act="work" data-d="-5">−</button><span class="val">${it.workSec}s</span><button data-act="work" data-d="5">+</button>`;
      return `
        <div class="plan-item" data-id="${it.exId}">
          <img class="thumb" src="${ex.image}" alt="" onerror="this.style.display='none'">
          <div class="info">
            <div class="name">${esc(ex.nameZh || ex.name)}</div>
            <div class="stepper">
              <button data-act="sets" data-d="-1">−</button><span class="val">${it.sets} 组</span><button data-act="sets" data-d="1">+</button>
              <span class="mode-group">${unitBtn('rep', '次数')}${unitBtn('time', '秒')}</span>
              ${workStepper}
              <button data-act="rest" data-d="-5">−</button><span class="val">休${it.restSec}s</span><button data-act="rest" data-d="5">+</button>
            </div>
          </div>
          <div class="reorder">
            <button data-move="up" ${i === 0 ? 'disabled style=opacity:.3' : ''}>▲</button>
            <button data-move="down" ${i === plan.length - 1 ? 'disabled style=opacity:.3' : ''}>▼</button>
          </div>
          <button class="del" data-del="1">🗑</button>
        </div>`;
    }).join('');

    const totalSec = estimateSec(plan);
    const mins = Math.max(1, Math.round(totalSec / 60));
    const totalGroups = plan.reduce((s, it) => s + (it.sets || 0), 0);

    view.innerHTML = `
      <button class="back-btn" id="backBtn">‹ 计划库</button>
      <div class="section-title">共 ${plan.length} 个动作 · ${totalGroups} 组 · 预计约 ${mins} 分钟</div>
      <div class="presets">${presetBtns}</div>
      ${items}
      <button class="primary-btn" id="startBtn">▶ 开始跟练</button>
      <button class="ghost-btn" id="clearBtn">清空计划</button>`;

    bindPresets();
    view.querySelectorAll('.plan-item').forEach((row) => {
      const id = row.dataset.id;
      row.querySelectorAll('.stepper button').forEach((b) => {
        if (b.dataset.act) b.onclick = () => changeItem(id, b.dataset.act, parseInt(b.dataset.d, 10));
      });
      row.querySelectorAll('.mode-btn').forEach((b) => {
        b.onclick = () => setMode(id, b.dataset.mode);
      });
      row.querySelector('[data-move="up"]').onclick = () => moveItem(plan.findIndex(p => p.exId === id), -1);
      row.querySelector('[data-move="down"]').onclick = () => moveItem(plan.findIndex(p => p.exId === id), 1);
      row.querySelector('.del').onclick = () => removeFromPlan(id);
    });
    document.getElementById('startBtn').onclick = () => startTraining(plan);
    document.getElementById('clearBtn').onclick = () => { plan = []; savePlan(); updateBadge(); renderCustomPlan(); };
    document.getElementById('backBtn').onclick = () => { planRoute = 'library'; renderPlanLibrary(); };
  }

  function bindPresets() {
    view.querySelectorAll('.preset-btn').forEach((b) => {
      b.onclick = () => {
        if (plan.length && !confirm('载入示例计划会替换当前计划，确定？')) return;
        loadPreset(b.dataset.preset);
      };
    });
  }

  // 粗略时长估算（rep 按每次~3s + 组间休息；time 直接累加）
  function estimateSec(items) {
    let s = 0;
    items.forEach((it) => {
      const work = it.mode === 'rep' ? it.reps * 3 : it.workSec;
      const sets = it.sets;
      s += sets * work + Math.max(0, sets - 1) * it.restSec;
    });
    s += Math.max(0, items.length - 1) * 15;
    return s;
  }

  // ---------- 跟练 ----------
  function setTrainingMode(on) {
    const tb = document.querySelector('.tabbar');
    if (tb) tb.style.display = on ? 'none' : '';
  }
  function startTraining(items) {
    items = items || plan;
    if (!items.length) { alert('计划是空的，先去添加动作'); return; }
    setTrainingMode(true);
    window.TrainerPlayer.start(items, view, () => { setTrainingMode(false); switchTab('plan'); });
  }

  // ---------- 路由 ----------
  function switchTab(tab) {
    currentTab = tab;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'library') renderLibrary();
    else if (tab === 'plan') renderPlanView();
  }
  tabs.forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- 初始化 ----------
  async function init() {
    updateSoundBtn();
    loadPlan();
    updateBadge();
    await window.AppData.load();
    if (!window.AppData.all().length) {
      view.innerHTML = `<div class="empty"><div class="big">⚠️</div>动作库加载失败<br>请用本地服务器打开（见 README）</div>`;
      return;
    }
    switchTab('library');
  }
  init();
})();
