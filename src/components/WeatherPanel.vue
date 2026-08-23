<script setup>
/**
 * 天气面板：一键获取 + 环境画像展示。
 *
 * 数据源是 Open-Meteo，界面上明确标注 —— 不是气象局直连。
 */
import { computed } from 'vue'
import { state, city, context, contextText, refreshWeather } from '../stores/app.js'
import { weatherText } from '../api/weather.js'

const w = computed(() => state.weather)
const ctx = computed(() => context.value)
const locationLabel = computed(() => state.weatherLocationLabel ?? city.value.name)
const locationHint = computed(() => {
  if (state.locationStatus === 'locating') return '正在获取当前位置…'
  if (state.locationStatus === 'denied') return '定位未启用，已切换为手动地区获取。'
  if (state.locationStatus === 'unavailable') return '当前浏览器不支持定位，请手动选择地区。'
  return ''
})

const observed = computed(() => {
  if (!state.weatherAt) return ''
  return state.weatherAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})

/** 展示用的读数行。海拔单列，因为它是这个 app 的特色维度。 */
const readings = computed(() => {
  if (!w.value) return []
  const r = w.value
  return [
    { label: '气温', value: r.temperature != null ? `${r.temperature}°C` : '—' },
    { label: '体感', value: r.apparentTemperature != null ? `${r.apparentTemperature}°C` : '—' },
    { label: '湿度', value: r.humidity != null ? `${r.humidity}%` : '—' },
    { label: '风速', value: r.windSpeed != null ? `${r.windSpeed} km/h` : '—' },
    { label: '降水', value: `${r.precipitation ?? 0} mm` },
    { label: '海拔', value: r.elevation != null ? `${Math.round(r.elevation)} m` : '—' },
  ]
})
</script>

<template>
  <section class="card" aria-labelledby="weather-title">
    <div class="card-head">
      <h2 id="weather-title" class="card-title">实时天气 · {{ locationLabel }}</h2>
      <button
        class="btn"
        :disabled="state.weatherLoading"
        @click="refreshWeather()"
      >
        {{ state.weatherLoading ? '获取中…' : '手动重新获取' }}
      </button>
    </div>

    <p v-if="state.weatherError" class="alert" role="alert">
      {{ state.weatherError }}
    </p>

    <p v-else-if="!w" class="muted" style="margin: 0">
      {{ locationHint || `正在准备 ${city.name} 的天气数据…` }}
    </p>

    <template v-else>
      <div class="readings">
        <div v-for="r in readings" :key="r.label" class="reading">
          <span class="reading-label">{{ r.label }}</span>
          <span class="reading-value">{{ r.value }}</span>
        </div>
      </div>

      <div v-if="ctx" class="ctx-tags">
        <span class="tag tag-good">{{ weatherText(w.weatherCode) }}</span>
        <span class="tag">{{ ctx.feel.label }}</span>
        <span class="tag">湿度{{ ctx.humidity.label }}</span>
        <span class="tag">{{ ctx.wind.label }}</span>
        <span v-if="ctx.precip.key !== 'none'" class="tag">{{ ctx.precip.label }}</span>
        <span v-if="ctx.altitude.key !== 'low'" class="tag tag-warn">
          {{ ctx.altitude.label }} · 沸点 {{ ctx.boilingPoint }}°C
        </span>
        <span class="tag">{{ ctx.season.label }}·{{ ctx.solarTerm }}</span>
        <span v-if="ctx.plumRain" class="tag tag-warn">梅雨季</span>
        <span v-else-if="ctx.dogDays" class="tag tag-warn">三伏</span>
      </div>

      <p class="faint" style="margin: 10px 0 0">
        {{ contextText }} ·
        数据源 Open-Meteo（{{ observed }} 获取）。定位坐标仅用于本次天气请求，不会保存。
      </p>
    </template>
  </section>
</template>

<style scoped>
.readings {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 10px;
  margin-bottom: 12px;
}

.reading {
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}

.reading-label {
  display: block;
  font-size: 11.5px;
  color: var(--text-faint);
}

.reading-value {
  display: block;
  font-size: 17px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
}

.ctx-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
