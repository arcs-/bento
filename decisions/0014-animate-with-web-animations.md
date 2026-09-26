# Toggles animate with Web Animations

Toggling and snapping animate each changed panel's `flex` with `Element.animate()`, from the layout before to the layout after. The final rules are written first, so nothing is committed to `style`. The duration and easing are the panel's own `transition-duration` and `transition-timing-function`, read at toggle start, so `duration-300 ease-out` on a panel restyles them. The panel's default `transition-property` stays `none`.

During the animation, every panel whose size changes has its content frozen at the larger of its start and end sizes. The content is anchored at the edge that does not move, and that includes the flexible neighbour, so no content reflows per frame. Toggling the same panel back mid-way reverses the animation; any other interruption finishes it first.

## Why
A CSS transition on `flex-basis` also fires on every drag write, so it would need switching on and off around each toggle, with `transitionend` bookkeeping. An app's `flex` class would override it mid-way. An animation outranks every normal rule, needs no switching, and ends exactly where the pure layout says. The `flex` shorthand is animated, not only `flex-basis`, because the prototype showed an app's `flex-grow` leaking in otherwise. `reverse()` makes a toggle interrupted by its opposite exact.

## Sources
- [MDN: Element.animate()](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)
- [MDN: Animation.reverse()](https://developer.mozilla.org/en-US/docs/Web/API/Animation/reverse)
- [CSS Cascade: animation origin](https://drafts.csswg.org/css-cascade-5/#cascade-origin)
