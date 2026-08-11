// 跟练引擎
//  - 次数模式(rep)：口令版跟练，系统逐个数"1…2…3…"，横条按次数填充，到点自动进下一组
//  - 计时模式(time)：秒倒计时（休息/计时动作/拉伸）
//  - 拉伸段(stretch)：带说明的计时段（热身/放松/凯格尔等），无次数
//  - 顶部总进度条（按"段"统计）
//  - 暂停/继续、组间休息、语音(TTS)、屏幕常亮、自动切换
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

  // 训练总时长（暂停冻结，用于进度条右侧显示）
  let trainStart = 0;
  let pausedAccum = 0;
  let durTimer = null;

  function speak(text, cancelFirst) {
    if (!window.soundOn) return;
    try {
      if (!('speechSynthesis' in window)) return;
      const ss = window.speechSynthesis;
      if (ss.paused) ss.resume();
      if (cancelFirst) ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
      ss.speak(u);
    } catch (e) {}
  }

  // ---------- Web Audio 提示音（不依赖系统 TTS，安卓 Chrome 静音时也能响） ----------
  let actx = null;
  let masterGain = null;
  function ensureAudio() {
    try {
      if (!actx) {
        actx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = actx.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(actx.destination);
      }
      if (actx && actx.state === 'suspended') actx.resume();
    } catch (e) { actx = null; masterGain = null; }
    return actx;
  }
  function tone(freq, durMs, delayMs, type, gainVal) {
    const ac = ensureAudio();
    if (!ac) return;
    const t0 = ac.currentTime + (delayMs || 0) / 1000;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    const peak = gainVal || 0.4;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g); g.connect(masterGain || ac.destination);
    osc.start(t0);
    osc.stop(t0 + durMs / 1000 + 0.03);
  }
  // 不同场景用不同音效区分
  const Cue = {
    start() { if (!window.soundOn) return; tone(880, 170, 0, 'sine', 1.0); tone(1320, 170, 0, 'sine', 0.35); },
    repTick() { if (!window.soundOn) return; tone(1175, 60, 0, 'triangle', 0.9); },
    setComplete() { if (!window.soundOn) return; tone(880, 150, 0, 'sine', 0.95); tone(1175, 280, 120, 'sine', 0.95); },
    restStart() { if (!window.soundOn) return; tone(587.33, 340, 0, 'sine', 0.9); },
    count3() { if (!window.soundOn) return; tone(987.77, 90, 0, 'square', 0.9); tone(1174.66, 90, 140, 'square', 0.9); tone(1318.51, 100, 280, 'square', 0.9); },
    workoutComplete() { if (!window.soundOn) return; [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 230, i * 150, 'triangle', 0.95)); }
  };

  async function keepAwake() {
    try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseAwake() { try { if (wakeLock) { wakeLock.release(); wakeLock = null; } } catch (e) {} }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && tickTimer && !paused) keepAwake();
  });

  // ---------- 段构建（支持 warmup / items / cooldown 三种 phase） ----------
  // 输入：plan 对象 { warmup:[], items:[], cooldown:[] } 或 纯 items 数组
  function buildSegments(plan) {
    const blocks = Array.isArray(plan)
      ? plan.slice()
      : (plan.warmup || []).concat(plan.items || [], plan.cooldown || []);
    const segs = [];
    blocks.forEach((block, bi) => {
      const isLast = bi === blocks.length - 1;
      if (block.kind === 'stretch') {
        const sec = Math.max(5, block.dur || 30);
        segs.push({ type: 'stretch', name: block.name || '拉伸', desc: block.desc || '', sec, ex: block.exId ? window.AppData.get(block.exId) : null });
        if (!isLast) segs.push({ type: 'rest', sec: 8, ex: null, set: 1, totalSets: 1, nextEx: null, mini: true });
        return;
      }
      // exercise
      const ex = window.AppData.get(block.exId);
      if (!ex) return;
      const sets = block.sets || 3;
      const rest = block.restSec || 15;
      const isRep = block.mode !== 'time';
      const sec = isRep ? 0 : (block.workSec || 30);
      const reps = block.reps || 12;
      for (let s = 1; s <= sets; s++) {
        segs.push({ type: 'work', ex, set: s, totalSets: sets, sec, reps, isRep });
        if (s < sets) segs.push({ type: 'rest', sec: rest, ex, set: s + 1, totalSets: sets, nextEx: ex });
      }
      if (!isLast) segs.push({ type: 'rest', sec: rest, ex, set: 1, totalSets: 1, nextEx: window.AppData.get((blocks[bi + 1] && blocks[bi + 1].exId) || '') });
    });
    if (segs.length && segs[segs.length - 1].type === 'rest') segs.pop();
    return segs;
  }

  // ---------- 总进度（按"段"） ----------
  function totalSteps() { return segments.length; }
  function stepProgress() {
    const total = totalSteps();
    const current = Math.min(idx + 1, total);
    return { done: idx, total, current };
  }
  function getElapsed() { return Math.max(0, Math.floor((Date.now() - trainStart - pausedAccum) / 1000)); }
  function updateDuration() { const el = document.getElementById('durText'); if (el) el.textContent = '⏱ ' + fmt(getElapsed()); }
  function progressHtml() {
    const { done, total, current } = stepProgress();
    const pct = total ? (done / total * 100) : 0;
    return `<div class="progress-wrap">
      <div class="progress-bar"><div class="progress-fill" id="progFill" style="width:${pct}%"></div></div>
      <div class="progress-meta">
        <span class="progress-label" id="progLabel">第 ${current} / ${total} 步</span>
        <span class="duration" id="durText">⏱ ${fmt(getElapsed())}</span>
      </div>
    </div>`;
  }
  function updateProgress() {
    const { done, total, current } = stepProgress();
    const f = document.getElementById('progFill'); if (f) f.style.width = (total ? done / total * 100 : 0) + '%';
    const l = document.getElementById('progLabel'); if (l) l.textContent = `第 ${current} / ${total} 步`;
  }

  // ---------- 渲染 ----------
  function render() {
    const seg = segments[idx];
    if (!seg) { renderDone(); return; }
    const ex = (seg.type === 'work') ? seg.ex : (seg.nextEx || seg.ex);
    const nameZh = seg.type === 'stretch' ? seg.name : (ex ? (ex.nameZh || ex.name) : '休息');
    const isWork = seg.type === 'work';

    // 次数模式
    if (isWork && seg.isRep) {
      const remain = Math.max(0, seg.reps - repDone);
      const repPct = Math.min(100, repDone / seg.reps * 100);
      container.innerHTML = `
        <div class="player">
          ${progressHtml()}
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
            <button class="pc-btn primary big" id="doneBtn">✓ 完成</button>
          </div>
          <button class="ghost-btn" id="stopBtn">结束训练</button>
        </div>`;
      document.getElementById('doneBtn').onclick = () => next(false);
      document.getElementById('skipBtn').onclick = () => next(false);
      document.getElementById('pauseBtn').onclick = togglePause;
      document.getElementById('stopBtn').onclick = stop;
      return;
    }

    // 计时模式（work time / rest / stretch）
    const remain = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
    const ringPct = seg.sec > 0 ? (1 - remain / seg.sec) : 0;
    let setLabel;
    if (seg.type === 'stretch') setLabel = seg.name;
    else if (seg.type === 'rest') setLabel = seg.mini ? '稍作调整' : `下一组 ${seg.set}/${seg.totalSets} 组`;
    else setLabel = `第 ${seg.set}/${seg.totalSets} 组`;
    container.innerHTML = `
      <div class="player">
        ${progressHtml()}
        <div class="count-num" id="timeText">${fmt(remain)}</div>
        <div class="hbar-wrap">
          <div class="hbar-track"><div class="hbar-fill ${isWork ? '' : 'rest'}" id="barFill" style="width:${Math.min(100, ringPct * 100)}%"></div></div>
        </div>
        <div class="phase-sub" id="phaseSub">${setLabel}</div>
        ${seg.type === 'stretch' && seg.desc ? `<div class="stretch-desc">${esc(seg.desc)}</div>` : ''}
        <div class="player-name">${nameZh}</div>
        ${ex && seg.type !== 'stretch' ? `<img class="player-gif" src="${ex.gif}" alt="" onerror="this.style.display='none'">` : ''}
        <div class="player-controls">
          <button class="pc-btn" id="pauseBtn">${paused ? '▶ 继续' : '⏸ 暂停'}</button>
          <button class="pc-btn" id="skipBtn">跳过 ⏭</button>
          <button class="pc-btn" id="prevBtn">⏮ 上步</button>
        </div>
        <button class="ghost-btn" id="stopBtn">结束训练</button>
      </div>`;
    document.getElementById('pauseBtn').onclick = togglePause;
    document.getElementById('skipBtn').onclick = () => next(false);
    document.getElementById('prevBtn').onclick = prev;
    document.getElementById('stopBtn').onclick = stop;
  }

  function renderDone() {
    const total = totalSteps();
    if (durTimer) { clearInterval(durTimer); durTimer = null; }
    container.innerHTML = `
      <div class="player done">
        <div class="progress-wrap">
          <div class="progress-bar"><div class="progress-fill" style="width:100%"></div></div>
          <div class="progress-label">第 ${total} / ${total} 步 · 全部完成</div>
        </div>
        <div class="done-emoji">🎉</div>
        <div class="done-title">训练完成！</div>
        <div class="done-sub">本次共 ${total} 步 · 用时 ${fmt(getElapsed())}</div>
        <button class="primary-btn" id="backBtn">返回</button>
      </div>`;
    document.getElementById('backBtn').onclick = () => { if (onFinish) onFinish(); };
    speak('训练完成，辛苦了');
    Cue.workoutComplete();
  }

  // ---------- 计时（秒） ----------
  function tick() {
    if (paused) return;
    const seg = segments[idx];
    if (!seg) return;
    if ((seg.sec || 0) <= 0) return;
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
      speak(seg.type === 'work' ? '还有三秒' : (seg.type === 'stretch' ? '准备' : '准备'));
      Cue.count3();
    }
    if (remain <= 0) { if (seg.type === 'work') Cue.setComplete(); next(true); }
  }

  // ---------- 次数口令 ----------
  function repTick() {
    if (paused) return;
    const seg = segments[idx];
    if (!seg || !seg.isRep) return;
    repDone++;
    if (repDone <= seg.reps) {
      speak(String(repDone));
      Cue.repTick();
      const el = document.getElementById('repNum'); if (el) el.textContent = repDone;
      const sub = document.getElementById('phaseSub');
      if (sub) sub.textContent = `第 ${seg.set}/${seg.totalSets} 组 · 共 ${seg.reps} 次 · 还剩 ${Math.max(0, seg.reps - repDone)} 次`;
      const bar = document.getElementById('barFill');
      if (bar) bar.style.width = (Math.min(1, repDone / seg.reps) * 100) + '%';
      if (repDone >= seg.reps) { speak('这组完成'); Cue.setComplete(); stopRep(); setTimeout(() => next(true), 600); }
    }
  }

  // ---------- 段启动 ----------
  function startSegment() {
    stopTick(); stopRep();
    const seg = segments[idx];
    if (!seg) { renderDone(); return; }
    warned3 = false;
    const ex = (seg.type === 'work') ? seg.ex : (seg.nextEx || seg.ex);
    if (seg.type === 'work') {
      if (seg.isRep) {
        repDone = 0;
        render();
        speak(`第 ${seg.set} 组，${ex ? (ex.nameZh || ex.name) : ''}，开始`, true);
        Cue.start();
        startRep();
      } else {
        endTime = Date.now() + seg.sec * 1000;
        render();
        speak(`第 ${seg.set} 组，${ex ? (ex.nameZh || ex.name) : ''}，开始`, true);
        Cue.start();
        startTick();
      }
    } else if (seg.type === 'stretch') {
      endTime = Date.now() + seg.sec * 1000;
      render();
      speak(seg.name, true);
      Cue.start();
      startTick();
    } else {
      endTime = Date.now() + seg.sec * 1000;
      render();
      speak(`休息 ${seg.sec} 秒`, true);
      Cue.restStart();
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
      if (pauseStart) { endTime += (Date.now() - pauseStart); pausedAccum += (Date.now() - pauseStart); }
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
    if (durTimer) { clearInterval(durTimer); durTimer = null; }
    try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch (e) {}
    if (onFinish) onFinish();
  }

  async function start(planObj, mountEl, finishCb) {
    container = mountEl;
    onFinish = finishCb;
    ensureAudio();
    trainStart = Date.now(); pausedAccum = 0;
    if (durTimer) clearInterval(durTimer);
    durTimer = setInterval(updateDuration, 500);
    updateDuration();
    try {
      if (window.speechSynthesis) {
        const ss = window.speechSynthesis;
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0; u.lang = 'zh-CN'; u.rate = 1; u.pitch = 1;
        ss.speak(u);
        setTimeout(() => { try { ss.cancel(); } catch (e) {} }, 80);
      }
    } catch (e) {}
    segments = buildSegments(planObj);
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
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  return { start };
})();
