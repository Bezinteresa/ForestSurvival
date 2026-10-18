import { AXE_CONFIG, ITEM_DEFINITIONS, PLAYER_CONFIG, RESOURCE_CONFIG, TEST_WORLD, TRAINING_DUMMY, type CommandResult, type DummySnapshot, type GameplaySnapshot, type InteractionSnapshot, type LootSnapshot, type PlayerSnapshot, type TreeDefinition, type Vector3Data } from '@forest-survival/shared';
import { AttackController } from '../combat/AttackController';
import { DamageReceiver } from '../combat/DamageReceiver';
import { selectTarget, type TargetPoint, type VisibilityQueries } from '../combat/TargetQuery';
import { Inventory } from '../items/Inventory';

export interface GameplayQueries extends VisibilityQueries {
  findDropPosition(player: PlayerSnapshot, yaw: number): Vector3Data | null;
}

export class GameplayWorld {
  private readonly attacks = new AttackController();
  private readonly resources: Array<{ definition: TreeDefinition; receiver: DamageReceiver }>;
  private readonly dummy = new DamageReceiver(TRAINING_DUMMY.id, TRAINING_DUMMY.maxHealth);
  private readonly loot = new Map<string, LootSnapshot>();
  private feedback: GameplaySnapshot['feedback'] = null;
  private lastHit: GameplaySnapshot['lastHit'] = null;
  private interaction: InteractionSnapshot | null = null;

  constructor(private readonly visibility: GameplayQueries, trees: readonly TreeDefinition[] = TEST_WORLD.trees, private readonly inventory = new Inventory()) {
    this.resources = trees.map((definition) => ({ definition, receiver: new DamageReceiver(definition.id, RESOURCE_CONFIG.treeHealth, 'axe') }));
  }

  selectSlot(slot: number, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return this.inventory.select(slot);
  }

  moveItem(from: number, to: number, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return this.inventory.move(from, to);
  }

  drop(slot: number, player: PlayerSnapshot, yaw: number, now: number): CommandResult {
    if (!Number.isFinite(yaw) || !Number.isInteger(slot)) return { accepted: false, reason: 'invalid' };
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const stack = this.inventory.getStack(slot);
    if (!stack) return { accepted: false, reason: 'missing' };
    const position = this.visibility.findDropPosition(player, yaw);
    if (!position || this.loot.has(stack.id)) return this.reject('blocked', 'Нет свободного места для выброса. Встаньте на землю и отойдите от препятствия.', now);
    this.inventory.remove(slot);
    this.loot.set(stack.id, { ...stack, position });
    this.feedback = { kind: 'info', text: 'Выброшено: ' + ITEM_DEFINITIONS[stack.itemId].label + ' ×' + stack.amount, at: now };
    return { accepted: true };
  }

  useItem(requestId: string, yaw: number, now: number): CommandResult {
    if (this.inventory.equippedItem === 'none') return this.reject('empty-hand', 'Выберите топор.', now);
    if (!this.attacks.begin(requestId, yaw, now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return { accepted: true };
  }

  getAttackYaw(now: number): number | undefined { return this.attacks.getYaw(now); }

  update(now: number, player: PlayerSnapshot, viewYaw: number): void {
    const strike = this.attacks.update(now);
    if (strike) {
      const target = this.findStrikeTarget(player, strike.yaw);
      if (!target) this.feedback = { kind: 'miss', text: 'Промах', at: now };
      else {
        const resource = this.resources.find((entry) => entry.definition.id === target.id);
        const receiver = resource?.receiver ?? this.dummy;
        const result = receiver.receiveDamage({ attackId: strike.id, sourceId: PLAYER_CONFIG.id, targetId: target.id, kind: 'melee', amount: AXE_CONFIG.damage, tool: 'axe' });
        if (result.applied) {
          this.lastHit = { targetId: target.id, at: now };
          this.feedback = { kind: 'hit', text: resource ? 'Дерево: −' + AXE_CONFIG.damage : 'Попадание: −' + AXE_CONFIG.damage, at: now };
          if (result.defeated) {
            this.visibility.removeEntityCollider(target.id);
            if (resource) {
              this.spawnWood(resource.definition);
              this.feedback = { kind: 'info', text: 'Дерево срублено. Подберите древесину.', at: now };
            } else this.feedback = { kind: 'info', text: 'Манекен уничтожен.', at: now };
          }
        }
      }
    }
    this.updateInteraction(player, this.getAttackYaw(now) ?? viewYaw);
  }

  pickup(id: string, player: PlayerSnapshot, now: number): CommandResult {
    const item = this.loot.get(id);
    if (!item) return { accepted: false, reason: 'missing' };
    const origin = this.getOrigin(player);
    if (Math.hypot(item.position.x - player.position.x, item.position.z - player.position.z) > RESOURCE_CONFIG.pickupRange || Math.abs(item.position.y - origin.y) > AXE_CONFIG.maxHeightDifference) return this.reject('out-of-range', 'Подойдите ближе.', now);
    if (!this.visibility.hasLineOfSight(origin, item.position, item.id)) return this.reject('blocked', 'Предмет закрыт препятствием.', now);
    const inserted = this.inventory.insert({ id: item.id, itemId: item.itemId, amount: item.amount });
    if (!inserted.accepted) return this.reject(inserted.reason ?? 'invalid', 'Нет места для всего стека.', now);
    this.loot.delete(id);
    if (this.interaction?.id === id) this.interaction = null;
    this.feedback = { kind: 'pickup', text: '+' + item.amount + ' · ' + ITEM_DEFINITIONS[item.itemId].label, at: now };
    return { accepted: true };
  }

  interact(player: PlayerSnapshot, now: number, viewYaw: number): CommandResult {
    this.updateInteraction(player, viewYaw);
    return this.interaction?.kind === 'pickup' ? this.pickup(this.interaction.id, player, now) : { accepted: false, reason: 'missing' };
  }

  getSnapshot(now: number): GameplaySnapshot {
    const dummy: DummySnapshot = { id: TRAINING_DUMMY.id, position: { ...TRAINING_DUMMY.position }, health: this.dummy.currentHealth, maxHealth: this.dummy.maxHealth, dead: this.dummy.exhausted };
    return {
      inventory: this.inventory.snapshot(),
      equippedItem: this.inventory.equippedItem,
      bag: { wood: this.inventory.count('wood'), capacity: this.inventory.capacityFor('wood') },
      resources: this.resources.map(({ definition, receiver }) => ({ id: definition.id, position: { ...definition.position }, radius: definition.radius, trunkHeight: definition.trunkHeight, health: receiver.currentHealth, maxHealth: receiver.maxHealth, exhausted: receiver.exhausted })),
      loot: [...this.loot.values()].map((item) => ({ ...item, position: { ...item.position } })),
      dummy,
      attack: this.attacks.getSnapshot(now),
      interaction: this.interaction ? { ...this.interaction } : null,
      feedback: this.feedback ? { ...this.feedback } : null,
      lastHit: this.lastHit ? { ...this.lastHit } : null,
    };
  }

  private findStrikeTarget(player: PlayerSnapshot, yaw: number): TargetPoint | null {
    return selectTarget(this.getDamageTargets(), this.getOrigin(player), yaw, AXE_CONFIG.reach, AXE_CONFIG.halfAngle, AXE_CONFIG.maxHeightDifference, this.visibility);
  }

  private getDamageTargets(): TargetPoint[] {
    const targets: TargetPoint[] = this.resources.filter(({ receiver }) => !receiver.exhausted).map(({ definition }) => ({ id: definition.id, position: { x: definition.position.x, y: definition.position.y + definition.trunkHeight / 2, z: definition.position.z }, radius: definition.radius }));
    if (!this.dummy.exhausted) targets.push({ id: TRAINING_DUMMY.id, position: { x: TRAINING_DUMMY.position.x, y: TRAINING_DUMMY.height / 2, z: TRAINING_DUMMY.position.z }, radius: TRAINING_DUMMY.radius });
    return targets;
  }

  private updateInteraction(player: PlayerSnapshot, yaw: number): void {
    const origin = this.getOrigin(player);
    const item = selectTarget([...this.loot.values()].map((loot) => ({ id: loot.id, position: loot.position, radius: 0 })), origin, yaw, RESOURCE_CONFIG.pickupRange, Math.PI * 0.48, AXE_CONFIG.maxHeightDifference, this.visibility);
    if (item) {
      const stack = this.loot.get(item.id)!;
      this.interaction = { id: item.id, kind: 'pickup', label: 'Взять: ' + ITEM_DEFINITIONS[stack.itemId].label + ' ×' + stack.amount };
      return;
    }
    const target = this.findStrikeTarget(player, yaw);
    if (!target) { this.interaction = null; return; }
    const resource = this.resources.find((entry) => entry.definition.id === target.id);
    const receiver = resource?.receiver ?? this.dummy;
    this.interaction = { id: target.id, kind: resource ? 'tree' : 'dummy', label: resource ? 'Дерево' : 'Манекен', health: receiver.currentHealth, maxHealth: receiver.maxHealth };
  }

  private getOrigin(player: PlayerSnapshot) { return { x: player.position.x, y: player.position.y + 0.15, z: player.position.z }; }

  private spawnWood(tree: TreeDefinition): void {
    for (let index = 0; index < RESOURCE_CONFIG.woodPerTree; index++) {
      const angle = index * Math.PI * 2 / RESOURCE_CONFIG.woodPerTree;
      const id = tree.id + '/wood/' + index;
      this.loot.set(id, { id, itemId: 'wood', amount: 1, position: { x: tree.position.x + Math.cos(angle) * 0.8, y: tree.position.y + 0.23, z: tree.position.z + Math.sin(angle) * 0.8 } });
    }
  }

  private reject(reason: NonNullable<CommandResult['reason']>, text: string, now: number): CommandResult {
    this.feedback = { kind: 'blocked', text, at: now };
    return { accepted: false, reason };
  }
}
