<script setup>
/**
 * 楚膳 —— 湖北智能三餐推荐。
 *
 * 天气、菜价各自一键获取；财富值和难度三档可选；
 * 三餐按「早餐简单 / 中午丰盛 / 晚上消食」的规则分别组配。
 */
import { computed, onMounted } from 'vue'
import { state, plan, demand, initializeApp } from './stores/app.js'

import WeatherPanel from './components/WeatherPanel.vue'
import PricePanel from './components/PricePanel.vue'
import PrefControls from './components/PrefControls.vue'
import MealCard from './components/MealCard.vue'
import RecipeDrawer from './components/RecipeDrawer.vue'

const MEAL_HINTS = {
  breakfast: '尽量简单，25 分钟内能上桌',
  lunch: '一荤一素一汤，中午吃得丰盛些',
  dinner: '清淡消食为主，不压肠胃',
}

/** 命中的环境规则，展示给用户看推荐依据。 */
const reasons = computed(() => demand.value?.reasons ?? [])

onMounted(() => initializeApp())
</script>

<template>
  <div class="app">
    <header class="app-header">
      <h1 class="app-title">楚膳</h1>
      <span class="app-sub">按天气、时令、菜价和你的条件，推荐湖北三餐</span>
    </header>
    <p class="app-note">
      湖北 17 市州 · 80 道楚菜 · 天气来自 Open-Meteo，菜价来自农业农村部公开数据
    </p>

    <WeatherPanel />
    <PricePanel />
    <PrefControls />

    <section v-if="plan" aria-labelledby="rec-title">
      <div class="rec-head">
        <h2 id="rec-title" class="card-title">今日推荐</h2>
        <div v-if="reasons.length" class="reasons">
          <span v-for="(r, i) in reasons" :key="i" class="tag tag-good">{{ r }}</span>
        </div>
      </div>

      <div class="meals">
        <MealCard :block="plan.breakfast" :hint="MEAL_HINTS.breakfast" />
        <MealCard :block="plan.lunch" :hint="MEAL_HINTS.lunch" />
        <MealCard :block="plan.dinner" :hint="MEAL_HINTS.dinner" />
      </div>

      <p class="faint" style="margin-top: 14px">
        点任意一道菜查看完整菜谱。成本按食材估算，不含调味料和燃气；
        营养值为估算值。菜谱为家常做法参考。
      </p>
    </section>

    <section v-else class="card empty">
      <p class="muted" style="margin: 0">
        先获取天气，三餐推荐会出现在这里。菜价可选，不获取也能推荐。
      </p>
    </section>

    <RecipeDrawer />
  </div>
</template>

<style scoped>
.rec-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 22px 0 0;
}

.reasons {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.empty {
  margin-top: 14px;
  text-align: center;
  padding: 32px 18px;
}
</style>
/**
 * 全局状态。用 Vue 的响应式原语手写，不引 Pinia —— 这一版只有一份状态树，
 * 引入状态库反而多一层间接。
 */

import { reactive, computed } from 'vue'

import citiesData from '../data/cities.hubei.json'
import dishesData from '../data/dishes.hubei.json'

import { fetchWeather } from '../api/weather.js'
import { loadPrices, loadManualPrices, saveManualPrices } from '../api/price.js'

import { buildContext, describeContext } from '../engine/context.js'
import { buildDemand } from '../engine/demand.js'
import { planDay } from '../engine/plan.js'

const LS_PREFS = 'chushan:prefs'

function loadPrefs() {
  try {
    const raw = localStorage.getItem(LS_PREFS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function savePrefs(p) {
  try {
    localStorage.setItem(LS_PREFS, JSON.stringify(p))
  } catch {
    /* 隐私模式下忽略 */
  }
}

const saved = loadPrefs()

export const state = reactive({
  cities: citiesData.cities,
  dishes: dishesData.dishes,

  cityId: saved.cityId ?? citiesData.default,
  wealth: saved.wealth ?? 'mid',
  difficulty: saved.difficulty ?? 'mid',

  weather: null,
  weatherLoading: false,
  weatherError: null,
  weatherAt: null,

  prices: null,
  pricesLoading: false,
  pricesError: null,

  manualPrices: loadManualPrices(),

  // 菜谱抽屉
  activeDish: null,
})

export const city = computed(
  () => state.cities.find((c) => c.id === state.cityId) ?? state.cities[0],
)

/** 价格表。菜价未加载时用空表 —— 引擎会把成本算作 0 并跳过成本项。 */
export const priceTable = computed(() => state.prices?.table ?? {})

export const context = computed(() =>
  state.weather ? buildContext(state.weather, new Date()) : null,
)

export const contextText = computed(() =>
  context.value ? describeContext(context.value) : '',
)

export const demand = computed(() => (context.value ? buildDemand(context.value) : null))

/** 三餐推荐。天气未获取时为 null，UI 显示引导态。 */
export const plan = computed(() => {
  if (!context.value || !demand.value) return null
  return planDay(state.dishes, {
    ctx: context.value,
    demand: demand.value,
    priceTable: priceTable.value,
    wealth: state.wealth,
    difficulty: state.difficulty,
    seedSalt: `${state.cityId}:${new Date().toISOString().slice(0, 10)}`,
  })
})

/* ------------------------------------------------------------------ 动作 */

export async function refreshWeather() {
  state.weatherLoading = true
  state.weatherError = null
  try {
    state.weather = await fetchWeather({ lat: city.value.lat, lon: city.value.lon })
    state.weatherAt = new Date()
  } catch (err) {
    state.weatherError = err?.message || '天气获取失败'
  } finally {
    state.weatherLoading = false
  }
}

export async function refreshPrices() {
  state.pricesLoading = true
  state.pricesError = null
  try {
    state.prices = await loadPrices(state.manualPrices)
  } catch (err) {
    state.pricesError = err?.message || '菜价获取失败'
  } finally {
    state.pricesLoading = false
  }
}

export function setCity(id) {
  state.cityId = id
  persist()
  // 换城市后天气必然过期，直接重取
  if (state.weather) refreshWeather()
}

export function setWealth(v) {
  state.wealth = v
  persist()
}

export function setDifficulty(v) {
  state.difficulty = v
  persist()
}

/** 手工改价：写 localStorage 并就地重算价格表。 */
export function setManualPrice(name, value) {
  const next = { ...state.manualPrices }
  if (value == null || value === '' || !(Number(value) > 0)) {
    delete next[name]
  } else {
    next[name] = Number(value)
  }
  state.manualPrices = next
  saveManualPrices(next)
  if (state.prices) refreshPrices()
}

export function openDish(dish) {
  state.activeDish = dish
}

export function closeDish() {
  state.activeDish = null
}

function persist() {
  savePrefs({ cityId: state.cityId, wealth: state.wealth, difficulty: state.difficulty })
}
