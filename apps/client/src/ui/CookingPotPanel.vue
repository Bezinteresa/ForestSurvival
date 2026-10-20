<script setup lang="ts">
import { computed } from 'vue';
import { BUILDING_DEFINITIONS, CONSUMABLE_DEFINITIONS, ITEM_DEFINITIONS, POT_RECIPES, SURVIVAL_CONFIG, type CookingPotSnapshot, type InventorySnapshot, type ItemId } from '@forest-survival/shared';
const props = defineProps<{ pot: CookingPotSnapshot; inventory: InventorySnapshot; moving: boolean }>();
const emit = defineEmits<{ cook: [recipeId: string]; collect: [] }>();
const definition = BUILDING_DEFINITIONS['cooking-pot'];
const price = Object.entries(definition.cost).map(([itemId, amount]) => ITEM_DEFINITIONS[itemId as ItemId].label + ' ×' + amount).join(' + ');
const recipes = computed(() => Object.entries(POT_RECIPES).map(([id, recipe]) => {
  const ingredients = Object.entries(recipe.ingredients).map(([itemId, required]) => ({ itemId: itemId as ItemId, required, owned: props.inventory.slots.reduce((sum, stack) => sum + (stack?.itemId === itemId ? stack.amount : 0), 0) }));
  return { id, ...recipe, ingredients, affordable: ingredients.every((item) => item.owned >= item.required), effect: CONSUMABLE_DEFINITIONS[recipe.output] };
}));
</script>
<template>
  <section class="storage-section" aria-labelledby="cooking-pot-title">
    <h3 id="cooking-pot-title">Котелок</h3>
    <p v-if="!pot.built" class="inventory-help">Постройте котелок в разделе «Постройки лагеря»: {{ price }}, верстак ур. {{ definition.minLevel }}. Для него есть отдельное место у костра.</p>
    <p v-else class="inventory-help">{{ !pot.inReach ? 'Подойдите к котелку.' : pot.heated ? 'Костёр согревает котелок.' : 'Костёр потух. Подложите топливо, чтобы продолжить готовку.' }} Ингредиенты берутся из рюкзака, одна порция за раз.</p>
    <template v-if="pot.cooking">
      <p class="inventory-help">{{ ITEM_DEFINITIONS[pot.cooking.outputItemId].label }} · {{ pot.cooking.ready ? 'готово' : 'осталось ' + Math.ceil(pot.cooking.durationSeconds - pot.cooking.progressSeconds) + ' с горения' }}. При полном рюкзаке блюдо остаётся здесь.</p>
      <progress :value="pot.cooking.progressSeconds" :max="pot.cooking.durationSeconds" aria-label="Готовка в котелке" />
      <button class="button primary" :disabled="moving || !pot.inReach || !pot.cooking.ready" @click="emit('collect')">Забрать блюдо</button>
    </template>
    <template v-else>
      <div v-for="recipe in recipes" :key="recipe.id">
        <h4>{{ recipe.label }}</h4>
        <ul class="campfire-price"><li v-for="ingredient in recipe.ingredients" :key="ingredient.itemId" :class="{ missing: ingredient.owned < ingredient.required }">{{ ITEM_DEFINITIONS[ingredient.itemId].label }}: {{ ingredient.owned }} / {{ ingredient.required }}</li></ul>
        <p class="inventory-help">{{ recipe.seconds }} с горения · {{ recipe.effect.hunger >= SURVIVAL_CONFIG.maxHunger ? 'полная сытость' : 'сытость +' + recipe.effect.hunger }} · здоровье +{{ recipe.effect.health }}. Все ингредиенты списываются при начале готовки.</p>
        <button class="button primary" :disabled="moving || !pot.built || !pot.inReach || !pot.heated || !recipe.affordable" @click="emit('cook', recipe.id)">Готовить · {{ recipe.label }}</button>
      </div>
    </template>
  </section>
</template>
