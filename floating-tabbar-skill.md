# Floating Glow TabBar Skill

A Vue 3 component skill for creating an iOS-style floating bottom tab bar with an interactive 4500K warm-white glow orb that follows touch with smooth delayed tracking and a breathing shrink-out animation.

## Quick Start

```bash
npx skills add floating-glow-tabbar
```

## What It Produces

- **Floating pill-shaped tab bar** — rounded corners, detached from screen edges, backdrop-blur glass effect
- **Touch-following glow orb** — 200px warm-white radial glow that tracks finger with 0.38s exponential ease
- **Breathing shrink-out** — orb pulses slightly then shrinks to nothing when finger lifts (not an abrupt cut)
- **Constrained to bar bounds** — overflow-hidden clips the orb; Y clamped to bar height, X follows freely
- **Drag-to-switch tabs** — press and slide across tabs, release to navigate
- **Bezier indicator** — active tab underline animates with spring-like cubic-bezier
- **Dark mode** — adapts glass opacity and text colors via provide/inject
- **Effects tier** — three levels (low/medium/high) control blur strength and opacity

## Component Architecture

```
┌─────────────────────────────────────────┐
│  fixed container (px-3, safe-bottom)    │
│  ┌─────────────────────────────────┐    │
│  │  rounded-[28px] overflow-hidden │    │  ← clips orb
│  │  ┌─ z-25: glow orb layer ────┐ │    │
│  │  │  absolute, 200px, radial  │ │    │  ← lerp-tracked
│  │  │  gradient, plus-lighter   │ │    │
│  │  └───────────────────────────┘ │    │
│  │  ┌─ z-30: pointer capture ───┐ │    │  ← transparent touch layer
│  │  │  absolute, inset-0        │ │    │
│  │  └───────────────────────────┘ │    │
│  │  ┌─ z-10: nav (tabs) ───────┐ │    │
│  │  │  flex, items-center       │ │    │
│  │  └───────────────────────────┘ │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

**Why a transparent pointer-capture layer (z-30)?** `<router-link>` elements intercept pointer events. Placing an invisible `touch-none` div on top with `pointerdown/move/up` handlers, and setting `pointer-events-none` on tab children, gives us raw unfiltered touch coordinates across the entire bar.

## Core Patterns

### 1. Glow Orb with Exponential Ease (Lerp Tracking)

```js
// Reactive state
const orb = reactive({ visible: false, fading: false, renderX: 0, renderY: 0, targetX: 0, targetY: 0 })

// ~0.38s delay: render position chases target with 10% catch-up per frame
const LERP = 0.10
function startLoop() {
  if (animFrame) return
  function tick() {
    orb.renderX += (orb.targetX - orb.renderX) * LERP
    orb.renderY += (orb.targetY - orb.renderY) * LERP
    animFrame = requestAnimationFrame(tick)
  }
  animFrame = requestAnimationFrame(tick)
}
```

**Why lerp instead of CSS transition?** CSS `transition` on `left`/`top` triggers layout. `requestAnimationFrame` + inline style mutation stays on the compositor thread. The exponential ease (`LERP = 0.10`) creates a natural trailing feel — the orb speeds up when the finger moves fast and slows as it approaches.

### 2. Pointer Clamp to Bar Bounds

```js
function clampToBar(pos) {
  const el = navRef.value.querySelector('.rounded-[28px]')
  const r = el ? el.getBoundingClientRect() : navRef.value.getBoundingClientRect()
  return {
    x: Math.max(0, Math.min(pos.x, r.width)),
    y: Math.max(0, Math.min(pos.y, r.height)),
  }
}
```

Client coordinates are converted to bar-relative, then clamped. X tracks freely within bar width; Y is locked to [0, barHeight]. When the finger drags up into the page, the orb stays at the top edge.

### 3. Breathing Shrink-Out Animation

```css
.glow-shrink {
  animation: orb-breathe-out .75s cubic-bezier(.4,0,.2,1) forwards;
}
@keyframes orb-breathe-out {
  0%   { transform: translate(-50%,-50%) scale(1);    opacity: 1;   filter: blur(8px)  brightness(1); }
  25%  { transform: translate(-50%,-50%) scale(1.12); opacity: .85; filter: blur(10px) brightness(1.15); }
  100% { transform: translate(-50%,-50%) scale(.08);  opacity: 0;   filter: blur(18px) brightness(1.6); }
}
```

0%–25%: orb inhales (slightly larger, slightly brighter). 25%–100%: exhales to nothing (shrinks, blurs wider, fades). `forwards` keeps the end state. Triggered by adding the `.glow-shrink` class on `pointerup`.

### 4. 4500K Warm-White Radial Gradient

```css
background: radial-gradient(circle at center,
  rgba(255,255,255,1)     0%,
  rgba(255,253,250,0.9)   5%,
  rgba(255,251,245,0.6)  12%,
  rgba(255,249,240,0.3)  25%,
  rgba(255,247,235,0.1)  45%,
  transparent             65%
);
```

Center is pure white. Fades through very-slightly-warm tones (4500K = neutral daylight with a whisper of warmth). `mix-blend-mode: plus-lighter` makes it glow over any background. `blur(8px)` softens edges.

### 5. Floating Pill with Glass Effect

```html
<!-- Fixed outer wrapper with safe-area -->
<div class="fixed bottom-0 left-0 right-0 z-50 px-3 select-none"
     style="padding-bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px))">
  <!-- Pill: rounded-28px, overflow-hidden clips the orb -->
  <div class="relative rounded-[28px] overflow-hidden shadow-xl shadow-black/5"
       :class="glassClass">
    ...
  </div>
</div>
```

Glass class is computed from effects tier:

```js
const glassClass = computed(() => {
  if (isDark) return 'bg-gray-900/20 backdrop-blur-xl'
  switch (level) {
    case 'low':    return 'bg-white'
    case 'medium': return 'bg-white/20 backdrop-blur-xl'   // 20% opacity, 24px blur
    case 'high':   return 'bg-white/20 backdrop-blur-2xl'  // 20% opacity, 40px blur
    default:       return 'bg-white/20 backdrop-blur-xl'
  }
})
```

**Blur units**: Tailwind `backdrop-blur-sm` = 4px, `md` = 12px, `lg` = 16px, `xl` = 24px, `2xl` = 40px.

### 6. Drag-to-Switch with Bezier Indicator

```js
// During drag: indicator follows finger as percentage
dragX.value = (pos.x / barWidth) * 100

// After release: navigate to tab under finger
const idx = getTabIdxAtX(pos.x)
if (visibleTabs[idx].path !== route.path) router.push(visibleTabs[idx].path)

// Static indicator: spring-like cubic-bezier snap on route change
style="transition: left 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)"
```

`cubic-bezier(0.34, 1.56, 0.64, 1)` overshoots and settles — the indicator bounces like a spring.

## Customization Parameters

| Parameter | Default | Description |
|---|---|---|
| `ORB_SIZE` | `200px` | Glow orb diameter |
| `ORB_COLOR_CENTER` | `rgba(255,255,255,1)` | Center color (4500K white) |
| `LERP_SPEED` | `0.10` | Tracking smoothness (lower = more lag, 0.10 ≈ 380ms) |
| `BLUR_RADIUS` | `8px` | Orb edge softness |
| `SHRINK_DURATION` | `0.75s` | Breathing-out animation length |
| `PILL_RADIUS` | `28px` | Floating bar corner radius |
| `GLASS_OPACITY` | `0.20` | bg-white opacity (0 = transparent, 1 = solid) |
| `BACKDROP_BLUR` | `24px` | Glass blur strength (`backdrop-blur-xl`) |

## Dependencies

- Vue 3 (Composition API + `<script setup>`)
- Tailwind CSS v4 (for `backdrop-blur`, `rounded-[28px]`, dark mode `dark:` variants)
- No additional npm packages

## Integration Pattern

```vue
<!-- Parent: provide effects level and color mode -->
<script setup>
import { provide } from 'vue'
provide('effectsLevel', ref('medium'))  // 'low' | 'medium' | 'high'
provide('colorMode', ref('light'))      // 'light' | 'dark'
</script>
<template>
  <BottomTabBar />
</template>
```

The tab bar reads `localStorage.getItem('user_role')` to filter visible tabs. Override the `allTabs` array for different tab configurations.

## Common Pitfalls

1. **Orb not showing**: Check z-index — the orb layer (z-25) must be above the nav background (z-10) but below the pointer capture layer (z-30). Also check that `overflow: hidden` on the pill container doesn't clip the orb's containing element (use `overflow: visible` on the orb's direct parent, and `overflow: hidden` on the pill).

2. **Orb lag too much / too little**: Adjust `LERP_SPEED`. At 60fps, `0.10` means 10% of remaining distance per frame — reaches ~63% of target in 10 frames (~167ms), ~95% in 30 frames (~500ms).

3. **Orb visible outside bar**: Ensure the pill container has `overflow-hidden` and the orb coordinates are clamped via `clampToBar()`.

4. **Glass effect not working on mobile**: `backdrop-filter` requires a semi-transparent background. If `bg-white` (solid) is used, blur has nothing to show through. Use `bg-white/20` minimum.

5. **Poor performance**: Set `will-change: left, top` on the orb. Avoid triggering layout (don't use `getBoundingClientRect` inside the animation loop — cache it or use it only in event handlers).

## Complete Component

See [FloatingGlowTabBar.vue](./FloatingGlowTabBar.vue) for the full production-ready component with all features described above.
