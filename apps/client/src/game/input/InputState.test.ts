import { describe, expect, it } from 'vitest';
import { InputState } from './InputState';
import { CONTROL_SETTINGS_KEY, DEFAULT_CONTROL_SETTINGS, loadControlSettings, saveControlSettings } from './ControlSettings';

describe('contextual input', () => {
  it('normalizes combined movement sources and preserves held actions from another source', () => {
    const input = new InputState();
    input.setContext('gameplay');
    input.setMove('keyboard', 1, 1);
    input.setMove('touch', 0, 1);
    input.setHeld('Sprint', 'left-control', true);
    input.setHeld('Sprint', 'right-control', true);
    input.setHeld('Sprint', 'left-control', false);
    const frame = input.consumeFrame();
    expect(Math.hypot(frame.move.x, frame.move.y)).toBeCloseTo(1);
    expect(frame.sprint).toBe(true);
    input.clearSource('right-control');
    expect(input.consumeFrame().sprint).toBe(false);
  });

  it('jump is an edge; holding or repeating a key does not request another jump', () => {
    const input = new InputState();
    input.setContext('gameplay');
    input.setHeld('Jump', 'space', true);
    expect(input.consumeFrame().pressed.has('Jump')).toBe(true);
    input.setHeld('Jump', 'space', true);
    expect(input.consumeFrame().pressed.has('Jump')).toBe(false);
    input.setHeld('Jump', 'space', false);
    input.setHeld('Jump', 'space', true);
    expect(input.consumeFrame().pressed.has('Jump')).toBe(true);
  });

  it('menu blocks movement and look, and reopening gameplay clears old presses', () => {
    const input = new InputState();
    input.setContext('gameplay');
    input.setMove('touch-stick', 1, 0);
    input.setHeld('Jump', 'touch-jump', true);
    input.addLook(30, 10, 'touch');
    input.setContext('ui');
    input.setMove('keyboard', 0, 1);
    input.setHeld('Jump', 'space', true);
    input.addLook(100, 100, 'mouse');
    input.setContext('gameplay');
    expect(input.consumeFrame()).toEqual({ move: { x: 0, y: 0 }, sprint: false, pressed: new Set() });
    expect(input.consumeLook()).toEqual({ mouse: { x: 0, y: 0 }, touch: { x: 0, y: 0 } });
  });

  it('keeps touch movement, look and jump independent', () => {
    const input = new InputState();
    input.setContext('gameplay');
    input.setMove('touch-stick', 0.4, 0.8);
    input.addLook(20, -10, 'touch');
    input.setHeld('Jump', 'touch-jump-2', true);
    const look = input.consumeLook();
    const frame = input.consumeFrame();
    expect(look.touch).toEqual({ x: 20, y: -10 });
    expect(frame.move).toEqual({ x: 0.4, y: 0.8 });
    expect(frame.pressed.has('Jump')).toBe(true);
    input.clearSource('touch-stick');
    expect(input.consumeFrame().move).toEqual({ x: 0, y: 0 });
  });
});

describe('saved controls', () => {
  it('round-trips settings with a versioned key', () => {
    const memory = new Map<string, string>();
    const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => { memory.set(key, value); } };
    const settings = { mouseSensitivity: 0.006, touchSensitivity: 0.005, invertY: true };
    expect(saveControlSettings(storage, settings)).toBe(true);
    expect(memory.has(CONTROL_SETTINGS_KEY)).toBe(true);
    expect(loadControlSettings(storage)).toEqual(settings);
  });

  it('recovers from invalid, future or denied storage', () => {
    expect(loadControlSettings({ getItem: () => '{bad', setItem: () => {} })).toEqual(DEFAULT_CONTROL_SETTINGS);
    expect(loadControlSettings({ getItem: () => '{"version":9,"invertY":true}', setItem: () => {} })).toEqual(DEFAULT_CONTROL_SETTINGS);
    const denied = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadControlSettings(denied)).toEqual(DEFAULT_CONTROL_SETTINGS);
    expect(saveControlSettings(denied, DEFAULT_CONTROL_SETTINGS)).toBe(false);
  });
});
