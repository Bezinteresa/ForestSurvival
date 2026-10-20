<script setup lang="ts">
import { computed } from 'vue';
import { BUILDING_DEFINITIONS, FARM_CONFIG, FARM_SITES, ITEM_DEFINITIONS, type FarmSnapshot, type InventorySnapshot, type ItemId } from '@forest-survival/shared';
const props = defineProps<{ farms: readonly FarmSnapshot[]; inventory: InventorySnapshot; moving: boolean }>();
const emit = defineEmits<{ plant: [farmId: string]; harvest: [farmId: string] }>();
const seedAvailable = computed(() => props.inventory.slots.some((item) => item?.itemId === 'carrot' && item.amount >= FARM_CONFIG.seedCost));
const definition = BUILDING_DEFINITIONS.farm;
const price = Object.entries(definition.cost).map(([itemId, amount]) => ITEM_DEFINITIONS[itemId as ItemId].label + ' ×' + amount).join(' + ');
</script>
<template>
  <section class="storage-section" aria-labelledby="farms-title">
    <h3 id="farms-title">Грядки</h3>
    <p class="inventory-help">Постройка: {{ price }}, верстак ур. {{ definition.minLevel }}. Посадка: морковь ×{{ FARM_CONFIG.seedCost }}. Через {{ FARM_CONFIG.growthSeconds }} игровых секунд — {{ FARM_CONFIG.harvestAmount }} морковки. После сбора посадите заново.</p>
    <p v-if="farms.length === 0" class="inventory-help">Выберите «Грядка» в постройках лагеря. Для двух грядок есть отдельные площадки.</p>
    <div v-for="farm in farms" :key="farm.id">
      <h4>Грядка {{ FARM_SITES.findIndex((site) => site.id === farm.siteId) + 1 }}</h4>
      <p class="inventory-help">{{ !farm.inReach ? 'Подойдите к этой грядке.' : '' }} {{ !farm.crop ? 'Пусто. Нужна морковь из рюкзака.' : farm.crop.ready ? 'Урожай готов. Освободите место для всех морковок.' : 'Растёт · осталось ' + Math.ceil(farm.crop.durationSeconds - farm.crop.progressSeconds) + ' с.' }}</p>
      <template v-if="farm.crop">
        <progress :value="farm.crop.progressSeconds" :max="farm.crop.durationSeconds" aria-label="Рост моркови" />
        <button class="button primary" :disabled="moving || !farm.inReach || !farm.crop.ready" @click="emit('harvest', farm.id)">Собрать · морковь ×{{ FARM_CONFIG.harvestAmount }}</button>
      </template>
      <button v-else class="button primary" :disabled="moving || !farm.inReach || !seedAvailable" @click="emit('plant', farm.id)">Посадить · морковь ×{{ FARM_CONFIG.seedCost }}</button>
    </div>
  </section>
</template>
