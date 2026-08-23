<script setup>
/**
 * 菜价面板：一键获取 + provenance 如实标注 + 手工改价。
 *
 * 关键约束（实测得出）：农业农村部的分市场分品种价格接口被图形验证码锁住，
 * 拿不到湖北本地批发价。这里显示的是全国指数折算的估算值，
 * 界面必须说清楚，不能让人误以为是本地真实行情。
 */
import { computed, ref } from 'vue'
import { state, refreshPrices, setManualPrice } from '../stores/app.js'
import { PROVENANCE } from '../api/price.js'

const showEditor = ref(false)
const filter = ref('')

const p = computed(() => state.prices)

/** 按来源分组计数，用于顶部摘要。 */
const summary = computed(() => {
  if (!p.value) return []
  return Object.entries(p.value.counts)
    .filter(([, n]) => n > 0)
    .map(([key, n]) => ({ ...PROVENANCE[key], count: n }))
})

/** 可编辑的价格行。搜索过滤，默认只显示前 40 条避免长列表。 */
const rows = computed(() => {
  if (!p.value) return []
  const q = filter.value.trim()
  const all = Object.entries(p.value.table).map(([name, v]) => ({ name, ...v }))
  const hit = q ? all.filter((r) => r.name.includes(q)) : all
  return hit.slice(0, q ? 60 : 40)
})

const totalCount = computed(() => (p.value ? Object.keys(p.value.table).length : 0))

function onInput(name, event) {
  setManualPrice(name, event.target.value)
}
</script>

<template>
  <section class="card" aria-labelledby="price-title">
    <div class="card-head">
      <h2 id="price-title" class="card-title">菜价</h2>
      <button class="btn" :disabled="state.pricesLoading" @click="refreshPrices">
        {{ state.pricesLoading ? '获取中…' : p ? '重新获取' : '一键获取菜价' }}
      </button>
    </div>

    <p v-if="state.pricesError" class="alert" role="alert">{{ state.pricesError }}</p>

    <p v-else-if="!p" class="muted" style="margin: 0">
      点上面的按钮获取菜价。不获取也能推荐，只是成本估算会缺失。
    </p>

    <template v-else>
      <div class="summary">
        <span v-for="s in summary" :key="s.key" class="tag" :class="`tag-${s.tone}`">
          {{ s.label }} {{ s.count }}
        </span>
        <span v-if="p.index" class="tag">
          菜篮子指数 {{ p.index.vegetableBasket }}（{{ p.index.date }}）
        </span>
      </div>

      <p class="alert alert-warn" style="margin: 12px 0 0">
        {{ p.disclaimer }}
      </p>

      <p v-if="!p.bulletinOk" class="faint" style="margin: 8px 0 0">
        每日行情简报接口本次未响应，畜禽类价格已回落到指数折算值。
      </p>

      <button
        class="btn btn-ghost"
        style="margin-top: 12px"
        :aria-expanded="showEditor"
        @click="showEditor = !showEditor"
      >
        {{ showEditor ? '收起手工改价' : `手工改价（共 ${totalCount} 项）` }}
      </button>

      <div v-if="showEditor" class="editor">
        <label class="field-label" for="price-filter">搜索食材</label>
        <input
          id="price-filter"
          v-model="filter"
          type="search"
          placeholder="例如：莲藕、排骨"
          class="filter-input"
        />

        <p class="faint" style="margin: 8px 0">
          填入你在菜场看到的真实价（元/公斤），会覆盖估算值并保存在本机。留空则恢复估算。
        </p>

        <ul class="price-list">
          <li v-for="r in rows" :key="r.name" class="price-row">
            <span class="price-name">{{ r.name }}</span>
            <span class="tag" :class="`tag-${PROVENANCE[r.provenance]?.tone ?? 'muted'}`">
              {{ PROVENANCE[r.provenance]?.label ?? r.provenance }}
            </span>
            <span class="price-current">{{ r.price }}</span>
            <input
              type="number"
              min="0"
              step="0.1"
              class="price-input"
              :value="state.manualPrices[r.name] ?? ''"
              :aria-label="`${r.name} 手工价格，元每公斤`"
              placeholder="改价"
              @change="onInput(r.name, $event)"
            />
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.editor {
  margin-top: 12px;
  border-top: 1px solid var(--line);
  padding-top: 12px;
}

.filter-input {
  width: 100%;
  max-width: 260px;
  font: inherit;
  font-size: 14px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--surface);
  color: var(--text);
}

.price-list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 340px;
  overflow-y: auto;
}

.price-row {
  display: grid;
  grid-template-columns: 1fr auto 64px 92px;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line);
}

.price-name {
  font-size: 13.5px;
}

.price-current {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-size: 13.5px;
  color: var(--text-dim);
}

.price-input {
  width: 100%;
}
</style>

    if (index) {
      const field = indexFieldFor(category)
      const today = index[field]
      const base = baseline.baseIndex[field]
      if (Number.isFinite(today) && Number.isFinite(base) && base > 0) {
        price = Math.round((basePrice * (today / base)) * 100) / 100
        provenance = 'index-adjusted'
      }
    }

    if (Number.isFinite(live[name]) && live[name] > 0) {
      price = live[name]
      provenance = 'live'
    }

    if (Number.isFinite(manual[name]) && manual[name] > 0) {
      price = manual[name]
      provenance = 'manual'
    }

    table[name] = { price, unit: '元/公斤', provenance, category }
  }

  return table
}

/**
 * 一键获取：并发拉指数 + 简报，任一失败都降级而不白屏。
 *
 * @param {object} manual 手工价覆盖
 */
export async function loadPrices(manual = {}) {
  const [indexRes, dailyRes] = await Promise.allSettled([fetchPriceIndex(), fetchDailyPrices()])

  const index = indexRes.status === 'fulfilled' ? indexRes.value : null
  const daily = dailyRes.status === 'fulfilled' ? dailyRes.value : { prices: {}, ok: false }

  const table = buildPriceTable({ index, live: daily.prices, manual })

  const counts = { manual: 0, live: 0, 'index-adjusted': 0, baseline: 0 }
  for (const v of Object.values(table)) counts[v.provenance]++

  return {
    table,
    index,
    liveCount: Object.keys(daily.prices).length,
    bulletinOk: daily.ok,
    indexOk: index != null,
    counts,
    // 这句会原样显示在 UI 上，避免让人误以为拿到了湖北本地批发价
    disclaimer:
      '价格为全国指数折算的估算值，非湖北本地批发价。分市场分品种接口被图形验证码限制，可用下方手工改价填入你在菜场看到的真实价。',
    loadedAt: new Date().toISOString(),
  }
}

/* -------------------------------------------------------------- 手工改价 */

const MANUAL_KEY = 'chushan:manualPrices'

export function loadManualPrices() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveManualPrices(map) {
  try {
    localStorage.setItem(MANUAL_KEY, JSON.stringify(map))
    return true
  } catch {
    return false
  }
}
