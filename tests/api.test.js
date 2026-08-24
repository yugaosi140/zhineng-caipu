import { describe, expect, it } from 'vitest'

import { normalizeWeather, weatherText } from '../src/api/weather.js'
import { PROVENANCE, buildPriceTable, parseDailyBulletin } from '../src/api/price.js'
import baseline from '../src/data/priceBaseline.json'

describe('天气响应归一化', () => {
  const raw = {
    current: {
      temperature_2m: 31.4,
      apparent_temperature: 35.2,
      relative_humidity_2m: 78,
      precipitation: 0.4,
      weather_code: 61,
      wind_speed_10m: 13.7,
      wind_gusts_10m: 26.1,
      pressure_msl: 1004.2,
      time: '2026-08-24T08:00',
    },
    daily: { temperature_2m_max: [34.1], temperature_2m_min: [26.8], precipitation_sum: [5.2] },
    elevation: 23,
  }

  it('压成引擎需要的扁平结构', () => {
    const w = normalizeWeather(raw)
    expect(w.temperature).toBe(31.4)
    expect(w.apparentTemperature).toBe(35.2)
    expect(w.humidity).toBe(78)
    expect(w.windSpeed).toBe(13.7)
    expect(w.elevation).toBe(23)
    expect(w.tempMax).toBe(34.1)
    expect(w.precipSum).toBe(5.2)
    expect(w.source).toBe('Open-Meteo')
  })

  it('字段缺失时降级为 null 而不是抛错', () => {
    const w = normalizeWeather({})
    expect(w.temperature).toBeNull()
    expect(w.elevation).toBeNull()
    expect(w.tempMax).toBeNull()
    // 降水和天气代码有兜底值，环境画像才不会因为缺字段而失真
    expect(w.precipitation).toBe(0)
    expect(w.weatherCode).toBe(0)
  })

  it('响应为空也不抛错', () => {
    expect(() => normalizeWeather(null)).not.toThrow()
    expect(() => normalizeWeather(undefined)).not.toThrow()
  })

  it('WMO 代码转中文，未知代码有兜底', () => {
    expect(weatherText(0)).toBe('晴')
    expect(weatherText(61)).toBe('小雨')
    expect(weatherText(95)).toBe('雷阵雨')
    expect(weatherText(9999)).toBe('未知')
  })
})

describe('每日简报解析', () => {
  // 简报原文形如（该接口时好时坏，只能靠单测锁行为）
  const text =
    '猪肉平均价格为15.99元/公斤，比昨天下降0.2%；牛肉68.25元/公斤，比昨天上升0.2%；' +
    '羊肉65.89元/公斤；鸡蛋10.51元/公斤；白条鸡17.2元/公斤'

  it('提取品名和价格，并映射到品种表标准名', () => {
    const out = parseDailyBulletin(text)
    expect(out['猪肉（白条猪）']).toBe(15.99)
    expect(out['牛肉']).toBe(68.25)
    expect(out['鸡蛋']).toBe(10.51)
    expect(out['白条鸡']).toBe(17.2)
  })

  it('汇总类条目不当作品种价格', () => {
    const out = parseDailyBulletin('重点监测的28种蔬菜平均价格为5.2元/公斤；重点监测的7种水果为7.8元/公斤')
    expect(out['重点监测的28种蔬菜']).toBeUndefined()
    expect(out['重点监测的7种水果']).toBeUndefined()
  })

  it('输入无效或无匹配时返回空对象', () => {
    expect(parseDailyBulletin('')).toEqual({})
    expect(parseDailyBulletin(null)).toEqual({})
    expect(parseDailyBulletin(undefined)).toEqual({})
    expect(parseDailyBulletin(12345)).toEqual({})
    expect(parseDailyBulletin('今日行情平稳，无明显波动')).toEqual({})
  })

  it('映射出的名字都能在菜价基准里找到', () => {
    const names = new Set(baseline.items.map((item) => item.name))
    for (const key of Object.keys(parseDailyBulletin(text))) {
      expect(names.has(key)).toBe(true)
    }
  })
})

describe('价格表合成', () => {
  const index = { agriculture: 120, grainAndOil: 118, vegetableBasket: 125 }

  it('无任何数据源时全部落基线', () => {
    const table = buildPriceTable()
    expect(Object.keys(table)).toHaveLength(baseline.items.length)
    expect(Object.values(table).every((v) => v.provenance === 'baseline')).toBe(true)
  })

  it('有指数时按今日指数比基线日指数折算', () => {
    const table = buildPriceTable({ index })
    const item = baseline.items.find((i) => i.category === '蔬菜')
    const expected = Math.round(item.price * (125 / baseline.baseIndex.vegetableBasket) * 100) / 100
    expect(table[item.name].price).toBe(expected)
    expect(table[item.name].provenance).toBe('index-adjusted')
  })

  it('优先级：手工 > 简报实时 > 指数折算 > 基线', () => {
    const name = baseline.items[0].name
    expect(buildPriceTable({ index, live: { [name]: 42 } })[name]).toMatchObject({
      price: 42,
      provenance: 'live',
    })
    expect(buildPriceTable({ index, live: { [name]: 42 }, manual: { [name]: 99 } })[name]).toMatchObject({
      price: 99,
      provenance: 'manual',
    })
  })

  it('非正数或非数值的覆盖价被忽略', () => {
    const name = baseline.items[0].name
    for (const bad of [0, -5, NaN, null, 'abc']) {
      expect(buildPriceTable({ manual: { [name]: bad } })[name].provenance).toBe('baseline')
    }
  })

  it('每项都带单位和来源标签', () => {
    for (const entry of Object.values(buildPriceTable({ index }))) {
      expect(entry.unit).toBe('元/公斤')
      expect(PROVENANCE[entry.provenance]).toBeDefined()
    }
  })
})
