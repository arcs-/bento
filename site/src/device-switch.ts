/**
 * Switches the demo's device frame between a phone and a desktop width. Only the frame's width
 * changes; the page inside is the same, and its panel's `modal` media query does the rest.
 */
export function wireDeviceSwitch(switcher: Element, fit: HTMLElement): void {
  const buttons = [...switcher.querySelectorAll<HTMLButtonElement>("[data-device]")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      fit.dataset.deviceFrame = button.dataset.device;
      for (const other of buttons) other.ariaPressed = String(other === button);
    });
  }
}

/**
 * Scales the frame down where its wrapper is narrower, so the frame keeps its real width and the
 * page inside sees that width. The wrapper already reserves the scaled size; the scale is a
 * transform, which changes no size either element is observed for.
 */
export function scaleDeviceToFit(fit: HTMLElement, frame: HTMLElement): void {
  const scale = () => {
    const ratio = Math.min(1, fit.clientWidth / frame.offsetWidth);
    frame.style.setProperty("--device-scale", String(ratio));
  };
  const sizeObserver = new ResizeObserver(scale);
  sizeObserver.observe(fit);
  sizeObserver.observe(frame);
}
