/**
 * Switches the demo's device frame between a phone and a desktop width. Only the frame's width
 * changes; the page inside is the same, and its panel's `modal` media query does the rest.
 */
export function wireDeviceSwitch(switcher: Element, frame: HTMLElement): void {
  const buttons = [...switcher.querySelectorAll<HTMLButtonElement>("[data-device]")];
  for (const button of buttons) {
    button.addEventListener("click", () => {
      frame.dataset.deviceFrame = button.dataset.device;
      for (const other of buttons) other.ariaPressed = String(other === button);
    });
  }
}
