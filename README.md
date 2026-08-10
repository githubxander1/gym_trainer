# 练练 · 跟练助手 (gym_trainer)

自用健身跟练 PWA：动作库 + 计划库 + 倒计时/口令跟练。

## 功能
- **动作库**：1324 条动作，按部位筛选、搜索。
- **计划库**：内置增肌 / 减脂 / 练胸 / 全身计划，点进详情看介绍与动作清单；也支持自定义计划。
- **跟练**：次数模式用语音逐个数「1,2,3…」，横条进度显示当前组完成度，顶部按组总进度条，支持暂停/继续。从「计划」点「开始跟练」启动（无独立 tab）。

## 本地运行
```bash
cd gym_trainer
python -m http.server 8000
# 浏览器打开 http://localhost:8000
```
> 必须通过 http(s) 访问（应用用 fetch 读取 data/exercises.json），直接双击 index.html 会被浏览器拦截。

## 部署
已通过 GitHub Pages 部署，线上地址：
https://githubxander1.github.io/gym_trainer/

手机访问该地址后：安卓 Chrome 点「安装应用」，iPhone Safari 点「分享 → 添加到主屏幕」，即可像原生 App 一样全屏使用。

## 目录
- `index.html` / `manifest.webmanifest` — 入口与 PWA 配置
- `css/style.css` — 样式
- `js/{data,app,player}.js` — 数据、界面、跟练逻辑
- `data/exercises.json` — 动作库
- `assets/icon.svg` — 应用图标
- `design-tokens.css` / `component-spec.md` — 设计交付物（供二次开发参考）
