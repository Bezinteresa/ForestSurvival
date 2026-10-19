<script setup lang="ts">
import type { VitalsSnapshot } from '@forest-survival/shared';
defineProps<{ vitals: VitalsSnapshot }>();
</script>

<template>
  <div class="player-status" aria-label="Состояние персонажа">
    <label>Здоровье <strong>{{ Math.ceil(vitals.health) }} / {{ vitals.maxHealth }}</strong><progress :value="vitals.health" :max="vitals.maxHealth" /></label>
    <label :class="{ starving: vitals.hunger <= 0 }">{{ vitals.hunger <= 0 ? 'Голод' : 'Сытость' }} <strong>{{ Math.ceil(vitals.hunger) }} / {{ vitals.maxHunger }}</strong><progress :value="vitals.hunger" :max="vitals.maxHunger" /></label>
  </div>
</template>
