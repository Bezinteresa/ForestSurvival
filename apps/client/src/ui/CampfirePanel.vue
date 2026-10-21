<script setup lang="ts">
import { computed } from 'vue';
import { CAMPFIRE_LEVELS, COOKING_RECIPES, FUEL_DEFINITIONS, ITEM_DEFINITIONS, SURVIVAL_CONFIG, isCookable, isFuel, type CampfireSnapshot, type InventorySnapshot, type ItemStack } from '@forest-survival/shared';
const props = defineProps<{ campfire: CampfireSnapshot; inventory: InventorySnapshot; selected: ItemStack | null | undefined; moving: boolean }>();
const emit = defineEmits<{ fuel: []; cook: []; collect: [] }>();
const cookable = computed(() => props.selected && isCookable(props.selected.itemId) ? { label: ITEM_DEFINITIONS[props.selected.itemId].label, output: ITEM_DEFINITIONS[COOKING_RECIPES[props.selected.itemId].output].label, seconds: COOKING_RECIPES[props.selected.itemId].seconds } : null);
const cooking = computed(() => props.campfire.cooking);
const nextLevel = computed(() => props.campfire.progressRequired === null ? null : CAMPFIRE_LEVELS[(props.campfire.level + 1) as keyof typeof CAMPFIRE_LEVELS]);
const fuel = computed(() => props.selected && isFuel(props.selected.itemId) ? { label: ITEM_DEFINITIONS[props.selected.itemId].label, seconds: FUEL_DEFINITIONS[props.selected.itemId].seconds, progress: FUEL_DEFINITIONS[props.selected.itemId].progress } : null);
const fuelFits = computed(() => fuel.value !== null && props.campfire.fuelSeconds + fuel.value.seconds <= props.campfire.maxFuelSeconds + 1e-9);
</script>

<template>
  <section class="storage-section" aria-labelledby="campfire-title">
    <h3 id="campfire-title">Костёр · ур. {{ campfire.level }} / {{ campfire.maxLevel }} · {{ campfire.lit ? 'горит' : 'потух' }}</h3>
    <p class="inventory-help">Топливо: {{ Math.ceil(campfire.fuelSeconds) }} / {{ campfire.maxFuelSeconds }} с. {{ !campfire.lit ? 'Зона отключена.' : campfire.playerInside ? 'Вы внутри зоны костра.' : 'Вы вне зоны костра.' }}</p>
    <progress class="campfire-fuel" :value="campfire.fuelSeconds" :max="campfire.maxFuelSeconds" aria-label="Топливо костра" />
    <div class="campfire-level">
      <h4>{{ nextLevel ? 'Сжечь топливо до 100% · уровень ' + (campfire.level + 1) : 'Максимальный уровень костра' }}</h4>
      <template v-if="nextLevel && campfire.progressRequired !== null">
        <progress :value="campfire.progress" :max="campfire.progressRequired" aria-label="Прогресс уровня костра" />
        <p class="inventory-help">{{ Math.round(100 * campfire.progress / campfire.progressRequired) }}% · древесина +{{ FUEL_DEFINITIONS.wood.progress }}, уголь +{{ FUEL_DEFINITIONS.coal.progress }} из {{ campfire.progressRequired }}. На 100%: тёплая зона {{ campfire.zoneRadius }} → {{ nextLevel.safeRadius }} м, карта ±{{ campfire.mapHalfSize }} → ±{{ nextLevel.mapHalfSize }} м.</p>
      </template>
      <p v-else class="inventory-help">Тёплая зона {{ campfire.zoneRadius }} м, вся карта открыта.</p>
    </div>
    <p class="inventory-help">Древесина: +{{ campfire.secondsPerWood }} с, уголь: +{{ campfire.secondsPerCoal }} с горения. {{ !campfire.inReach ? 'Подойдите к костру.' : !fuel ? 'Выберите древесину или уголь.' : !fuelFits ? 'Костёр полон: время горения не вырастет, но прогресс уровня засчитается.' : 'Расходуется один предмет.' }}</p>
    <button class="button primary" :disabled="moving || !campfire.inReach || !fuel" @click="emit('fuel')">{{ fuel ? 'В костёр · ' + fuel.label + ' ×1 (+' + fuel.seconds + ' с, +' + fuel.progress + ' к уровню)' : 'В костёр · выберите топливо' }}</button>
    <div class="campfire-cooking">
      <h4>Готовка</h4>
      <template v-if="cooking">
        <p class="inventory-help">{{ ITEM_DEFINITIONS[cooking.outputItemId].label }}: {{ cooking.ready ? 'готово, заберите.' : 'осталось ' + Math.ceil(cooking.durationSeconds - cooking.progressSeconds) + ' с горения.' }} {{ !cooking.ready && !campfire.lit ? 'Костёр потух — готовка стоит.' : '' }}</p>
        <progress :value="cooking.progressSeconds" :max="cooking.durationSeconds" aria-label="Готовка" />
        <button class="button primary" :disabled="moving || !campfire.inReach || !cooking.ready" @click="emit('collect')">Забрать · {{ ITEM_DEFINITIONS[cooking.outputItemId].label }}</button>
      </template>
      <template v-else>
        <p class="inventory-help">{{ cookable ? cookable.label + ' → ' + cookable.output + ' за ' + cookable.seconds + ' с, пока костёр горит. Тратится один предмет.' : 'Выберите сырое мясо, чтобы пожарить его.' }}</p>
        <button class="button primary" :disabled="moving || !campfire.inReach || !campfire.lit || !cookable" @click="emit('cook')">{{ cookable ? 'Жарить · ' + cookable.label + ' ×1' : 'Жарить · выберите продукт' }}</button>
      </template>
    </div>
    <p class="inventory-help">Ночью горящая зона согревает. Вне неё через {{ SURVIVAL_CONFIG.coldGraceSeconds }} с начинается замерзание; костёр не лечит.</p>
  </section>
</template>
