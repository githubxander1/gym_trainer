# gym-trainer 设计稿组件拆解

对应 Ardot 原型文件：`https://ardot.tencent.com/file/713266082454827`  
开发时请搭配 `design-tokens.css` 使用，颜色/间距/字号全部引用 token，不要写死数值。

---

## 一、设计系统

| Token | 用途 |
|-------|------|
| `--gt-bg` | 页面背景、跟练内容区背景 |
| `--gt-surface` | 卡片、顶栏、底部 tab、圆环 |
| `--gt-surface-2` | 搜索框、未选中 chip、缩略图占位、禁用按钮 |
| `--gt-accent` | 主按钮、激活态、选中 tab、强调标签 |
| `--gt-text-primary` | 标题、主要文字 |
| `--gt-text-secondary` | 次要说明、参数、占位文字 |
| `--gt-danger` | 删除按钮图标 |

---

## 二、页面骨架（三屏共用）

每个屏幕都是 **390×844** 的垂直 Frame，内部三段式：

```
├─ TopBar      高度 56，flex row，space-between，背景 surface
├─ Content     fill，flex column，gap 12，padding 16，可滚动
└─ BottomTab   高度 64，flex row，space-around/around，背景 surface
```

---

## 三、屏1：动作库（节点 `2:1`）

内容区：`2:5`

### 1. SearchBar（`2:26`）
- 结构：单行 Frame，高度 44，背景 `surface-2`，圆角 `radius-md`
- 内部：左 padding 14，placeholder 文字 `text-secondary`
- 对应组件：`<SearchBar placeholder="搜索动作 / 中文名 / 部位" />`

### 2. ChipGroup（`2:28`）
- 结构：水平 Frame，gap 8，高度 hug（随子元素）
- 子元素：
  - `Chip`（`2:29`、`2:31`、`2:33`、`2:35`）
    - 胶囊形状（`radius-pill`）
    - 水平 auto-layout，hug 内容，padding `14px 14px 6px 6px`
    - 激活态：背景 `accent`，文字 `accent-text`
    - 默认态：背景 `surface-2`，文字 `text-secondary`
- 对应组件：`<ChipGroup options={['全部','胸','背','大腿',...]} active={...} />`

### 3. ExerciseCard（`2:38`、`2:45`、`2:52`、`2:59`）
- 结构：水平 Frame，高度 84，背景 `surface`，圆角 `radius-xl`
- padding 10，gap 12，垂直居中对齐
- 子元素：
  1. **Thumbnail** 64×64，背景 `surface-2`，圆角 `radius-sm`（后续替换为真实 GIF/图片）
  2. **Info** 垂直 Frame，gap 4
     - 动作名：`--gt-body`，`text-primary`
     - 标签：`--gt-caption`，`accent`（例：`大腿 · 哑铃`）
  3. **AddButton** 38×38，背景 `accent-12`，圆角 `radius-sm`，内部 "+" 为 `accent` 色
- 对应组件：`<ExerciseCard exercise={...} onAdd={...} />`

---

## 四、屏2：我的计划（节点 `2:10`）

内容区：`2:13`

### 1. SectionTitle（`2:66`）
- 文字：`--gt-caption`，`text-secondary`
- 例："快速开始 · 示例全身计划"

### 2. PresetGroup（`2:68`）
- 结构：水平 Frame，gap 8，高度 hug
- 子元素：
  - `PresetPill`（`2:69`、`2:71`、`2:73`）
    - 胶囊/圆角按钮，hug 内容，padding `12px 12px 9px 9px`
    - 背景 `surface-2`，文字 `accent`，字号 `--gt-small`
    - 例："周一 · 全身A"
- 对应组件：`<PresetGroup plans={['周一·全身A','周三·全身B','周五·全身C']} />`

### 3. PlanItem（`2:75`、`2:82`）
- 结构：水平 Frame，高度 72，背景 `surface`，圆角 `radius-xl`
- padding 10，gap 10，垂直居中对齐
- 子元素：
  1. **Thumbnail** 52×52，背景 `surface-2`，圆角 `radius-sm`
  2. **Info** 垂直 Frame，gap 3
     - 动作名：`--gt-body`，`text-primary`
     - 参数：`--gt-caption`，`text-secondary`（例：`3 组 · 12 次 · 休45s`）
  3. **DeleteButton** 32×32，背景 `danger-12`，圆角 `radius-sm`，内部 "×" 为 `danger` 色
- 对应组件：`<PlanItem item={...} onDelete={...} />`

### 4. PrimaryButton（`2:89`）
- 结构：全宽 Frame，高度 52，背景 `accent`，圆角 `radius-lg`
- 文字居中，`--gt-body`，`accent-text`
- 例："▶ 开始跟练"
- 对应组件：`<PrimaryButton>开始跟练</PrimaryButton>`

---

## 五、屏3：跟练（节点 `2:18`）

内容区：`2:21`，垂直居中排列

### 1. PhaseTag（`2:91`）
- 结构：胶囊 Frame，padding 16/5，背景 `accent-15`
- 文字 `accent`，`--gt-caption`
- 例："训练组"
- 对应组件：`<PhaseTag>训练组</PhaseTag>`

### 2. CountdownRing（`2:93`）
- 结构：同心圆
  - 外环：220×220，背景 `surface`，正圆
  - 内圆：180×180，背景 `bg`，正圆
- 内部文字垂直居中：
  - 数字：`--gt-h1`，`accent`
  - 单位：`--gt-caption`，`text-secondary`
- 对应组件：`<CountdownRing seconds={45} />`

### 3. ExerciseName
- 文字：`--gt-h1`，`text-primary`，居中

### 4. GifPlaceholder（`2:98`）
- 200×200，背景 `surface`，圆角 `radius-lg`
- 运行时替换为真实 GIF

### 5. Progress
- 文字：`--gt-caption`，`text-secondary`
- 例："第 1/7 项 · 组 1/3"

### 6. ControlBar（`2:100`）
- 结构：水平 Frame，gap 12，子元素居中对齐
- 子元素 `IconButton` 64×64 正圆：
  - Pause/Stop：背景 `surface-2`，图标 `text-primary`
  - Next：背景 `accent`，图标 `accent-text`
- 对应组件：
  ```jsx
  <ControlBar
    onPause={...}
    onNext={...}
    onStop={...}
  />
  ```

---

## 六、给开发的建议

1. **不要切图**：所有元素都能用 CSS 画出；只有动作 GIF/缩略图需要图片资源。
2. **先搭 Layout 骨架**：三个 Screen 共享 TopBar + Content + BottomTab，先封装 `<ScreenLayout activeTab />`。
3. **优先复用组件**：`ExerciseCard` 与 `PlanItem` 结构非常接近，可以抽象出 `<ListItem size="lg|sm" showDelete />`。
4. **用 token 而不是硬编码**：所有颜色/间距/字号已在 `design-tokens.css` 定义，后期换肤只改这一处。
5. **响应式**：设计稿按 iPhone 375pt 逻辑像素（390 展示宽度）出图；开发时可用 `max-width: 430px; margin: 0 auto` 居中显示，其余区域用 `bg` 色填充。
