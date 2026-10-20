import { AXE_CONFIG, CAMP_STORAGE, CONSUMABLE_DEFINITIONS, COOKING_RECIPES, TEST_BERRY_BUSHES, isConsumable, isCookable, isMedical, ITEM_DEFINITIONS, PLAYER_CONFIG, RESOURCE_DEFINITIONS, TOOL_DAMAGE, TOOL_LEVELS, RESOURCE_CONFIG, TEST_WORLD, TRAINING_DUMMY, type CommandResult, type DummySnapshot, type GameplaySnapshot, type InteractionSnapshot, type LootSnapshot, type PlayerSnapshot, type TreeDefinition, type Vector3Data, type MaterialNodeDefinition, type ResourceKind, type ToolId, type BerryBushDefinition, type ItemStack } from '@forest-survival/shared';
import { AttackController } from '../combat/AttackController';
import { DamageReceiver } from '../combat/DamageReceiver';
import { selectTarget, type TargetPoint, type VisibilityQueries } from '../combat/TargetQuery';
import { Inventory } from '../items/Inventory';
import { CampStorage } from '../items/CampStorage';
import { PlayerVitals } from '../player/PlayerVitals';
import { ForagingWorld } from './ForagingWorld';
import { CAMPFIRE_CONFIG, FUEL_DEFINITIONS, isFuel, type CampfireLevel } from '@forest-survival/shared';
import { Campfire } from './Campfire';
import { WORKBENCH_CONFIG, type WorkbenchLevel } from '@forest-survival/shared';
import { Workbench, type WorkbenchPlacement } from './Workbench';
import { CampBuilding, type BuildingQueries } from './CampBuilding';
import { type BuildingPlan, type BuildingPreview } from '@forest-survival/shared';

interface ResourceDefinition extends TreeDefinition { readonly kind: ResourceKind }

export interface GameplayQueries extends VisibilityQueries {
  findDropPosition(player: PlayerSnapshot, yaw: number): Vector3Data | null;
  canPlaceWorkbench?: WorkbenchPlacement['canPlaceWorkbench'];
  addWorkbenchCollider?: WorkbenchPlacement['addWorkbenchCollider'];
  canPlaceBuilding?: BuildingQueries['canPlaceBuilding'];
  activateBuildingCollider?: BuildingQueries['activateBuildingCollider'];
}

export class GameplayWorld {
  private readonly attacks = new AttackController();
  private readonly storage = new CampStorage();
  private currentStorage = this.storage;
  private readonly buildings = new CampBuilding();
  private readonly campfire = new Campfire();
  private readonly workbench = new Workbench();
  private workbenchInReach = false;
  private campfireInReach = false;
  private lastPlayer: PlayerSnapshot = { id: PLAYER_CONFIG.id, position: { ...PLAYER_CONFIG.spawn }, grounded: false, yaw: Math.PI };
  private readonly foraging: ForagingWorld;
  private storageInReach = false;
  private attackTool: { tool: ToolId; damage: number } | undefined;
  private readonly resources: Array<{ definition: ResourceDefinition; receiver: DamageReceiver }>;
  private readonly dummy = new DamageReceiver(TRAINING_DUMMY.id, TRAINING_DUMMY.maxHealth);
  private readonly loot = new Map<string, LootSnapshot>();
  private feedback: GameplaySnapshot['feedback'] = null;
  private lastHit: GameplaySnapshot['lastHit'] = null;
  private interaction: InteractionSnapshot | null = null;

  constructor(private readonly visibility: GameplayQueries, trees: readonly TreeDefinition[] = TEST_WORLD.trees, private readonly inventory = new Inventory(), nodes: readonly MaterialNodeDefinition[] = [], private readonly debugTools = false, bushes: readonly BerryBushDefinition[] = TEST_BERRY_BUSHES, supplies: ReadonlyArray<ItemStack & { readonly position: Vector3Data }> = []) {
    this.foraging = new ForagingWorld(bushes);
    for (const supply of supplies) this.loot.set(supply.id, { ...supply, position: { ...supply.position } });
    const definitions: ResourceDefinition[] = [
      ...trees.map((tree) => ({ ...tree, kind: 'tree' as const })),
      ...nodes.map((node) => ({ ...node, trunkHeight: node.height })),
    ];
    this.resources = definitions.map((definition) => ({ definition, receiver: new DamageReceiver(definition.id, RESOURCE_DEFINITIONS[definition.kind].health, RESOURCE_DEFINITIONS[definition.kind].tool ?? undefined) }));
  }

  getSelectedItem() { return this.inventory.getStack(this.inventory.selectedSlot); }

  previewBuilding(plan: BuildingPlan, player: PlayerSnapshot, now: number): BuildingPreview {
    const preview = this.buildings.preview(plan, this.inventory, player, this.workbench.snapshot(false).level, {
      hasLineOfSight: (...args) => this.visibility.hasLineOfSight(...args),
      canPlaceBuilding: (box) => !!this.visibility.activateBuildingCollider && (this.visibility.canPlaceBuilding?.(box) ?? false),
      activateBuildingCollider: (box) => this.visibility.activateBuildingCollider!(box),
    }, [...this.loot.values()]);
    return this.attacks.isBusy(now) ? { ...preview, result: { accepted: false, reason: 'busy' } } : preview;
  }

  placeBuilding(plan: BuildingPlan, player: PlayerSnapshot, now: number): CommandResult {
    const preview = this.previewBuilding(plan, player, now);
    if (!preview.result.accepted) return preview.result;
    const result = this.buildings.place(plan, this.inventory, player, this.workbench.snapshot(false).level, {
      hasLineOfSight: (...args) => this.visibility.hasLineOfSight(...args),
      canPlaceBuilding: (box) => this.visibility.canPlaceBuilding!(box),
      activateBuildingCollider: (box) => this.visibility.activateBuildingCollider!(box),
    }, [...this.loot.values()]);
    if (result.accepted) { this.feedback = { kind: 'info', text: 'Постройка установлена.', at: now }; this.updateInteraction(player, player.yaw); }
    return result;
  }

  step(dt: number): void { this.campfire.step(dt); }
  warmthDuration(dt: number, position: Vector3Data): number { return this.campfire.warmthDuration(dt, position); }
  isWarm(position: Vector3Data): boolean { return this.campfire.contains(position); }

  fuelFire(slot: number, expectedItemId: string, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const stack = this.inventory.getStack(slot);
    const result = this.campfire.addFuel(this.inventory, slot, expectedItemId, player, this.visibility);
    const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
      'out-of-range': 'Подойдите к костру.', blocked: 'Костёр закрыт препятствием.', stale: 'Слот изменился. Выберите топливо заново.',
      'wrong-fuel': 'Выберите древесину или уголь.', 'fire-full': 'Нет места для всей порции топлива. Предмет сохранён.',
    };
    this.feedback = { kind: result.accepted ? 'info' : 'blocked', text: result.accepted && stack && isFuel(stack.itemId) ? 'Костёр: +' + FUEL_DEFINITIONS[stack.itemId].seconds + ' с · ' + ITEM_DEFINITIONS[stack.itemId].label + ' −1' : messages[result.reason!] ?? 'Не удалось добавить топливо.', at: now };
    return result;
  }

  upgradeFire(expectedLevel: CampfireLevel, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const result = this.campfire.upgrade(expectedLevel, this.inventory, player, this.visibility);
    const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
      'out-of-range': 'Подойдите к костру.', blocked: 'Костёр закрыт препятствием.', stale: 'Уровень костра изменился. Проверьте новое улучшение.',
      'fire-out': 'Сначала разожгите костёр.', 'max-level': 'Достигнут максимальный уровень костра.', 'insufficient-materials': 'Не хватает материалов в рюкзаке.',
    };
    const state = this.campfire.snapshot(player, this.campfireInReach);
    this.feedback = { kind: result.accepted ? 'info' : 'blocked', text: result.accepted ? 'Костёр: уровень ' + state.level + ' · зона ' + state.zoneRadius + ' м' : messages[result.reason!] ?? 'Улучшение недоступно.', at: now };
    return result;
  }

  end(): void {
    this.attacks.cancel();
    this.interaction = null;
    this.storageInReach = false;
    this.campfireInReach = false;
    this.workbenchInReach = false;
  }

  buildWorkbench(player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const site = WORKBENCH_CONFIG;
    const lootInSite = [...this.loot.values()].some((item) => Math.abs(item.position.x - site.position.x) < site.halfSize.x + 0.3 && Math.abs(item.position.z - site.position.z) < site.halfSize.z + 0.3 && Math.abs(item.position.y - site.position.y) < site.halfSize.y + 0.3);
    const result = this.workbench.build(this.inventory, player, this.visibility, {
      canPlaceWorkbench: () => !lootInSite && !!this.visibility.addWorkbenchCollider && (this.visibility.canPlaceWorkbench?.() ?? false),
      addWorkbenchCollider: () => this.visibility.addWorkbenchCollider!(),
    });
    if (result.accepted) this.updateInteraction(player, player.yaw);
    return this.workbenchFeedback(result, now, 'Верстак построен. Открыты базовые рецепты.');
  }

  craftItem(recipeId: string, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    return this.workbenchFeedback(this.workbench.craft(recipeId, this.inventory, player, this.visibility), now, recipeId === 'expanded-backpack' ? 'Рюкзак расширен.' : 'Предмет изготовлен и помещён в рюкзак.');
  }

  upgradeWorkbench(expectedLevel: WorkbenchLevel, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const result = this.workbench.upgrade(expectedLevel, this.inventory, player, this.visibility);
    return this.workbenchFeedback(result, now, 'Верстак улучшен до уровня ' + this.workbench.snapshot(this.workbenchInReach).level + '.');
  }

  private workbenchFeedback(result: CommandResult, now: number, success: string): CommandResult {
    const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
      'out-of-range': 'Подойдите к площадке верстака.', blocked: 'Освободите площадку и путь к верстаку.',
      'insufficient-materials': 'Не хватает материалов в рюкзаке.', 'inventory-full': 'Нет места для результата. Материалы сохранены.',
      'already-built': 'Верстак уже построен.', 'station-required': 'Сначала постройте верстак.', 'station-level': 'Нужен верстак более высокого уровня.',
      stale: 'Уровень верстака изменился. Проверьте следующее улучшение.', 'max-level': 'Максимальный уровень уже достигнут.',
    };
    this.feedback = { kind: result.accepted ? 'info' : 'blocked', text: result.accepted ? success : messages[result.reason!] ?? 'Рецепт недоступен.', at: now };
    return result;
  }

  consumeItem(slot: number, expectedItemId: string, vitals: PlayerVitals, now: number): CommandResult {
    if (vitals.dead) return { accepted: false, reason: 'dead' };
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const stack = this.inventory.getStack(slot);
    if (!stack || stack.id !== expectedItemId) return { accepted: false, reason: 'stale' };
    if (!isConsumable(stack.itemId)) return { accepted: false, reason: 'invalid' };
    const effect = CONSUMABLE_DEFINITIONS[stack.itemId];
    const blocker = vitals.consumeBlocker(effect);
    if (blocker === 'satiated') return this.reject('satiated', effect.health > 0 ? 'Вы сыты и здоровы.' : 'Вы уже сыты.', now);
    if (blocker === 'full-health') return this.reject('full-health', 'Здоровье уже полное.', now);
    if (blocker) return { accepted: false, reason: blocker };
    const before = vitals.snapshot();
    // The item is spent first; vitals.consume cannot fail after the blocker check above.
    const consumed = this.inventory.consume(slot, expectedItemId);
    if (!consumed.accepted) return consumed;
    vitals.consume(effect);
    const after = vitals.snapshot();
    const gains = [after.hunger > before.hunger ? 'сытость +' + Math.round(after.hunger - before.hunger) : '', after.health > before.health ? 'здоровье +' + Math.round(after.health - before.health) : ''].filter(Boolean).join(', ');
    this.feedback = { kind: 'info', text: (isMedical(stack.itemId) ? 'Использовано: ' : 'Съедено: ') + ITEM_DEFINITIONS[stack.itemId].label + ' · ' + gains, at: now };
    return { accepted: true };
  }

  cookItem(slot: number, expectedItemId: string, player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const stack = this.inventory.getStack(slot);
    const result = this.campfire.startCooking(this.inventory, slot, expectedItemId, player, this.visibility);
    const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
      'out-of-range': 'Подойдите к костру.', blocked: 'Костёр закрыт препятствием.', stale: 'Слот изменился. Выберите продукт заново.',
      'not-cookable': 'Этот предмет нельзя приготовить.', 'fire-out': 'Сначала разожгите костёр.', 'cooking-busy': 'На костре уже готовится еда.',
    };
    const recipe = stack && isCookable(stack.itemId) ? COOKING_RECIPES[stack.itemId] : null;
    this.feedback = { kind: result.accepted ? 'info' : 'blocked', text: result.accepted && recipe ? 'Готовится: ' + ITEM_DEFINITIONS[recipe.output].label + ' · ' + recipe.seconds + ' с горения' : messages[result.reason!] ?? 'Не удалось начать готовку.', at: now };
    return result;
  }

  collectCooked(player: PlayerSnapshot, now: number): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const output = this.campfire.snapshot(player, false).cooking?.outputItemId;
    const result = this.campfire.collectCooked(this.inventory, player, this.visibility);
    const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
      'out-of-range': 'Подойдите к костру.', blocked: 'Костёр закрыт препятствием.', 'nothing-cooked': 'Еда ещё не готова.', 'inventory-full': 'Нет места в рюкзаке. Еда остаётся на костре.',
    };
    this.feedback = { kind: result.accepted ? 'pickup' : 'blocked', text: result.accepted && output ? '+1 · ' + ITEM_DEFINITIONS[output].label : messages[result.reason!] ?? 'Не удалось забрать еду.', at: now };
    return result;
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

  transfer(direction: 'deposit' | 'withdraw', slot: number, expectedItemId: string, player: PlayerSnapshot, now: number, storageId: string = CAMP_STORAGE.id): CommandResult {
    if (this.attacks.isBusy(now)) return this.reject('busy', 'Дождитесь завершения удара.', now);
    const storage = storageId === CAMP_STORAGE.id ? this.storage : this.buildings.storage(storageId);
    if (!storage) return { accepted: false, reason: 'missing' };
    const result = storage.transfer(this.inventory, direction, slot, expectedItemId, player, this.visibility);
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
        const requiredTool = resource ? RESOURCE_DEFINITIONS[resource.definition.kind].tool : null;
        if (!result.applied && requiredTool && requiredTool !== attack.tool) this.feedback = { kind: 'blocked', text: 'Нужен инструмент: ' + ITEM_DEFINITIONS[requiredTool].label, at: now };
        if (result.applied) {
          this.lastHit = { targetId: target.id, at: now };
          this.feedback = { kind: 'hit', text: (resource ? RESOURCE_DEFINITIONS[resource.definition.kind].label : 'Манекен') + ': −' + attack.damage, at: now };
          if (result.defeated) {
            this.visibility.removeEntityCollider(target.id);
            if (resource) {
              this.spawnMaterials(resource.definition);
              this.feedback = { kind: 'info', text: resource.definition.kind === 'hare' ? 'Заяц добыт. Подберите мясо.' : RESOURCE_DEFINITIONS[resource.definition.kind].label + ': ресурс исчерпан. Подберите добычу.', at: now };
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
    if (this.interaction?.kind === 'campfire') {
      // Ready food is collected first; otherwise the selected item decides between cooking and fuel.
      if (this.campfire.cookedReady) return this.collectCooked(player, now);
      const stack = this.getSelectedItem();
      if (stack && isCookable(stack.itemId)) return this.cookItem(this.inventory.selectedSlot, stack.id, player, now);
      return stack ? this.fuelFire(this.inventory.selectedSlot, stack.id, player, now) : this.reject('wrong-fuel', 'Выберите древесину или уголь.', now);
    }
    if (this.interaction?.kind === 'bush') return this.gather(this.interaction.id, player, now);
    if (this.interaction?.kind === 'storage') {
      const storage = this.interaction.id === CAMP_STORAGE.id ? this.storage : this.buildings.storage(this.interaction.id);
      if (!storage?.canAccess(player, this.visibility)) return { accepted: false, reason: 'out-of-range' };
      this.currentStorage = storage;
      this.storageInReach = true;
      return { accepted: true };
    }
    if (this.interaction?.kind === 'workbench') return this.attacks.isBusy(now) ? this.reject('busy', 'Дождитесь завершения удара.', now) : this.workbench.access(player, this.visibility);
    return this.interaction?.kind === 'pickup' ? this.pickup(this.interaction.id, player, now) : { accepted: false, reason: 'missing' };
  }

  getSnapshot(now: number): GameplaySnapshot {
    const dummy: DummySnapshot = { id: TRAINING_DUMMY.id, position: { ...TRAINING_DUMMY.position }, health: this.dummy.currentHealth, maxHealth: this.dummy.maxHealth, dead: this.dummy.exhausted };
    return {
      inventory: this.inventory.snapshot(),
      storage: { id: this.currentStorage.definition.id, inventory: this.currentStorage.snapshot(), inReach: this.storageInReach },
      buildings: this.buildings.snapshot(),
      debugTools: this.debugTools,
      equippedItem: this.inventory.equippedItem,
      bag: { wood: this.inventory.count('wood'), capacity: this.inventory.capacityFor('wood') },
      bushes: this.foraging.snapshot(),
      campfire: this.campfire.snapshot(this.lastPlayer, this.campfireInReach),
      workbench: this.workbench.snapshot(this.workbenchInReach),
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
    this.lastPlayer = { ...player, position: { ...player.position } };
    this.campfireInReach = this.campfire.access(player, this.visibility).accepted;
    const storages = [this.storage, ...this.buildings.containers()];
    if (!this.currentStorage.canAccess(player, this.visibility)) {
      this.currentStorage = storages.filter((entry) => entry.canAccess(player, this.visibility)).sort((a, b) => Math.hypot(a.definition.position.x - player.position.x, a.definition.position.z - player.position.z) - Math.hypot(b.definition.position.x - player.position.x, b.definition.position.z - player.position.z))[0] ?? this.currentStorage;
    }
    this.storageInReach = this.currentStorage.canAccess(player, this.visibility);
    this.workbenchInReach = this.workbench.access(player, this.visibility).accepted;
    const item = selectTarget([...this.loot.values()].map((loot) => ({ id: loot.id, position: loot.position, radius: 0 })), origin, yaw, RESOURCE_CONFIG.pickupRange, Math.PI * 0.48, AXE_CONFIG.maxHeightDifference, this.visibility);
    if (item) {
      const stack = this.loot.get(item.id)!;
      this.interaction = { id: item.id, kind: 'pickup', label: 'Взять: ' + ITEM_DEFINITIONS[stack.itemId].label + ' ×' + stack.amount };
      return;
    }
    const bush = this.foraging.target(player, yaw, this.visibility);
    if (bush) { this.interaction = { id: bush.id, kind: 'bush', label: 'Собрать ягоды' }; return; }
    const storageTarget = selectTarget(storages.filter((entry) => entry.canAccess(player, this.visibility)).map((entry) => ({ id: entry.definition.id, position: entry.definition.position, radius: 0 })), origin, yaw, CAMP_STORAGE.range, AXE_CONFIG.halfAngle, 1.5, this.visibility);
    if (storageTarget) {
      this.interaction = { id: storageTarget.id, kind: 'storage', label: 'Открыть склад лагеря' };
      return;
    }
    const fire = CAMPFIRE_CONFIG;
    if (this.campfireInReach && selectTarget([{ id: fire.id, position: { ...fire.position, y: fire.position.y + fire.targetHeight }, radius: 0 }], origin, yaw, fire.range, AXE_CONFIG.halfAngle, 1.5, this.visibility)) {
      const snapshot = this.campfire.snapshot(player, true);
      const cooking = snapshot.cooking;
      const cookingLabel = !cooking ? '' : cooking.ready ? ' · готово: ' + ITEM_DEFINITIONS[cooking.outputItemId].label : ' · жарится ' + Math.ceil(cooking.durationSeconds - cooking.progressSeconds) + ' с';
      this.interaction = { id: fire.id, kind: 'campfire', label: 'Костёр · ур. ' + snapshot.level + (snapshot.lit ? ' · ' + Math.ceil(snapshot.fuelSeconds) + ' с' : ' · потух') + cookingLabel };
      return;
    }
    const bench = WORKBENCH_CONFIG;
    if (this.workbenchInReach && selectTarget([{ id: bench.id, position: bench.position, radius: 0 }], origin, yaw, bench.range, AXE_CONFIG.halfAngle, 1.5, this.visibility)) {
      this.interaction = { id: bench.id, kind: 'workbench', label: this.workbench.snapshot(true).built ? 'Открыть верстак' : 'Построить верстак' };
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
