<script setup lang="ts">
import { BUILD_SITES, BUILDING_DEFINITIONS, ITEM_DEFINITIONS, type BuildingPlan, type BuildingPreview, type MaterialId, type PlayerSnapshot } from '@forest-survival/shared';
defineProps<{ plan: BuildingPlan; preview: BuildingPreview | undefined; player: PlayerSnapshot; note: string }>();
const emit = defineEmits<{ change: [plan: BuildingPlan]; place: []; cancel: [] }>();
const reasons: Record<string, string> = { 'station-required': 'Сначала постройте верстак.', 'station-level': 'Для баррикады нужен верстак уровня 2.', 'out-of-range': 'Подойдите к площадке и встаньте на землю.', blocked: 'Площадка или путь заняты. Уберите предметы или поверните постройку.', 'already-built': 'Эта площадка уже занята.', 'insufficient-materials': 'Не хватает материалов в рюкзаке.', busy: 'Дождитесь завершения удара.', invalid: 'Выберите площадку.', paused: 'Игра приостановлена.', dead: 'Забег завершён.' };
</script>
<template>
  <section class="camp-build-panel" data-ui aria-label="Строительство лагеря">
    <div class="inventory-heading"><h2>Строительство</h2><button class="button secondary" @click="emit('cancel')">Закрыть</button></div>
    <p class="inventory-help">Выберите отмеченную площадку. Зелёный макет можно установить, красный — нельзя. Мир продолжает работать.</p>
    <svg class="camp-build-map" viewBox="-10 -8 20 20" aria-label="Площадки вокруг костра">
      <circle cx="0" cy="2.8" r="0.7" fill="#efaa55" /><text x="0" y="1.6" text-anchor="middle">Костёр</text>
      <g v-for="(site, index) in BUILD_SITES" :key="site.id" @click="emit('change', { ...plan, siteId: site.id })">
        <circle :cx="site.position.x" :cy="site.position.z" r="0.85" :fill="site.id === plan.siteId ? '#c8e49c' : '#518292'" /><text :x="site.position.x" :y="site.position.z + 0.25" text-anchor="middle" fill="#0a160e">{{ index + 1 }}</text>
      </g>
      <rect v-if="preview?.box" :x="preview.box.position.x - preview.box.halfSize.x" :y="preview.box.position.z - preview.box.halfSize.z" :width="preview.box.halfSize.x * 2" :height="preview.box.halfSize.z * 2" fill="none" :stroke="preview.result.accepted ? '#74f1a2' : '#f07a73'" stroke-width="0.15" />
      <circle :cx="player.position.x" :cy="player.position.z" r="0.25" fill="#fff" />
    </svg>
    <div class="inventory-actions">
      <button v-for="(definition, kind) in BUILDING_DEFINITIONS" :key="kind" class="button secondary" :aria-pressed="plan.kind === kind" @click="emit('change', { ...plan, kind })">{{ definition.label }}</button>
      <button class="button secondary" @click="emit('change', { ...plan, rotation: plan.rotation === 0 ? 1 : 0 })">Повернуть · {{ plan.rotation * 90 }}°</button>
    </div>
    <div class="inventory-actions"><button v-for="(site, index) in BUILD_SITES" :key="site.id" class="button secondary" :aria-pressed="plan.siteId === site.id" @click="emit('change', { ...plan, siteId: site.id })">{{ index + 1 }}</button></div>
    <p class="inventory-help">{{ BUILDING_DEFINITIONS[plan.kind].label }} · площадка {{ BUILD_SITES.findIndex((site) => site.id === plan.siteId) + 1 }} · {{ plan.kind === 'storage' ? '8 пустых слотов' : 'Преграда для прохода' }}</p>
    <ul class="campfire-price"><li v-for="(amount, material) in preview?.cost" :key="material">{{ ITEM_DEFINITIONS[material as MaterialId].label }} ×{{ amount }}</li></ul>
    <p class="inventory-status" role="status">{{ note || (preview?.result.accepted ? 'Место свободно. Материалы спишутся после подтверждения.' : reasons[preview?.result.reason ?? 'invalid']) }}</p>
    <button class="button primary" :disabled="!preview?.result.accepted" @click="emit('place')">Построить</button>
  </section>
</template>
