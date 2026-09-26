/** What the elements share: custom states and properties set before upgrade. */

const customStatesWork = CSS.supports("selector(:state(collapsed))");

/**
 * Sets a custom state for app CSS, such as `:state(collapsed)`. Chrome before 125 throws on
 * names without dashes, so states exist only where the selector works.
 */
export function setState(internals: ElementInternals, name: string, on: boolean): void {
  if (!customStatesWork) return;
  if (on) internals.states.add(name);
  else internals.states.delete(name);
}

/**
 * Re-applies properties an app set before the element was defined, which would otherwise
 * shadow the accessors, as when React sets props on an element parsed before the script ran.
 */
export function upgradeProperties(element: HTMLElement, names: readonly string[]): void {
  for (const name of names) {
    if (!Object.hasOwn(element, name)) continue;
    const value: unknown = Reflect.get(element, name);
    Reflect.deleteProperty(element, name);
    Reflect.set(element, name, value);
  }
}
