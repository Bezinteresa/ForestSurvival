<script setup lang="ts">
import { computed } from 'vue';
import type { WorldClockSnapshot } from '@forest-survival/shared';
const props = defineProps<{ clock: WorldClockSnapshot; speed: number }>();
const remaining = computed(() => {
  const seconds = Math.max(0, Math.ceil(props.clock.secondsRemaining - 1e-7));
  return String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
});
</script>

<template>
  <div class="play-readings world-clock-hud" aria-label="Сутки и прогресс забега">
    <span><strong>{{ clock.phase === 'day' ? 'День' : 'Ночь' }} {{ clock.cycleNumber }}</strong> · {{ clock.phase === 'day' ? 'до ночи' : 'до рассвета' }} {{ remaining }}</span>
    <span>Ночей {{ clock.physicalCycles }} · зачтено {{ clock.creditedDays }} · x{{ clock.dayMultiplier }}<b v-if="speed > 1" class="diagnostic-speed"> · тест x{{ speed }}</b></span>
  </div>
</template>
