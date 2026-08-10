// 数据加载：从 data/exercises.json 读取精选动作库
window.AppData = (function () {
  let exercises = [];
  let byId = {};

  async function load() {
    try {
      const res = await fetch('data/exercises.json', { cache: 'no-cache' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      exercises = await res.json();
    } catch (e) {
      console.error('动作库加载失败：', e);
      exercises = [];
    }
    byId = {};
    exercises.forEach((ex) => { byId[ex.id] = ex; });
    return exercises;
  }

  function all() { return exercises; }
  function get(id) { return byId[id]; }
  function getByName(name) {
    const key = String(name).trim().toLowerCase();
    return exercises.find((e) => e.name.toLowerCase() === key) || null;
  }

  // 按部位分类（用于筛选，返回中文名，与 app.js 的 filtered() 比对一致）
  function bodyParts() {
    const set = new Set(exercises.map((e) => e.bodyPartZh).filter(Boolean));
    // 按常用顺序排列，避免随机散列
    const ORDER = ['胸', '背', '肩', '手臂', '前臂', '大腿', '小腿', '腰腹', '颈部', '有氧'];
    return ORDER.filter((p) => set.has(p)).concat(Array.from(set).filter((p) => !ORDER.includes(p)));
  }

  return { load, all, get, getByName, bodyParts };
})();
