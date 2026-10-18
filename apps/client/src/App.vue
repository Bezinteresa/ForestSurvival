<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue';
import type { SessionSnapshot } from '@forest-survival/shared';
import type { Game } from './game/core/Game';
import type { InputState } from './game/input/InputState';
import type { ControlStatus } from './game/input/BrowserInput';
import { loadControlSettings, saveControlSettings, sanitizeControlSettings, type ControlSettings } from './game/input/ControlSettings';
import TouchControls from './ui/TouchControls.vue';

const host = useTemplateRef<HTMLDivElement>('scene');
const snapshot = shallowRef<SessionSnapshot>();
const loading = ref(false);
const error = ref('');
const showDebug = ref(false);
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
    }, controller.signal, { settings: settings.value, onStatus: (status) => { if (!disposed && ownGeneration === generation) controls.value = status; } });
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

function equip(itemId: 'axe' | 'none'): void {
  game?.sendCommand({ type: 'equip-item', itemId, requestId: 'ui-' + (++requestNumber) });
}

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
      <div class="header-actions" data-ui><span class="mode-badge"><span aria-hidden="true" />Одиночная сцена</span><button v-if="active && !paused" class="button secondary" @click="togglePause">Меню</button></div>
    </header>

    <section v-if="!active" class="welcome-panel" aria-labelledby="welcome-title">
      <p class="eyebrow">ПЕРВЫЙ ШАГ В ЛЕС</p>
      <h1 id="welcome-title">Всё начинается<br />с поляны.</h1>
      <p class="intro">Основа будущего выживания: персонаж, деревья и препятствия на небольшой тестовой площадке.</p>
      <p class="scope-note">Подойдите к дереву, нанесите несколько ударов топором и подберите древесину. На телефоне доступны стик и экранные кнопки.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button primary" :disabled="loading" @click="start">{{ loading ? 'Подготавливаем поляну…' : error ? 'Попробовать снова' : 'Открыть поляну' }}<span aria-hidden="true">↗</span></button>
      <p class="footnote">Локальная сессия · без подключения к серверу</p>
    </section>

    <div v-if="active && !paused" class="play-readings"><span>{{ elapsed }}</span><span>{{ snapshot?.player.grounded ? 'На земле' : 'В воздухе' }}</span><span>{{ controls.firstPerson ? 'Первое лицо' : controls.cameraLocked ? 'Камера фиксирована' : 'Третье лицо' }}</span></div>
    <div v-if="active && !paused" class="crosshair" aria-hidden="true">+</div>
    <p v-if="active && !paused && controls.message" class="control-message" role="status">{{ controls.message }}</p>
    <div v-if="active && !paused && gameplay" class="resource-count">Древесина <strong>{{ gameplay.bag.wood }} / {{ gameplay.bag.capacity }}</strong></div>
    <div v-if="active && !paused && gameplay?.interaction" class="target-hint">
      <strong>{{ gameplay.interaction.label }}</strong>
      <template v-if="gameplay.interaction.health !== undefined"><span>{{ gameplay.interaction.health }} / {{ gameplay.interaction.maxHealth }}</span><progress :value="gameplay.interaction.health" :max="gameplay.interaction.maxHealth" /></template>
      <span>{{ gameplay.interaction.kind === 'pickup' ? 'E / кнопка «Взять»' : 'ЛКМ / кнопка «Удар»' }}</span>
    </div>
    <p v-if="active && !paused && feedback" class="game-feedback" role="status">{{ feedback }}</p>
    <div v-if="active && !paused && gameplay" class="equipment-bar" data-ui>
      <button :class="{ selected: gameplay.equippedItem === 'axe' }" :aria-pressed="gameplay.equippedItem === 'axe'" @click="equip('axe')">1 · Топор</button>
      <button :class="{ selected: gameplay.equippedItem === 'none' }" :aria-pressed="gameplay.equippedItem === 'none'" @click="equip('none')">2 · Пустые руки</button>
      <progress v-if="gameplay.attack.phase !== 'idle'" :value="gameplay.attack.progress" max="1" aria-label="Восстановление после удара" />
    </div>
    <TouchControls v-if="active && currentInput" :input="currentInput" :enabled="!paused" :camera-locked="controls.cameraLocked" :can-interact="gameplay?.interaction?.kind === 'pickup'" @camera-lock="game?.toggleCameraLock(false)" @zoom="game?.zoom($event)" />
    <div v-if="active && paused" class="pause-backdrop" />
    <section v-if="active && paused" class="scene-panel" aria-label="Меню паузы" data-ui>
      <p class="eyebrow">ТЕСТОВАЯ ПОЛЯНА</p>
      <h1>Лесная площадка</h1>
      <p class="panel-description">WASD — движение · Space — прыжок · Ctrl — бег · Shift — фиксация камеры · ПКМ — обзор · колесо — приближение. ЛКМ — удар, E — подбор, 1/2 — топор или пустые руки.</p>
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

    <footer class="bottom-note"><span class="status-dot" aria-hidden="true" />{{ loading ? 'Загрузка 3D и физики' : active ? paused ? 'Сцена приостановлена' : 'Сцена запущена' : 'Готово к запуску' }}</footer>
  </main>
</template>
