export type Subscriber<T> = (ev: T) => void | Promise<void>;

export class EventBus<T> {
  private readonly subs = new Set<Subscriber<T>>();
  private isClosed = false;

  subscribe(fn: Subscriber<T>): () => void {
    if (this.isClosed) return () => undefined;
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  emit(ev: T): void {
    if (this.isClosed) return;
    for (const fn of this.subs) {
      try {
        void fn(ev);
      } catch {
        // Subscriber errors must not stop the worker.
      }
    }
  }

  close(): void {
    this.isClosed = true;
    this.subs.clear();
  }

  get closed(): boolean {
    return this.isClosed;
  }

  get subscriberCount(): number {
    return this.subs.size;
  }
}
