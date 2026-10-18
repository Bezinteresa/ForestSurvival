import type { SessionCommand, SessionSnapshot } from '@forest-survival/shared';
import { LocalSession } from '../session/LocalSession';
import { SceneView } from '../world/SceneView';
import { FixedStepLoop, browserScheduler, type FrameScheduler } from './FixedStepLoop';
import type { GameView } from './GameView';

export class Game {
  private readonly loop: FixedStepLoop;
  private destroyed = false;
  private debugEnabled = false;
  private readonly cleanups: Array<() => void> = [];

  static async create(host: HTMLElement, onSnapshot: (snapshot: SessionSnapshot) => void, onError: (error: unknown) => void, signal: AbortSignal): Promise<Game> {
    const session = await LocalSession.create();
    if (signal.aborted) {
      session.destroy();
      throw new DOMException('Запуск отменён', 'AbortError');
    }
    let game: Game | undefined;
    let view: SceneView | undefined;
    try {
      view = SceneView.create(host, onError);
      game = new Game(session, view, browserScheduler, onError);
      game.cleanups.push(session.subscribe(onSnapshot));
      const pause = () => game?.pause();
      const visibility = () => { if (document.hidden) pause(); };
      window.addEventListener('blur', pause);
      document.addEventListener('visibilitychange', visibility);
      game.cleanups.push(() => window.removeEventListener('blur', pause), () => document.removeEventListener('visibilitychange', visibility));
      return game;
    } catch (error) {
      if (game) game.destroy();
      else { view?.destroy(); session.destroy(); }
      throw error;
    }
  }

  constructor(private readonly session: LocalSession, private readonly view: GameView, scheduler: FrameScheduler = browserScheduler, onError: (error: unknown) => void = () => {}) {
    this.loop = new FixedStepLoop(
      (dt) => session.step(dt),
      (alpha) => this.render(alpha),
      (error) => { session.pause(); onError(error); },
      scheduler,
    );
  }

  start(): void {
    if (this.destroyed) return;
    this.session.start();
    this.loop.start();
  }

  pause(): void {
    if (this.destroyed) return;
    this.loop.stop();
    this.session.pause();
    this.render(1);
  }

  setDebug(enabled: boolean): void {
    if (this.destroyed) return;
    this.debugEnabled = enabled;
    this.render(1);
  }

  sendCommand(command: SessionCommand): void {
    if (this.destroyed) return;
    this.session.sendCommand(command);
    this.render(1);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loop.stop();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.session.destroy();
    this.view.destroy();
  }

  private render(alpha: number): void {
    this.view.render({
      playerPosition: this.session.getRenderPosition(alpha),
      debugGeometry: this.debugEnabled ? this.session.getDebugGeometry() : undefined,
    });
  }
}
