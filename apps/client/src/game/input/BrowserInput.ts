import { InputState, type InputAction } from './InputState';
import { CameraController } from '../player/CameraController';

export interface ControlStatus {
  readonly cameraLocked: boolean;
  readonly firstPerson: boolean;
  readonly pointerLocked: boolean;
  readonly message: string;
}

export interface BrowserEnvironment {
  readonly window: Window;
  readonly document: Document;
}

const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const ACTION_KEYS: Readonly<Record<string, InputAction>> = {
  Space: 'Jump', ControlLeft: 'Sprint', ControlRight: 'Sprint',
  KeyE: 'Interact', Tab: 'Inventory', KeyG: 'Drop',
  Digit1: 'Hotbar1', Digit2: 'Hotbar2', Digit3: 'Hotbar3', Digit4: 'Hotbar4', Digit5: 'Hotbar5',
};

function isUiTarget(target: EventTarget | null): boolean {
  return !!(target as Element | null)?.closest?.('input, textarea, select, button, summary, a, [contenteditable], [data-ui]');
}

export class BrowserInput {
  private readonly keys = new Set<string>();
  private readonly cleanups: Array<() => void> = [];
  private orbiting = false;
  private mouseButtons = 0;
  private locked = false;
  private expectedRelease = false;
  private captureRejected = false;
  private destroyed = false;
  private message = '';

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly input: InputState,
    private readonly camera: CameraController,
    private readonly onPause: () => void,
    private readonly onStatus: (status: ControlStatus) => void,
    private readonly environment: BrowserEnvironment = { window, document },
    private readonly onInventoryKey: () => boolean = () => false,
  ) {
    canvas.tabIndex = 0;
    this.listen<KeyboardEvent>(environment.window, 'keydown', this.keyDown);
    this.listen<KeyboardEvent>(environment.window, 'keyup', this.keyUp);
    this.listen<FocusEvent>(environment.document, 'focusin', (event) => { if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]')) this.reset(); });
    this.listen<PointerEvent>(canvas, 'pointerdown', this.pointerDown);
    this.listen<PointerEvent>(environment.window, 'pointermove', this.pointerMove);
    this.listen<PointerEvent>(environment.window, 'pointerup', this.pointerUp);
    this.listen<PointerEvent>(environment.window, 'pointercancel', () => this.reset());
    this.listen<WheelEvent>(canvas, 'wheel', (event) => {
      if (!this.input.enabled) return;
      event.preventDefault();
      this.zoom(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 300 : 1) / 100, true);
    }, { passive: false });
    this.listen(canvas, 'contextmenu', (event) => event.preventDefault());
    this.listen(environment.document, 'pointerlockchange', this.pointerLockChange);
    this.listen(environment.document, 'pointerlockerror', () => this.captureFailed());
    this.notify();
  }

  toggleLock(capture = true): void {
    if (!this.input.enabled) return;
    this.camera.toggleLock();
    this.captureRejected = false;
    this.input.setHeld('CameraLock', 'camera-toggle', true);
    this.input.setHeld('CameraLock', 'camera-toggle', false);
    if (this.camera.getPose().locked && capture) this.requestCapture();
    else if (!this.camera.firstPerson) this.releasePointer();
    this.notify();
  }

  zoom(steps: number, mouseHint = false): void {
    if (!this.input.enabled) return;
    const wasFirstPerson = this.camera.firstPerson;
    this.camera.zoom(steps);
    if (wasFirstPerson !== this.camera.firstPerson) this.captureRejected = false;
    if (!this.camera.firstPerson && !this.camera.getPose().locked) this.releasePointer();
    this.message = mouseHint && this.camera.firstPerson && !this.locked ? 'Для обзора мышью нажмите на сцену или удерживайте ПКМ.' : '';
    this.notify();
  }

  requestCapture(): void {
    if (this.destroyed || !this.input.enabled || !this.camera.facesCamera || this.locked || this.captureRejected) return;
    try {
      if (typeof this.canvas.requestPointerLock !== 'function') { this.captureFailed(); return; }
      const result = this.canvas.requestPointerLock() as Promise<void> | undefined;
      result?.catch(() => this.captureFailed());
    } catch { this.captureFailed(); }
  }

  suspend(): void {
    this.reset();
    this.releasePointer();
  }

  focusCanvas(): void {
    if (!this.destroyed && this.input.enabled) this.canvas.focus({ preventScroll: true });
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    this.reset();
    this.releasePointer();
  }

  private readonly keyDown = (event: KeyboardEvent): void => {
    if (!this.input.enabled && (event.code === 'Tab' || event.code === 'Escape') && !event.repeat && this.onInventoryKey()) { event.preventDefault(); return; }
    if (!this.input.enabled || isUiTarget(event.target) || event.metaKey || event.altKey) return;
    if (event.repeat && !this.keys.has(event.code)) return;
    if (event.code === 'Escape') { event.preventDefault(); this.onPause(); return; }
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      event.preventDefault();
      if (!event.repeat && !this.keys.has(event.code)) this.toggleLock();
      this.keys.add(event.code);
      return;
    }
    const action = ACTION_KEYS[event.code];
    if (!action && !MOVEMENT_CODES.has(event.code)) return;
    event.preventDefault();
    this.keys.add(event.code);
    if (action) this.input.setHeld(action, event.code, true);
    this.updateMovement();
  };

  private readonly keyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
    const action = ACTION_KEYS[event.code];
    if (action) this.input.setHeld(action, event.code, false);
    this.updateMovement();
  };

  private readonly pointerDown = (event: PointerEvent): void => {
    if (!this.input.enabled || event.pointerType === 'touch') return;
    if (event.button === 2) event.preventDefault();
    this.syncMouseButtons(event);
  };

  private syncMouseButtons(event: PointerEvent): void {
    const previouslyPressed = this.mouseButtons;
    this.mouseButtons = event.buttons;
    this.orbiting = (event.buttons & 2) !== 0;
    if ((event.buttons & 1) === 0) this.input.setHeld('Primary', 'mouse', false);
    else if ((previouslyPressed & 1) === 0 && !isUiTarget(event.target)) {
      if (this.camera.facesCamera && !this.locked && !this.captureRejected) { this.requestCapture(); return; }
      this.input.setHeld('Primary', 'mouse', true);
    }
  }

  private readonly pointerMove = (event: PointerEvent): void => {
    if (!this.input.enabled || event.pointerType === 'touch') return;
    // Chorded mouse presses/releases arrive as pointermove until the last button is released.
    if (this.mouseButtons !== 0 || this.locked) this.syncMouseButtons(event);
    if (!this.orbiting && !this.locked) return;
    this.input.addLook(event.movementX, event.movementY, 'mouse');
  };

  private readonly pointerUp = (event: PointerEvent): void => {
    if (event.pointerType === 'touch') return;
    if (this.input.enabled && (this.mouseButtons !== 0 || this.locked)) this.syncMouseButtons(event);
  };

  private readonly pointerLockChange = (): void => {
    const previouslyLocked = this.locked;
    this.locked = this.environment.document.pointerLockElement === this.canvas;
    if (this.locked && (!this.input.enabled || !this.camera.facesCamera)) { this.releasePointer(); return; }
    if (previouslyLocked && !this.locked && !this.expectedRelease) {
      this.camera.unlock();
      this.reset();
      this.onPause();
    }
    this.expectedRelease = false;
    this.message = '';
    this.notify();
  };

  private updateMovement(): void {
    const has = (a: string, b: string) => this.keys.has(a) || this.keys.has(b) ? 1 : 0;
    this.input.setMove('keyboard', has('KeyD', 'ArrowRight') - has('KeyA', 'ArrowLeft'), has('KeyW', 'ArrowUp') - has('KeyS', 'ArrowDown'));
  }

  private reset(): void {
    this.keys.clear();
    this.orbiting = false;
    this.mouseButtons = 0;
    this.input.clear();
  }

  private releasePointer(): void {
    if (this.environment.document.pointerLockElement !== this.canvas) return;
    this.expectedRelease = true;
    try { this.environment.document.exitPointerLock(); } catch { this.expectedRelease = false; }
  }

  private captureFailed(): void {
    if (this.destroyed) return;
    this.message = 'Захват мыши недоступен. Для обзора удерживайте ПКМ.';
    this.captureRejected = true;
    this.notify();
  }

  private notify(): void {
    if (!this.destroyed) this.onStatus({ cameraLocked: this.camera.getPose().locked, firstPerson: this.camera.firstPerson, pointerLocked: this.locked, message: this.message });
  }

  private listen<E extends Event>(target: EventTarget, name: string, callback: (event: E) => void, options?: AddEventListenerOptions): void {
    const listener = callback as EventListener;
    target.addEventListener(name, listener, options);
    this.cleanups.push(() => target.removeEventListener(name, listener, options));
  }
}
