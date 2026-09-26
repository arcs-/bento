# Reduced motion reduces, never removes

Under `prefers-reduced-motion` the size change is instant and the content cross-fades: collapsing fades it out, then the size jumps; expanding jumps, then fades it in. Dragging is untouched: content follows the pointer, which is direct manipulation, not animation.

## Why
The transition shows what happened, and a fade still shows it without movement. Apple answers exactly this case: with Reduce Motion and Prefer Cross-Fade Transitions on, lateral slides become dissolves, the change stays visible, the motion goes. WCAG 2.3.3 treats changes in size and position as motion and opacity as not; motion counts as essential only when no conforming alternative exists, and a fade is one. A panel sliding open moves both itself and its neighbours sideways, so it is the motion to replace.

## Sources
- [WWDC 2019, Visual Design and Accessibility: Reduce Motion, Prefer Cross-Fade Transitions](https://developer.apple.com/videos/play/wwdc2019/244)
- [Apple HIG, Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- [WCAG 2.3.3, Animation from Interactions](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html)
