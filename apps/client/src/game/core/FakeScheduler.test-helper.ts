import type { FrameScheduler } from './FixedStepLoop';

export class FakeScheduler implements FrameScheduler {
  readonly pending = new Map<number, (time: number) => void>();
  private nextHandle = 0;

  request(callback: (time: number) => void): number {
    const handle = ++this.nextHandle;
    this.pending.set(handle, callback);
    return handle;
  }

  cancel(handle: number): void {
    this.pending.delete(handle);
  }

  advance(time: number): void {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    for (const callback of callbacks) callback(time);
  }
}
