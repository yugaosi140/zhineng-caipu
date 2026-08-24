import { describe, expect, it } from 'vitest'

import { buildContext } from '../src/engine/context.js'
import { DIMENSIONS, altitudePenalty, buildDemand } from '../src/engine/demand.js'

/** 造一个环境画像。默认温和无风无雨的平原，按需覆盖。 */
function ctxOf(overrides = {}, now = new Date('2026-10-15T08:00:00+08:00')) {
  return buildContext(
    {
      temperature: 22,
      apparentTemperature: 22,
      humidity: 55,
      windSpeed: 5,
      precipitation: 0,
      weatherCode: 0,
      elevation: 30,
      ...overrides,
    },
    now,
  )
}

describe('需求权重', () => {
  it('温和天气不触发任何规则，权重全零', () => {
    const { weights, hits } = buildDemand(ctxOf())
    expect(hits).toEqual([])
    for (const dim of DIMENSIONS) expect(weights[dim]).toBe(0)
  })

  it('权重向量始终包含全部七个维度', () => {
    const { weights } = buildDemand(ctxOf({ apparentTemperature: 38 }))
    expect(Object.keys(weights).sort()).toEqual([...DIMENSIONS].sort())
  })

  it('酷热天要清凉少油，warming 和 oily 为负', () => {
    const { weights, hits } = buildDemand(ctxOf({ apparentTemperature: 38 }))
    expect(hits).toContain('scorching')
    expect(weights.warming).toBeLessThan(0)
    expect(weights.oily).toBeLessThan(0)
    expect(weights.hydrating).toBeGreaterThan(0)
  })

  it('寒冷天要温补汤水，warming 和 soupy 为正', () => {
    const { weights, hits } = buildDemand(ctxOf({ apparentTemperature: 2 }))
    expect(hits).toContain('cold')
    expect(weights.warming).toBeGreaterThan(0)
    expect(weights.soupy).toBeGreaterThan(0)
  })

  it('冷热规则互斥，不会同时命中', () => {
    const hot = buildDemand(ctxOf({ apparentTemperature: 30 })).hits
    expect(hot).toContain('hot')
    expect(hot).not.toContain('scorching')
    expect(hot).not.toContain('cold')
  })

  it('潮湿加辣（本地祛湿传统），干燥加汤水', () => {
    expect(buildDemand(ctxOf({ humidity: 85 })).weights.spicy).toBeGreaterThan(0)
    expect(buildDemand(ctxOf({ humidity: 30 })).weights.soupy).toBeGreaterThan(0)
  })

  it('多条规则命中时权重累加', () => {
    // 寒冷 + 大风都会推 warming，应叠加而非互相覆盖
    const cold = buildDemand(ctxOf({ apparentTemperature: 2 }))
    const coldWindy = buildDemand(ctxOf({ apparentTemperature: 2, windSpeed: 30 }))
    expect(coldWindy.hits).toContain('strongWind')
    expect(coldWindy.weights.warming).toBeGreaterThan(cold.weights.warming)
  })

  it('高海拔抑制汤水（沸点低炖不透）', () => {
    const { weights, hits } = buildDemand(ctxOf({ elevation: 1700 }))
    expect(hits).toContain('highAltitude')
    expect(weights.soupy).toBeLessThan(0)
  })

  it('梅雨季和三伏各自命中对应规则', () => {
    expect(buildDemand(ctxOf({}, new Date('2026-06-20T08:00:00+08:00'))).hits).toContain('plumRain')
    expect(buildDemand(ctxOf({}, new Date('2026-08-10T08:00:00+08:00'))).hits).toContain('dogDays')
  })

  it('每条命中规则都给出一句可读理由', () => {
    const { hits, reasons } = buildDemand(ctxOf({ apparentTemperature: 38, humidity: 85 }))
    expect(reasons).toHaveLength(hits.length)
    for (const reason of reasons) {
      expect(typeof reason).toBe('string')
      expect(reason.length).toBeGreaterThan(0)
    }
  })

  it('理由里的数值不出现 NaN', () => {
    // 理由文本会插值温度、湿度、风速、海拔，缺字段时不能漏出 NaN
    const { reasons } = buildDemand(
      buildContext({ temperature: 38, humidity: 85, windSpeed: 30, elevation: 1700, weatherCode: 61, precipitation: 5 }),
    )
    for (const reason of reasons) expect(reason).not.toContain('NaN')
  })
})

describe('高海拔炖煮惩罚', () => {
  const highCtx = ctxOf({ elevation: 1700 })
  const lowCtx = ctxOf({ elevation: 30 })

  it('高海拔久炖扣分最重', () => {
    expect(altitudePenalty(highCtx, { tags: ['炖'], timeMin: 100 })).toBe(-1.5)
  })

  it('高海拔短时炖煮只轻度扣分', () => {
    expect(altitudePenalty(highCtx, { tags: ['炖'], timeMin: 30 })).toBe(-0.6)
  })

  it('高海拔的炒菜不扣分', () => {
    expect(altitudePenalty(highCtx, { tags: ['炒'], timeMin: 100 })).toBe(0)
  })

  it('平原地区一律不扣分', () => {
    expect(altitudePenalty(lowCtx, { tags: ['炖'], timeMin: 100 })).toBe(0)
  })

  it('没有 tags 字段时不抛错', () => {
    expect(altitudePenalty(highCtx, { timeMin: 100 })).toBe(0)
  })
})
