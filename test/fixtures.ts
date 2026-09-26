import { commands, page, userEvent } from "vitest/browser";
import type { BentoToggleEvent } from "../src/bento.ts";

/** Test helpers. They only use what any page can: markup, properties, input and geometry. */

const renderedContainers = new Set<HTMLElement>();

/** Parses markup into a detached container, so nothing is upgraded before `mount`. */
export function parse(markup: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = markup;
  return container;
}

/** Connects a parsed container; the elements upgrade now, with their attributes already set. */
export function mount(container: HTMLElement): HTMLElement {
  document.body.append(container);
  renderedContainers.add(container);
  return container;
}

/** Renders markup and waits for the first frame, the moment of the first paint. */
export async function render(markup: string): Promise<HTMLElement> {
  const container = mount(parse(markup));
  await nextFrame();
  return container;
}

export function removeRendered(): void {
  for (const container of renderedContainers) container.remove();
  renderedContainers.clear();
}

export function byId<Tag extends keyof HTMLElementTagNameMap>(
  tag: Tag,
  id: string,
): HTMLElementTagNameMap[Tag] {
  const found = document.getElementById(id);
  if (found?.localName !== tag) throw new Error(`no <${tag} id="${id}"> rendered`);
  return found as HTMLElementTagNameMap[Tag];
}

/** Every test group has an explicit size, so layout never depends on the viewport. */
export const groupSize = { width: 1000, height: 300 } as const;

/** A group `#layout` of `groupSize` around the given children. */
export function layout(children: string, groupAttributes = ""): string {
  const sizeStyle = `width: ${groupSize.width}px; height: ${groupSize.height}px; background: white`;
  return `<bento-group id="layout" style="${sizeStyle}" ${groupAttributes}>${children}</bento-group>`;
}

/** The sidebar shape: `#sidebar` with the given attributes, separator `#handle`, flexible `#main`. */
export function sidebarLayout(sidebarAttributes = "", groupAttributes = ""): string {
  return layout(
    `<bento-panel id="sidebar" ${sidebarAttributes}>
      <div id="sidebar-content" style="height: 100px; background: rgb(0, 0, 255)"></div>
    </bento-panel>
    <bento-separator id="handle" aria-label="Sidebar"></bento-separator>
    <bento-panel id="main"><div id="main-content" style="height: 100px"></div></bento-panel>`,
    groupAttributes,
  );
}

export const group = (id: string) => byId("bento-group", id);
export const panel = (id: string) => byId("bento-panel", id);
export const separator = (id: string) => byId("bento-separator", id);
export const block = (id: string) => byId("div", id);

export const width = (target: Element) => target.getBoundingClientRect().width;
export const height = (target: Element) => target.getBoundingClientRect().height;

/** Parses a live `size` such as `"350px"` into pixels, or fails for anything but px. */
export function pixels(size: string): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(size);
  if (!match?.[1]) throw new Error(`expected a px size, got "${size}"`);
  return Number(match[1]);
}

/** Subpixel layout differs between engines; a size within a pixel counts as reached. */
const pixelTolerance = 1;

export function isAt(value: number, target: number): boolean {
  return Math.abs(value - target) < pixelTolerance;
}

/** Strictly between two sizes, by more than rounding noise. */
export function isBetween(value: number, start: number, end: number): boolean {
  return (
    value > Math.min(start, end) + pixelTolerance && value < Math.max(start, end) - pixelTolerance
  );
}

export function nextFrame(): Promise<DOMHighResTimeStamp> {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

/**
 * Waits for frames. Two by default: bento writes at most once per frame and a
 * `ResizeObserver` reports after the frame's callbacks, so two frames see every write.
 */
export async function frames(count = 2): Promise<void> {
  for (let frame = 0; frame < count; frame += 1) await nextFrame();
}

/** Measures once per frame for a number of frames. */
export async function sampleFrames(measure: () => number, count = 5): Promise<number[]> {
  const samples: number[] = [];
  for (let frame = 0; frame < count; frame += 1) {
    await nextFrame();
    samples.push(measure());
  }
  return samples;
}

const settleTimeoutMs = 3000;
const settledFrameCount = 3;

/** Measures once per frame until the value has stayed at `end` for a few frames. */
export async function sampleUntilAt(measure: () => number, end: number): Promise<number[]> {
  const samples: number[] = [];
  const deadline = performance.now() + settleTimeoutMs;
  let framesAtEnd = 0;
  while (framesAtEnd < settledFrameCount) {
    if (performance.now() > deadline) {
      throw new Error(`never settled at ${end}; last samples ${samples.slice(-5).join(", ")}`);
    }
    await nextFrame();
    const sample = measure();
    samples.push(sample);
    framesAtEnd = isAt(sample, end) ? framesAtEnd + 1 : 0;
  }
  return samples;
}

/** Waits until an animated change has finished at `end`. */
export async function settleAt(measure: () => number, end: number): Promise<void> {
  await sampleUntilAt(measure, end);
}

const pointerSteps = 5;

/** Presses the primary pointer button on the center of `target`, or that far off it, as a user would. */
export async function press(target: Element, offsetX = 0, offsetY = 0): Promise<void> {
  await commands.pointerDown(page.elementLocator(target), offsetX, offsetY);
}

/** Moves the pressed pointer in several pointermove events, then lets bento lay out. */
export async function moveBy(deltaX: number, deltaY = 0): Promise<void> {
  await commands.pointerMove(deltaX, deltaY, pointerSteps);
  await frames();
}

export async function release(): Promise<void> {
  await commands.pointerUp();
  await frames();
}

export async function drag(target: Element, deltaX: number, deltaY = 0): Promise<void> {
  await press(target);
  await moveBy(deltaX, deltaY);
  await release();
}

export async function doubleClick(target: Element): Promise<void> {
  await commands.doubleClick(page.elementLocator(target));
  await frames();
}

/** A click through real pointer input, which never checks whether the target is covered. */
export async function clickThrough(target: Element): Promise<void> {
  await press(target);
  await release();
}

/** Focuses `target` and types `keys` in `userEvent.keyboard` syntax, such as `{Shift>}{ArrowRight}{/Shift}`. */
export async function pressKeys(target: HTMLElement, keys: string): Promise<void> {
  target.focus();
  await userEvent.keyboard(keys);
  await frames();
}

export interface Color {
  red: number;
  green: number;
  blue: number;
}

/** The color the page renders at a point in the viewport, read from a real screenshot. */
export async function colorAt(x: number, y: number): Promise<Color> {
  const base64 = await commands.screenshotPixel(Math.round(x), Math.round(y));
  const image = await createImageBitmap(
    await (await fetch(`data:image/png;base64,${base64}`)).blob(),
  );
  const canvas = new OffscreenCanvas(1, 1);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("no 2d canvas");
  context.drawImage(image, 0, 0);
  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;
  return { red, green, blue };
}

/** The color at the center of an element's box. */
export async function colorAtCenterOf(target: Element): Promise<Color> {
  const box = target.getBoundingClientRect();
  return colorAt(box.left + box.width / 2, box.top + box.height / 2);
}

const colorTolerance = 3;

export function isColor(color: Color, expected: Color): boolean {
  return (
    Math.abs(color.red - expected.red) <= colorTolerance &&
    Math.abs(color.green - expected.green) <= colorTolerance &&
    Math.abs(color.blue - expected.blue) <= colorTolerance
  );
}

/** Records events of the given types on a target, in the phase asked for. */
export function recordEvents(
  target: EventTarget,
  types: readonly string[],
  options: AddEventListenerOptions = {},
): Event[] {
  const recorded: Event[] = [];
  for (const type of types) target.addEventListener(type, (event) => recorded.push(event), options);
  return recorded;
}

export const panelEventTypes = ["resize", "resizeend", "beforetoggle", "toggle"] as const;

/** Toggle events as `type old→new`, marked when cancelable, for readable comparisons. */
export function toggleStates(events: Event[]): string[] {
  return events.map((event) => {
    const { type, oldState, newState, cancelable } = event as BentoToggleEvent;
    return `${type} ${oldState}→${newState}${cancelable ? " cancelable" : ""}`;
  });
}
