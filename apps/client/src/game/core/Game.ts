import { InputState } from '../input/InputState';
import { BrowserInput, type ControlStatus } from '../input/BrowserInput';
import { DEFAULT_CONTROL_SETTINGS, sanitizeControlSettings, type ControlSettings } from '../input/ControlSettings';
import { CameraController } from '../player/CameraController';
import type { SessionCommand, SessionSnapshot } from '@forest-survival/shared';
import { LocalSession } from '../session/LocalSession';
import { SceneView } from '../world/SceneView';
import { FixedStepLoop, browserScheduler, type FrameScheduler } from './FixedStepLoop';
import type { GameView } from './GameView';

export class Game {
  readonly input = new InputState();
  readonly camera = new CameraController();
  private settings: ControlSettings;
  private browserInput: BrowserInput | undefined;
  private readonly loop: FixedStepLoop;
  private destroyed = false;
  private debugEnabled = false;
  private readonly cleanups: Array<() => void> = [];

  static async create(host: HTMLElement, onSnapshot: (snapshot: SessionSnapshot) => void, onError: (error: unknown) => void, signal: AbortSignal, controls?: { settings: ControlSettings; onStatus: (status: ControlStatus) => void }): Promise<Game> {
    const session = await LocalSession.create();
    if (signal.aborted) {
      session.destroy();
      throw new DOMException('Запуск отменён', 'AbortError');
    }
    let game: Game | undefined;
    let view: SceneView | undefined;
    try {
      view = SceneView.create(host, onError);
      game = new Game(session, view, browserScheduler, onError, controls?.settings);
      game.browserInput = new BrowserInput(view.canvas, game.input, game.camera, () => game?.pause(), controls?.onStatus ?? (() => {}));
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

  constructor(private readonly session: LocalSession, private readonly view: GameView, scheduler: FrameScheduler = browserScheduler, onError: (error: unknown) => void = () => {}, settings: ControlSettings = DEFAULT_CONTROL_SETTINGS) {
    this.settings = sanitizeControlSettings(settings);
    this.loop = new FixedStepLoop(
      (dt) => {
        const frame = this.input.consumeFrame();
        session.step(dt, { moveX: frame.move.x, moveY: frame.move.y, sprint: frame.sprint, jump: frame.pressed.has('Jump'), cameraYaw: this.camera.cameraYaw, faceCamera: this.camera.facesCamera });
      },
      (alpha) => this.render(alpha),
      (error) => { this.input.setContext('ui'); this.browserInput?.suspend(); session.pause(); onError(error); },
      scheduler,
    );
  }

  start(): void {
    if (this.destroyed) return;
    if (this.session.getSnapshot().status !== 'running') this.input.setContext('gameplay');
    this.session.start();
    this.loop.start();
    this.browserInput?.requestCapture();
  }

  pause(): void {
    if (this.destroyed) return;
    this.loop.stop();
    this.input.setContext('ui');
    this.browserInput?.suspend();
    this.session.pause();
    this.render(1);
  }

  setSettings(settings: ControlSettings): void { this.settings = sanitizeControlSettings(settings); }

  toggleCameraLock(capture = true): void {
    if (this.destroyed || !this.input.enabled) return;
    if (this.browserInput) this.browserInput.toggleLock(capture);
    else this.camera.toggleLock();
  }

  zoom(steps: number): void {
    if (this.destroyed || !this.input.enabled) return;
    if (this.browserInput) this.browserInput.zoom(steps);
    else this.camera.zoom(steps);
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
    this.input.setContext('ui');
    this.browserInput?.destroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.session.destroy();
    this.view.destroy();
  }

  private render(alpha: number): void {
    this.camera.look(this.input.consumeLook(), this.settings);
    this.view.render({
      playerPosition: this.session.getRenderPosition(alpha),
      playerYaw: this.session.getRenderYaw(alpha),
      camera: this.camera.getPose(),
      debugGeometry: this.debugEnabled ? this.session.getDebugGeometry() : undefined,
    });
  }
}
