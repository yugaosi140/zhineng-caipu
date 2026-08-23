/**
 * 需求权重：环境画像 → 菜品属性的权重向量。
 *
 * 菜品侧有 7 个 0–1 属性，这里为每个属性算一个权重。
 * 权重为正表示"此刻想要这个属性高的菜"，为负表示想避开。
 *
 * 每条规则都记录一句人话理由，最终推荐卡片上的解释就来自这里。
 */

/** 菜品属性维度。dishes.hubei.json 里的 properties 必须齐这 7 项。 */
export const DIMENSIONS = [
  'heavy', // 丰盛度
  'digestibility', // 易消化
  'spicy', // 辛辣
  'warming', // 温补（低=清凉）
  'soupy', // 汤水
  'oily', // 油腻
  'hydrating', // 补水
]

function zeroWeights() {
  return DIMENSIONS.reduce((acc, k) => ((acc[k] = 0), acc), {})
}

/**
 * 规则表。每条规则：命中条件 + 权重增量 + 理由。
 * 拆成数据而非 if/else，是为了让"为什么推荐这道菜"能自动生成。
 */
const RULES = [
  {
    id: 'scorching',
    when: (ctx) => ctx.feel.key === 'scorching',
    delta: { warming: -1.2, hydrating: 0.8, oily: -1.0, heavy: -0.5, spicy: -0.2 },
    reason: (ctx) => `体感 ${Math.round(ctx.raw.apparentTemperature ?? ctx.raw.temperature)}°C 酷热，偏清凉少油`,
  },
  {
    id: 'hot',
    when: (ctx) => ctx.feel.key === 'hot',
    delta: { warming: -0.6, hydrating: 0.5, oily: -0.5, heavy: -0.2 },
    reason: () => '天气偏热，清爽为主',
  },
  {
    id: 'cool',
    when: (ctx) => ctx.feel.key === 'cool',
    delta: { warming: 0.6, soupy: 0.4, heavy: 0.3 },
    reason: () => '天气转凉，适合热食',
  },
  {
    id: 'cold',
    when: (ctx) => ctx.feel.key === 'cold',
    delta: { warming: 1.2, soupy: 0.8, heavy: 0.6, oily: 0.2 },
    reason: () => '气温偏低，宜温补热汤',
  },
  {
    id: 'humid',
    when: (ctx) => ctx.humidity.key === 'humid',
    // 楚菜用辛辣祛湿是本地饮食传统，湿度高时适度加权
    delta: { spicy: 0.5, oily: -0.3 },
    reason: (ctx) => `湿度 ${Math.round(ctx.raw.humidity)}%，湖北人讲究吃点辣祛湿`,
  },
  {
    id: 'dry',
    when: (ctx) => ctx.humidity.key === 'dry',
    delta: { soupy: 0.6, hydrating: 0.4, oily: -0.4 },
    reason: () => '空气干燥，多喝汤水润一润',
  },
  {
    id: 'strongWind',
    when: (ctx) => ctx.wind.key === 'strong',
    delta: { warming: 0.4, soupy: 0.4 },
    reason: (ctx) => `${ctx.wind.label}（${Math.round(ctx.raw.windSpeed)}km/h），偏炖煮暖身`,
  },
  {
    id: 'rain',
    when: (ctx) => ['rain', 'storm', 'drizzle'].includes(ctx.precip.key),
    delta: { soupy: 0.3, warming: 0.3 },
    reason: (ctx) => `${ctx.precip.label}，适合在家做汤水菜`,
  },
  {
    id: 'plumRain',
    when: (ctx) => ctx.plumRain,
    delta: { spicy: 0.4, oily: -0.2, digestibility: 0.3 },
    reason: () => '梅雨季湿气重，宜开胃祛湿',
  },
  {
    id: 'dogDays',
    when: (ctx) => ctx.dogDays,
    delta: { hydrating: 0.5, warming: -0.5, heavy: -0.3 },
    reason: () => '三伏天，以清补生津为宜',
  },
  {
    id: 'highAltitude',
    when: (ctx) => ctx.altitude.key === 'high',
    // 沸点低，久炖久煮煮不透，改推蒸炒煎
    delta: { soupy: -0.5, warming: 0.3 },
    reason: (ctx) => `${ctx.altitude.label} ${Math.round(ctx.raw.elevation)}m，沸点约 ${ctx.boilingPoint}°C，久炖不易熟`,
  },
  {
    id: 'midAltitude',
    when: (ctx) => ctx.altitude.key === 'mid',
    delta: { warming: 0.2 },
    reason: () => '山区气候偏凉',
  },
]

/**
 * 环境画像 → 权重向量 + 命中理由。
 *
 * @returns {{weights: Record<string, number>, reasons: string[], hits: string[]}}
 */
export function buildDemand(ctx) {
  const weights = zeroWeights()
  const reasons = []
  const hits = []

  for (const rule of RULES) {
    if (!rule.when(ctx)) continue
    hits.push(rule.id)
    reasons.push(rule.reason(ctx))
    for (const [dim, v] of Object.entries(rule.delta)) {
      weights[dim] = (weights[dim] ?? 0) + v
    }
  }

  return { weights, reasons, hits }
}

/**
 * 高海拔时长时间炖煮的菜要额外扣分（沸点低煮不透），
 * 这个惩罚跟做法有关而非属性，所以单独给出。
 */
export function altitudePenalty(ctx, dish) {
  if (ctx.altitude.key !== 'high') return 0
  const slowCook = (dish.tags || []).some((t) => ['炖', '卤', '煨', '煲'].includes(t))
  if (!slowCook) return 0
  return dish.timeMin >= 60 ? -1.5 : -0.6
}

