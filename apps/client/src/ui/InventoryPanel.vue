<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { ITEM_DEFINITIONS, isTool, isFood, itemLabel, type GameplaySnapshot, type InventorySnapshot } from '@forest-survival/shared';
import CampfirePanel from './CampfirePanel.vue';

const props = defineProps<{ inventory: InventorySnapshot; storage: GameplaySnapshot['storage']; campfire: GameplaySnapshot['campfire']; debugTools: boolean; note: string }>();
const emit = defineEmits<{ close: []; selectSlot: [slot: number]; moveItem: [from: number, to: number]; dropItem: [slot: number]; consumeItem: [slot: number]; fuelFire: [slot: number]; transferItem: [direction: 'deposit' | 'withdraw', slot: number]; debugUpgrade: [target: 'tool' | 'backpack', slot: number] }>();
const dialog = useTemplateRef<HTMLDialogElement>('dialog');
const selected = ref(props.inventory.activeSlot);
const selectedStorage = ref(0);
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
    <div class="inventory-heading"><h2 id="inventory-title">Рюкзак · ур. {{ inventory.level }}</h2><button class="button secondary" autofocus @click="emit('close')">Закрыть</button></div>
    <p class="inventory-help">Выберите предмет. Для переноса нажмите «Перенести», затем нужный слот. Одинаковые ресурсы объединяются, разные предметы меняются местами.</p>
    <div class="inventory-slots">
      <button v-for="(item, slot) in inventory.slots" :key="slot" class="inventory-slot" :class="{ selected: selected === slot, equipped: inventory.activeSlot === slot }" :aria-pressed="selected === slot" @click="choose(slot)">
        <span>Слот {{ slot + 1 }}{{ inventory.activeSlot === slot ? ' · в руке' : '' }}</span>
        <strong>{{ item ? itemLabel(item) : 'Пусто' }}</strong>
        <span v-if="item">{{ item.amount }} / {{ ITEM_DEFINITIONS[item.itemId].stackLimit }}</span>
      </button>
    </div>
    <p class="inventory-status" role="status">{{ movingFrom !== null ? 'Выберите слот назначения или отмените перенос.' : note || (stack ? itemLabel(stack) + ' ×' + stack.amount : 'Пустой слот: в руке не будет инструмента.') }}</p>
    <div class="inventory-actions">
      <template v-if="movingFrom === null">
        <button class="button primary" @click="emit('selectSlot', selected)">В руку</button>
        <button v-if="stack && isFood(stack.itemId)" class="button primary" @click="emit('consumeItem', selected)">Съесть одну</button>
        <button class="button secondary" :disabled="!stack" @click="movingFrom = selected">Перенести</button>
        <button class="button secondary" :disabled="!stack" @click="emit('dropItem', selected)">Выбросить стек</button>
        <button class="button secondary" :disabled="!stack || !storage.inReach" @click="emit('transferItem', 'deposit', selected)">В склад</button>
      </template>
      <button v-else class="button secondary" @click="movingFrom = null">Отменить перенос</button>
    </div>
    <CampfirePanel :campfire="campfire" :selected="stack" :moving="movingFrom !== null" @fuel="emit('fuelFire', selected)" />
    <section class="storage-section" aria-labelledby="storage-title">
      <h3 id="storage-title">Склад лагеря · {{ storage.inventory.slots.filter(Boolean).length }} / {{ storage.inventory.slots.length }} слотов</h3>
      <template v-if="storage.inReach">
        <p class="inventory-help">Стартовая кирка хранится здесь. Можно положить или забрать целый стек. При нехватке места предмет остаётся в исходном контейнере.</p>
        <div class="inventory-slots">
          <button v-for="(item, slot) in storage.inventory.slots" :key="slot" class="inventory-slot" :class="{ selected: selectedStorage === slot }" :aria-pressed="selectedStorage === slot" @click="selectedStorage = slot">
            <span>Склад {{ slot + 1 }}</span><strong>{{ item ? itemLabel(item) : 'Пусто' }}</strong><span v-if="item">×{{ item.amount }}</span>
          </button>
        </div>
        <button class="button primary" :disabled="!storage.inventory.slots[selectedStorage] || movingFrom !== null" @click="emit('transferItem', 'withdraw', selectedStorage)">Забрать в рюкзак</button>
      </template>
      <p v-else class="inventory-help">Подойдите к ящику лагеря, чтобы открыть доступ к складу.</p>
    </section>
    <details v-if="debugTools" class="debug-upgrades">
      <summary>Режим разработки: проверка улучшений</summary>
      <div class="inventory-actions">
        <button class="button secondary" :disabled="!stack || !isTool(stack.itemId) || stack.level === 2" @click="emit('debugUpgrade', 'tool', selected)">Инструмент → ур. 2</button>
        <button class="button secondary" :disabled="inventory.level === 2" @click="emit('debugUpgrade', 'backpack', selected)">Рюкзак → ур. 2</button>
      </div>
    </details>
    <p class="inventory-help">1–5 — предмет в руке · G — выбросить активный стек · Tab / Esc — закрыть. Мир продолжает работать, управление персонажем отключено.</p>
  </dialog>
</template>
