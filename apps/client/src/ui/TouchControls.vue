<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import type { InputAction, InputState } from '../game/input/InputState';

const props = defineProps<{ input: InputState; enabled: boolean; cameraLocked: boolean; canInteract: boolean; interactionLabel: string }>();
const emit = defineEmits<{ cameraLock: []; zoom: [steps: number] }>();
const knob = ref({ x: 0, y: 0 });
const sprinting = ref(false);
let stickPointer: number | undefined;
let lookPointer: number | undefined;
let lookPosition = { x: 0, y: 0 };
let stickCenter = { x: 0, y: 0 };
const actionPointers = new Map<number, InputAction>();

function stickDown(event: PointerEvent): void {
  if (!props.enabled || stickPointer !== undefined) return;
  const element = event.currentTarget as HTMLElement;
  const rect = element.getBoundingClientRect();
  stickCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  stickPointer = event.pointerId;
  element.setPointerCapture(event.pointerId);
  stickMove(event);
}

function stickMove(event: PointerEvent): void {
  if (event.pointerId !== stickPointer) return;
  const x = event.clientX - stickCenter.x, y = event.clientY - stickCenter.y;
  const length = Math.hypot(x, y);
  const factor = length > 40 ? 40 / length : 1;
  knob.value = { x: x * factor, y: y * factor };
  const strength = Math.max(0, (Math.min(1, length / 40) - 0.12) / 0.88);
  props.input.setMove('touch-stick', length ? x / length * strength : 0, length ? -y / length * strength : 0);
}

function stickEnd(event: PointerEvent): void {
  if (event.pointerId !== stickPointer) return;
  stickPointer = undefined;
  knob.value = { x: 0, y: 0 };
  props.input.clearSource('touch-stick');
}

function lookDown(event: PointerEvent): void {
  if (!props.enabled || lookPointer !== undefined) return;
  lookPointer = event.pointerId;
  lookPosition = { x: event.clientX, y: event.clientY };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function lookMove(event: PointerEvent): void {
  if (event.pointerId !== lookPointer) return;
  props.input.addLook(event.clientX - lookPosition.x, event.clientY - lookPosition.y, 'touch');
  lookPosition = { x: event.clientX, y: event.clientY };
}

function lookEnd(event: PointerEvent): void {
  if (event.pointerId === lookPointer) lookPointer = undefined;
}

function actionDown(action: InputAction, event: PointerEvent): void {
  if (!props.enabled) return;
  actionPointers.set(event.pointerId, action);
  props.input.setHeld(action, 'touch-action-' + event.pointerId, true);
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function actionEnd(event: PointerEvent): void {
  actionPointers.delete(event.pointerId);
  props.input.clearSource('touch-action-' + event.pointerId);
}

function keyboardAction(action: InputAction, event: MouseEvent): void {
  if (!props.enabled || event.detail !== 0) return;
  props.input.setHeld(action, 'accessible-touch', true);
  props.input.setHeld(action, 'accessible-touch', false);
}

function cancelAll(): void { props.input.clear(); clear(); }

function toggleSprint(): void {
  if (!props.enabled) return;
  sprinting.value = !sprinting.value;
  props.input.setHeld('Sprint', 'touch-sprint', sprinting.value);
}

function clear(): void {
  props.input.clearSource('touch-stick');
  props.input.clearSource('touch-sprint');
  for (const pointer of actionPointers.keys()) props.input.clearSource('touch-action-' + pointer);
  actionPointers.clear();
  stickPointer = undefined;
  lookPointer = undefined;
  knob.value = { x: 0, y: 0 };
  sprinting.value = false;
}

watch(() => props.enabled, (enabled) => { if (!enabled) clear(); });
onBeforeUnmount(clear);
</script>

<template>
  <div v-if="enabled" class="touch-controls" aria-label="Сенсорное управление">
    <div class="touch-look" aria-label="Область обзора"
      @pointerdown.stop.prevent="lookDown" @pointermove.stop.prevent="lookMove"
      @pointerup.stop="lookEnd" @pointercancel.stop="cancelAll" @lostpointercapture="lookEnd" />
    <div class="touch-stick" aria-label="Стик движения"
      @pointerdown.stop.prevent="stickDown" @pointermove.stop.prevent="stickMove"
      @pointerup.stop="stickEnd" @pointercancel.stop="cancelAll" @lostpointercapture="stickEnd">
      <span :style="{ transform: 'translate(' + knob.x + 'px, ' + knob.y + 'px)' }" />
    </div>
    <div class="touch-actions" data-ui>
      <button class="touch-button attack" @pointerdown.stop.prevent="actionDown('Primary', $event)" @pointerup.stop="actionEnd" @pointercancel.stop="cancelAll" @lostpointercapture="actionEnd" @click="keyboardAction('Primary', $event)">Удар</button>
      <button class="touch-button" :disabled="!canInteract" @pointerdown.stop.prevent="actionDown('Interact', $event)" @pointerup.stop="actionEnd" @pointercancel.stop="cancelAll" @lostpointercapture="actionEnd" @click="keyboardAction('Interact', $event)">{{ interactionLabel }}</button>
      <button class="touch-button" :class="{ selected: sprinting }" :aria-pressed="sprinting" @pointerdown.prevent @click="toggleSprint">Бег</button>
      <button class="touch-button jump" @pointerdown.stop.prevent="actionDown('Jump', $event)" @pointerup.stop="actionEnd" @pointercancel.stop="cancelAll" @lostpointercapture="actionEnd" @click="keyboardAction('Jump', $event)">Прыжок</button>
    </div>
    <div class="touch-camera" data-ui>
      <button class="touch-button small" :class="{ selected: cameraLocked }" :aria-pressed="cameraLocked" @pointerdown.prevent @click="emit('cameraLock')">Фикс.</button>
      <button class="touch-button small" aria-label="Приблизить камеру" @pointerdown.prevent @click="emit('zoom', -1)">+</button>
      <button class="touch-button small" aria-label="Отдалить камеру" @pointerdown.prevent @click="emit('zoom', 1)">−</button>
    </div>
  </div>
</template>
