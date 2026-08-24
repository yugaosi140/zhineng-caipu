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
import { buildShoppingList, summarizeNutrition, assessNutrition } from '../engine/shopping.js'

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
  weatherLocationLabel: null,
  locationStatus: 'idle',

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
    cityId: state.cityId,
    seedSalt: `${state.cityId}:${new Date().toISOString().slice(0, 10)}`,
  })
})

/**
 * 今日实际要做的菜。
 *
 * 推荐列表里每餐给的是候选，但采购和营养要算的是"真的会做的那几道"：
 * 早晚各取重点推荐一道，中餐取组合出的整套（主菜+素菜+汤）。
 * 一天 5 道菜是家庭常态，把 9 道候选全算进采购清单没有意义。
 */
export const dayDishes = computed(() => {
  if (!plan.value) return []
  const picks = [
    ...plan.value.breakfast.items.slice(0, 1),
    ...plan.value.lunch.items,
    ...plan.value.dinner.items.slice(0, 1),
  ]
  // 同一道菜可能同时出现在中餐组合和晚餐里，按 id 去重
  const seen = new Set()
  return picks.filter((item) => {
    if (seen.has(item.dish.id)) return false
    seen.add(item.dish.id)
    return true
  })
})

/** 采购清单：按类别归并同名配料。 */
export const shoppingList = computed(() =>
  dayDishes.value.length
    ? buildShoppingList(
      dayDishes.value.map((item) => item.dish),
      priceTable.value,
    )
    : null,
)

/** 当日营养汇总 + 参考值对照。 */
export const nutritionSummary = computed(() => {
  if (!dayDishes.value.length) return null
  const totals = summarizeNutrition(dayDishes.value.map((item) => item.dish))
  return { totals, compare: assessNutrition(totals) }
})

/* ------------------------------------------------------------------ 动作 */

export async function refreshWeather(coords = city.value, label = city.value.name) {
  state.weatherLoading = true
  state.weatherError = null
  state.locationStatus = label === '当前位置' ? 'located' : 'city'
  try {
    state.weather = await fetchWeather({ lat: coords.lat, lon: coords.lon })
    state.weatherAt = new Date()
    state.weatherLocationLabel = label
  } catch (err) {
    state.weatherError = err?.message || '天气获取失败'
  } finally {
    state.weatherLoading = false
  }
}

export async function refreshWeatherFromLocation() {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    state.locationStatus = 'unavailable'
    state.weatherError = '当前浏览器不支持定位。请选择地区后手动获取天气。'
    return
  }
  state.weatherLoading = true
  state.weatherError = null
  state.locationStatus = 'locating'
  try {
    const position = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 10 * 60 * 1000,
      })
    })
    await refreshWeather({ lat: position.coords.latitude, lon: position.coords.longitude }, '当前位置')
  } catch (err) {
    state.locationStatus = 'denied'
    state.weatherLoading = false
    state.weatherError = err?.code === 1
      ? `未获得定位权限。请选择「${city.value.name}」或其他地区后手动获取天气。`
      : `定位失败。请选择「${city.value.name}」或其他地区后手动获取天气。`
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

export function refreshSelectedLocation() {
  return Promise.allSettled([refreshWeather(), refreshPrices()])
}

export function setCity(id) {
  state.cityId = id
  state.weatherLocationLabel = city.value.name
  state.locationStatus = 'city'
  persist()
  void refreshSelectedLocation()
}

export function initializeApp() {
  void refreshPrices()
  void refreshWeatherFromLocation()
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
