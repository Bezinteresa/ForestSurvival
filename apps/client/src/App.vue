<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue';
import type { SessionSnapshot } from '@forest-survival/shared';
import type { Game } from './game/core/Game';

const host = useTemplateRef<HTMLDivElement>('scene');
const snapshot = shallowRef<SessionSnapshot>();
const loading = ref(false);
const error = ref('');
const showDebug = ref(false);
let game: Game | undefined;
let pendingStart: AbortController | undefined;
let generation = 0;
let disposed = false;
let requestNumber = 0;

const active = computed(() => !!snapshot.value && snapshot.value.status !== 'stopped');
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
    }, controller.signal);
    if (controller.signal.aborted || disposed || ownGeneration !== generation) {
      next.destroy();
      return;
    }
    game = next;
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

onBeforeUnmount(() => { disposed = true; stop(); });
</script>

<template>
  <main class="prototype">
    <div ref="scene" class="scene" />
    <header class="topbar">
      <div class="brand"><span class="brand-mark" aria-hidden="true">▲</span><div><strong>FOREST SURVIVAL</strong><span>Ранний прототип</span></div></div>
      <span class="mode-badge"><span aria-hidden="true" />Одиночная сцена</span>
    </header>

    <section v-if="!active" class="welcome-panel" aria-labelledby="welcome-title">
      <p class="eyebrow">ПЕРВЫЙ ШАГ В ЛЕС</p>
      <h1 id="welcome-title">Всё начинается<br />с поляны.</h1>
      <p class="intro">Основа будущего выживания: персонаж, деревья и препятствия на небольшой тестовой площадке.</p>
      <p class="scope-note">Передвижение и управление камерой появятся на следующем этапе.</p>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <button class="button primary" :disabled="loading" @click="start">{{ loading ? 'Подготавливаем поляну…' : error ? 'Попробовать снова' : 'Открыть поляну' }}<span aria-hidden="true">↗</span></button>
      <p class="footnote">Локальная сессия · без подключения к серверу</p>
    </section>

    <section v-if="active" class="scene-panel" aria-label="Управление тестовой сценой">
      <p class="eyebrow">ТЕСТОВАЯ ПОЛЯНА</p>
      <h1>Лесная площадка</h1>
      <p class="panel-description">Персонаж опускается на землю под действием гравитации. Деревья и стены имеют коллайдеры.</p>
      <div class="readings">
        <div><span>Время сцены</span><strong>{{ elapsed }}</strong></div>
        <div><span>Персонаж</span><strong>{{ snapshot?.player.grounded ? 'На земле' : 'В воздухе' }}</strong></div>
      </div>
      <p v-if="paused" class="pause-note" role="status">Пауза. Можно продолжить с того же места.</p>
      <div class="actions"><button class="button primary" @click="togglePause">{{ paused ? 'Продолжить' : 'Пауза' }}</button><button class="button secondary" @click="start">Заново</button></div>
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
