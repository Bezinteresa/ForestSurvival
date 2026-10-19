<script setup lang="ts">
import { onMounted, useTemplateRef } from 'vue';
import type { VitalsSnapshot } from '@forest-survival/shared';
defineProps<{ vitals: VitalsSnapshot; elapsed: string }>();
const emit = defineEmits<{ restart: []; leave: [] }>();
const restart = useTemplateRef<HTMLButtonElement>('restart');
onMounted(() => restart.value?.focus({ preventScroll: true }));
</script>

<template>
  <div class="run-result-backdrop">
    <section class="run-result" aria-labelledby="run-result-title" data-ui>
      <p class="eyebrow">ЗАБЕГ ЗАВЕРШЁН</p>
      <h1 id="run-result-title">Вы погибли</h1>
      <p>{{ vitals.deathReason === 'starvation' ? 'Здоровье закончилось из-за голода.' : 'Здоровье закончилось.' }}</p>
      <p>Время в лесу: <strong>{{ elapsed }}</strong></p>
      <div class="actions"><button ref="restart" class="button primary" @click="emit('restart')">Новый забег</button><button class="button secondary" @click="emit('leave')">В меню</button></div>
    </section>
  </div>
</template>
