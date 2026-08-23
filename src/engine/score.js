/**
 * 评分：需求权重 × 菜品属性 + 成本契合 − 惩罚 + 多样性抖动。
 *
 * 设计要点：
 * 1. 属性值是 0–1，权重有正有负。为了让"权重为负时低属性值得分高"，
 *    这里把属性值中心化到 [-0.5, 0.5] 再乘权重 —— 否则属性值 0 的菜
 *    在负权重下只能拿 0 分，无法体现"就是要清凉"这个诉求。
 * 2. 每一项贡献都记下来，可解释性直接从这里生成。
 * 3. 抖动用菜品 id 的确定性哈希，同一天同一环境下结果稳定，
 *    不会每次点刷新就跳一批（但换天/换城市会变）。
 */

import { DIMENSIONS, altitudePenalty } from './demand.js'
import { estimateDishCost, costFit } from './cost.js'

/** 属性值中心化：0 → -0.5，1 → +0.5。 */
function centered(v) {
  const x = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5
  return x - 0.5
}

/** 确定性哈希 → [0,1)，用于稳定的多样性抖动。 */
function stableJitter(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 1000) / 1000
}

/** 属性维度 → 人话（用于生成理由）。 */
const DIM_LABEL = {
  heavy: { high: '丰盛', low: '清简' },
  digestibility: { high: '好消化', low: '偏厚重' },
  spicy: { high: '够辣', low: '不辣' },
  warming: { high: '温补', low: '清凉' },
  soupy: { high: '带汤水', low: '干香' },
  oily: { high: '油润', low: '少油' },
  hydrating: { high: '生津', low: '偏干' },
}

/**
 * 环境契合分。
 *
 * @returns {{score:number, contributions:Array<{dim:string,weight:number,value:number,gain:number}>}}
 */
export function environmentScore(dish, weights) {
  const props = dish.properties || {}
  const contributions = []
  let score = 0

  for (const dim of DIMENSIONS) {
    const w = weights[dim] ?? 0
    if (w === 0) continue
    const v = props[dim]
    // 乘 2 让单维贡献回到 [-w, +w] 量级，便于和成本分、餐段分同尺度比较
    const gain = w * centered(v) * 2
    score += gain
    contributions.push({ dim, weight: w, value: v ?? null, gain })
  }

  return { score, contributions }
}

/**
 * 从贡献里挑出最能解释"为什么是这道菜"的正向项。
 * 只取正贡献，且按绝对值排序，最多 2 条 —— 理由太多反而没说服力。
 */
export function explainContributions(contributions, limit = 2) {
    const positive = contributions
    .filter((c) => c.gain > 0.08)
    .sort((a, b) => b.gain - a.gain)
    .slice(0, limit)

  return positive.map((c) => {
    const label = DIM_LABEL[c.dim]
    if (!label) return c.dim
    // 权重为正 → 想要高属性值；为负 → 想要低属性值
    return c.weight > 0 ? label.high : label.low
  })
}

/**
 * 单道菜的完整评分。
 *
 * @param {object} dish
 * @param {object} params
 * @param {object} params.ctx        环境画像
 * @param {object} params.demand     buildDemand 结果
 * @param {object} params.priceTable 价格表
 * @param {string} params.wealth     low|mid|high
 * @param {object} [params.mealRule] 餐段规则（plan.js 提供）
 * @param {string} [params.seedSalt] 抖动盐（通常是日期+城市）
 */
export function scoreDish(dish, { ctx, demand, priceTable, wealth = 'mid', mealRule = null, seedSalt = '' }) {
  const env = environmentScore(dish, demand.weights)
  const cost = estimateDishCost(dish, priceTable)
  const fit = costFit(cost.perServing, wealth)
  const altPenalty = altitudePenalty(ctx, dish)

  const mealScore = mealRule ? mealRule.score(dish, ctx) : 0
  const mealNotes = mealRule ? mealRule.notes(dish, ctx) : []

  // 抖动幅度很小（±0.15），只在分数接近时起打散作用，不会翻转明显差距
  const jitter = (stableJitter(dish.id + seedSalt) - 0.5) * 0.3

  const total =
    Math.round((env.score + mealScore + fit.score + altPenalty + jitter) * 1000) / 1000

  return {
    dish,
    total,
    breakdown: {
      environment: Math.round(env.score * 1000) / 1000,
      meal: Math.round(mealScore * 1000) / 1000,
      cost: Math.round(fit.score * 1000) / 1000,
      altitude: altPenalty,
      jitter: Math.round(jitter * 1000) / 1000,
    },
    cost,
    costFit: fit,
    contributions: env.contributions,
    highlights: explainContributions(env.contributions),
    mealNotes,
  }
}

/**
 * 难度过滤。低=1–2，中=3，高=4–5。
 * 注意是"上限"语义：选"高"的人也愿意做简单菜，所以是 ≤ 上限。
 */
export const DIFFICULTY_CAPS = { low: 2, mid: 3, high: 5 }

export function difficultyAllowed(dish, level) {
  const cap = DIFFICULTY_CAPS[level] ?? 5
  return (dish.difficulty ?? 3) <= cap
}

/**
 * 生成一句推荐理由。
 *
 * 只讲"为什么是这道菜"——环境画像（体感多少度、湿度多高）是全局的，
 * 界面顶部已经展示过一次，逐条重复会把列表撑得又长又吵，
 * 展开到几十道时尤其明显。
 *
 * @param {object} scored scoreDish 结果
 */
export function buildReason(scored) {
  const parts = []

  if (scored.highlights.length) {
    parts.push(`推荐${scored.highlights.join('、')}的菜`)
  }
  if (scored.mealNotes.length) {
    parts.push(scored.mealNotes[0])
  }
  if (scored.costFit.fit === 'in' && scored.cost.perServing > 0) {
    parts.push(scored.costFit.note)
  }

  return parts.join(' · ')
}

