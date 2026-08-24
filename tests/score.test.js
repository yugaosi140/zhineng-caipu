import { describe, expect, it } from 'vitest'

import {
  DIFFICULTY_CAPS,
  buildReason,
  difficultyAllowed,
  environmentScore,
  explainContributions,
  scoreDish,
} from '../src/engine/score.js'
import { buildContext } from '../src/engine/context.js'
import { buildDemand } from '../src/engine/demand.js'
import { MEAL_RULES } from '../src/engine/plan.js'

/** 只带需要的属性的最小菜品，其余维度留空（走 0.5 中性）。 */
function dish(properties = {}, extra = {}) {
  return {
    id: 'test-dish',
    name: '测试菜',
    difficulty: 2,
    timeMin: 20,
    servings: 2,
    ingredients: [],
    properties,
    nutrition: { kcal: 400, protein: 15, fat: 10, carbs: 50 },
    tags: [],
    ...extra,
  }
}

function weights(partial) {
  return { heavy: 0, digestibility: 0, spicy: 0, warming: 0, soupy: 0, oily: 0, hydrating: 0, ...partial }
}

describe('环境契合分', () => {
  it('权重为负时低属性值得分高', () => {
    // 这是 score.js 顶部注释里的核心设计：属性值中心化到 [-0.5, 0.5]，
    // 否则属性值 0 的菜在负权重下只能拿 0 分，无法体现"就是要清凉"
    const cool = environmentScore(dish({ warming: 0 }), weights({ warming: -1.2 }))
    const warm = environmentScore(dish({ warming: 1 }), weights({ warming: -1.2 }))
    expect(cool.score).toBeGreaterThan(0)
    expect(warm.score).toBeLessThan(0)
    expect(cool.score).toBeCloseTo(1.2, 5)
  })

  it('单维贡献的量级等于权重绝对值', () => {
    // 乘 2 的用意：让单维贡献回到 [-w, +w]，能和成本分、餐段分同尺度比较
    const { score } = environmentScore(dish({ spicy: 1 }), weights({ spicy: 0.8 }))
    expect(score).toBeCloseTo(0.8, 5)
  })

  it('权重为 0 的维度不产生贡献项', () => {
    const { contributions } = environmentScore(dish({ spicy: 1, heavy: 1 }), weights({}))
    expect(contributions).toHaveLength(0)
  })

  it('属性缺失按中性 0.5 处理，不影响分数', () => {
    const { score } = environmentScore(dish({}), weights({ warming: 1 }))
    expect(score).toBe(0)
  })

  it('越界属性值被夹到 0–1', () => {
    const clamped = environmentScore(dish({ warming: 5 }), weights({ warming: -1.2 }))
    const one = environmentScore(dish({ warming: 1 }), weights({ warming: -1.2 }))
    expect(clamped.score).toBeCloseTo(one.score, 5)
  })
})

describe('推荐理由的属性描述', () => {
  it('按贡献从大到小取，最多两条', () => {
    const labels = explainContributions([
      { dim: 'heavy', weight: 1, value: 1, gain: 0.5 },
      { dim: 'spicy', weight: 1, value: 1, gain: 0.9 },
      { dim: 'soupy', weight: 1, value: 1, gain: 0.2 },
    ])
    expect(labels).toEqual(['够辣', '丰盛'])
  })

  it('权重为负时给出"低"侧的说法', () => {
    expect(explainContributions([{ dim: 'oily', weight: -1, value: 0, gain: 0.5 }])).toEqual(['少油'])
  })

  it('贡献都很小时不硬凑理由', () => {
    expect(explainContributions([{ dim: 'heavy', weight: 1, value: 0.51, gain: 0.02 }])).toEqual([])
  })
})

describe('难度过滤', () => {
  it('是上限语义：选高难度的人也愿意做简单菜', () => {
    expect(DIFFICULTY_CAPS).toEqual({ low: 2, mid: 3, high: 5 })
    expect(difficultyAllowed({ difficulty: 1 }, 'high')).toBe(true)
    expect(difficultyAllowed({ difficulty: 5 }, 'high')).toBe(true)
    expect(difficultyAllowed({ difficulty: 3 }, 'low')).toBe(false)
    expect(difficultyAllowed({ difficulty: 2 }, 'low')).toBe(true)
  })

  it('难度缺失按 3 计，未知档位放开全部', () => {
    expect(difficultyAllowed({}, 'mid')).toBe(true)
    expect(difficultyAllowed({}, 'low')).toBe(false)
    expect(difficultyAllowed({ difficulty: 5 }, 'bogus')).toBe(true)
  })
})

describe('单菜总评', () => {
  const ctx = buildContext(
    { temperature: 30, apparentTemperature: 33, humidity: 80, windSpeed: 8, precipitation: 0, weatherCode: 2, elevation: 70 },
    new Date('2026-08-24T08:00:00+08:00'),
  )
  const demand = buildDemand(ctx)
  const base = { ctx, demand, priceTable: {}, wealth: 'mid' }

  it('同一天同一环境下结果稳定', () => {
    // 抖动用菜品 id 的确定性哈希，不能每次点刷新就换一批
    const a = scoreDish(dish(), { ...base, seedSalt: 'wuhan:2026-08-24' })
    const b = scoreDish(dish(), { ...base, seedSalt: 'wuhan:2026-08-24' })
    expect(a.total).toBe(b.total)
  })

  it('换城市或换天会得到不同抖动', () => {
    const a = scoreDish(dish(), { ...base, seedSalt: 'wuhan:2026-08-24' })
    const b = scoreDish(dish(), { ...base, seedSalt: 'enshi:2026-08-24' })
    expect(a.breakdown.jitter).not.toBe(b.breakdown.jitter)
  })

  it('抖动幅度不超过 ±0.15，不会翻转明显差距', () => {
    for (const id of ['a', 'bb', 'ccc', 'reganmian', 'dongporou']) {
      const { breakdown } = scoreDish(dish({}, { id }), { ...base, seedSalt: 'x' })
      expect(Math.abs(breakdown.jitter)).toBeLessThanOrEqual(0.15)
    }
  })

  it('总分等于各项之和', () => {
    const scored = scoreDish(dish({ warming: 0.2, oily: 0.3 }), { ...base, seedSalt: 's' })
    const { environment, meal, cost, region, altitude, jitter } = scored.breakdown
    expect(scored.total).toBeCloseTo(environment + meal + cost + region + altitude + jitter, 2)
  })

  it('明细含所有评分项，便于界面解释', () => {
    const scored = scoreDish(dish(), { ...base, seedSalt: 's' })
    expect(Object.keys(scored.breakdown).sort()).toEqual(
      ['altitude', 'cost', 'environment', 'jitter', 'meal', 'region'].sort(),
    )
  })

  it('传入餐段规则时计入餐段分', () => {
    const quick = scoreDish(dish({}, { timeMin: 10, tags: ['早点'] }), {
      ...base,
      mealRule: MEAL_RULES.breakfast,
      seedSalt: 's',
    })
    expect(quick.breakdown.meal).toBeGreaterThan(0)
    expect(quick.mealNotes.length).toBeGreaterThan(0)
  })

  it('不传餐段规则时餐段分为 0', () => {
    const scored = scoreDish(dish(), { ...base, seedSalt: 's' })
    expect(scored.breakdown.meal).toBe(0)
    expect(scored.mealNotes).toEqual([])
  })
})

describe('推荐理由拼装', () => {
  it('代表菜的地域说明排在最前', () => {
    const reason = buildReason({
      region: { kind: 'specialty', note: '武汉代表菜' },
      highlights: ['少油'],
      mealNotes: ['湖北经典早点'],
      costFit: { fit: 'in', note: '约 5 元/人，合中档预算' },
      cost: { perServing: 5 },
    })
    expect(reason.startsWith('武汉代表菜')).toBe(true)
    expect(reason).toContain('推荐少油的菜')
  })

  it('同地归属不进理由，避免每道菜都挂一句本地', () => {
    const reason = buildReason({
      region: { kind: 'same-region', note: '武汉本地菜' },
      highlights: [],
      mealNotes: [],
      costFit: { fit: 'in', note: '' },
      cost: { perServing: 0 },
    })
    expect(reason).not.toContain('本地菜')
  })

  it('成本未知时不提预算', () => {
    const reason = buildReason({
      region: { kind: 'none', note: '' },
      highlights: ['清简'],
      mealNotes: [],
      costFit: { fit: 'in', note: '成本未知' },
      cost: { perServing: 0 },
    })
    expect(reason).toBe('推荐清简的菜')
  })

  it('超预算时不把预算说明当卖点', () => {
    const reason = buildReason({
      region: { kind: 'none', note: '' },
      highlights: [],
      mealNotes: [],
      costFit: { fit: 'over', note: '约 30 元/人，高于中档预算' },
      cost: { perServing: 30 },
    })
    expect(reason).toBe('')
  })
})
