<script setup>
/**
 * 筛选控件：城市 + 财富值三档 + 难度三档。
 * 对应需求第 5 点。
 */
import { state, setCity, setWealth, setDifficulty } from '../stores/app.js'

const WEALTH = [
  { key: 'low', label: '低', hint: '约 8 元/人以内' },
  { key: 'mid', label: '中', hint: '约 3–22 元/人' },
  { key: 'high', label: '高', hint: '10 元/人以上，放开食材' },
]

const DIFFICULTY = [
  { key: 'low', label: '低', hint: '1–2 星，基础翻炒' },
  { key: 'mid', label: '中', hint: '3 星以内，需掌握火候' },
  { key: 'high', label: '高', hint: '不限，含复杂工序' },
]
</script>

<template>
  <section class="card" aria-labelledby="ctrl-title">
    <h2 id="ctrl-title" class="card-title" style="margin-bottom: 14px">推荐条件</h2>

    <div class="controls-row">
      <div>
        <label class="field-label" for="city-select">地区</label>
        <select
          id="city-select"
          :value="state.cityId"
          @change="setCity($event.target.value)"
        >
          <option v-for="c in state.cities" :key="c.id" :value="c.id">
            {{ c.name }}
          </option>
        </select>
      </div>

      <div>
        <span class="field-label" id="wealth-label">财富值</span>
        <div class="seg" role="group" aria-labelledby="wealth-label">
          <button
            v-for="w in WEALTH"
            :key="w.key"
            type="button"
            :aria-pressed="state.wealth === w.key"
            :title="w.hint"
            @click="setWealth(w.key)"
          >
            {{ w.label }}
          </button>
        </div>
      </div>

      <div>
        <span class="field-label" id="diff-label">菜谱难度</span>
        <div class="seg" role="group" aria-labelledby="diff-label">
          <button
            v-for="d in DIFFICULTY"
            :key="d.key"
            type="button"
            :aria-pressed="state.difficulty === d.key"
            :title="d.hint"
            @click="setDifficulty(d.key)"
          >
            {{ d.label }}
          </button>
        </div>
      </div>
    </div>

    <p class="faint" style="margin: 12px 0 0">
      财富值按每人食材成本估算，难度是上限而非区间 —— 选「高」也会出简单菜。
      某档候选不足 3 道时会自动放宽并在下方标注。
    </p>
    <p class="faint price-scope-note">
      菜价范围：当前为全国指数折算估算，不是武汉或湖北市级实时实价；选择地区会同步刷新天气和菜价，后续接入本地市场数据后可按市替换。
    </p>
  </section>
</template>

<style scoped>
.price-scope-note {
  margin: 6px 0 0;
}
</style>
