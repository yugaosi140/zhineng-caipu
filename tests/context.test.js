import { describe, expect, it } from 'vitest'

import {
  altitudeBand,
  boilingPoint,
  buildContext,
  describeContext,
  feelBand,
  humidityBand,
  isDogDays,
  isPlumRain,
  precipBand,
  season,
  solarTerm,
  windBand,
} from '../src/engine/context.js'

/**
 * 这些分带函数的阈值直接决定推荐走向，改一个数字会静默改变所有结果。
 * 所以每个分带都测边界值本身和边界下方一档，把阈值钉死。
 */

describe('体感分带', () => {
  it('阈值取「大于等于」语义', () => {
    expect(feelBand(35).key).toBe('scorching')
    expect(feelBand(34.9).key).toBe('hot')
    expect(feelBand(28).key).toBe('hot')
    expect(feelBand(27.9).key).toBe('mild')
    expect(feelBand(18).key).toBe('mild')
    expect(feelBand(17.9).key).toBe('cool')
    expect(feelBand(10).key).toBe('cool')
    expect(feelBand(9.9).key).toBe('cold')
  })

  it('缺值退回温和，不让单字段缺失把画像带偏', () => {
    expect(feelBand(null).key).toBe('mild')
    expect(feelBand(undefined).key).toBe('mild')
  })
})

describe('湿度分带', () => {
  it('潮湿是严格大于 75，干燥是严格小于 40', () => {
    expect(humidityBand(76).key).toBe('humid')
    expect(humidityBand(75).key).toBe('normal')
    expect(humidityBand(40).key).toBe('normal')
    expect(humidityBand(39).key).toBe('dry')
  })

  it('缺值按适中处理', () => {
    expect(humidityBand(null).key).toBe('normal')
  })
})

describe('风力分带', () => {
  it('单位是 km/h，阈值 25 和 12', () => {
    expect(windBand(25).key).toBe('strong')
    expect(windBand(24.9).key).toBe('breezy')
    expect(windBand(12).key).toBe('breezy')
    expect(windBand(11.9).key).toBe('calm')
  })

  it('缺值按微风处理', () => {
    expect(windBand(null).key).toBe('calm')
  })
})

describe('降水分带', () => {
  it('雷雨和雪优先于降水量判断', () => {
    // 雷暴、降雪即使当前降水量为 0 也要如实归类
    expect(precipBand(0, 95).key).toBe('storm')
    expect(precipBand(0, 71).key).toBe('snow')
  })

  it('天气代码可以在降水量为 0 时判定有雨', () => {
    expect(precipBand(0, 61).key).toBe('rain')
    expect(precipBand(0, 51).key).toBe('drizzle')
  })

  it('降水量达到 2.5mm 即算有雨', () => {
    expect(precipBand(2.5, 0).key).toBe('rain')
    expect(precipBand(0.1, 0).key).toBe('drizzle')
  })

  it('晴或多云且无降水时为无降水', () => {
    expect(precipBand(0, 0).key).toBe('none')
    expect(precipBand(0, 2).key).toBe('none')
  })
})

describe('海拔分带与沸点', () => {
  it('阈值按湖北实际分布取 1200 和 300', () => {
    expect(altitudeBand(1700).key).toBe('high') // 神农架
    expect(altitudeBand(1200).key).toBe('high')
    expect(altitudeBand(1199).key).toBe('mid')
    expect(altitudeBand(300).key).toBe('mid') // 十堰、恩施量级
    expect(altitudeBand(299).key).toBe('low')
    expect(altitudeBand(25).key).toBe('low') // 武汉
  })

  it('缺值按平原处理', () => {
    expect(altitudeBand(null).key).toBe('low')
  })

  it('沸点按每 300m 降 1°C 线性近似', () => {
    expect(boilingPoint(null)).toBe(100)
    expect(boilingPoint(0)).toBe(100)
    expect(boilingPoint(300)).toBe(99)
    // 神农架煮不透炖菜的依据就是这个数
    expect(boilingPoint(1700)).toBe(94.3)
  })
})

describe('时令判定', () => {
  it('梅雨季覆盖 6 月下半月到 7 月上半月', () => {
    expect(isPlumRain(new Date(2026, 5, 14))).toBe(false)
    expect(isPlumRain(new Date(2026, 5, 15))).toBe(true)
    expect(isPlumRain(new Date(2026, 6, 15))).toBe(true)
    expect(isPlumRain(new Date(2026, 6, 16))).toBe(false)
  })

  it('三伏覆盖 7 月下半月到 8 月 25 日', () => {
    expect(isDogDays(new Date(2026, 6, 14))).toBe(false)
    expect(isDogDays(new Date(2026, 6, 15))).toBe(true)
    expect(isDogDays(new Date(2026, 7, 25))).toBe(true)
    expect(isDogDays(new Date(2026, 7, 26))).toBe(false)
  })

  it('节气按月内上下半月切换', () => {
    expect(solarTerm(new Date(2026, 0, 14))).toBe('小寒')
    expect(solarTerm(new Date(2026, 0, 15))).toBe('大寒')
  })

  it('季节按月份粗分', () => {
    expect(season(new Date(2026, 2, 1)).key).toBe('spring')
    expect(season(new Date(2026, 5, 1)).key).toBe('summer')
    expect(season(new Date(2026, 8, 1)).key).toBe('autumn')
    expect(season(new Date(2026, 11, 1)).key).toBe('winter')
  })
})

describe('环境画像组装', () => {
  const august = new Date(2026, 7, 24)

  it('体感缺失时退回气温而不是直接判温和', () => {
    const ctx = buildContext({ temperature: 36, apparentTemperature: null }, august)
    expect(ctx.feel.key).toBe('scorching')
  })

  it('气温体感都缺时才落到温和', () => {
    const ctx = buildContext({ temperature: null, apparentTemperature: null }, august)
    expect(ctx.feel.key).toBe('mild')
  })

  it('原始读数原样保留，供理由文案取用', () => {
    const ctx = buildContext(
      { temperature: 30, apparentTemperature: 33, humidity: 80, elevation: 70 },
      august,
    )
    expect(ctx.raw.humidity).toBe(80)
    expect(ctx.raw.elevation).toBe(70)
  })

  it('空输入也能产出完整画像，不抛错', () => {
    const ctx = buildContext({}, august)
    for (const key of ['feel', 'humidity', 'wind', 'precip', 'altitude', 'season']) {
      expect(ctx[key]).toBeTruthy()
    }
    expect(ctx.boilingPoint).toBe(100)
  })
})

describe('画像描述文案', () => {
  const august = new Date(2026, 7, 24)

  it('只说异常项：微风和无降水不进文案', () => {
    const ctx = buildContext(
      { temperature: 30, apparentTemperature: 33, humidity: 60, windSpeed: 5, elevation: 25 },
      august,
    )
    const text = describeContext(ctx)
    expect(text).toContain('体感 33°C')
    expect(text).toContain('湿度 60%')
    expect(text).not.toContain('微风')
    expect(text).not.toContain('无降水')
  })

  it('高海拔与大风会写进文案', () => {
    const ctx = buildContext(
      { temperature: 5, apparentTemperature: 2, humidity: 70, windSpeed: 30, elevation: 1700 },
      new Date(2026, 0, 10),
    )
    const text = describeContext(ctx)
    expect(text).toContain('大风')
    expect(text).toContain('1700m')
  })
})
