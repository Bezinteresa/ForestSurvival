<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue';
import { itemLabel, isFood, type CampfireLevel, type CommandResult, type SessionSnapshot } from '@forest-survival/shared';
import type { Game } from './game/core/Game';
import type { InputState } from './game/input/InputState';
import type { ControlStatus } from './game/input/BrowserInput';
import { loadControlSettings, saveControlSettings, sanitizeControlSettings, type ControlSettings } from './game/input/ControlSettings';
import TouchControls from './ui/TouchControls.vue';
import InventoryPanel from './ui/InventoryPanel.vue';
import PlayerStatus from './ui/PlayerStatus.vue';
import RunResult from './ui/RunResult.vue';

const host = useTemplateRef<HTMLDivElement>('scene');
const snapshot = shallowRef<SessionSnapshot>();
const loading = ref(false);
const error = ref('');
const showDebug = ref(false);
const inventoryOpen = ref(false);
const inventoryNote = ref('');
const currentInput = shallowRef<InputState>();
const controls = shallowRef<ControlStatus>({ cameraLocked: false, firstPerson: false, pointerLocked: false, message: '' });
function settingsStorage(): Storage | undefined { try { return window.localStorage; } catch { return undefined; } }
const settings = shallowRef<ControlSettings>(loadControlSettings(settingsStorage()));
const settingsNote = ref('');
let game: Game | undefined;
let pendingStart: AbortController | undefined;
let generation = 0;
let disposed = false;
let requestNumber = 0;

const active = computed(() => !!snapshot.value && snapshot.value.status !== 'stopped');
const gameplay = computed(() => snapshot.value?.gameplay);
const feedback = computed(() => {
  const message = gameplay.value?.feedback;
  return message && (snapshot.value?.simulationTime ?? 0) - message.at < 1.6 ? message.text : '';
});
const materials = computed(() => {
  const totals = { wood: 0, stone: 0, scrap: 0 };
  for (const stack of gameplay.value?.inventory.slots ?? []) if (stack && (stack.itemId === 'wood' || stack.itemId === 'stone' || stack.itemId === 'scrap')) totals[stack.itemId] += stack.amount;
  return totals;
});
const ended = computed(() => snapshot.value?.status === 'ended');
const interactionLabel = computed(() => { const kind = gameplay.value?.interaction?.kind; return kind === 'storage' ? 'Склад' : kind === 'bush' ? 'Собрать' : kind === 'campfire' ? 'Топливо' : 'Взять'; });
const canInteract = computed(() => ['pickup', 'storage', 'bush', 'campfire'].includes(gameplay.value?.interaction?.kind ?? ''));
const foodInHand = computed(() => { const inventory = gameplay.value?.inventory; const stack = inventory?.slots[inventory.activeSlot]; return !!stack && isFood(stack.itemId); });
const canPlay = computed(() => active.value && !paused.value && !ended.value);
const paused = computed(() => snapshot.value?.status === 'paused');
const elapsed = computed(() => {
  const seconds = Math.floor(snapshot.value?.simulationTime ?? 0);
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
});

function stop(): void {
  generation++;
  pendingStart?.abort();
  pendingStart = undefined;
  game?.destroy();
  game = undefined;
  inventoryOpen.value = false;
  currentInput.value = undefined;
  snapshot.value = undefined;
  loading.value = false;
}

function fail(cause: unknown): void {
  stop();
  error.value = cause instanceof Error ? cause.message : 'Не удалось запустить сцену. Попробуйте ещё раз.';
}

async function start(): Promise<void> {
  stop();
  error.value = '';
  showDebug.value = false;
  loading.value = true;
  const ownGeneration = generation;
  const controller = new AbortController();
  pendingStart = controller;
  try {
    const { Game: GameClass } = await import('./game/core/Game');
    if (controller.signal.aborted || disposed || !host.value) return;
    const next = await GameClass.create(host.value, (state) => {
      if (!disposed && ownGeneration === generation) snapshot.value = state;
    }, (cause) => {
      if (!disposed && ownGeneration === generation) fail(cause);
    }, controller.signal, {
      settings: settings.value,
      onStatus: (status) => { if (!disposed && ownGeneration === generation) controls.value = status; },
      onInventoryChange: (open) => {
        if (disposed || ownGeneration !== generation) return;
        inventoryOpen.value = open;
        inventoryNote.value = '';
        if (!open) void nextTick(() => { if (!disposed && ownGeneration === generation) game?.focusControls(); });
      },
    });
    if (controller.signal.aborted || disposed || ownGeneration !== generation) {
      next.destroy();
      return;
    }
    game = next;
    currentInput.value = next.input;
    loading.value = false;
    pendingStart = undefined;
    next.start();
  } catch (cause) {
    if (!controller.signal.aborted && !disposed && ownGeneration === generation) fail(cause);
  }
}

function togglePause(): void {
  if (paused.value) game?.start();
  else game?.pause();
}

function toggleDebug(event: Event): void {
  showDebug.value = (event.target as HTMLInputElement).checked;
  game?.setDebug(showDebug.value);
}

function resetPosition(): void {
  game?.sendCommand({ type: 'reset-player', requestId: 'reset-' + (++requestNumber) });
}

function reportInventory(result?: CommandResult): void {
  const messages: Partial<Record<NonNullable<CommandResult['reason']>, string>> = {
    busy: 'Дождитесь завершения удара.',
    'inventory-full': 'Нет места для всего стека.',
    blocked: 'Нет места для выброса. Встаньте на землю и отойдите от препятствия.',
    'out-of-range': 'Подойдите ближе к месту взаимодействия.',
    stale: 'Слот изменился. Выберите предмет заново.',
    forbidden: 'Режим разработки отключён.',
    satiated: 'Вы уже сыты. Еда сохранена.',
    dead: 'Забег завершён.',
    'fire-full': 'Нет места для всей порции топлива. Древесина сохранена.',
    'wrong-fuel': 'Для костра нужна древесина.',
    'fire-out': 'Сначала разожгите костёр.',
    'max-level': 'Достигнут максимальный уровень костра.',
    'insufficient-materials': 'Не хватает материалов в рюкзаке.',
  };
  inventoryNote.value = result?.accepted ? 'Готово.' : result?.reason ? messages[result.reason] ?? 'Операция недоступна.' : 'Операция недоступна.';
}

function selectSlot(slot: number): void { reportInventory(game?.sendCommand({ type: 'select-slot', slot, requestId: 'ui-' + (++requestNumber) })); }
function moveItem(from: number, to: number): void { reportInventory(game?.sendCommand({ type: 'move-item', from, to, requestId: 'ui-' + (++requestNumber) })); }
function dropItem(slot: number): void {
  const cameraYaw = game?.camera.cameraYaw ?? 0;
  reportInventory(game?.sendCommand({ type: 'drop-item', slot, yaw: Math.atan2(Math.sin(cameraYaw), -Math.cos(cameraYaw)), requestId: 'ui-' + (++requestNumber) }));
}

function transferItem(direction: 'deposit' | 'withdraw', slot: number): void {
  const container = direction === 'deposit' ? gameplay.value?.inventory : gameplay.value?.storage.inventory;
  const stack = container?.slots[slot];
  if (stack) reportInventory(game?.sendCommand({ type: 'transfer-item', direction, slot, expectedItemId: stack.id, requestId: 'ui-' + (++requestNumber) }));
}
function consumeItem(slot: number): void {
  const stack = gameplay.value?.inventory.slots[slot];
  if (stack) reportInventory(game?.sendCommand({ type: 'consume-item', slot, expectedItemId: stack.id, requestId: 'ui-' + (++requestNumber) }));
}
function fuelFire(slot: number): void {
  const stack = gameplay.value?.inventory.slots[slot];
  if (!stack) return;
  const result = game?.sendCommand({ type: 'fuel-fire', slot, expectedItemId: stack.id, requestId: 'ui-' + (++requestNumber) });
  reportInventory(result);
  if (result?.reason === 'blocked') inventoryNote.value = 'Костёр закрыт препятствием.';
  if (result?.reason === 'out-of-range') inventoryNote.value = 'Подойдите к костру.';
}
function upgradeFire(expectedLevel: CampfireLevel): void {
  const result = game?.sendCommand({ type: 'upgrade-fire', expectedLevel, requestId: 'ui-' + (++requestNumber) });
  reportInventory(result);
  if (result?.reason === 'blocked') inventoryNote.value = 'Костёр закрыт препятствием.';
  if (result?.reason === 'out-of-range') inventoryNote.value = 'Подойдите к костру.';
  if (result?.reason === 'stale') inventoryNote.value = 'Уровень костра изменился. Проверьте новое улучшение.';
}
function debugUpgrade(target: 'tool' | 'backpack', slot: number): void { reportInventory(game?.sendCommand({ type: 'debug-upgrade', target, slot, level: 2, requestId: 'ui-' + (++requestNumber) })); }

function changeSensitivity(key: 'mouseSensitivity' | 'touchSensitivity', event: Event): void {
  updateSettings({ ...settings.value, [key]: (event.target as HTMLInputElement).valueAsNumber });
}

function updateSettings(value: ControlSettings): void {
  settings.value = sanitizeControlSettings(value);
  game?.setSettings(settings.value);
  settingsNote.value = saveControlSettings(settingsStorage(), settings.value) ? 'Настройки сохранены.' : 'Настройки применены. Сохранение в этом браузере недоступно.';
}

onBeforeUnmount(() => { disposed = true; stop(); });
</script>

<template>
  <main class="prototype" :class="{ playing: active }">
    <div ref="scene" class="scene" />
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">▲</span><div><strong>FOREST SURVIVAL</strong><span>Ранний прототип</span></div></div>
      <div class="header-actions" data-ui><span class="mode-badge"><span aria-hidden="true" />Одиночная сцена</span><button v-if="canPlay" class="button secondary" @click="game?.toggleInventory()">Рюкзак</button><button v-if="canPlay" class="button secondary" @click="togglePause">Меню</button></div>
    </header>

    <section v-if="!active" class="welcome-panel" aria-labelledby="welcome-title">
      <p class="eyebrow">ПЕРВЫЙ ШАГ В ЛЕС</p>
      <h1 id="welcome-title">Всё начинается<br />с поляны.</h1>
      <p class="intro">Основа будущего выживания: персонаж, деревья и препятствия на небольшой тестовой площадке.</p>
      <p class="scope-note">Подойдите к дереву, нанесите несколько ударов топором и подберите древесину. Собирайте ягоды, утоляйте голод и поддерживайте костёр древесиной. На телефоне доступны стик и экранные кнопки.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button primary" :disabled="loading" @click="start">{{ loading ? 'Подготавливаем поляну…' : error ? 'Попробовать снова' : 'Открыть поляну' }}<span aria-hidden="true">↗</span></button>
      <p class="footnote">Локальная сессия · без подключения к серверу</p>
    </section>

    <div v-if="canPlay" class="play-readings"><span>{{ elapsed }}</span><span>{{ snapshot?.player.grounded ? 'На земле' : 'В воздухе' }}</span><span>{{ controls.firstPerson ? 'Первое лицо' : controls.cameraLocked ? 'Камера фиксирована' : 'Третье лицо' }}</span></div>
    <div v-if="canPlay && !inventoryOpen" class="crosshair" aria-hidden="true">+</div>
    <p v-if="canPlay && controls.message" class="control-message" role="status">{{ controls.message }}</p>
    <div v-if="canPlay && gameplay" class="resource-count">Ресурсы <strong>{{ materials.wood }} дер. · {{ materials.stone }} кам. · {{ materials.scrap }} мет.</strong><span>Слоты {{ gameplay.inventory.slots.filter(Boolean).length }} / {{ gameplay.inventory.slots.length }}</span></div>
    <div v-if="canPlay && !inventoryOpen && gameplay?.interaction" class="target-hint">
      <strong>{{ gameplay.interaction.label }}</strong>
      <template v-if="gameplay.interaction.health !== undefined"><span>{{ gameplay.interaction.health }} / {{ gameplay.interaction.maxHealth }}</span><progress :value="gameplay.interaction.health" :max="gameplay.interaction.maxHealth" /></template>
      <span>{{ gameplay.interaction.kind === 'campfire' ? 'E / «Топливо» · 1 древесина' : gameplay.interaction.kind === 'storage' ? 'E / кнопка «Склад»' : gameplay.interaction.kind === 'bush' ? 'E / кнопка «Собрать»' : gameplay.interaction.kind === 'pickup' ? 'E / кнопка «Взять»' : 'ЛКМ / кнопка «Удар»' }}</span>
    </div>
    <p v-if="canPlay && feedback" class="game-feedback" role="status">{{ feedback }}</p>
    <div v-if="canPlay && !inventoryOpen && gameplay" class="equipment-bar" data-ui>
      <button v-for="(item, slot) in gameplay.inventory.slots.slice(0, 5)" :key="slot" :class="{ selected: gameplay.inventory.activeSlot === slot }" :aria-pressed="gameplay.inventory.activeSlot === slot" @pointerdown.prevent @click="selectSlot(slot)"><span>{{ slot + 1 }}</span><strong>{{ item ? itemLabel(item) : 'Пусто' }}</strong><span v-if="item">×{{ item.amount }}</span></button>
      <progress v-if="gameplay.attack.phase !== 'idle'" :value="gameplay.attack.progress" max="1" aria-label="Восстановление после удара" />
    </div>
    <TouchControls v-if="active && currentInput" :input="currentInput" :enabled="canPlay && !inventoryOpen" :camera-locked="controls.cameraLocked" :can-interact="canInteract" :interaction-label="interactionLabel" :primary-label="foodInHand ? 'Есть' : 'Удар'" @camera-lock="game?.toggleCameraLock(false)" @zoom="game?.zoom($event)" />
    <InventoryPanel v-if="canPlay && inventoryOpen && gameplay" :inventory="gameplay.inventory" :storage="gameplay.storage" :campfire="gameplay.campfire" :debug-tools="gameplay.debugTools" :note="inventoryNote" @close="game?.closeInventory()" @select-slot="selectSlot" @move-item="moveItem" @drop-item="dropItem" @consume-item="consumeItem" @fuel-fire="fuelFire" @upgrade-fire="upgradeFire" @transfer-item="transferItem" @debug-upgrade="debugUpgrade" />
    <PlayerStatus v-if="canPlay && snapshot" :vitals="snapshot.vitals" />
    <RunResult v-if="ended && snapshot" :vitals="snapshot.vitals" :elapsed="elapsed" @restart="start" @leave="stop" />
    <div v-if="active && paused" class="pause-backdrop" />
    <section v-if="active && paused" class="scene-panel" aria-label="Меню паузы" data-ui>
      <p class="eyebrow">ТЕСТОВАЯ ПОЛЯНА</p>
      <h1>Лесная площадка</h1>
      <p class="panel-description">WASD — движение · Space — прыжок · Ctrl — бег · Shift — фиксация камеры · ПКМ — обзор · колесо — приближение. ЛКМ — предмет, E — подбор/сбор/топливо, 1–5 — слот, Tab — рюкзак, G — выбросить стек.</p>
      <div class="readings">
        <div><span>Время сцены</span><strong>{{ elapsed }}</strong></div>
        <div><span>Персонаж</span><strong>{{ snapshot?.player.grounded ? 'На земле' : 'В воздухе' }}</strong></div>
      </div>
      <p v-if="paused" class="pause-note" role="status">Пауза. Можно продолжить с того же места.</p>
      <div class="actions"><button class="button primary" @click="togglePause">{{ paused ? 'Продолжить' : 'Пауза' }}</button><button class="button secondary" @click="start">Заново</button></div>
      <details class="settings-panel">
        <summary>Настройки управления</summary>
        <label>Чувствительность мыши<input type="range" min="0.0005" max="0.01" step="0.00025" :value="settings.mouseSensitivity" @input="changeSensitivity('mouseSensitivity', $event)" /></label>
        <label>Чувствительность касаний<input type="range" min="0.0005" max="0.01" step="0.00025" :value="settings.touchSensitivity" @input="changeSensitivity('touchSensitivity', $event)" /></label>
        <label class="checkbox-label"><input type="checkbox" :checked="settings.invertY" @change="updateSettings({ ...settings, invertY: ($event.target as HTMLInputElement).checked })" />Инверсия вертикального обзора</label>
        <p v-if="settingsNote" role="status">{{ settingsNote }}</p>
      </details>
      <details class="diagnostics">
        <summary>Проверка сцены</summary>
        <label><input type="checkbox" :checked="showDebug" @change="toggleDebug" />Показывать коллайдеры</label>
        <button class="text-button" @click="resetPosition">Сбросить позицию персонажа</button>
      </details>
      <button class="text-button leave" @click="stop">Завершить сцену</button>
    </section>

    <footer class="bottom-note"><span class="status-dot" aria-hidden="true" />{{ loading ? 'Загрузка 3D и физики' : active ? ended ? 'Забег завершён' : paused ? 'Сцена приостановлена' : 'Сцена запущена' : 'Готово к запуску' }}</footer>
  </main>
</template>
