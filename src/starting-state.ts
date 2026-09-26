/** The two live values of a panel that have a starting state. */
export interface Start {
  /** As written, valid or not: `defaultSize` reads it back. `""` is no size. */
  readonly size: string;
  readonly collapsed: boolean;
}

export type StartKey = keyof Start;

/**
 * Where a panel starts: its `size` and `collapsed` attributes, or property writes before its
 * first layout, as React makes on the client. Each live value follows its start while clean,
 * like an `<input>`'s value follows `defaultValue` until someone types.
 */
export class StartingState {
  #start: Start = { size: "", collapsed: false };
  readonly #dirty = new Set<StartKey>();
  #laidOut = false;

  get size(): string {
    return this.#start.size;
  }

  get collapsed(): boolean {
    return this.#start.collapsed;
  }

  /** After its first layout, property writes are live writes. */
  laidOut(): void {
    this.#laidOut = true;
  }

  /** An attribute changed the start; returns whether the live value follows it. */
  attributeChanged<Key extends StartKey>(key: Key, value: Start[Key]): boolean {
    this.#start = { ...this.#start, [key]: value };
    return !this.#dirty.has(key);
  }

  /**
   * The app wrote the property: before the first layout that is the start, which the live
   * value follows; after it, the live value is the app's.
   */
  propertyWritten<Key extends StartKey>(key: Key, value: Start[Key]): void {
    if (this.#laidOut) this.#dirty.add(key);
    else this.#start = { ...this.#start, [key]: value };
  }

  /** The user dragged, keyed or toggled it. */
  changedByUser(key: StartKey): void {
    this.#dirty.add(key);
  }

  /** Double-click: the live value is back at the start and follows it again. */
  reset(key: StartKey): void {
    this.#dirty.delete(key);
  }
}
