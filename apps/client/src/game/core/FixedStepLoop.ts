import { SIMULATION_CONFIG } from '@forest-survival/shared';

export interface FrameScheduler {
  request(callback: (time: number) => void): number;
  cancel(handle: number): void;
}

export const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle),
};

export class FixedStepLoop {
  private running = false;
  private handle: number | undefined;
  private previousTime: number | undefined;
  private accumulator = 0;

  constructor(
    private readonly step: (dt: number) => void,
    private readonly render: (alpha: number) => void,
    private readonly onError: (error: unknown) => void,
    private readonly scheduler: FrameScheduler = browserScheduler,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.previousTime = undefined;
    this.accumulator = 0;
    this.schedule();
  }

  stop(): void {
    this.running = false;
    if (this.handle !== undefined) this.scheduler.cancel(this.handle);
    this.handle = undefined;
    this.previousTime = undefined;
    this.accumulator = 0;
  }

  private schedule(): void {
    this.handle = this.scheduler.request(this.frame);
  }

  private readonly frame = (time: number): void => {
    this.handle = undefined;
    if (!this.running) return;

    try {
      const elapsed = this.previousTime === undefined ? 0 : (time - this.previousTime) / 1000;
      this.previousTime = time;
      this.accumulator += Math.min(Math.max(elapsed, 0), SIMULATION_CONFIG.maxFrameDelta);
      let steps = 0;

      while (this.accumulator + 1e-10 >= SIMULATION_CONFIG.fixedStep && steps < SIMULATION_CONFIG.maxSubSteps && this.running) {
        this.step(SIMULATION_CONFIG.fixedStep);
        this.accumulator -= SIMULATION_CONFIG.fixedStep;
        steps++;
      }

      this.accumulator = Math.max(0, Math.min(this.accumulator, SIMULATION_CONFIG.fixedStep));
      if (!this.running) return;
      this.render(this.accumulator / SIMULATION_CONFIG.fixedStep);
      if (this.running) this.schedule();
    } catch (error) {
      this.stop();
      this.onError(error);
    }
  };
}
