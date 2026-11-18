# 蓝色 3D 圣诞树 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布一个可环绕旋转、带点击雪花反馈的深蓝极光 3D 圣诞树网页，手机与电脑通过 GitHub Pages 链接直接访问。

**Architecture:** 单个 `index.html`（内联 CSS 与应用脚本）+ 本地 `vendor/three.min.js`（r159 UMD，经典脚本，双击可离线运行）。场景由粒子圆锥树、挂饰、树顶星、极光背景、3D 雪、地面光池组成；自写半分辨率高斯泛光；自写轨道相机与对象池雪花爆发。

**Tech Stack:** Three.js r159（UMD）、原生 DOM/CSS、Chrome headless 截图验证。

**Spec:** `docs/superpowers/specs/2026-11-18-blue-christmas-tree-design.md`

## Global Constraints

- 运行时不请求任何外部资源（无 CDN、无外部字体、无图片文件；雪花贴图由 canvas 现画）
- 只用经典 `<script>`，不用 ES module，保证 `file://` 双击可运行
- 调色板：背景 `#030814`、冰白 `#DFF6FF`、天蓝 `#7CDFFF`、深蓝 `#1B5BFF`、点睛青 `#4FD1E8`
- 文案固定：`MERRY CHRISTMAS`，下方小字 `2026`
- 像素比上限 2；手机光点 1200、桌面 2200；泛光半分辨率
- 点击判定：位移 < 8px 且时长 < 350ms；爆发冷却 150ms；10 秒无操作后恢复自转
- 标签页隐藏时暂停；`dt` 上限 0.05s；尊重 `prefers-reduced-motion`
- 单文件除 three 外无其他依赖；three 保留 MIT 许可头

## Review Focus

1. **手机 Safari 地址栏伸缩**：画布高度不得跳动或露出黑边；用 `100dvh` + `visualViewport` resize 处理。
2. **拖动末端误爆雪**：手指拖动 20px 后松手不得触发雪花爆发（`isTap` 判定）。
3. **file:// 双击**：本地直接打开无 CORS/模块错误，场景完整。
4. **切后台很久再回来**：不得出现粒子瞬移或整屏闪烁（`dt` 钳制、隐藏暂停）。
5. **低端机**：DPR 上限与移动端降级生效，不发烫、不白屏；WebGL 不可用时有可读提示。

---

### Task 1: 仓库骨架、依赖与场景启动

**Files:**
- Create: `index.html`
- Create: `vendor/three.min.js`
- Create: `vendor/LICENSE-three.txt`
- Create: `README.md`
- Create: `.gitignore`

**Interfaces:**
- Produces: `CONFIG` 全局常量（含 `CONFIG.tap = { maxMove: 8, maxMs: 350, cooldownMs: 150 }`、`CONFIG.burst = { snowflakes: 48, sparks: 24, lifeMin: 1.2, lifeMax: 1.8 }`、`CONFIG.orbit.idleAutoRotateAfterMs = 10000`）；`init()` 启动入口；`window.SCENE_READY`（第三帧后置 true）；页面根节点 `data-ready="1"`；`?demo=burst|click` 查询参数钩子

- [ ] **Step 1:** `git init`；`mkdir -p vendor`；下载 `https://cdn.jsdelivr.net/npm/three@0.159.0/build/three.min.js` 到 `vendor/`，确认文件 > 600KB 且首行含 `THREE`/版本注释；从同版本包取 `LICENSE` 存为 `vendor/LICENSE-three.txt`
- [ ] **Step 2:** 写 `index.html`：`<canvas id="stage">`、全屏样式（`100dvh`、`overflow:hidden`、背景 `#030814`）、`<script src="vendor/three.min.js">`、内联应用脚本；`init()` 创建 `WebGLRenderer(antialias:true, alpha:false)`、`outputColorSpace = SRGBColorSpace`、`toneMapping = ACESFilmicToneMapping`、`PerspectiveCamera(40, ..., 0.1, 200)` 位于 `(0, 3.2, 30)`、渲染循环、`resize()`；`CONFIG` 按 Global Constraints 给出所有数值
- [ ] **Step 3:** 加错误可见化：`window.onerror` 与 `unhandledrejection` 把错误文本写进页面上一个红色 `<pre>`；无 WebGL 时显示中文提示"当前浏览器不支持 WebGL"
- [ ] **Step 4:** 写 `README.md`（一句话说明 + 在线链接占位 + 本地打开方式）与 `.gitignore`
- [ ] **Step 5:** 验证：`chrome --headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --window-size=390,844 --virtual-time-budget=4000 --screenshot=artifacts/t1.png "file:///D:/Claude Code/play/blue-christmas-tree/index.html"`；Read 截图确认纯深蓝背景、无红色错误块；`curl` 无外部请求（查看源码确认）
- [ ] **Step 6:** Commit `chore: scaffold 3D scene with vendored three.js`

### Task 2: 粒子树、挂饰、树顶星、地面与雾

**Files:**
- Modify: `index.html`（新增场景构建区块）

**Interfaces:**
- Produces: `createTree({ count }) -> { group, uniforms, triggerRipple(worldPos: THREE.Vector3) }`；`createOrnaments() -> { group, pulse(worldPos) }`；`createStar() -> { group, flash() }`；`createGround()`；`CONFIG.tree = { height: 20, radius: 7.2, turns: 14, twistJitter: 0.35 }`
- Consumes: `CONFIG`、`init()` 的 scene

- [ ] **Step 1:** 实现 `createTree`：`THREE.BufferGeometry` 存 position/color/size/seed；黄金角螺旋 `angle = i * 2.39996`，`y` 从顶到底按随机层次，半径 `r = radius * (1 - t) * (0.75 + 0.25*rand)`，形成体积；顶点色在 `#DFF6FF`、`#7CDFFF`、`#1B5BFF` 间按高度与随机插值，8% 点用 `#4FD1E8`
- [ ] **Step 2:** 自定义 `ShaderMaterial`：大小随距离衰减、圆形软边、加法混合、`depthWrite:false`；uniform `uTime`、`uRippleOrigin`、`uRippleTime`（初始 -100，触发时置 0 并在 update 中累加）；波纹按 `distance(worldPos, origin)` 与 `uRippleTime` 计算亮度脉冲
- [ ] **Step 3:** `createOrnaments`：30 个球体（`SphereGeometry(0.16, 10, 10)`，`MeshBasicMaterial` 高亮蓝白），放在树表面螺旋上，`pulse` 在 0.8s 内放大 1.6 倍并恢复；各自轻微上下浮动
- [ ] **Step 4:** `createStar`：树顶 `OctahedronGeometry(0.55)` + 4 长 4 短星芒（加法混合 PlaneGeometry 贴 canvas 画的光晕）呼吸；`flash()` 把亮度拉到 2.5 再回落
- [ ] **Step 5:** `createGround`：半径 18 的圆形平面，径向渐变 shader（中心 `#0A2A4A` 到边缘透明），加法混合；`scene.fog = FogExp2(0x030814, 0.018)`
- [ ] **Step 6:** 验证移动端与桌面截图（390×844、1440×900），Read 检查树形清晰、星在顶部、无黑块
- [ ] **Step 7:** Commit `feat: build particle tree, ornaments and star`

### Task 3: 轨道相机、自动旋转与暂停

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `createOrbit(dom, camera, target) -> { update(dt), isDragging(), consumeDragDelta() -> {x,y} }`；纯函数 `isTap(dx, dy, dtMs) -> boolean`
- Consumes: 相机与 `CONFIG`

- [ ] **Step 1:** 实现 `createOrbit`：`pointerdown/move/up`（Pointer Events 统一鼠标与触摸），yaw 无限制、pitch 钳制 `-8°..+28°`，速度 0.004 rad/px，松手速度按 0.92/帧衰减；`update(dt)` 应用惯性；空闲累计 10s 后以 `0.06 rad/s` 自转（`CONFIG.orbit.idleAutoRotateAfterMs = 10000`）
- [ ] **Step 2:** 滚轮不缩放，只 `preventDefault`；`touch-action: none` 防页面滚动
- [ ] **Step 3:** 实现 `isTap(dx=0, dy=0, dt=0)`：`Math.hypot(dx,dy) < 8 && dt < 350`
- [ ] **Step 4:** 渲染循环：`dt = Math.min(clock.getDelta(), 0.05)`；`document.hidden` 时跳过渲染；`visibilitychange` 恢复时重置 clock
- [ ] **Step 5:** 验证：Node 运行 `isTap` 四组断言（0px/100ms true，9px/100ms false，0px/400ms false，3px/300ms true）；两次不同虚拟时间截图（`--virtual-time-budget=1500` 与 `=4500`）像素哈希不同，证明在动
- [ ] **Step 6:** Commit `feat: add orbit camera with inertia and auto-rotate`

### Task 4: 极光、3D 雪与自写泛光

**Files:**
- Modify: `index.html`

**Interfaces:**
- Produces: `createAurora() -> { mesh, update(t) }`；`createSnow({ count }) -> { object, update(dt, wind: Vector2), setStir(v: Vector2) }`；`createBloom(renderer) -> { render(scene, camera, dt), resize(w,h) }`
- Consumes: Task 2 场景

- [ ] **Step 1:** `createAurora`：位于 `z=-60` 的大平面，片元着色器用 3 组不同频率/速度的正弦带叠加成流动光带，颜色 `#1B5BFF`→`#4FD1E8`，亮度低（最终画面里不抢树），`update(t)` 仅更新 uniform
- [ ] **Step 2:** `createSnow`：三层 3D 点云（数量 220/120/50，桌面乘 1），随机盒 `x±16, y±12, z -12..14`，各自下落速度 0.25/0.5/0.9、大小与透明度分层，圆形软边；`update` 内按风摆、出界回绕；`setStir` 在拖动时叠加横向速度并缓慢衰减
- [ ] **Step 3:** `createBloom`：渲染场景到半分辨率 `WebGLRenderTarget`；阈值 pass（亮度 > 0.65）；水平 9 抽样高斯 → 垂直 9 抽样；最后主画面与模糊结果加法合成（全屏三角/四边形，正交相机）
- [ ] **Step 4:** 性能降级：`navigator.hardwareConcurrency <= 4` 或视口宽 < 500 时，光点使用移动端数量、泛光分辨率再减半
- [ ] **Step 5:** 验证：截图中树与星有明显光晕溢出，极光在树后但更暗；无 WebGL 警告
- [ ] **Step 6:** Commit `feat: add aurora, 3D snow and custom bloom`

### Task 5: 点击雪花反馈、光波与提示

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `createTree().triggerRipple`、`createOrnaments().pulse`、`createStar().flash`、`isTap`、`createBurst()`
- Produces: `createBurst(scene) -> { spawn(origin: Vector3), update(dt) }`；`showHint()`

- [ ] **Step 1:** canvas 现画六芒雪花贴图（`CanvasTexture`，白色描边 + 柔光），`createBurst` 预建 72 个 `THREE.Sprite`（48 雪花 + 24 光点），加法混合；`spawn` 时从池中取、随机方向速度（雪花 2–5，光点 5–9）、随机自旋、随机寿命 1.2–1.8s；`update` 应用阻力、轻微重力、淡出，结束后归还池
- [ ] **Step 2:** 绑定 `pointerdown/up`：用起点终点与时长调用 `isTap`；冷却 150ms；命中则在点击位置（射线与树体包络圆锥相交）触发 `triggerRipple` 与挂饰 `pulse`，任意位置都触发 `spawn` 与星 `flash`
- [ ] **Step 3:** 拖动时调用 `snow.setStir` 与 `orbit.consumeDragDelta`，拖动期间不触发爆发
- [ ] **Step 4:** 桌面精细指针：一个 CSS 径向渐变光晕 div 跟随指针（`pointer: fine` 才显示），靠近挂饰时亮度提高；触摸设备隐藏
- [ ] **Step 5:** `showHint()`：静置 3s 底部淡入 `拖动旋转 · 点击飘雪`，5s 后淡出；`localStorage['bct_hint_seen']` 存在则跳过
- [ ] **Step 6:** 验证：`?demo=click` 在 1.2s 后以屏幕中心触发一次点击；headless 在 1.8s 截图，Read 确认可见雪花与光点；Node 断言 `isTap`；确认拖动 20px 不触发
- [ ] **Step 7:** Commit `feat: add snow burst, ripple and pointer feedback`

### Task 6: 排版、响应式与无障碍

**Files:**
- Modify: `index.html`

- [ ] **Step 1:** DOM 叠层：`MERRY CHRISTMAS`（`font-weight:300`、`letter-spacing:0.42em`、`clamp(18px, 4.2vw, 40px)`、白色 0.92 透明），下方 `2026`（12px、0.35 透明）；载入 600ms 后淡入并轻微上移 6px
- [ ] **Step 2:** 竖屏手机与桌面两套间距；`min-height:100dvh` + `visualViewport` resize 时重设 renderer 尺寸；横屏时文字上移避免与树底重叠
- [ ] **Step 3:** `prefers-reduced-motion`：不启动自转、极光漂移与雪的下落（静态显示），点击反馈保留；canvas 加 `role="img"` 与 `aria-label="蓝色粒子圣诞树，可拖动旋转"`
- [ ] **Step 4:** 验证：390×844 与 1440×900 截图文字不压树、不溢出；`--force-device-scale-factor=2` 截图清晰；`--force-prefers-reduced-motion` 截图正常
- [ ] **Step 5:** Commit `feat: add typography, responsive layout and a11y`

### Task 7: README、部署与线上验证

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** README 写：项目名、在线链接、手机/电脑打开说明、本地打开方式、可改的文案位置（标注行号）
- [ ] **Step 2:** 逐任务检查 `git status` 干净；`git log --oneline` 至少 6 次提交
- [ ] **Step 3:** **先向用户确认后再推送**：创建公开仓库 `gh repo create jxxxxxx0122/blue-christmas-tree --public --source=. --remote=origin --push`
- [ ] **Step 4:** 开 Pages：`gh api -X POST repos/jxxxxxx0122/blue-christmas-tree/pages -f 'source[branch]=main' -f 'source[path]=/'`；轮询 `gh api repos/.../pages` 直到 `status=built`
- [ ] **Step 5:** 验证线上：`curl -I https://jxxxxxx0122.github.io/blue-christmas-tree/` 返回 200；headless 打开线上地址截图确认与本地一致；`curl -I` 确认 three.min.js 200
- [ ] **Step 6:** Commit & push README 更新（同样先确认）
