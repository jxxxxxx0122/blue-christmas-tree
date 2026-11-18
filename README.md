# Blue Christmas Tree · 蓝色 3D 圣诞树

深蓝极光雪夜里的 3D 粒子圣诞树。拖动可以绕着树看，点击会炸开雪花与光波。

**在线访问**：https://jxxxxxx0122.github.io/blue-christmas-tree/
手机、平板、电脑用浏览器打开即可，不需要安装任何东西。

## 操作

- 拖动 / 单指滑动：绕树旋转，松手有惯性，静置 10 秒后自动缓慢旋转
- 点击 / 轻点：炸开雪花，点到树身还会有一道光波，树顶星同步闪亮
- 桌面鼠标靠近挂饰：挂饰微微亮起

## 本地查看

双击 `index.html` 即可。Three.js 已放在 `vendor/` 里，断网也能看。

## 改文案

打开 `index.html`，用编辑器搜索这些文字：

| 想改什么 | 搜索 |
| --- | --- |
| 标题 | `MERRY CHRISTMAS` |
| 年份 | `2026` |
| 底部操作提示 | `拖动旋转` |

## 技术说明

- 单页实现：`index.html` 内联 HTML / CSS / JS，无构建步骤
- Three.js r159 本地打包（MIT，许可见 `vendor/LICENSE-three.txt`），运行时不请求任何外网资源
- 自写半分辨率泛光合成、3D 飘雪、点击雪花对象池、轨道相机与惯性
- 适配手机竖屏 / 横屏 / 桌面，支持 `prefers-reduced-motion`，标签页隐藏时暂停渲染
