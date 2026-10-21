<script setup lang="ts">
import { BUILDING_DEFINITIONS, CRAFT_RECIPES, DEFERRED_WORKBENCH_ITEMS, ITEM_DEFINITIONS, type BuildingKind, type InventorySnapshot, type MaterialCost, type MaterialId, type WorkbenchLevel, type WorkbenchSnapshot } from '@forest-survival/shared';
const props = defineProps<{ workbench: WorkbenchSnapshot; inventory: InventorySnapshot; moving: boolean }>();
const emit = defineEmits<{ build: []; craft: [recipeId: string]; upgrade: [expectedLevel: WorkbenchLevel] }>();
const RECIPE_USES: Record<string, string> = { map: 'Пока карта в рюкзаке: M или кнопка «Карта» показывает открытую область, ресурсы и находки.', compass: 'Пока компас в рюкзаке: стрелка на экране указывает на костёр.' };
function price(cost: MaterialCost) {
  return Object.entries(cost).map(([id, required]) => ({ label: ITEM_DEFINITIONS[id as MaterialId].label, required, owned: props.inventory.slots.reduce((sum, stack) => sum + (stack?.itemId === id ? stack.amount : 0), 0) }));
}
function affordable(cost: MaterialCost): boolean { return price(cost).every((entry) => entry.owned >= entry.required); }
function owned(itemId: string): boolean { return props.inventory.slots.some((stack) => stack?.itemId === itemId); }
function upgrade(): void { if (props.workbench.level) emit('upgrade', props.workbench.level); }
function unlocks(level: number): string {
  const items = Object.values(CRAFT_RECIPES).filter((recipe) => recipe.minLevel === level).map((recipe) => recipe.label);
  const builds = (Object.entries(BUILDING_DEFINITIONS) as Array<[BuildingKind, (typeof BUILDING_DEFINITIONS)[BuildingKind]]>).filter(([, definition]) => definition.minLevel === level).map(([, definition]) => definition.label);
  return [...items, ...builds].join(', ') || 'новые рецепты появятся позже';
}
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
      <p class="inventory-help">Откроется: {{ unlocks(workbench.nextUpgrade.level) }}. Постройки и запас топлива сохраняются.</p>
      <ul class="campfire-price"><li v-for="entry in price(workbench.nextUpgrade.cost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <button class="button primary" :disabled="moving || !workbench.inReach || !affordable(workbench.nextUpgrade.cost)" @click="upgrade">Улучшить до ур. {{ workbench.nextUpgrade.level }}</button>
    </div>
    <p v-else-if="workbench.built" class="inventory-help">Максимальный уровень верстака.</p>
    <p class="inventory-help">Предметы делаются из материалов рюкзака. Постройки (склад, кровати, ловушки, баррикада, грядка, котелок) — в разделе «Постройки лагеря». Топоры, кирки и большой рюкзак верстак не делает: их находят за туманом, когда костёр открывает карту.</p>
    <article v-for="recipe in CRAFT_RECIPES" :key="recipe.id" class="craft-recipe">
      <h4>{{ recipe.label }} · верстак ур. {{ recipe.minLevel }}</h4>
      <p class="inventory-help">{{ RECIPE_USES[recipe.id] }}</p>
      <ul class="campfire-price"><li v-for="entry in price(recipe.cost)" :key="entry.label" :class="{ missing: entry.owned < entry.required }">{{ entry.label }}: {{ entry.owned }} / {{ entry.required }}</li></ul>
      <p v-if="recipe.minLevel > workbench.level" class="inventory-help">Нужен верстак ур. {{ recipe.minLevel }}.</p>
      <p v-else-if="owned(recipe.output.itemId)" class="inventory-help">Уже есть в рюкзаке; второй не нужен.</p>
      <button class="button primary" :disabled="moving || !workbench.inReach || !workbench.built || recipe.minLevel > workbench.level || !affordable(recipe.cost) || owned(recipe.output.itemId)" @click="emit('craft', recipe.id)">Изготовить · {{ recipe.label }}</button>
    </article>
    <details class="craft-deferred">
      <summary>Ещё в каталоге оригинала · недоступно</summary>
      <p v-for="item in DEFERRED_WORKBENCH_ITEMS" :key="item.label" class="inventory-help">🔒 {{ item.label }} (ур. {{ item.minLevel }}) — {{ item.reason }}.</p>
    </details>
  </section>
</template>
