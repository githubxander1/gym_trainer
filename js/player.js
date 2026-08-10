// 跟练引擎
//  - 次数模式(rep)：口令版跟练，系统逐个数"第1个…第2个…"，圆环按次数填充，到点自动进下一组
//  - 计时模式(time)：秒倒计时（休息/计时动作）
//  - 顶部总进度条（按"组"统计，俯卧撑+下蹲+杠铃 各3组 = 共9组）
//  - 暂停/继续（两种模式通用）、组间休息、语音(TTS)、屏幕常亮、自动切换
window.TrainerPlayer = (function () {
  const REP_PACE_MS = 2500;   // 次数模式口令节奏：每个动作约 2.5 秒

  let container = null;
  let segments = [];
  let idx = 0;
  let endTime = 0;
  let tickTimer = null;
  let repTimer = null;
  let paused = false;
  let pauseStart = 0;
  let warned3 = false;
  let repDone = 0;            // 次数模式：当前组已数到的个数
  let wakeLock = null;
  let onFinish = null;

  function speak(text, cancelFirst) {
    if (!window.soundOn) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const ss = window.speechSynthesis;
      if (ss.paused) ss.resume();
      if (cancelFirst) ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 1.0;
      ss.speak(u);
    } catch (e) {}
  }

  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseAwake() { try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tickTimer && !paused) keepAwake();
  });

  // ---------- 段构建 ----------
  function buildSegments(planItems) {
    const segs = [];
    let groupNo = 0;
    planItems.forEach((it, i) => {
      const ex = window.AppData.get(it.exId);
      if (!ex) return;
      const sets = it.sets || 3;
      const rest = it.restSec || 15;
      const isRep = it.mode !== 'time';
      const sec = isRep ? 0 : (it.workSec || 30);
      const reps = it.reps || 12;
      for (let s = 1; s <= sets; s++) {
        groupNo++;
        segs.push({ type: 'work', ex, set: s, totalSets: sets, sec, reps, isRep, groupNo });
        if (s < sets) segs.push({ type: 'rest', sec: rest, ex, set: s + 1, nextEx: ex });
      }
      if (i < planItems.length - 1) {
        segs.push({ type: 'rest', sec: rest, ex, set: 1, nextEx: window.AppData.get(planItems[i + 1].exId) });
      }
    });
    if (segs.length && segs[segs.length - 1].type === 'rest') segs.pop();
    return segs;
  }

  // ---------- 总进度（按"组"） ----------
  function totalGroups() { return segments.filter((s) => s.type === 'work').length; }
  function groupProgress() {
    const total = totalGroups();
    let done = 0;
    for (let i = 0; i < idx; i++) if (segments[i].type === 'work') done++;
    const seg = segments[idx];
    const current = seg ? Math.min(done + 1, total) : total;
    return { done, total, current: Math.min(current, total) };
  }
  function progressHtml() {
    const { done, total, current } = groupProgress();
    const pct = total ? (done / total * 100) : 0;
    return `<div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" id="progFill" style="width:${pct}%"></div></div>
      <div class="progress-label" id="progLabel">第 ${current} / ${total} 组</div>
    </div>`;
  }
  function updateProgress() {
    const { done, total, current } = groupProgress();
    const f = document.getElementById('progFill'); if (f) f.style.width = (total ? done / total * 100 : 0) + '%';
    const l = document.getElementById('progLabel'); if (l) l.textContent = `第 ${current} / ${total} 组`;
  }

  // ---------- 渲染 ----------
  function render() {
    const seg = segments[idx];
    if (!seg) { renderDone(); return; }
    const ex = seg.type === 'work' ? seg.ex : seg.nextEx;
    const nameZh = ex ? (ex.nameZh || ex.name) : '休息';
    const isWork = seg.type === 'work';
    const phase = isWork ? (seg.isRep ? '次数跟练' : '计时跟练') : '休息';
    const phaseCls = isWork ? 'work' : 'rest';

    // 次数模式
    if (isWork && seg.isRep) {
      const remain = Math.max(0, seg.reps - repDone);
      const repPct = Math.min(100, repDone / seg.reps * 100);
      container.innerHTML = `
        <div class="player">
          ${progressHtml()}
          <div class="player-phase ${phaseCls}">${phase}</div>
          <div class="count-num" id="repNum">${repDone}</div>
          <div class="hbar-wrap">
            <div class="hbar-track"><div class="hbar-fill" id="barFill" style="width:${repPct}%"></div></div>
          </div>
          <div class="phase-sub" id="phaseSub">第 ${seg.set}/${seg.totalSets} 组 · 共 ${seg.reps} 次 · 还剩 ${remain} 次</div>
          <div class="player-name">${nameZh}</div>
          ${ex ? `<img class="player-gif" src="${ex.gif}" alt="" onerror="this.style.display='none'">` : ''}
          <div class="player-controls">
            <button class="pc-btn" id="pauseBtn">${paused ? '▶ 继续' : '⏸ 暂停'}</button>
            <button class="pc-btn" id="skipBtn">跳过 ⏭</button>
            <button class="pc-btn primary big" id="doneBtn">✓ 完成这组</button>
          </div>
          <button class="ghost-btn" id="stopBtn">结束训练</button>
        </div>`;
      document.getElementById('doneBtn').onclick = () => next(false);
      document.getElementById('skipBtn').onclick = () => next(false);
      document.getElementById('pauseBtn').onclick = togglePause;
      document.getElementById('stopBtn').onclick = stop;
      return;
    }

    // 计时模式（work time / rest）
    const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const ringPct = seg.sec > 0 ? (1 - remain / seg.sec) : 0;
    const setLabel = isWork ? `第 ${seg.set}/${seg.totalSets} 组` : `下一组 ${seg.set}/${seg.totalSets} 组`;
    container.innerHTML = `
      <div class="player">
        ${progressHtml()}
        <div class="player-phase ${phaseCls}">${phase}</div>
        <div class="count-num" id="timeText">${fmt(remain)}</div>
        <div class="hbar-wrap">
          <div class="hbar-track"><div class="hbar-fill ${isWork ? '' : 'rest'}" id="barFill" style="width:${Math.min(100, ringPct * 100)}%"></div></div>
        </div>
        <div class="phase-sub" id="phaseSub">${setLabel}</div>
        <div class="player-name">${nameZh}</div>
        ${ex ? `<img class="player-gif" src="${ex.gif}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="player-controls">
          <button class="pc-btn" id="pauseBtn">${paused ? '▶ 继续' : '⏸ 暂停'}</button>
          <button class="pc-btn" id="skipBtn">跳过 ⏭</button>
          <button class="pc-btn" id="prevBtn">⏮ 上组</button>
        </div>
        <button class="ghost-btn" id="stopBtn">结束训练</button>
      </div>`;
    document.getElementById('pauseBtn').onclick = togglePause;
    document.getElementById('skipBtn').onclick = () => next(false);
    document.getElementById('prevBtn').onclick = prev;
    document.getElementById('stopBtn').onclick = stop;
  }

  function renderDone() {
    const total = totalGroups();
    container.innerHTML = `
      <div class="player done">
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
          <div class="progress-label">第 ${total} / ${total} 组 · 全部完成</div>
        </div>
        <div class="done-emoji">🎉</div>
        <div class="done-title">训练完成！</div>
        <div class="done-sub">本次共 ${total} 组动作</div>
        <button class="primary-btn" id="backBtn">返回</button>
      </div>`;
    document.getElementById('backBtn').onclick = () => { if (onFinish) onFinish(); };
    speak('训练完成，辛苦了');
  }

  // ---------- 计时（秒） ----------
  function tick() {
    if (paused) return;
    const seg = segments[idx];
    if (!seg) return;
    if ((seg.sec || 0) <= 0) return;            // 次数模式不在此倒计时
    const remain = (endTime - Date.now()) / 1000;
    const el = document.getElementById('timeText');
    const bar = document.getElementById('barFill');
    if (el) el.textContent = fmt(Math.max(0, Math.ceil(remain)));
    if (bar) {
      const pct = Math.min(1, Math.max(0, 1 - remain / seg.sec));
      bar.style.width = (pct * 100) + '%';
    }
    if (!warned3 && remain <= 3 && remain > 0) {
      warned3 = true;
      speak(seg.type === 'work' ? '还有三秒' : '准备');
    }
    if (remain <= 0) next(true);
  }

  // ---------- 次数口令 ----------
  function repTick() {
    if (paused) return;
    const seg = segments[idx];
    if (!seg || !seg.isRep) return;
    repDone++;
    if (repDone <= seg.reps) {
      speak(String(repDone));
      const el = document.getElementById('repNum'); if (el) el.textContent = repDone;
      const sub = document.getElementById('phaseSub');
      if (sub) sub.textContent = `第 ${seg.set}/${seg.totalSets} 组 · 共 ${seg.reps} 次 · 还剩 ${Math.max(0, seg.reps - repDone)} 次`;
      const bar = document.getElementById('barFill');
      if (bar) bar.style.width = (Math.min(1, repDone / seg.reps) * 100) + '%';
      if (repDone >= seg.reps) { speak('这组完成'); stopRep(); setTimeout(() => next(true), 600); }
    }
  }

  // ---------- 段启动 ----------
  function startSegment() {
    stopTick(); stopRep();
    const seg = segments[idx];
    if (!seg) { renderDone(); return; }
    warned3 = false;
    const ex = seg.type === 'work' ? seg.ex : seg.nextEx;
    if (seg.type === 'work') {
      if (seg.isRep) {
        repDone = 0;
        render();
        speak(`第 ${seg.set} 组，${ex ? (ex.nameZh || ex.name) : ''}，开始`, true);
        startRep();
      } else {
        endTime = Date.now() + seg.sec * 1000;
        render();
        speak(`第 ${seg.set} 组，${ex ? (ex.nameZh || ex.name) : ''}，开始`, true);
        startTick();
      }
    } else {
      endTime = Date.now() + seg.sec * 1000;
      render();
      speak(`休息 ${seg.sec} 秒`, true);
      startTick();
    }
  }

  function next() {
    idx++;
    if (idx >= segments.length) { stopTick(); stopRep(); releaseAwake(); renderDone(); return; }
    startSegment();
  }
  function prev() { if (idx > 0) { idx--; startSegment(); } }

  function togglePause() {
    paused = !paused;
    const b = document.getElementById('pauseBtn');
    if (paused) {
      pauseStart = Date.now();
      stopTick(); stopRep();
      if (b) b.textContent = '▶ 继续';
    } else {
      if (pauseStart) endTime += (Date.now() - pauseStart);
      if (b) b.textContent = '⏸ 暂停';
      const seg = segments[idx];
      if (seg && seg.sec > 0) startTick();
      else if (seg && seg.isRep) startRep();
    }
  }

  function startTick() { stopTick(); tickTimer = setInterval(tick, 200); }
  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }
  function startRep() { stopRep(); repTimer = setInterval(repTick, REP_PACE_MS); }
  function stopRep() { if (repTimer) { clearInterval(repTimer); repTimer = null; } }

  function stop() {
    stopTick(); stopRep(); releaseAwake();
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    if (onFinish) onFinish();
  }

  async function start(planItems, mountEl, finishCb) {
    container = mountEl;
    onFinish = finishCb;
    segments = buildSegments(planItems);
    idx = 0; paused = false; pauseStart = 0; repDone = 0;
    if (!segments.length) { renderDone(); return; }
    await keepAwake();
    startSegment();
  }

  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return (m > 0 ? m + ':' : '') + String(ss).padStart(m > 0 ? 2 : 1, '0');
  }

  return { start };
})();
