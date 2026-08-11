// 主控制器：视图路由 + 动作库 + 计划编排（预设计划 + 我的计划）+ 启动跟练
(function () {
  const LS_MYPLANS = 'lianlian_myplans_v1';
  const LS_SOUND = 'lianlian_sound_v1';

  const ALL_TAGS = ['增肌', '减脂', '全身', '有氧', '徒手', '哑铃', '女士', '凯格尔', '腿臀', '拉', '推', '盆底'];

  let myPlans = [];            // [{id,name,tags:[],note,warmup:[],items:[],cooldown:[]}]
  let currentTab = 'library';
  let filterPart = '全部';
  let filterEq = '全部';
  let keyword = '';
  let filterTag = '全部';
  let planView = 'list';       // 'list' | 'detail' | 'edit'
  let viewPlanId = null;
  let viewIsPreset = false;
  let editId = null;

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

  // ---------- 存储 ----------
  function saveMyPlans() { localStorage.setItem(LS_MYPLANS, JSON.stringify(myPlans)); }
  function loadMyPlans() {
    try { myPlans = JSON.parse(localStorage.getItem(LS_MYPLANS)) || []; } catch (e) { myPlans = []; }
  }
  function uid() { return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function getPreset(id) { return (window.PRESET_PLANS || []).find((p) => p.id === id) || null; }
  function getMyPlan(id) { return myPlans.find((p) => p.id === id) || null; }
  function findPlan(id) {
    const p = getPreset(id); if (p) return { plan: p, isPreset: true };
    const m = getMyPlan(id); if (m) return { plan: m, isPreset: false };
    return null;
  }
  function updateBadge() {
    planBadge.textContent = myPlans.length;
    planBadge.hidden = myPlans.length === 0;
  }

  // ---------- 时长估计（仅正式训练 items，不含热身/放松） ----------
  function estimateSec(items) {
    let s = 0;
    (items || []).forEach((it) => {
      if (it.kind === 'exercise') {
        const work = it.mode === 'rep' ? (it.reps || 12) * 3 : (it.workSec || 30);
        s += (it.sets || 3) * work + Math.max(0, (it.sets || 3) - 1) * (it.restSec || 15);
      } else {
        s += (it.dur || 30);
      }
    });
    s += Math.max(0, (items || []).length - 1) * 15;
    return s;
  }
  function planStats(plan) {
    const items = plan.items || [];
    const exCount = items.filter((i) => i.kind === 'exercise').length;
    const groups = items.reduce((s, i) => s + (i.kind === 'exercise' ? (i.sets || 0) : 0), 0);
    const mins = Math.max(1, Math.round(estimateSec(items) / 60));
    return { exCount, groups, mins };
  }

  // ---------- 休息建议 ----------
  function suggestRest(ex) {
    const n = ((ex && (ex.name || '')) + ' ' + (ex && (ex.targetZh || ''))).toLowerCase();
    if (/(burpee|mountain climber|high knee|plank|jump|running|sprint|jog|climb|skip)/.test(n)) return 15;
    if (/(curl|raise|fly|crunch|twist|dip|calf|lateral|sit up|reverse|glute|extension|leg raise|hip thrust|hip)/.test(n)) return 25;
    return 30;
  }
  function newExItem(ex) {
    return { kind: 'exercise', exId: ex.id, sets: 3, mode: 'rep', reps: 12, workSec: 30, restSec: suggestRest(ex) };
  }

  // ---------- 动作库（含分页） ----------
  const PAGE_SIZE = 60;
  let shown = PAGE_SIZE;

  function renderLibrary() {
    const parts = ['全部', ...window.AppData.bodyParts()];
    const partChips = parts.map((p) => `<button class="chip ${p === filterPart ? 'active' : ''}" data-part="${p}">${p}</button>`).join('');
    const eqs = ['全部', ...equipList()];
    const eqChips = eqs.map((q) => `<button class="chip ${q === filterEq ? 'active' : ''}" data-eq="${q}">${q}</button>`).join('');
    view.innerHTML = `
      <input class="search" id="searchInput" placeholder="搜索动作名 / 部位 / 器械" value="${esc(keyword)}" />
      <div class="filter-block"><div class="filter-label">按部位</div><div class="chips" id="partChips">${partChips}</div></div>
      <div class="filter-block"><div class="filter-label">按器械</div><div class="chips" id="eqChips">${eqChips}</div></div>
      <div class="list" id="list"></div>`;
    const input = document.getElementById('searchInput');
    const onSearch = () => { keyword = input.value.trim().toLowerCase(); shown = PAGE_SIZE; updateList(); };
    input.addEventListener('input', onSearch);
    input.addEventListener('compositionend', onSearch);
    view.querySelectorAll('#partChips .chip').forEach((c) => { c.onclick = () => { filterPart = c.dataset.part; shown = PAGE_SIZE; syncChip('#partChips', 'part', filterPart); updateList(); }; });
    view.querySelectorAll('#eqChips .chip').forEach((c) => { c.onclick = () => { filterEq = c.dataset.eq; shown = PAGE_SIZE; syncChip('#eqChips', 'eq', filterEq); updateList(); }; });
    shown = PAGE_SIZE;
    updateList();
  }
  function syncChip(sel, key, val) { view.querySelectorAll(sel + ' .chip').forEach((c) => c.classList.toggle('active', c.dataset[key] === val)); }

  function updateList() {
    const all = filtered();
    const visible = all.slice(0, shown);
    const listEl = document.getElementById('list');
    let html = visible.map((ex) => cardHtml(ex)).join('');
    if (!all.length) html = `<div class="empty"><div class="big">🔍</div>没有匹配的动作</div>`;
    else {
      const remaining = all.length - visible.length;
      if (remaining > 0) html += `<button class="more-btn" id="moreBtn">加载更多（还有 ${remaining} 个）</button>`;
    }
    listEl.innerHTML = html;
    const mb = document.getElementById('moreBtn');
    if (mb) mb.onclick = () => { shown += PAGE_SIZE; updateList(); };
    listEl.querySelectorAll('.add-btn').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); openAddSheet(b.dataset.id); }; });
    listEl.querySelectorAll('.card').forEach((c) => { c.onclick = () => openDetail(c.dataset.id); });
  }

  function filtered() {
    let arr = window.AppData.all();
    if (filterPart !== '全部') arr = arr.filter((e) => e.bodyPartZh === filterPart);
    if (filterEq !== '全部') arr = arr.filter((e) => e.equipmentZh === filterEq);
    if (keyword) arr = arr.filter((e) =>
      (e.nameZh || '').toLowerCase().includes(keyword) || (e.name || '').toLowerCase().includes(keyword) ||
      (e.bodyPartZh || '').toLowerCase().includes(keyword) || (e.equipmentZh || '').toLowerCase().includes(keyword) ||
      (e.targetZh || '').toLowerCase().includes(keyword));
    return arr;
  }
  function equipList() {
    const set = new Set(window.AppData.all().map((e) => e.equipmentZh).filter(Boolean));
    const ORDER = ['自重', '哑铃', '杠铃', '壶铃', '弹力带', '绳索', '史密斯机'];
    return ORDER.filter((q) => set.has(q)).concat(Array.from(set).filter((q) => !ORDER.includes(q)));
  }
  function cardHtml(ex) {
    return `
      <div class="card" data-id="${ex.id}">
        <img class="thumb" src="${ex.image}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E'">
        <div class="meta">
          <div class="name">${esc(ex.nameZh || ex.name)}</div>
          <div class="sub"><span class="tag">${esc(ex.bodyPartZh)}</span><span class="tag">${esc(ex.equipmentZh)}</span></div>
        </div>
        <button class="add-btn" data-id="${ex.id}" title="加入计划">+</button>
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
        <button class="primary-btn" id="sheetAdd">加入计划</button>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.close').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelector('#sheetAdd').onclick = () => { openAddSheet(id); mask.remove(); };
  }

  // ---------- 添加动作：选已有计划 or 新建 ----------
  function openAddSheet(exId) {
    const ex = window.AppData.get(exId);
    if (!ex) return;
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    const myList = myPlans.map((p) => `<div class="add-opt" data-pick="${p.id}">➕ 加入「${esc(p.name)}」</div>`).join('') || `<div class="empty" style="padding:14px">还没有我的计划，先新建一个吧</div>`;
    mask.innerHTML = `
      <div class="sheet">
        <button class="close">取消</button>
        <h3>把「${esc(ex.nameZh || ex.name)}」加入…</h3>
        <div class="section-title">已有计划</div>
        <div id="myList">${myList}</div>
        <button class="primary-btn" id="newPlanBtn">＋ 新建计划</button>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.close').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelectorAll('#myList .add-opt').forEach((o) => {
      o.onclick = () => { addExToPlan(ex, o.dataset.pick); mask.remove(); };
    });
    mask.querySelector('#newPlanBtn').onclick = () => openCreatePlanForm(ex, mask);
  }

  function addExToPlan(ex, planId) {
    const plan = getMyPlan(planId);
    if (!plan) return;
    if (plan.items.some((i) => i.kind === 'exercise' && i.exId === ex.id)) { toast('该计划已有此动作'); renderPlanEdit(plan); return; }
    plan.items.push(newExItem(ex));
    saveMyPlans(); updateBadge();
    toast('已加入「' + plan.name + '」');
    renderPlanEdit(plan);
  }

  function openCreatePlanForm(ex, prevMask) {
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    let selTags = [];
    const tagHtml = ALL_TAGS.map((t) => `<button type="button" class="chip tagpick" data-t="${t}">${t}</button>`).join('');
    mask.innerHTML = `
      <div class="sheet">
        <button class="close">取消</button>
        <h3>新建计划</h3>
        <div class="form-row"><label>名称</label><input id="npName" class="form-input" placeholder="例如：我的胸训日" /></div>
        <div class="form-row"><label>标签</label><div class="chips" id="npTags">${tagHtml}</div></div>
        <div class="form-row"><label>备注</label><textarea id="npNote" class="form-input" rows="2" placeholder="选填，记录目标或注意点"></textarea></div>
        <button class="primary-btn" id="npCreate">创建并加入此动作</button>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.close').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelectorAll('#npTags .tagpick').forEach((c) => {
      c.onclick = () => {
        const t = c.dataset.t;
        if (selTags.includes(t)) { selTags = selTags.filter((x) => x !== t); c.classList.remove('active'); }
        else { selTags.push(t); c.classList.add('active'); }
      };
    });
    mask.querySelector('#npCreate').onclick = () => {
      const name = mask.querySelector('#npName').value.trim() || '我的计划';
      const plan = { id: uid(), name, tags: selTags.slice(), note: mask.querySelector('#npNote').value.trim(), warmup: [], items: [newExItem(ex)], cooldown: [] };
      myPlans.push(plan); saveMyPlans(); updateBadge();
      mask.remove();
      toast('已创建「' + name + '」');
      renderPlanEdit(plan);
    };
  }

  // ---------- 计划列表 ----------
  function setPlanTab() { currentTab = 'plan'; tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === 'plan')); }

  function renderPlanList() {
    const tags = ['全部', ...ALL_TAGS.filter((t) => planHasTag(t))];
    const chips = tags.map((t) => `<button class="chip ${t === filterTag ? 'active' : ''}" data-tag="${t}">${t}</button>`).join('');
    const match = (p) => filterTag === '全部' || (p.tags || []).includes(filterTag);

    let html = '';
    // 预设计划
    (window.PRESET_PLANS || []).filter(match).forEach((p) => {
      const st = planStats(p);
      html += `
        <div class="plan-card" data-plan="${p.id}" data-preset="1">
          ${tagBadges(p.tags)}
          <div class="pc-body">
            <div class="pc-name">${esc(p.name)}</div>
            <div class="pc-meta">${st.exCount} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟</div>
          </div>
          <div class="pc-go">›</div>
        </div>`;
    });
    // 我的计划（可左滑删除）
    myPlans.filter(match).forEach((p) => {
      const st = planStats(p);
      html += `
        <div class="swipe" data-swipe="${p.id}">
          <div class="swipe-del" data-del="${p.id}">删除</div>
          <div class="swipe-inner plan-card" data-plan="${p.id}">
            ${tagBadges(p.tags)}
            <div class="pc-body">
              <div class="pc-name">${esc(p.name)} <span class="mine-flag">我的</span></div>
              <div class="pc-meta">${st.exCount} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟</div>
            </div>
            <div class="pc-go">›</div>
          </div>
        </div>`;
    });
    if (!html) html = `<div class="empty"><div class="big">📋</div>没有匹配的计划</div>`;

    view.innerHTML = `
      <div class="section-title">计划库（点开看详情）</div>
      <div class="chips" id="tagChips">${chips}</div>
      <button class="ghost-btn" id="importBtn">⬇ 导入计划（JSON）</button>
      <div class="plan-list">${html}</div>
      <input type="file" id="importFile" accept="application/json" style="display:none" />`;

    view.querySelectorAll('#tagChips .chip').forEach((c) => { c.onclick = () => { filterTag = c.dataset.tag; renderPlanList(); }; });
    view.querySelectorAll('.plan-card[data-plan]').forEach((c) => { c.onclick = () => openPlan(c.dataset.plan, c.dataset.preset === '1'); });
    bindSwipe();
    const imp = view.querySelector('#importBtn');
    const file = view.querySelector('#importFile');
    imp.onclick = () => file.click();
    file.onchange = (e) => { if (e.target.files && e.target.files[0]) importPlan(e.target.files[0]); };
  }
  function planHasTag(t) {
    return (window.PRESET_PLANS || []).some((p) => (p.tags || []).includes(t)) || myPlans.some((p) => (p.tags || []).includes(t));
  }
  function tagBadges(tags) {
    return (tags || []).slice(0, 3).map((t) => `<span class="goal-tag ${tagCls(t)}">${esc(t)}</span>`).join('');
  }
  function tagCls(t) {
    const m = { '增肌': 'g-bulk', '减脂': 'g-cut', '全身': 'g-full', '有氧': 'g-cardio', '徒手': 'g-body', '哑铃': 'g-dumb', '女士': 'g-lady', '凯格尔': 'g-pel', '腿臀': 'g-leg', '拉': 'g-pull', '推': 'g-push', '盆底': 'g-pel' };
    return m[t] || 'g-full';
  }

  // ---------- 左滑删除（我的计划） ----------
  function bindSwipe() {
    view.querySelectorAll('.swipe').forEach((sw) => {
      const inner = sw.querySelector('.swipe-inner');
      const del = sw.querySelector('.swipe-del');
      let startX = 0, dx = 0, dragging = false, moved = false;
      inner.addEventListener('pointerdown', (e) => { startX = e.clientX; dx = 0; dragging = true; moved = false; inner.style.transition = 'none'; });
      inner.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const d = e.clientX - startX;
        if (Math.abs(d) > 4) moved = true;
        dx = Math.min(0, d);
        if (dx < -100) dx = -100;
        inner.style.transform = 'translateX(' + dx + 'px)';
      });
      inner.addEventListener('pointerup', () => {
        if (!dragging) return; dragging = false; inner.style.transition = 'transform .2s';
        // 拖开则停住露出删除；轻点（未拖动）回弹，由原生 click 打开详情，避免重复导航
        if (dx < -50) inner.style.transform = 'translateX(-80px)';
        else inner.style.transform = 'translateX(0)';
      });
      inner.addEventListener('pointercancel', () => { dragging = false; inner.style.transition = 'transform .2s'; inner.style.transform = 'translateX(0)'; });
      del.onclick = () => deletePlan(sw.dataset.swipe);
    });
  }

  function deletePlan(id) {
    myPlans = myPlans.filter((p) => p.id !== id);
    saveMyPlans(); updateBadge();
    renderPlanList();
    toast('已删除计划');
  }

  function openPlan(id, isPreset) {
    const f = findPlan(id);
    if (!f) { renderPlanList(); return; }
    viewIsPreset = isPreset !== undefined ? isPreset : f.isPreset;
    viewPlanId = id;
    planView = 'detail'; setPlanTab();
    renderPlanDetail(f.plan, viewIsPreset);
  }

  // ---------- 计划详情 ----------
  function renderPlanDetail(plan, isPreset) {
    setPlanTab();
    const st = planStats(plan);
    const secHtml = (title, arr, empty) => {
      if (!arr || !arr.length) return '';
      return `<div class="section-title">${title}</div><div class="pd-list">${arr.map(itemRowHtml).join('')}</div>`;
    };
    view.innerHTML = `
      <button class="back-btn" id="backBtn">‹ 计划库</button>
      <div class="pd-head">${tagBadges(plan.tags)}<h2 class="pd-title">${esc(plan.name)}</h2></div>
      ${plan.intro ? `<p class="pd-intro">${esc(plan.intro)}</p>` : ''}
      <div class="pd-summary">共 ${st.exCount} 动作 · ${st.groups} 组 · 约 ${st.mins} 分钟（正式训练，不含热身/放松）</div>
      ${secHtml('热身', plan.warmup)}
      ${secHtml('动作清单', plan.items)}
      ${secHtml('放松拉伸', plan.cooldown)}
      <button class="primary-btn" id="startBtn">▶ 开始跟练</button>
      ${isPreset
        ? `<button class="ghost-btn" id="editBtn">编辑此计划（复制到我的）</button>`
        : `<button class="ghost-btn" id="editBtn">编辑此计划</button><button class="ghost-btn danger" id="delBtn">删除计划</button>`}`;
    document.getElementById('backBtn').onclick = () => { planView = 'list'; renderPlanList(); };
    view.querySelectorAll('.pd-row').forEach((r) => { r.onclick = () => { if (r.dataset.ex) openDetail(r.dataset.ex); }; });
    document.getElementById('startBtn').onclick = () => startTraining(plan);
    document.getElementById('editBtn').onclick = () => {
      if (isPreset) {
        const copy = JSON.parse(JSON.stringify(plan));
        copy.id = uid(); copy.name = plan.name + '（我的）';
        myPlans.push(copy); saveMyPlans(); updateBadge();
        toast('已复制到我的计划');
        renderPlanEdit(copy);
      } else {
        renderPlanEdit(plan);
      }
    };
    if (!isPreset) document.getElementById('delBtn').onclick = () => deletePlan(plan.id);
  }

  function itemRowHtml(it) {
    if (it.kind === 'exercise') {
      const ex = window.AppData.get(it.exId);
      const nm = ex ? (ex.nameZh || ex.name) : '?';
      const spec = it.mode === 'rep' ? `${it.sets} 组 · ${it.reps} 次` : `${it.sets} 组 · ${it.workSec}s`;
      return `<div class="pd-row" data-ex="${it.exId}"><div class="pd-name">${esc(nm)}</div><div class="pd-set">${spec}</div></div>`;
    }
    return `<div class="pd-row pd-stretch"><div class="pd-name">${esc(it.name)}</div><div class="pd-set">${esc(it.dur || 30)}s</div></div>`;
  }

  // ---------- 我的计划编辑 ----------
  function renderPlanEdit(plan) {
    setPlanTab();
    editId = plan.id;
    const tagHtml = ALL_TAGS.map((t) => `<button type="button" class="chip tagpick ${plan.tags.includes(t) ? 'active' : ''}" data-t="${t}">${t}</button>`).join('');
    const section = (title, key, items, addBtn) => {
      if (!items) return '';
      const rows = items.map((it, i) => editRowHtml(plan, key, it, i)).join('');
      return `<div class="section-title">${title}</div><div class="edit-list">${rows}${addBtn || ''}</div>`;
    };
    view.innerHTML = `
      <button class="back-btn" id="backBtn">‹ 计划库</button>
      <div class="edit-head">
        <input id="epName" class="form-input big" value="${esc(plan.name)}" />
        <button class="icon-btn danger" id="epDel" title="删除计划">🗑</button>
      </div>
      <div class="form-row"><label>标签</label><div class="chips" id="epTags">${tagHtml}</div></div>
      <div class="form-row"><label>备注</label><textarea id="epNote" class="form-input" rows="2">${esc(plan.note || '')}</textarea></div>
      ${section('热身', 'warmup', plan.warmup, `<button class="add-stretch" data-to="warmup">＋ 添加热身拉伸</button>`)}
      ${section('动作', 'items', plan.items, `<button class="add-stretch" data-to="items">＋ 去动作库添加动作</button>`)}
      ${section('放松拉伸', 'cooldown', plan.cooldown, `<button class="add-stretch" data-to="cooldown">＋ 添加放松拉伸</button>`)}
      <button class="primary-btn" id="startBtn">▶ 开始跟练</button>
      <button class="ghost-btn" id="exportBtn">⬆ 导出此计划（JSON）</button>`;

    document.getElementById('backBtn').onclick = () => { planView = 'list'; renderPlanList(); };
    document.getElementById('epName').oninput = (e) => { plan.name = e.target.value; saveMyPlans(); };
    document.getElementById('epNote').oninput = (e) => { plan.note = e.target.value; saveMyPlans(); };
    view.querySelectorAll('#epTags .tagpick').forEach((c) => {
      c.onclick = () => {
        const t = c.dataset.t;
        if (plan.tags.includes(t)) { plan.tags = plan.tags.filter((x) => x !== t); c.classList.remove('active'); }
        else { plan.tags.push(t); c.classList.add('active'); }
        saveMyPlans();
      };
    });
    view.querySelectorAll('.add-stretch').forEach((b) => {
      b.onclick = () => {
        if (b.dataset.to === 'items') { switchTab('library'); toast('在动作库点 ＋ 加入「' + plan.name + '」'); }
        else openStretchForm(plan, b.dataset.to);
      };
    });
    bindEditRows(plan);
    document.getElementById('startBtn').onclick = () => startTraining(plan);
    document.getElementById('epDel').onclick = () => deletePlan(plan.id);
    document.getElementById('exportBtn').onclick = () => exportPlan(plan);
  }

  function editRowHtml(plan, key, it, i) {
    const arr = plan[key];
    const up = i > 0 ? `<button data-move="up">▲</button>` : '';
    const down = i < arr.length - 1 ? `<button data-move="down">▼</button>` : '';
    if (it.kind === 'exercise') {
      const ex = window.AppData.get(it.exId);
      const unitBtn = (m, label) => `<button class="mode-btn ${it.mode === m ? 'on' : ''}" data-mode="${m}">${label}</button>`;
      const workStepper = it.mode === 'rep'
        ? `<button data-act="reps" data-d="-1">−</button><span class="val">${it.reps} 次</span><button data-act="reps" data-d="1">+</button>`
        : `<button data-act="work" data-d="-5">−</button><span class="val">${it.workSec}s</span><button data-act="work" data-d="5">+</button>`;
      return `
        <div class="plan-item" data-key="${key}" data-i="${i}">
          <img class="thumb" src="${ex ? ex.image : ''}" alt="" onerror="this.style.display='none'">
          <div class="info">
            <div class="name">${esc(ex ? (ex.nameZh || ex.name) : '?')}</div>
            <div class="stepper">
              <button data-act="sets" data-d="-1">−</button><span class="val">${it.sets} 组</span><button data-act="sets" data-d="1">+</button>
              <span class="mode-group">${unitBtn('rep', '次数')}${unitBtn('time', '秒')}</span>
              ${workStepper}
              <button data-act="rest" data-d="-5">−</button><span class="val">休${it.restSec}s</span><button data-act="rest" data-d="5">+</button>
            </div>
          </div>
          <div class="reorder">${up}${down}</div>
          <button class="del" data-del="1">✕</button>
        </div>`;
    }
    return `
      <div class="plan-item stretch" data-key="${key}" data-i="${i}">
        <div class="info">
          <div class="name">${esc(it.name)}</div>
          <div class="sub" style="color:var(--text-dim);font-size:12px">${esc(it.desc || '')}</div>
        </div>
        <div class="reorder">${up}${down}</div>
        <button class="del" data-del="1">✕</button>
      </div>`;
  }

  function bindEditRows(plan) {
    view.querySelectorAll('.plan-item').forEach((row) => {
      const key = row.dataset.key, i = parseInt(row.dataset.i, 10);
      const arr = plan[key];
      row.querySelectorAll('.stepper button').forEach((b) => {
        if (b.dataset.act) b.onclick = () => { changeItem(arr[i], b.dataset.act, parseInt(b.dataset.d, 10)); saveMyPlans(); renderPlanEdit(plan); };
      });
      row.querySelectorAll('.mode-btn').forEach((b) => { b.onclick = () => { arr[i].mode = b.dataset.mode; saveMyPlans(); renderPlanEdit(plan); }; });
      const up = row.querySelector('[data-move="up"]'); if (up) up.onclick = () => { moveItem(arr, i, -1); saveMyPlans(); renderPlanEdit(plan); };
      const dn = row.querySelector('[data-move="down"]'); if (dn) dn.onclick = () => { moveItem(arr, i, 1); saveMyPlans(); renderPlanEdit(plan); };
      row.querySelector('.del').onclick = () => { arr.splice(i, 1); saveMyPlans(); renderPlanEdit(plan); };
    });
  }
  function changeItem(it, field, delta) {
    if (field === 'sets') it.sets = Math.max(1, (it.sets || 3) + delta);
    else if (field === 'reps') it.reps = Math.min(50, Math.max(1, (it.reps || 12) + delta));
    else if (field === 'work') it.workSec = Math.min(120, Math.max(5, (it.workSec || 30) + delta));
    else if (field === 'rest') it.restSec = Math.min(30, Math.max(5, (it.restSec || 15) + delta));
  }
  function moveItem(arr, i, dir) {
    const j = i + dir; if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  function openStretchForm(plan, to) {
    const mask = document.createElement('div');
    mask.className = 'sheet-mask';
    mask.innerHTML = `
      <div class="sheet">
        <button class="close">取消</button>
        <h3>添加拉伸（${to === 'warmup' ? '热身' : '放松'}）</h3>
        <div class="form-row"><label>名称</label><input id="stName" class="form-input" placeholder="例如：胸大肌拉伸" /></div>
        <div class="form-row"><label>说明</label><textarea id="stDesc" class="form-input" rows="2" placeholder="怎么做 / 做多久"></textarea></div>
        <div class="form-row"><label>时长(秒)</label><input id="stDur" class="form-input" type="number" value="20" min="5" max="300" /></div>
        <button class="primary-btn" id="stAdd">添加</button>
      </div>`;
    document.body.appendChild(mask);
    mask.querySelector('.close').onclick = () => mask.remove();
    mask.onclick = (e) => { if (e.target === mask) mask.remove(); };
    mask.querySelector('#stAdd').onclick = () => {
      const name = mask.querySelector('#stName').value.trim() || '拉伸';
      const dur = Math.max(5, Math.min(300, parseInt(mask.querySelector('#stDur').value, 10) || 20));
      plan[to].push({ kind: 'stretch', name, desc: mask.querySelector('#stDesc').value.trim(), dur });
      saveMyPlans(); mask.remove(); renderPlanEdit(plan);
    };
  }

  // ---------- 导入 / 导出 ----------
  function exportPlan(plan) {
    const data = JSON.stringify(plan, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = (plan.name || 'plan') + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function importPlan(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || !Array.isArray(obj.items)) { alert('文件格式不对'); return; }
        obj.id = uid(); obj.name = obj.name || '导入的计划';
        obj.tags = obj.tags || []; obj.note = obj.note || '';
        obj.warmup = obj.warmup || []; obj.cooldown = obj.cooldown || [];
        myPlans.push(obj); saveMyPlans(); updateBadge();
        toast('已导入「' + obj.name + '」');
        renderPlanList();
      } catch (e) { alert('解析失败：' + e.message); }
    };
    reader.readAsText(file);
  }

  // ---------- 跟练 ----------
  function setTrainingMode(on) { const tb = document.querySelector('.tabbar'); if (tb) tb.style.display = on ? 'none' : ''; }
  function startTraining(planObj) {
    if (!planObj) return;
    const total = (planObj.items || []).length + (planObj.warmup || []).length + (planObj.cooldown || []).length;
    if (!total) { alert('计划是空的，先去添加动作'); return; }
    setTrainingMode(true);
    // 播放器需要 warmup/items/cooldown；预设计划/preset 对象结构一致
    window.TrainerPlayer.start(planObj, view, () => { setTrainingMode(false); switchTab('plan'); });
  }

  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 1600);
  }

  // ---------- 路由 ----------
  function switchTab(tab) {
    currentTab = tab;
    tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === tab));
    if (tab === 'library') renderLibrary();
    else if (tab === 'plan') { planView = 'list'; renderPlanList(); }
  }
  tabs.forEach((t) => { t.onclick = () => switchTab(t.dataset.tab); });

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // ---------- 初始化 ----------
  async function init() {
    updateSoundBtn();
    loadMyPlans(); updateBadge();
    await window.AppData.load();
    if (!window.AppData.all().length) {
      view.innerHTML = `<div class="empty"><div class="big">⚠️</div>动作库加载失败<br>请用本地服务器打开（见 README）</div>`;
      return;
    }
    switchTab('library');
  }
  init();
})();
