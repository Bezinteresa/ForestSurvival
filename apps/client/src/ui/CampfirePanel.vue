<script setup lang="ts">
import { computed } from 'vue';
import { ITEM_DEFINITIONS, SURVIVAL_CONFIG, isFuel, type CampfireLevel, type CampfireSnapshot, type InventorySnapshot, type ItemStack, type MaterialId } from '@forest-survival/shared';
const props = defineProps<{ campfire: CampfireSnapshot; inventory: InventorySnapshot; selected: ItemStack | null | undefined; moving: boolean }>();
const emit = defineEmits<{ fuel: []; upgrade: [expectedLevel: CampfireLevel] }>();
const price = computed(() => Object.entries(props.campfire.nextUpgrade?.cost ?? {}).map(([itemId, required]) => ({ label: ITEM_DEFINITIONS[itemId as MaterialId].label, required, owned: props.inventory.slots.reduce((sum, stack) => sum + (stack?.itemId === itemId ? stack.amount : 0), 0) })));
const affordable = computed(() => price.value.every((entry) => entry.owned >= entry.required));
const fuel = computed(() => props.selected && isFuel(props.selected.itemId) ? { label: ITEM_DEFINITIONS[props.selected.itemId].label, seconds: props.selected.itemId === 'coal' ? props.campfire.secondsPerCoal : props.campfire.secondsPerWood } : null);
const fuelFits = computed(() => fuel.value !== null && props.campfire.fuelSeconds + fuel.value.seconds <= props.campfire.maxFuelSeconds + 1e-9);
</script>

<template>
  <section class="storage-section" aria-labelledby="campfire-title">
    <h3 id="campfire-title">Костёр · ур. {{ campfire.level }} / {{ campfire.maxLevel }} · {{ campfire.lit ? 'горит' : 'потух' }}</h3>
    <p class="inventory-help">Топливо: {{ Math.ceil(campfire.fuelSeconds) }} / {{ campfire.maxFuelSeconds }} с. {{ !campfire.lit ? 'Зона отключена.' : campfire.playerInside ? 'Вы внутри зоны костра.' : 'Вы вне зоны костра.' }}</p>
    <progress class="campfire-fuel" :value="campfire.fuelSeconds" :max="campfire.maxFuelSeconds" aria-label="Топливо костра" />
    <p class="inventory-help">Древесина: +{{ campfire.secondsPerWood }} с, уголь: +{{ campfire.secondsPerCoal }} с. {{ !campfire.inReach ? 'Подойдите к костру.' : !fuel ? 'Выберите древесину или уголь.' : !fuelFits ? 'Порция не помещается, предмет сохранится.' : 'Расходуется один предмет.' }}</p>
    <button class="button primary" :disabled="moving || !campfire.inReach || !fuelFits" @click="emit('fuel')">{{ fuel ? 'В костёр · ' + fuel.label + ' ×1 (+' + fuel.seconds + ' с)' : 'В костёр · выберите топливо' }}</button>
    <p class="inventory-help">Ночью горящая зона согревает. Вне неё через {{ SURVIVAL_CONFIG.coldGraceSeconds }} с начинается замерзание; костёр не лечит.</p>
    <div v-if="campfire.nextUpgrade" class="campfire-upgrade">
      <h4>Следующий уровень · {{ campfire.nextUpgrade.level }}</h4>
      <p class="inventory-help">Радиус зоны: {{ campfire.zoneRadius }} → {{ campfire.nextUpgrade.safeRadius }} м. Топливо при покупке сохраняется.</p>
      <ul class="campfire-price"><li v-for="entry in price" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <p class="inventory-help">Материалы списываются из рюкзака. {{ !campfire.inReach ? 'Подойдите к костру.' : !campfire.lit ? 'Сначала разожгите костёр.' : !affordable ? 'Соберите недостающие материалы.' : 'Всё готово для улучшения.' }}</p>
      <button class="button primary" :disabled="moving || !campfire.inReach || !campfire.lit || !affordable" @click="emit('upgrade', campfire.level)">Улучшить до ур. {{ campfire.nextUpgrade.level }}</button>
    </div>
    <p v-else class="inventory-help">Максимальный уровень. Радиус зоны: {{ campfire.zoneRadius }} м.</p>
  </section>
</template>
