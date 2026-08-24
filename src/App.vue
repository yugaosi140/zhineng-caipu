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
import DayPlanPanel from './components/DayPlanPanel.vue'
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
      湖北 17 市州 · {{ state.dishes.length }} 道楚菜 · 天气来自 Open-Meteo，菜价来自农业农村部公开数据
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

      <DayPlanPanel />
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
