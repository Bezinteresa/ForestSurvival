<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { ITEM_DEFINITIONS, type InventorySnapshot } from '@forest-survival/shared';

const props = defineProps<{ inventory: InventorySnapshot; note: string }>();
const emit = defineEmits<{ close: []; selectSlot: [slot: number]; moveItem: [from: number, to: number]; dropItem: [slot: number] }>();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const selected = ref(props.inventory.activeSlot);
const movingFrom = ref<number | null>(null);
const stack = computed(() => props.inventory.slots[selected.value]);

function choose(slot: number): void {
  if (movingFrom.value !== null) {
    if (movingFrom.value !== slot) emit('moveItem', movingFrom.value, slot);
    movingFrom.value = null;
  }
  selected.value = slot;
}

onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => dialog.value?.close());
</script>

<template>
  <dialog ref="dialog" class="inventory-panel" aria-labelledby="inventory-title" data-ui @cancel.prevent="emit('close')">
    <div class="inventory-heading"><h2 id="inventory-title">Рюкзак</h2><button class="button secondary" autofocus @click="emit('close')">Закрыть</button></div>
    <p class="inventory-help">Выберите предмет. Для переноса нажмите «Перенести», затем нужный слот. Одинаковые ресурсы объединяются, разные предметы меняются местами.</p>
    <div class="inventory-slots">
      <button v-for="(item, slot) in inventory.slots" :key="slot" class="inventory-slot" :class="{ selected: selected === slot, equipped: inventory.activeSlot === slot }" :aria-pressed="selected === slot" @click="choose(slot)">
        <span>Слот {{ slot + 1 }}{{ inventory.activeSlot === slot ? ' · в руке' : '' }}</span>
        <strong>{{ item ? ITEM_DEFINITIONS[item.itemId].label : 'Пусто' }}</strong>
        <span v-if="item">{{ item.amount }} / {{ ITEM_DEFINITIONS[item.itemId].stackLimit }}</span>
      </button>
    </div>
    <p class="inventory-status" role="status">{{ movingFrom !== null ? 'Выберите слот назначения или отмените перенос.' : note || (stack ? ITEM_DEFINITIONS[stack.itemId].label + ' ×' + stack.amount : 'Пустой слот: в руке не будет инструмента.') }}</p>
    <div class="inventory-actions">
      <template v-if="movingFrom === null">
        <button class="button primary" @click="emit('selectSlot', selected)">В руку</button>
        <button class="button secondary" :disabled="!stack" @click="movingFrom = selected">Перенести</button>
        <button class="button secondary" :disabled="!stack" @click="emit('dropItem', selected)">Выбросить стек</button>
      </template>
      <button v-else class="button secondary" @click="movingFrom = null">Отменить перенос</button>
    </div>
    <p class="inventory-help">1–5 — предмет в руке · G — выбросить активный стек · Tab / Esc — закрыть. Мир продолжает работать, управление персонажем отключено.</p>
  </dialog>
</template>
