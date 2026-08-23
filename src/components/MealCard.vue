<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { openDish } from '../stores/app.js'
import { PROVENANCE } from '../api/price.js'
import sourceData from '../data/foodSources.hubei.json'

const props = defineProps({ block: { type: Object, required: true }, hint: { type: String, default: '' } })
const listRef = ref(null)
const STARS = { 1: '★', 2: '★★', 3: '★★★', 4: '★★★★', 5: '★★★★★' }

const items = computed(() => {
  const featured = props.block.items ?? []
  const used = new Set(featured.map((item) => item.dish.id))
  return [...featured, ...(props.block.ranked ?? []).filter((item) => !used.has(item.dish.id))]
})

watch(() => props.block, async () => {
  await nextTick()
  if (listRef.value) listRef.value.scrollTop = 0
})

function outsidePrice(dish) {
  return sourceData.dishPrices?.[dish.name] ?? null
}

function outsidePriceText(dish) {
  const price = outsidePrice(dish)
  if (!price) return ''
  return Number.isFinite(price.priceMin) ? `${price.priceMin}-${price.priceMax} ${price.unit}` : `${price.price} ${price.unit}`
}
</script>

<template>
  <section class="card meal-card" :aria-labelledby="`meal-${block.meal}`">
    <div class="meal-head"><h3 :id="`meal-${block.meal}`" class="meal-title">{{ block.label }}</h3><span class="faint">{{ block.poolSize }} / {{ block.mealPoolSize }} 道候选</span></div>
    <p v-if="hint" class="faint meal-hint">{{ hint }}</p>
    <p v-if="block.relaxed" class="alert alert-warn">所选难度候选不足，已自动放宽。</p>
    <ul v-if="items.length" ref="listRef" class="dish-list">
      <li v-for="(item, index) in items" :key="item.dish.id" class="dish" :class="{ featured: index === 0 }">
        <button class="dish-btn" type="button" @click="openDish(item.dish)">
          <span class="dish-line"><span v-if="item.roleLabel" class="tag tag-good">{{ item.roleLabel }}</span><span class="dish-name">{{ item.dish.name }}</span><span class="faint dish-region">{{ item.dish.region }}</span></span>
          <span class="dish-meta"><span v-if="index === 0" class="tag tag-recommend">★ 重点推荐</span><span class="tag tag-muted">难度 {{ STARS[item.dish.difficulty] }}</span><span class="tag tag-muted">{{ item.dish.timeMin }} 分钟</span><span v-if="item.cost.perServing > 0" class="tag" :class="`tag-${PROVENANCE[item.cost.provenance]?.tone ?? 'muted'}`">家做成本 {{ item.cost.perServing }} 元/人</span><span v-if="outsidePrice(item.dish)" class="tag tag-warn">外食参考 {{ outsidePriceText(item.dish) }}</span></span>
          <span class="dish-reason">{{ item.reason }}</span>
        </button>
      </li>
    </ul>
    <p v-else class="muted">当前条件下没有合适的菜。</p>
    <p v-if="items.length" class="faint list-hint">列表可独立滚动查看全部候选</p>
  </section>
</template>

<style scoped>
.meal-card { display: flex; flex-direction: column; }
.meal-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:6px; }
.meal-title { margin:0; font-size:16px; }
.meal-hint,.list-hint { margin:0 0 8px; }.list-hint { margin-top:8px; text-align:right; }
.dish-list { height:960px; overflow-y:auto; overscroll-behavior:contain; scrollbar-width:none; list-style:none; padding:0 4px 0 0; margin:0; display:grid; gap:8px; }.dish-list::-webkit-scrollbar { display:none; }
.dish { min-height:88px; }.dish-btn { width:100%; min-height:88px; display:block; text-align:left; padding:10px 12px; background:var(--surface-2); border:1px solid transparent; border-radius:var(--radius-sm); }.dish-btn:hover,.featured .dish-btn { border-color:var(--accent); background:var(--accent-dim); }
.featured .dish-btn { animation:pulse 2.8s ease-in-out infinite; }.dish-line,.dish-meta { display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; }.dish-name { font-size:15.5px; font-weight:650; }.dish-region,.dish-reason { font-size:12px; }.dish-meta { margin:6px 0; }.dish-reason { display:block; line-height:1.55; color:var(--text-dim); }
@keyframes pulse { 50% { box-shadow:0 0 0 4px rgba(95,199,174,.3); } }
</style>
