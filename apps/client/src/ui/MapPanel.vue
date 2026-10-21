<script setup lang="ts">
import { computed } from 'vue';
import { ITEM_DEFINITIONS, type GameplaySnapshot, type PlayerSnapshot } from '@forest-survival/shared';
// Top-down view of the explored square; only things inside the open area are drawn, the fog hides the rest.
const props = defineProps<{ gameplay: GameplaySnapshot; player: PlayerSnapshot; cameraYaw: number }>();
const emit = defineEmits<{ close: [] }>();
const half = computed(() => props.gameplay.campfire.mapHalfSize);
const inside = (position: { x: number; z: number }) => Math.abs(position.x) <= half.value && Math.abs(position.z) <= half.value;
const RESOURCE_COLORS: Record<string, string> = { tree: '#3f7d47', rock: '#9aa5aa', 'scrap-pile': '#b7785b', 'coal-vein': '#3c434b', hare: '#d8c5a4' };
const resources = computed(() => props.gameplay.resources.filter((entry) => !entry.exhausted && inside(entry.position)));
const loot = computed(() => props.gameplay.loot.filter((entry) => inside(entry.position)));
const bushes = computed(() => props.gameplay.bushes.filter((entry) => entry.remaining > 0 && inside(entry.position)));
// Camera forward on the map: x = sin(yaw), z = -cos(yaw).
const heading = computed(() => Math.atan2(Math.sin(props.cameraYaw), -Math.cos(props.cameraYaw)) * 180 / Math.PI);
</script>

<template>
  <section class="map-panel" data-ui aria-label="Карта">
    <div class="inventory-heading"><h2>Карта · открыто ±{{ half }} м</h2><button class="button secondary" @click="emit('close')">Закрыть</button></div>
    <svg viewBox="-21 -21 42 42" class="map-svg" role="img" aria-label="Схема открытой области">
      <rect x="-21" y="-21" width="42" height="42" fill="#1f2a24" />
      <rect :x="-half" :y="-half" :width="half * 2" :height="half * 2" fill="#5f7d4c" stroke="#d6e5a9" stroke-width="0.2" />
      <circle cx="0" cy="2.8" :r="gameplay.campfire.safeRadius" fill="#f0c46c22" stroke="#f0c46c88" stroke-width="0.15" />
      <circle v-for="entry in resources" :key="entry.id" :cx="entry.position.x" :cy="entry.position.z" :r="entry.kind === 'tree' ? 0.8 : 0.6" :fill="RESOURCE_COLORS[entry.kind]" />
      <circle v-for="entry in bushes" :key="entry.id" :cx="entry.position.x" :cy="entry.position.z" r="0.45" fill="#c34562" />
      <rect v-for="entry in gameplay.buildings" :key="entry.id" :x="entry.position.x - entry.halfSize.x" :y="entry.position.z - entry.halfSize.z" :width="entry.halfSize.x * 2" :height="entry.halfSize.z * 2" fill="#a08154" />
      <rect v-if="gameplay.workbench.built" :x="gameplay.workbench.position.x - 0.75" :y="gameplay.workbench.position.z - 0.45" width="1.5" height="0.9" fill="#c9b07d" />
      <g v-for="entry in loot" :key="entry.id"><title>{{ ITEM_DEFINITIONS[entry.itemId].label }}</title><rect :x="entry.position.x - 0.45" :y="entry.position.z - 0.45" width="0.9" height="0.9" fill="#f6e27a" transform-origin="center" /></g>
      <circle cx="0" cy="2.8" r="0.8" fill="#ef8f3a" />
      <g :transform="'translate(' + player.position.x + ' ' + player.position.z + ') rotate(' + heading + ')'">
        <polygon points="0,-1.3 0.8,0.9 0,0.4 -0.8,0.9" fill="#ffffff" stroke="#14231b" stroke-width="0.15" />
      </g>
    </svg>
    <p class="inventory-help">● костёр · деревья, камни, лом, уголь, зайцы · ■ находки и выпавшие предметы · стрелка — вы и направление камеры. Туман открывается, когда костёр набирает уровень. M — закрыть.</p>
  </section>
</template>
