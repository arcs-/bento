import type { BentoPanelElement } from "../../src/bento.ts";
import { isModal } from "./panels.ts";

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The first entry of a computed time list, in milliseconds. */
function milliseconds(time: string): number {
  const first = time.split(",")[0]?.trim() ?? "0s";
  const amount = Number.parseFloat(first) || 0;
  return first.endsWith("ms") ? amount : amount * 1000;
}

/**
 * Resolves once a closing drawer has let go of the page. The sheet fades out over the panel's
 * `transition-duration` and keeps the page inert until then, and nothing announces the end; the
 * dialog handing focus back to the page does, with the fade's length as a fallback.
 */
function afterDrawerCloses(drawer: BentoPanelElement): Promise<void> {
  const fade = milliseconds(getComputedStyle(drawer).transitionDuration);
  return new Promise((resolve) => {
    const done = () => {
      document.removeEventListener("focusin", focusReturned);
      clearTimeout(fallback);
      requestAnimationFrame(() => resolve());
    };
    const focusReturned = (event: FocusEvent) => {
      if (event.target instanceof Node && !drawer.contains(event.target)) done();
    };
    document.addEventListener("focusin", focusReturned);
    const fallback = setTimeout(done, fade + 250);
  });
}

/**
 * The page's section links: a click scrolls smoothly to the section, or at once under reduced
 * motion, updates the hash and moves focus to the heading. In the drawer the drawer closes first.
 * The dot of the section in view is lit, found by an `IntersectionObserver` on the headings.
 */
export function wireSectionLinks(
  links: readonly HTMLAnchorElement[],
  scroller: HTMLElement,
  drawer: BentoPanelElement,
): void {
  const targets = new Map<Element, HTMLAnchorElement>();
  for (const link of links) {
    const heading = document.getElementById(decodeURIComponent(link.hash.slice(1)));
    if (!heading) continue;
    heading.tabIndex = -1;
    targets.set(heading, link);
    link.addEventListener("click", (event) => {
      event.preventDefault();
      if (!isModal(drawer) || drawer.collapsed) return goTo(heading, link);
      drawer.collapsed = true;
      void afterDrawerCloses(drawer).then(() => goTo(heading, link));
    });
  }

  const light = (current: HTMLAnchorElement) => {
    for (const link of links) {
      if (link === current) link.setAttribute("aria-current", "true");
      else link.removeAttribute("aria-current");
    }
  };

  const goTo = (heading: HTMLElement, link: HTMLAnchorElement) => {
    heading.scrollIntoView({ behavior: reducedMotion() ? "instant" : "smooth", block: "start" });
    heading.focus({ preventScroll: true });
    history.pushState(null, "", link.hash);
    light(link);
  };

  const inView = new Set<Element>();
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target);
        else inView.delete(entry.target);
      }
      const first = [...targets.keys()].find((heading) => inView.has(heading));
      const link = first ? targets.get(first) : undefined;
      if (link) light(link);
    },
    { root: scroller, rootMargin: "0px 0px -60% 0px" },
  );
  for (const heading of targets.keys()) observer.observe(heading);
  const hashTarget = location.hash ? document.getElementById(location.hash.slice(1)) : null;
  const initial = (hashTarget && targets.get(hashTarget)) ?? links[0];
  if (initial) light(initial);
}
