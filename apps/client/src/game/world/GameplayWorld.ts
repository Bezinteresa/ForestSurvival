import { AXE_CONFIG, CAMP_STORAGE, FOOD_DEFINITIONS, TEST_BERRY_BUSHES, isFood, ITEM_DEFINITIONS, PLAYER_CONFIG, RESOURCE_DEFINITIONS, TOOL_DAMAGE, TOOL_LEVELS, RESOURCE_CONFIG, TEST_WORLD, TRAINING_DUMMY, type CommandResult, type DummySnapshot, type GameplaySnapshot, type InteractionSnapshot, type LootSnapshot, type PlayerSnapshot, type TreeDefinition, type Vector3Data, type MaterialNodeDefinition, type ResourceKind, type ToolId, type BerryBushDefinition } from '@forest-survival/shared';
import { AttackController } from '../combat/AttackController';
import { DamageReceiver } from '../combat/DamageReceiver';
import { selectTarget, type TargetPoint, type VisibilityQueries } from '../combat/TargetQuery';
import { Inventory } from '../items/Inventory';
import { CampStorage } from '../items/CampStorage';
import { PlayerVitals } from '../player/PlayerVitals';
import { ForagingWorld } from './ForagingWorld';

interface ResourceDefinition extends TreeDefinition { readonly kind: ResourceKind }

export interface GameplayQueries extends VisibilityQueries {
  findDropPosition(player: PlayerSnapshot, yaw: number): Vector3Data | null;
}

export class GameplayWorld {
  private readonly attacks = new AttackController();
  private readonly storage = new CampStorage();
  private readonly foraging: ForagingWorld;
  private storageInReach = false;
  private attackTool: { tool: ToolId; damage: number } | undefined;
  private readonly resources: Array<{ definition: ResourceDefinition; receiver: DamageReceiver }>;
  private readonly dummy = new DamageReceiver(TRAINING_DUMMY.id, TRAINING_DUMMY.maxHealth);
  private readonly loot = new Map<string, LootSnapshot>();
  private feedback: GameplaySnapshot['feedback'] = null;
  private lastHit: GameplaySnapshot['lastHit'] = null;
  private interaction: InteractionSnapshot | null = null;

  constructor(private readonly visibility: GameplayQueries, trees: readonly TreeDefinition[] = TEST_WORLD.trees, private readonly inventory = new Inventory(), nodes: readonly MaterialNodeDefinition[] = [], private readonly debugTools = false, bushes: readonly BerryBushDefinition[] = TEST_BERRY_BUSHES) {
    this.foraging = new ForagingWorld(bushes);
    const definitions: ResourceDefinition[] = [
      ...trees.map((tree) => ({ ...tree, kind: 'tree' as const })),
      ...nodes.map((node) => ({ ...node, trunkHeight: node.height })),
    ];
    this.resources = definitions.map((definition) => ({ definition, receiver: new DamageReceiver(definition.id, RESOURCE_DEFINITIONS[definition.kind].health, RESOURCE_DEFINITIONS[definition.kind].tool) }));
  }

  getSelectedItem() { return this.inventory.getStack(this.inventory.selectedSlot); }

  end(): void {
    this.attacks.cancel();
    this.interaction = null;
    this.storageInReach = false;
  }

  consumeFood(slot: number, expectedItemId: string, vitals: PlayerVitals, now: number): CommandResult {
    if (vitals.dead) return { accepted: false, reason: 'dead' };
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const stack = this.inventory.getStack(slot);
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (!isFood(stack.itemId)) return { accepted: false, reason: 'invalid' };
    const food = FOOD_DEFINITIONS[stack.itemId];
    if (!vitals.canEat(food.hunger)) return this.reject('satiated', 'Вы уже сыты.', now);
    const consumed = this.inventory.consume(slot, expectedItemId);
    if (!consumed.accepted) return consumed;
    vitals.eat(food.hunger);
    this.feedback = { kind: 'info', text: 'Ягоды съедены.', at: now };
    return { accepted: true };
  }

  gather(id: string, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const result = this.foraging.gather(id, player, this.inventory, this.visibility);
    this.feedback = { kind: result.accepted ? 'pickup' : 'blocked', text: result.accepted ? '+1 · Ягоды' : result.reason === 'inventory-full' ? 'Рюкзак заполнен.' : 'Не удалось собрать ягоды. Подойдите по свободному пути.', at: now };
    return result;
  }

  selectSlot(slot: number, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return this.inventory.select(slot);
  }

  moveItem(from: number, to: number, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return this.inventory.move(from, to);
  }

  transfer(direction: 'deposit' | 'withdraw', slot: number, expectedItemId: string, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const result = this.storage.transfer(this.inventory, direction, slot, expectedItemId, player, this.visibility);
    this.feedback = { kind: result.accepted ? 'info' : 'blocked', text: result.accepted ? 'Предмет перенесён.' : result.reason === 'out-of-range' ? 'Подойдите к складу.' : result.reason === 'stale' ? 'Слот изменился. Выберите предмет заново.' : 'Нет места для всего стека.', at: now };
    return result;
  }

  debugUpgrade(target: 'tool' | 'backpack', slot: number, level: 2, now: number): CommandResult {
    if (!this.debugTools) return { accepted: false, reason: 'forbidden' };
    if (this.attacks.isBusy(now)) return { accepted: false, reason: 'busy' };
    if (target === 'tool') return this.inventory.upgradeTool(slot, level);
    if (target === 'backpack') return this.inventory.upgradeBackpack(level);
    return { accepted: false, reason: 'invalid' };
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
    const tool = this.inventory.equippedItem;
    if (tool === 'none') return this.reject('empty-hand', 'Выберите инструмент.', now);
    const level = this.inventory.getStack(this.inventory.selectedSlot)?.level ?? 1;
    const tuning = TOOL_LEVELS[level];
    if (!this.attacks.begin(requestId, yaw, now, tuning)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    this.attackTool = { tool, damage: TOOL_DAMAGE[tool] * tuning.damageMultiplier };
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
        const attack = this.attackTool!;
        const result = receiver.receiveDamage({ attackId: strike.id, sourceId: PLAYER_CONFIG.id, targetId: target.id, kind: 'melee', amount: attack.damage, tool: attack.tool });
        if (!result.applied && resource && RESOURCE_DEFINITIONS[resource.definition.kind].tool !== attack.tool) this.feedback = { kind: 'blocked', text: 'Нужен инструмент: ' + ITEM_DEFINITIONS[RESOURCE_DEFINITIONS[resource.definition.kind].tool].label, at: now };
        if (result.applied) {
          this.lastHit = { targetId: target.id, at: now };
          this.feedback = { kind: 'hit', text: (resource ? RESOURCE_DEFINITIONS[resource.definition.kind].label : 'Манекен') + ': −' + attack.damage, at: now };
          if (result.defeated) {
            this.visibility.removeEntityCollider(target.id);
            if (resource) {
              this.spawnMaterials(resource.definition);
              this.feedback = { kind: 'info', text: RESOURCE_DEFINITIONS[resource.definition.kind].label + ': ресурс исчерпан. Подберите добычу.', at: now };
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
    const inserted = this.inventory.insert({ id: item.id, itemId: item.itemId, amount: item.amount, ...(item.level !== undefined ? { level: item.level } : {}) });
    if (!inserted.accepted) return this.reject(inserted.reason ?? 'invalid', 'Нет места для всего стека.', now);
    this.loot.delete(id);
    if (this.interaction?.id === id) this.interaction = null;
    this.feedback = { kind: 'pickup', text: '+' + item.amount + ' · ' + ITEM_DEFINITIONS[item.itemId].label, at: now };
    return { accepted: true };
  }

  interact(player: PlayerSnapshot, now: number, viewYaw: number): CommandResult {
    this.updateInteraction(player, viewYaw);
    if (this.interaction?.kind === 'bush') return this.gather(this.interaction.id, player, now);
    if (this.interaction?.kind === 'storage') return { accepted: this.storage.canAccess(player, this.visibility) };
    return this.interaction?.kind === 'pickup' ? this.pickup(this.interaction.id, player, now) : { accepted: false, reason: 'missing' };
  }

  getSnapshot(now: number): GameplaySnapshot {
    const dummy: DummySnapshot = { id: TRAINING_DUMMY.id, position: { ...TRAINING_DUMMY.position }, health: this.dummy.currentHealth, maxHealth: this.dummy.maxHealth, dead: this.dummy.exhausted };
    return {
      inventory: this.inventory.snapshot(),
      storage: { inventory: this.storage.snapshot(), inReach: this.storageInReach },
      debugTools: this.debugTools,
      equippedItem: this.inventory.equippedItem,
      bag: { wood: this.inventory.count('wood'), capacity: this.inventory.capacityFor('wood') },
      bushes: this.foraging.snapshot(),
      resources: this.resources.map(({ definition, receiver }) => ({ id: definition.id, kind: definition.kind, requiredTool: RESOURCE_DEFINITIONS[definition.kind].tool, position: { ...definition.position }, radius: definition.radius, trunkHeight: definition.trunkHeight, health: receiver.currentHealth, maxHealth: receiver.maxHealth, exhausted: receiver.exhausted })),
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
    this.storageInReach = this.storage.canAccess(player, this.visibility);
    const item = selectTarget([...this.loot.values()].map((loot) => ({ id: loot.id, position: loot.position, radius: 0 })), origin, yaw, RESOURCE_CONFIG.pickupRange, Math.PI * 0.48, AXE_CONFIG.maxHeightDifference, this.visibility);
    if (item) {
      const stack = this.loot.get(item.id)!;
      this.interaction = { id: item.id, kind: 'pickup', label: 'Взять: ' + ITEM_DEFINITIONS[stack.itemId].label + ' ×' + stack.amount };
      return;
    }
    const bush = this.foraging.target(player, yaw, this.visibility);
    if (bush) { this.interaction = { id: bush.id, kind: 'bush', label: 'Собрать ягоды' }; return; }
    const storage = CAMP_STORAGE;
    if (this.storageInReach && selectTarget([{ id: storage.id, position: storage.position, radius: 0 }], origin, yaw, storage.range, AXE_CONFIG.halfAngle, 1.5, this.visibility)) {
      this.interaction = { id: storage.id, kind: 'storage', label: 'Открыть склад лагеря' };
      return;
    }
    const target = this.findStrikeTarget(player, yaw);
    if (!target) { this.interaction = null; return; }
    const resource = this.resources.find((entry) => entry.definition.id === target.id);
    const receiver = resource?.receiver ?? this.dummy;
    this.interaction = { id: target.id, kind: resource ? resource.definition.kind === 'tree' ? 'tree' : 'resource' : 'dummy', label: resource ? RESOURCE_DEFINITIONS[resource.definition.kind].label : 'Манекен', health: receiver.currentHealth, maxHealth: receiver.maxHealth };
  }

  private getOrigin(player: PlayerSnapshot) { return { x: player.position.x, y: player.position.y + 0.15, z: player.position.z }; }

  private spawnMaterials(resource: ResourceDefinition): void {
    const output = RESOURCE_DEFINITIONS[resource.kind];
    for (let index = 0; index < output.amount; index++) {
      const angle = index * Math.PI * 2 / output.amount;
      const id = resource.id + '/' + output.output + '/' + index;
      this.loot.set(id, { id, itemId: output.output, amount: 1, position: { x: resource.position.x + Math.cos(angle) * 0.8, y: resource.position.y + 0.23, z: resource.position.z + Math.sin(angle) * 0.8 } });
    }
  }

  private reject(reason: NonNullable<CommandResult['reason']>, text: string, now: number): CommandResult {
    this.feedback = { kind: 'blocked', text, at: now };
    return { accepted: false, reason };
  }
}
