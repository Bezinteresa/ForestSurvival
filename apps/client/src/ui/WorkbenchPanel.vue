<script setup lang="ts">
import { BACKPACK_LEVELS, CRAFT_RECIPES, ITEM_DEFINITIONS, type InventorySnapshot, type MaterialCost, type MaterialId, type WorkbenchLevel, type WorkbenchSnapshot } from '@forest-survival/shared';
const props = defineProps<{ workbench: WorkbenchSnapshot; inventory: InventorySnapshot; moving: boolean }>();
const emit = defineEmits<{ build: []; craft: [recipeId: string]; upgrade: [expectedLevel: WorkbenchLevel] }>();
function price(cost: MaterialCost) {
  return Object.entries(cost).map(([id, required]) => ({ label: ITEM_DEFINITIONS[id as MaterialId].label, required, owned: props.inventory.slots.reduce((sum, stack) => sum + (stack?.itemId === id ? stack.amount : 0), 0) }));
}
function affordable(cost: MaterialCost): boolean { return price(cost).every((entry) => entry.owned >= entry.required); }
function upgrade(): void { if (props.workbench.level) emit('upgrade', props.workbench.level); }
</script>

<template>
  <section class="storage-section" aria-labelledby="workbench-title">
    <h3 id="workbench-title">Верстак · {{ workbench.built ? 'ур. ' + workbench.level + ' / ' + workbench.maxLevel : 'площадка' }}</h3>
    <p v-if="!workbench.inReach" class="inventory-help">Подойдите к голубой площадке верстака рядом со складом.</p>
    <template v-if="!workbench.built">
      <p class="inventory-help">Постройте верстак на отмеченном месте. Уберите предметы с площадки и отойдите с неё.</p>
      <ul class="campfire-price"><li v-for="entry in price(workbench.buildCost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <button class="button primary" :disabled="moving || !workbench.inReach || !affordable(workbench.buildCost)" @click="emit('build')">Построить верстак</button>
    </template>
    <div v-if="workbench.nextUpgrade" class="campfire-upgrade">
      <h4>Улучшить верстак до ур. {{ workbench.nextUpgrade.level }}</h4>
      <p class="inventory-help">{{ workbench.nextUpgrade.level === 2 ? 'Откроются усиленные инструменты.' : 'Откроется рюкзак на восемь слотов.' }} Постройка и запас топлива сохраняются.</p>
      <ul class="campfire-price"><li v-for="entry in price(workbench.nextUpgrade.cost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <button class="button primary" :disabled="moving || !workbench.inReach || !affordable(workbench.nextUpgrade.cost)" @click="upgrade">Улучшить до ур. {{ workbench.nextUpgrade.level }}</button>
    </div>
    <p v-else-if="workbench.built" class="inventory-help">Максимальный уровень верстака.</p>
    <p class="inventory-help">Крафт использует материалы рюкзака. При нехватке места результат и ингредиенты не расходуются. Мир продолжает работать.</p>
    <article v-for="recipe in CRAFT_RECIPES" :key="recipe.id" class="craft-recipe">
      <h4>{{ recipe.label }} · {{ recipe.kind === 'item' ? '×' + recipe.output.amount : BACKPACK_LEVELS[recipe.level] + ' слотов' }}</h4>
      <ul class="campfire-price"><li v-for="entry in price(recipe.cost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <p v-if="recipe.minLevel > workbench.level" class="inventory-help">Нужен верстак ур. {{ recipe.minLevel }}.</p>
      <p v-else-if="recipe.kind === 'backpack' && inventory.level >= recipe.level" class="inventory-help">Рюкзак уже улучшен.</p>
      <button class="button secondary" :disabled="moving || !workbench.inReach || !workbench.built || recipe.minLevel > workbench.level || !affordable(recipe.cost) || (recipe.kind === 'backpack' && inventory.level >= recipe.level)" @click="emit('craft', recipe.id)">{{ recipe.kind === 'item' ? 'Изготовить · ' + recipe.label : 'Расширить рюкзак' }}</button>
    </article>
  </section>
</template>
