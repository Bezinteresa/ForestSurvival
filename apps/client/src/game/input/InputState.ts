export type InputAction = 'Jump' | 'Sprint' | 'Primary' | 'Interact' | 'Inventory' | 'CameraLock' | 'Hotbar1' | 'Hotbar2' | 'Hotbar3' | 'Hotbar4' | 'Hotbar5';
export type InputContext = 'gameplay' | 'ui';

export interface MoveAxis { readonly x: number; readonly y: number }
export interface LookDelta { readonly mouse: MoveAxis; readonly touch: MoveAxis }

export class InputState {
  private context: InputContext = 'ui';
  private readonly moves = new Map<string, MoveAxis>();
  private readonly held = new Map<InputAction, Set<string>>();
  private readonly pressed = new Set<InputAction>();
  private mouseLook = { x: 0, y: 0 };
  private touchLook = { x: 0, y: 0 };

  get enabled(): boolean { return this.context === 'gameplay'; }

  setContext(context: InputContext): void {
    this.clear();
    this.context = context;
  }

  setMove(source: string, x: number, y: number): void {
    if (!this.enabled || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.moves.set(source, normalizeAxis(x, y));
  }

  setHeld(action: InputAction, source: string, down: boolean): void {
    if (!down) { this.held.get(action)?.delete(source); return; }
    if (!this.enabled) return;
    let sources = this.held.get(action);
    if (!sources) { sources = new Set(); this.held.set(action, sources); }
    if (sources.size === 0) this.pressed.add(action);
    sources.add(source);
  }

  addLook(x: number, y: number, kind: 'mouse' | 'touch'): void {
    if (!this.enabled || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const delta = kind === 'mouse' ? this.mouseLook : this.touchLook;
    delta.x += x;
    delta.y += y;
  }

  consumeLook(): LookDelta {
    const result = { mouse: { ...this.mouseLook }, touch: { ...this.touchLook } };
    this.mouseLook = { x: 0, y: 0 };
    this.touchLook = { x: 0, y: 0 };
    return result;
  }

  consumeFrame(): { move: MoveAxis; sprint: boolean; pressed: ReadonlySet<InputAction> } {
    let x = 0, y = 0;
    for (const move of this.moves.values()) { x += move.x; y += move.y; }
    const result = { move: normalizeAxis(x, y), sprint: (this.held.get('Sprint')?.size ?? 0) > 0, pressed: new Set(this.pressed) };
    this.pressed.clear();
    return result;
  }

  clearSource(source: string): void {
    this.moves.delete(source);
    for (const sources of this.held.values()) sources.delete(source);
  }

  clear(): void {
    this.moves.clear();
    this.held.clear();
    this.pressed.clear();
    this.mouseLook = { x: 0, y: 0 };
    this.touchLook = { x: 0, y: 0 };
  }
}

export function normalizeAxis(x: number, y: number): MoveAxis {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}
