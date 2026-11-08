/** Runtime data is instance-scoped, externally supplied and absent from history. */
export class ObservationStore<T = unknown> {
  readonly #values = new Map<string, T>();
  readonly #listeners = new Map<string, Set<() => void>>();
  key(path: readonly string[], nodeId: string, instance = ""): string {
    return JSON.stringify([path, nodeId, instance]);
  }
  get(key: string): T | undefined {
    return this.#values.get(key);
  }
  set(key: string, value: T): void {
    if (Object.is(this.#values.get(key), value)) return;
    this.#values.set(key, value);
    for (const listener of this.#listeners.get(key) ?? []) listener();
  }
  subscribe(key: string, listener: () => void): () => void {
    const listeners = this.#listeners.get(key) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.#listeners.delete(key);
    };
  }
  clear(): void {
    const keys = [...this.#values.keys()];
    this.#values.clear();
    for (const key of keys)
      for (const listener of this.#listeners.get(key) ?? []) listener();
  }
}
