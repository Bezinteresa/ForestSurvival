<script setup lang="ts">
import type { VitalsSnapshot } from '@forest-survival/shared';
defineProps<{ vitals: VitalsSnapshot }>();
</script>

<template>
  <div class="player-status" aria-label="Состояние персонажа">
    <label>Здоровье <strong>{{ Math.ceil(vitals.health) }} / {{ vitals.maxHealth }}</strong><progress :value="vitals.health" :max="vitals.maxHealth" /></label>
    <label :class="{ starving: vitals.hunger <= 0 }">{{ vitals.hunger <= 0 ? 'Голод' : 'Сытость' }} <strong>{{ Math.ceil(vitals.hunger) }} / {{ vitals.maxHunger }}</strong><progress :value="vitals.hunger" :max="vitals.maxHunger" /></label>
    <p v-if="vitals.cold.exposed" class="cold-status" :class="{ freezing: vitals.cold.freezing }" role="status">{{ vitals.cold.freezing ? 'Замерзание · −' + vitals.cold.damagePerSecond + ' HP/с' : 'Холод · до урона ' + Math.ceil(Math.max(0, vitals.cold.graceSeconds - vitals.cold.exposureSeconds)) + ' с' }}. Вернитесь в зону горящего костра.</p>
  </div>
</template>

<style scoped>
.cold-status { grid-column: 1 / -1; margin: 0.2rem 0 0; max-width: 28rem; font-size: 0.8rem; line-height: 1.3; color: #abd8f6; }
.cold-status.freezing { color: #ffb4a8; }
</style>
