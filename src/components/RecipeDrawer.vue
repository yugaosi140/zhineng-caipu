<script setup>
/**
 * 菜谱抽屉。展示配料、步骤、要点。
 * 焦点管理和 Esc 关闭按可访问性要求处理。
 */
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { state, closeDish } from '../stores/app.js'

const panel = ref(null)
let lastFocused = null

watch(
  () => state.activeDish,
  async (dish) => {
    if (dish) {
      lastFocused = document.activeElement
      await nextTick()
      panel.value?.focus()
      document.addEventListener('keydown', onKey)
    } else {
      document.removeEventListener('keydown', onKey)
      lastFocused?.focus?.()
    }
  },
)

function onKey(e) {
  if (e.key === 'Escape') closeDish()
}

onBeforeUnmount(() => document.removeEventListener('keydown', onKey))

const DIFF_TEXT = {
  1: '极简，会烧水就行',
  2: '简单，基础翻炒',
  3: '中等，需掌握火候或多步骤',
  4: '偏难，刀工火候有门槛',
  5: '难，工序复杂',
}
</script>

<template>
  <Teleport to="body">
    <div v-if="state.activeDish" class="backdrop" @click.self="closeDish">
      <div
        ref="panel"
        class="drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="`${state.activeDish.name} 菜谱`"
        tabindex="-1"
      >
        <div class="drawer-head">
          <div>
            <h2 class="drawer-title">{{ state.activeDish.name }}</h2>
            <p class="faint" style="margin: 2px 0 0">
              {{ state.activeDish.region }} ·
              {{ DIFF_TEXT[state.activeDish.difficulty] }} ·
              {{ state.activeDish.timeMin }} 分钟 ·
              {{ state.activeDish.servings }} 人份
            </p>
          </div>
          <button class="close-btn" aria-label="关闭菜谱" @click="closeDish">×</button>
        </div>

        <div class="drawer-body">
          <div class="tags">
            <span v-for="t in state.activeDish.tags" :key="t" class="tag">{{ t }}</span>
          </div>

          <h3 class="sec-title">配料</h3>
          <ul class="ing-list">
            <li v-for="(ing, i) in state.activeDish.ingredients" :key="i">
              <span>{{ ing.name }}</span>
              <span class="muted">{{ ing.qty }} {{ ing.unit }}</span>
            </li>
          </ul>

          <h3 class="sec-title">做法</h3>
          <ol class="step-list">
            <li v-for="(s, i) in state.activeDish.recipe.steps" :key="i">{{ s }}</li>
          </ol>

          <template v-if="state.activeDish.recipe.tips">
            <h3 class="sec-title">要点</h3>
            <p class="tips">{{ state.activeDish.recipe.tips }}</p>
          </template>

          <h3 class="sec-title">参考营养（每份估算）</h3>
          <div class="nutri">
            <span>{{ state.activeDish.nutrition.kcal }} kcal</span>
            <span>蛋白 {{ state.activeDish.nutrition.protein }}g</span>
            <span>脂肪 {{ state.activeDish.nutrition.fat }}g</span>
            <span>碳水 {{ state.activeDish.nutrition.carbs }}g</span>
          </div>
          <p class="faint" style="margin-top: 6px">
            营养值按常见配比估算，非实测数据，仅供参考。
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  display: flex;
  justify-content: flex-end;
  z-index: 100;
}

.drawer {
  background: var(--surface);
  width: min(460px, 100%);
  height: 100%;
  overflow-y: auto;
  box-shadow: -4px 0 24px rgba(16, 24, 40, 0.18);
}

.drawer-head {
  position: sticky;
  top: 0;
  background: var(--surface);
  border-bottom: 1px solid var(--line);
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.drawer-title {
  font-size: 19px;
  font-weight: 700;
  margin: 0;
}

.close-btn {
  background: transparent;
  border: 0;
  font-size: 26px;
  line-height: 1;
  color: var(--text-dim);
  padding: 0 4px;
}

.close-btn:hover {
  color: var(--text);
}

.drawer-body {
  padding: 16px 20px 40px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 16px;
}

.sec-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-dim);
  letter-spacing: 0.04em;
  margin: 18px 0 8px;
}

.ing-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.ing-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--line);
  font-size: 14px;
}

.step-list {
  margin: 0;
  padding-left: 20px;
}

.step-list li {
  margin-bottom: 10px;
  font-size: 14px;
  line-height: 1.65;
}

.tips {
  background: var(--surface-2);
  border-left: 3px solid var(--accent);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  padding: 10px 12px;
  margin: 0;
  font-size: 13.5px;
  line-height: 1.65;
}

.nutri {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13.5px;
  font-variant-numeric: tabular-nums;
  color: var(--text-dim);
}
</style>
