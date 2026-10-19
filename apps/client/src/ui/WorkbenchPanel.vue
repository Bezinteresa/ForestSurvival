<script setup lang="ts">
import { CRAFT_RECIPES, ITEM_DEFINITIONS, type InventorySnapshot, type MaterialCost, type MaterialId, type WorkbenchSnapshot } from '@forest-survival/shared';
const props = defineProps<{ workbench: WorkbenchSnapshot; inventory: InventorySnapshot; moving: boolean }>();
const emit = defineEmits<{ build: []; craft: [recipeId: string] }>();
function price(cost: MaterialCost) {
  return Object.entries(cost).map(([id, required]) => ({ label: ITEM_DEFINITIONS[id as MaterialId].label, required, owned: props.inventory.slots.reduce((sum, stack) => sum + (stack?.itemId === id ? stack.amount : 0), 0) }));
}
function affordable(cost: MaterialCost): boolean { return price(cost).every((entry) => entry.owned >= entry.required); }
</script>

<template>
  <section class="storage-section" aria-labelledby="workbench-title">
    <h3 id="workbench-title">Верстак · {{ workbench.built ? 'ур. ' + workbench.level : 'площадка' }}</h3>
    <p v-if="!workbench.inReach" class="inventory-help">Подойдите к голубой площадке верстака рядом со складом.</p>
    <template v-if="!workbench.built">
      <p class="inventory-help">Постройте верстак на отмеченном месте. Уберите предметы с площадки и отойдите с неё.</p>
      <ul class="campfire-price"><li v-for="entry in price(workbench.buildCost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <button class="button primary" :disabled="moving || !workbench.inReach || !affordable(workbench.buildCost)" @click="emit('build')">Построить верстак</button>
    </template>
    <p class="inventory-help">Крафт использует материалы рюкзака. При нехватке места результат и ингредиенты не расходуются. Мир продолжает работать.</p>
    <article v-for="recipe in CRAFT_RECIPES" :key="recipe.id" class="craft-recipe">
      <h4>{{ recipe.label }} · ×{{ recipe.output.amount }}</h4>
      <ul class="campfire-price"><li v-for="entry in price(recipe.cost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <p v-if="recipe.minLevel > workbench.level && recipe.minLevel > 1" class="inventory-help">Нужен верстак ур. {{ recipe.minLevel }}. Улучшения станции появятся следующим этапом.</p>
      <button class="button secondary" :disabled="moving || !workbench.inReach || !workbench.built || recipe.minLevel > workbench.level || !affordable(recipe.cost)" @click="emit('craft', recipe.id)">Изготовить · {{ recipe.label }}</button>
    </article>
  </section>
</template>
