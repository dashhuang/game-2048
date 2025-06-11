# 2048 游戏中的 iOS 26「液态玻璃」动效落地指南

> 面向完全没看过 WWDC／iOS 26 发布会的前端 / Canvas / WebGL 工程师

---

## 1. 背景与效果概念

### 1.1 什么是「液态玻璃」？

- **视觉特征**：
  1. 有**半透明毛玻璃**的虚化与高饱和度；
  2. **边缘呈流体形变**，好像表面有轻微的水波；
  3. **随时间或交互**（指针 / 内容更新）产生柔和、自然的「晃动」。
- **Apple 的定位**：在 iOS 26 / macOS 16 的小组件、Dock 背景里，用来让半透明面板更“活”。

### 1.2 技术原理（网页侧复刻）

- 基于 **SVG Filter**
  - `feTurbulence` → 生成柏林噪声 (Perlin noise) 纹理；
  - `feDisplacementMap` → 用噪声位移图阻挠元素像素，形成“液化”边缘；
- 再叠加 ``** + **`` 实现毛玻璃；
- 通过 **CSS 动画** 或 **JavaScript** 动态修改 `baseFrequency` / `scale` 等属性，实现持续流动。

> 代表性实现：GitHub 项目 ``，纯 HTML + CSS + SVG，无依赖，代码 < 2 KB。([github.com](https://github.com/lucasromerodb/liquid-glass-effect-macos?utm_source=chatgpt.com))

---

## 2. lucasromerodb 版本源码拆解

### 2.1 HTML 结构（精简）

```html
<!-- index.html -->
<svg width="0" height="0" style="position:absolute">
  <filter id="liquid">
    <feTurbulence id="noise" type="fractalNoise"
                  baseFrequency="0.015" numOctaves="3" seed="2"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="18" />
  </filter>
</svg>

<button class="glass">Play</button>
```

### 2.2 关键 CSS

```css
:root {
  /* 通过 CSS 变量方便 JS/动画实时调整 */
  --liq-freq: 0.015;
  --liq-scale: 18;
}

@keyframes liquid {
  0%   { --liq-freq: 0.012; }
  50%  { --liq-freq: 0.022; }
  100% { --liq-freq: 0.012; }
}

svg   feTurbulence { base-frequency: var(--liq-freq); }
svg   feDisplacementMap { scale: var(--liq-scale); }

.glass {
  backdrop-filter: blur(24px) saturate(140%);
  filter: url(#liquid);
  mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, #000 60%, transparent 100%);
  animation: liquid 8s linear infinite;
  /* 其余按钮样式略… */
}
```

*要点*

1. **SVG 定义一次，页面任意元素用 **``** 复用**；
2. 用 `mask-image` 或 `clip-path` 让外轮廓圆润、边缘更像真实液体；
3. CSS 动画周期 6–10 s 较自然（Apple 官方示例也是慢速）。

### 2.3 交互增强（可选）

```js
// pointer ripple
const el = document.querySelector('.glass');
window.addEventListener('pointermove', e => {
  const rect = el.getBoundingClientRect();
  const inside = e.clientX > rect.left && e.clientX < rect.right &&
                 e.clientY > rect.top  && e.clientY < rect.bottom;
  document.documentElement.style.setProperty('--liq-scale', inside ? 28 : 18);
});
```

---

## 3. 在 2048 游戏中的落地方案

> 假设你的 2048 是纯前端（HTML + CSS + Vanilla JS 或 React/Vue），以下两种集成粒度可选。

### 3.1 **方案 A：整块棋盘液态玻璃**

1. **棋盘容器 **`` 加 `filter: url(#liquid)`；
2. 继续保持每个格子传统着色（不同数字不同颜色），但外层玻璃容器会随着位移流动；
3. **合并触发波动**：在 `mergeTiles()` 后短暂提升 `--liq-scale` ，制造“涟漪”。

**优点**：代码改动小；性能开销固定一层；效果明显。

### 3.2 **方案 B：每个方块都是液态玻璃**

1. 在 `Tile` 组件上添加 `.glass-tile` 类；
2. 使用 `clip-path: inset(0 round 12px)` 保证圆角；
3. 随 tile 数值变化更换文字/阴影，但 **同用** 一个 `url(#liquid)` 过滤器；
4. 合并动画 = CSS scale + displacement `scale` 动态叠加，示例：

```js
function burst(tileEl){
  tileEl.animate({ transform: ['scale(1)', 'scale(1.1)', 'scale(1)'] },
                 { duration: 160, easing:'ease-out' });
  document.documentElement.style.setProperty('--liq-scale', 32);
  setTimeout(()=>document.documentElement.style.setProperty('--liq-scale', 18), 200);
}
```

**注意**：WebGL/GPU 复合层可能暴增；移动端需测试帧率。

---

## 4. 性能与兼容性

| 浏览器          | `backdrop-filter`                         | SVG `feTurbulence`/`Displacement` | 备注          |
| ------------ | ----------------------------------------- | --------------------------------- | ----------- |
| Safari 15+   | ✅                                         | ✅                                 | 原生效果最佳      |
| Chrome 76+   | ✅                                         | ✅                                 | Blink 内核 OK |
| Edge 79+     | ✅                                         | ✅                                 | 同 Chrome    |
| Firefox 126+ | ⚠️ 需 `layout.css.backdrop-filter.enabled` | ✅                                 | 降级到静态玻璃     |

- **降级策略**：检测 `CSS.supports('backdrop-filter','blur(4px)')`；不支持时移除 `filter` 类，仅留普通颜色。
- **节能策略**：若 `prefers-reduced-motion`，暂停动画 (`animation-play-state: paused`)。

---

## 5. 步骤 Checklist（交给工程师）

1. **复制** `index.html` 内 `<svg><filter id="liquid">…` 块到项目根。
2. **在主 **`` 添加上文 `:root` 变量、`.glass` 样式与 `@keyframes liquid`。
3. **根据方案 A/B**：
   - 给 `.board` 或 `.tile` 添加 `class="glass"`/`.glass-tile`；
   - 更新现有布局的 `position` / `overflow`，确保滤镜可见。
4. **在 JS 逻辑** 中：
   - 当 Tile 合并 / 新 Tile 插入时调用 `burst()` 或自定义函数修改 `--liq-scale`。
   - 监听 `pointermove` 可选增强。
5. **兼容性**：构建时注入下列 Polyfill 检测脚本，自动降级。
6. **QA**：在以下场景测试 FPS：
   - Chrome Mobile (Pixel 8) 高负载；
   - Safari iOS 17；
   - 桌面 Firefox（未启用 backdrop-filter）。

---

## 6. 进阶提升

- **WebGL Shader 重写**：若想完全摆脱 SVG，Three.js 的 `water` shader 可改造；性能更好。
- **动态光斑 (Specular Highlights)**：在 `::before` 伪元素上放径向渐变，随 pointer 位置移动，营造折射闪光。
- **Tailwind CSS 封装**：抽一条 `@apply` 规则：

```css
@layer components {
  .liquid-glass { @apply backdrop-blur-2xl saturate-150 relative overflow-hidden; }
}
```

通过 `liquid-glass` + `filter-[url(#liquid)]` 一键套用。

---

## 7. 参考资料

- lucasromerodb/liquid-glass-effect-macos 源代码与演示 (WWDC 2025) ([github.com](https://github.com/lucasromerodb/liquid-glass-effect-macos?utm_source=chatgpt.com))
- Codrops：SVG `<feTurbulence>` 详解 ([tympanus.net](https://tympanus.net/codrops/2019/02/19/svg-filter-effects-creating-texture-with-feturbulence/?utm_source=chatgpt.com))
- CSS‑Tricks：使用 `feDisplacementMap` 制作玻璃形变 ([css-tricks.com](https://css-tricks.com/making-a-realistic-glass-effect-with-svg/?utm_source=chatgpt.com))

---

**完成！** 按上述步骤集成后，即可在 2048 游戏界面获得与 iOS 26 类似的液态玻璃视觉动效，并保持良好的性能与兼容性。

