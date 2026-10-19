<script setup lang="ts">
import type { CampfireSnapshot, ItemStack } from '@forest-survival/shared';
defineProps<{ campfire: CampfireSnapshot; selected: ItemStack | null | undefined; moving: boolean }>();
const emit = defineEmits<{ fuel: [] }>();
</script>

<template>
  <section class="storage-section" aria-labelledby="campfire-title">
    <h3 id="campfire-title">Костёр · {{ campfire.lit ? 'горит' : 'потух' }}</h3>
    <p class="inventory-help">Топливо: {{ Math.ceil(campfire.fuelSeconds) }} / {{ campfire.maxFuelSeconds }} с. {{ !campfire.lit ? 'Зона отключена.' : campfire.playerInside ? 'Вы внутри зоны костра.' : 'Вы вне зоны костра.' }}</p>
    <progress class="campfire-fuel" :value="campfire.fuelSeconds" :max="campfire.maxFuelSeconds" aria-label="Топливо костра" />
    <p class="inventory-help">Одна древесина добавляет {{ campfire.secondsPerWood }} секунд. {{ campfire.inReach ? 'Выберите древесину в рюкзаке.' : 'Подойдите к костру, чтобы добавить топливо.' }}</p>
    <button class="button primary" :disabled="moving || !campfire.inReach || selected?.itemId !== 'wood'" @click="emit('fuel')">В костёр · 1 древесина</button>
  </section>
</template>
