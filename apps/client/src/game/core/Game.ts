import { InputState } from '../input/InputState';
import { BrowserInput, type ControlStatus } from '../input/BrowserInput';
import { DEFAULT_CONTROL_SETTINGS, sanitizeControlSettings, type ControlSettings } from '../input/ControlSettings';
import { CameraController } from '../player/CameraController';
import type { CommandResult, SessionCommand, SessionSnapshot } from '@forest-survival/shared';
import type { InputAction } from '../input/InputState';
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
  private commandNumber = 0;
  private inventoryOpen = false;
  private readonly cleanups: Array<() => void> = [];

  static async create(host: HTMLElement, onSnapshot: (snapshot: SessionSnapshot) => void, onError: (error: unknown) => void, signal: AbortSignal, controls?: { settings: ControlSettings; onStatus: (status: ControlStatus) => void; onInventoryChange?: (open: boolean) => void }): Promise<Game> {
    const session = await LocalSession.create({ debugTools: import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEBUG_TOOLS === 'true' });
    if (signal.aborted) {
      session.destroy();
      throw new DOMException('Запуск отменён', 'AbortError');
    }
    let game: Game | undefined;
    let view: SceneView | undefined;
    try {
      view = SceneView.create(host, onError);
      game = new Game(session, view, browserScheduler, onError, controls?.settings, controls?.onInventoryChange);
      game.browserInput = new BrowserInput(view.canvas, game.input, game.camera, () => game?.pause(), controls?.onStatus ?? (() => {}), undefined, () => game?.closeInventory() ?? false);
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

  constructor(private readonly session: LocalSession, private readonly view: GameView, scheduler: FrameScheduler = browserScheduler, onError: (error: unknown) => void = () => {}, settings: ControlSettings = DEFAULT_CONTROL_SETTINGS, private readonly onInventoryChange: (open: boolean) => void = () => {}) {
    this.settings = sanitizeControlSettings(settings);
    this.loop = new FixedStepLoop(
      (dt) => {
        this.camera.look(this.input.consumeLook(), this.settings);
        const frame = this.input.consumeFrame();
        const nextRequest = () => 'input-' + (++this.commandNumber);
        if (frame.pressed.has('Inventory')) this.toggleInventory();
        else if (frame.pressed.has('Interact') && session.getSnapshot().gameplay.interaction?.kind === 'storage') {
          if (session.sendCommand({ type: 'interact', requestId: nextRequest() }).accepted) this.toggleInventory();
        }
        const yaw = Math.atan2(Math.sin(this.camera.cameraYaw), -Math.cos(this.camera.cameraYaw));
        if (this.input.enabled) {
          for (let slot = 0; slot < 5; slot++) if (frame.pressed.has(('Hotbar' + (slot + 1)) as InputAction)) session.sendCommand({ type: 'select-slot', slot, requestId: nextRequest() });
          if (frame.pressed.has('Primary')) session.sendCommand({ type: 'use-item', yaw, requestId: nextRequest() });
          if (frame.pressed.has('Interact')) session.sendCommand({ type: 'interact', requestId: nextRequest() });
          if (frame.pressed.has('Drop')) session.sendCommand({ type: 'drop-item', slot: session.getSnapshot().gameplay.inventory.activeSlot, yaw, requestId: nextRequest() });
        }
        session.step(dt, { moveX: this.input.enabled ? frame.move.x : 0, moveY: this.input.enabled ? frame.move.y : 0, sprint: this.input.enabled && frame.sprint, jump: this.input.enabled && frame.pressed.has('Jump'), cameraYaw: this.camera.cameraYaw, faceCamera: this.camera.facesCamera });
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
    this.focusControls();
    this.browserInput?.requestCapture();
  }

  pause(): void {
    if (this.destroyed) return;
    this.loop.stop();
    this.closeInventory();
    this.input.setContext('ui');
    this.browserInput?.suspend();
    this.session.pause();
    this.render(1);
  }

  setSettings(settings: ControlSettings): void { this.settings = sanitizeControlSettings(settings); }

  focusControls(): void { if (!this.destroyed) this.browserInput?.focusCanvas(); }

  toggleInventory(): void {
    if (this.destroyed || this.session.getSnapshot().status !== 'running') return;
    if (this.closeInventory()) return;
    this.inventoryOpen = true;
    this.input.setContext('ui');
    this.browserInput?.suspend();
    this.onInventoryChange(true);
  }

  closeInventory(): boolean {
    if (!this.inventoryOpen) return false;
    this.inventoryOpen = false;
    this.input.setContext('gameplay');
    this.onInventoryChange(false);
    return true;
  }

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

  sendCommand(command: SessionCommand): CommandResult {
    if (this.destroyed) return { accepted: false, reason: 'invalid' };
    const result = this.session.sendCommand(command);
    this.render(1);
    return result;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loop.stop();
    this.closeInventory();
    this.input.setContext('ui');
    this.browserInput?.destroy();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.session.destroy();
    this.view.destroy();
  }

  private render(alpha: number): void {
    this.camera.look(this.input.consumeLook(), this.settings);
    const snapshot = this.session.getSnapshot();
    this.view.render({
      gameplay: snapshot.gameplay,
      simulationTime: snapshot.simulationTime,
      playerPosition: this.session.getRenderPosition(alpha),
      playerYaw: this.session.getRenderYaw(alpha),
      camera: this.camera.getPose(),
      debugGeometry: this.debugEnabled ? this.session.getDebugGeometry() : undefined,
    });
  }
}
