import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserInput } from './BrowserInput';
import { InputState } from './InputState';
import { CameraController } from '../player/CameraController';

function dispatch(target: EventTarget, type: string, fields: Record<string, unknown> = {}): Event {
  const event = new Event(type, { cancelable: true });
  for (const [key, value] of Object.entries(fields)) Object.defineProperty(event, key, { value });
  target.dispatchEvent(event);
  return event;
}

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });

function setup(denyCapture = false, onInventoryKey: () => boolean = () => false) {
  const win = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    pointerLockElement: null as EventTarget | null,
    exitPointerLock: () => { doc.pointerLockElement = null; dispatch(doc, 'pointerlockchange'); },
  });
  const canvas = Object.assign(new EventTarget(), {
    focus: vi.fn(),
    requestPointerLock: vi.fn(() => {
      if (denyCapture) return Promise.reject(new Error('denied'));
      doc.pointerLockElement = canvas;
      dispatch(doc, 'pointerlockchange');
      return Promise.resolve();
    }),
  });
  const input = new InputState();
  input.setContext('gameplay');
  const camera = new CameraController();
  const status = vi.fn();
  const pause = vi.fn(() => { input.setContext('ui'); binding.suspend(); });
  const binding = new BrowserInput(canvas as unknown as HTMLCanvasElement, input, camera, pause, status, { window: win as unknown as Window, document: doc as unknown as Document }, onInventoryKey);
  cleanups.push(() => binding.destroy());
  return { win, doc, canvas, input, camera, status, pause, binding };
}

describe('browser event adapter using EventTarget (without a browser)', () => {
  it('closes an inventory with Tab or Escape while UI blocks gameplay keys', () => {
    const close = vi.fn(() => true);
    const { win, input } = setup(false, close);
    input.setContext('ui');
    dispatch(win, 'keydown', { code: 'KeyG' });
    dispatch(win, 'keydown', { code: 'Space' });
    expect(input.consumeFrame().pressed.size).toBe(0);
    expect(dispatch(win, 'keydown', { code: 'Tab', repeat: false }).defaultPrevented).toBe(true);
    dispatch(win, 'keydown', { code: 'Tab', repeat: true });
    expect(close).toHaveBeenCalledTimes(1);
    dispatch(win, 'keydown', { code: 'Escape', repeat: false });
    expect(close).toHaveBeenCalledTimes(2);
  });

  it('releases a locked pointer for inventory and restores canvas focus without a false pause', () => {
    const { binding, input, doc, pause, canvas } = setup();
    binding.toggleLock();
    input.setContext('ui');
    binding.suspend();
    expect(doc.pointerLockElement).toBeNull();
    expect(pause).not.toHaveBeenCalled();
    expect(input.consumeFrame().pressed.size).toBe(0);
    binding.focusCanvas();
    expect(canvas.focus).not.toHaveBeenCalled();
    input.setContext('gameplay');
    binding.focusCanvas();
    expect(canvas.focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true });
  });

  it('maps movement relative axes and separates Ctrl sprint from Shift camera lock', () => {
    const { win, input, camera } = setup();
    dispatch(win, 'keydown', { code: 'KeyW' });
    dispatch(win, 'keydown', { code: 'ControlLeft' });
    let frame = input.consumeFrame();
    expect(frame.move.y).toBe(1);
    expect(frame.sprint).toBe(true);
    expect(camera.getPose().locked).toBe(false);
    dispatch(win, 'keyup', { code: 'ControlLeft' });
    dispatch(win, 'keydown', { code: 'ShiftLeft', repeat: false });
    frame = input.consumeFrame();
    expect(frame.sprint).toBe(false);
    expect(camera.getPose().locked).toBe(true);
  });

  it('resets keys in a menu and ignores stale OS key repeats after resume', () => {
    const { win, input, binding } = setup();
    dispatch(win, 'keydown', { code: 'KeyW' });
    dispatch(win, 'keydown', { code: 'Escape' });
    input.setContext('gameplay');
    dispatch(win, 'keydown', { code: 'KeyW', repeat: true });
    expect(input.consumeFrame().move.y).toBe(0);
    dispatch(win, 'keyup', { code: 'KeyW' });
    dispatch(win, 'keydown', { code: 'KeyW', repeat: false });
    expect(input.consumeFrame().move.y).toBe(1);
    binding.destroy();
    dispatch(win, 'keyup', { code: 'KeyW' });
    dispatch(win, 'keydown', { code: 'KeyD' });
    expect(input.consumeFrame().move.x).toBe(0);
  });

  it('does not treat typing in an editable field as gameplay', () => {
    const { win, input } = setup();
    const editor = { closest: () => ({}) };
    dispatch(win, 'keydown', { code: 'KeyW', target: editor });
    dispatch(win, 'keydown', { code: 'Space', target: editor });
    expect(input.consumeFrame().move.y).toBe(0);
    expect(input.consumeFrame().pressed.size).toBe(0);
  });

  it('orbits only while RMB is held and prevents context menus only on the canvas', () => {
    const { win, canvas, input } = setup();
    dispatch(win, 'pointermove', { pointerType: 'mouse', movementX: 10, movementY: 2 });
    expect(input.consumeLook().mouse.x).toBe(0);
    dispatch(canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
    dispatch(win, 'pointermove', { pointerType: 'mouse', movementX: 10, movementY: 2 });
    expect(input.consumeLook().mouse).toEqual({ x: 10, y: 2 });
    dispatch(win, 'pointerup', { pointerType: 'mouse', button: 2 });
    dispatch(win, 'pointermove', { pointerType: 'mouse', movementX: 20, movementY: 4 });
    expect(input.consumeLook().mouse.x).toBe(0);
    expect(dispatch(canvas, 'contextmenu').defaultPrevented).toBe(true);
    expect(dispatch(win, 'contextmenu').defaultPrevented).toBe(false);
  });

  it('keeps RMB fallback when pointer lock is rejected', async () => {
    const { binding, camera, status, canvas, win, input } = setup(true);
    binding.toggleLock();
    await Promise.resolve();
    expect(camera.getPose().locked).toBe(true);
    expect(status.mock.lastCall?.[0].message).toContain('ПКМ');
    dispatch(canvas, 'pointerdown', { pointerType: 'mouse', button: 2 });
    dispatch(win, 'pointermove', { pointerType: 'mouse', movementX: 6, movementY: 0 });
    expect(input.consumeLook().mouse.x).toBe(6);
    dispatch(canvas, 'pointerdown', { pointerType: 'mouse', button: 0 });
    expect(input.consumeFrame().pressed.has('Primary')).toBe(true);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('pauses and clears movement when pointer lock is lost unexpectedly', () => {
    const { binding, doc, input, win, pause, camera } = setup();
    binding.toggleLock();
    dispatch(win, 'keydown', { code: 'KeyW' });
    doc.exitPointerLock();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(camera.getPose().locked).toBe(false);
    expect(input.enabled).toBe(false);
    expect(input.consumeFrame().move.y).toBe(0);
  });
});
