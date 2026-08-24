<script setup>
/**
 * 今日采购清单 + 营养汇总。
 *
 * 推荐列表给的是候选，这里算的是「真的会做的那五道」：
 * 早晚各一道重点推荐，中餐一整套。清单按菜场动线分组，同名配料已合并。
 */
import { computed, ref } from 'vue'
import { dayDishes, shoppingList, nutritionSummary } from '../stores/app.js'
import { PROVENANCE } from '../api/price.js'

const open = ref(true)

const list = computed(() => shoppingList.value)
const nutrition = computed(() => nutritionSummary.value)

const dishNames = computed(() => dayDishes.value.map((item) => item.dish.name))

const NUTRIENT_LABELS = {
  kcal: { label: '热量', unit: 'kcal' },
  protein: { label: '蛋白质', unit: 'g' },
  fat: { label: '脂肪', unit: 'g' },
  carbs: { label: '碳水', unit: 'g' },
}

const LEVEL_TEXT = { low: '偏少', ok: '合适', high: '偏多' }
const LEVEL_TONE = { low: 'warn', ok: 'good', high: 'warn' }

/** 参考值对照行。 */
const nutrientRows = computed(() => {
  if (!nutrition.value) return []
  return Object.entries(NUTRIENT_LABELS).map(([key, meta]) => {
    const cell = nutrition.value.compare[key]
    return {
      key,
      ...meta,
      value: cell.value,
      reference: cell.reference,
      level: cell.level,
      levelText: LEVEL_TEXT[cell.level],
      tone: LEVEL_TONE[cell.level],
      pct: Math.min(100, Math.round(cell.ratio * 100)),
    }
  })
})
</script>

<template>
  <section v-if="list && nutrition" class="card" aria-labelledby="day-title">
    <div class="card-head">
      <h2 id="day-title" class="card-title">今日采购与营养</h2>
      <button class="btn btn-ghost" :aria-expanded="open" @click="open = !open">
        {{ open ? '收起' : '展开' }}
      </button>
    </div>

    <p class="faint day-dishes">
      按 {{ dishNames.length }} 道菜计算：{{ dishNames.join('、') }}
    </p>

    <template v-if="open">
      <h3 class="sec-title">采购清单</h3>
      <p class="faint sec-note">
        共 {{ list.lineCount }} 项，食材合计约 {{ list.totalCost }} 元（{{ dishNames.length }} 道菜、每道 2 人份）。
        同名配料已合并，每项下方是用到它的菜。
      </p>

      <div class="groups">
        <div v-for="g in list.groups" :key="g.category" class="group">
          <div class="group-head">
            <span class="group-name">{{ g.category }}</span>
            <span class="faint">{{ g.cost > 0 ? `约 ${g.cost} 元` : '—' }}</span>
          </div>
          <ul class="item-list">
            <li v-for="item in g.items" :key="`${item.name}-${item.unit}`" class="item">
              <span class="item-main">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-qty">{{ item.qtyText }}</span>
              </span>
              <span class="item-side">
                <span v-if="item.cost > 0" class="item-cost">{{ item.cost }} 元</span>
                <span v-else class="tag tag-muted">未计价</span>
                <span
                  v-if="item.provenance"
                  class="tag"
                  :class="`tag-${PROVENANCE[item.provenance]?.tone ?? 'muted'}`"
                >
                  {{ PROVENANCE[item.provenance]?.label }}
                </span>
              </span>
              <span class="faint item-from">{{ item.dishes.join('、') }}</span>
            </li>
          </ul>
        </div>
      </div>

      <p v-if="list.unpriced.length" class="faint unpriced">
        以下 {{ list.unpriced.length }} 项没有价格数据，未计入合计：{{ list.unpriced.join('、') }}。
        多为家中常备调味料。
      </p>

      <h3 class="sec-title">营养汇总（单人一天）</h3>
      <p class="faint sec-note">
        按每道菜一份相加。参考值取中国居民膳食营养素参考摄入量里轻体力活动成年人的中间值，
        只作方向性提示，不是健康建议。
      </p>

      <ul class="nutri-list">
        <li v-for="row in nutrientRows" :key="row.key" class="nutri-row">
          <span class="nutri-label">{{ row.label }}</span>
          <span class="nutri-bar" aria-hidden="true">
            <span class="nutri-fill" :class="`fill-${row.level}`" :style="{ width: `${row.pct}%` }" />
          </span>
          <span class="nutri-value">
            {{ row.value }} / {{ row.reference }} {{ row.unit }}
          </span>
          <span class="tag" :class="`tag-${row.tone}`">{{ row.levelText }}</span>
        </li>
      </ul>

      <p class="faint macro">
        供能占比：蛋白 {{ nutrition.totals.macroSplit.protein }}% ·
        脂肪 {{ nutrition.totals.macroSplit.fat }}% ·
        碳水 {{ nutrition.totals.macroSplit.carbs }}%
      </p>
    </template>
  </section>
</template>

<style scoped>
.day-dishes {
  margin: 0 0 4px;
}

.sec-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 0.04em;
  margin: 18px 0 4px;
}

.sec-note {
  margin: 0 0 10px;
}

.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.group {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 10px 12px;
}

.group-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 6px;
  margin-bottom: 6px;
}

.group-name {
  font-size: 13.5px;
  font-weight: 650;
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.item-main,
.item-side {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
}

.item-main {
  justify-content: space-between;
}

.item-name {
  font-size: 14px;
}

.item-qty {
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.item-side {
  margin-top: 2px;
}

.item-cost {
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.item-from {
  display: block;
  font-size: 11.5px;
  margin-top: 2px;
}

.unpriced {
  margin: 10px 0 0;
}

.nutri-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 8px;
}

.nutri-row {
  display: grid;
  grid-template-columns: 54px 1fr auto auto;
  gap: 10px;
  align-items: center;
}

.nutri-label {
  font-size: 13.5px;
  color: var(--text-dim);
}

.nutri-bar {
  height: 8px;
  background: var(--surface-2);
  border-radius: 999px;
  overflow: hidden;
}

.nutri-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
}

.nutri-fill.fill-low,
.nutri-fill.fill-high {
  background: var(--warn);
}

.nutri-value {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}

.macro {
  margin: 10px 0 0;
}

@media (max-width: 520px) {
  .nutri-row {
    grid-template-columns: 50px 1fr auto;
  }

  .nutri-row .tag {
    display: none;
  }
}
</style>
