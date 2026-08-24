/**
 * 天气数据源：Open-Meteo（免注册、免 key、支持 CORS，可浏览器直连）。
 *
 * 说明：中国气象局 weather.cma.cn 只提供网页端，没有免费公开 API
 * （实测 301 重定向），官方 CMADaaS 接口需机构申请审批，所以 v1 用 Open-Meteo。
 * 海拔由同一响应的 elevation 字段给出，不需要第二个数据源。
 */

import { getJson } from './http.js'

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
  'wind_gusts_10m',
  'pressure_msl',
].join(',')

const DAILY_FIELDS = ['temperature_2m_max', 'temperature_2m_min', 'precipitation_sum'].join(',')

/** WMO code → 中文天气描述。 */
const WMO_TEXT = {
  0: '晴', 1: '晴间少云', 2: '多云', 3: '阴',
  45: '雾', 48: '冻雾',
  51: '毛毛雨', 53: '小雨', 55: '中雨', 56: '冻雨', 57: '冻雨',
  61: '小雨', 63: '中雨', 65: '大雨', 66: '冻雨', 67: '强冻雨',
  71: '小雪', 73: '中雪', 75: '大雪', 77: '雪粒',
  80: '阵雨', 81: '强阵雨', 82: '暴雨',
  85: '阵雪', 86: '强阵雪',
  95: '雷阵雨', 96: '雷阵雨伴冰雹', 99: '强雷暴伴冰雹',
}

export function weatherText(code) {
  return WMO_TEXT[code] ?? '未知'
}

/**
 * 拉取某坐标的实时天气 + 海拔。
 *
 * @param {{lat:number, lon:number}} coords
 * @returns {Promise<object>} 归一化后的读数
 */
export async function fetchWeather({ lat, lon }) {
  const url =
    `${ENDPOINT}?latitude=${lat}&longitude=${lon}` +
    `&current=${CURRENT_FIELDS}&daily=${DAILY_FIELDS}` +
    '&timezone=Asia%2FShanghai&forecast_days=1'

  const raw = await getJson(url, { retries: 2, cacheTtl: 10 * 60 * 1000 })
  return normalizeWeather(raw)
}

/** 把 Open-Meteo 响应压成引擎需要的扁平结构。导出以便单测。 */
export function normalizeWeather(raw) {
  const c = raw?.current || {}
  const d = raw?.daily || {}
  return {
    temperature: c.temperature_2m ?? null,
    apparentTemperature: c.apparent_temperature ?? null,
    humidity: c.relative_humidity_2m ?? null,
    windSpeed: c.wind_speed_10m ?? null,
    windGust: c.wind_gusts_10m ?? null,
    precipitation: c.precipitation ?? 0,
    weatherCode: c.weather_code ?? 0,
    pressure: c.pressure_msl ?? null,
    elevation: raw?.elevation ?? null,
    tempMax: d.temperature_2m_max?.[0] ?? null,
    tempMin: d.temperature_2m_min?.[0] ?? null,
    precipSum: d.precipitation_sum?.[0] ?? null,
    observedAt: c.time ?? null,
    source: 'Open-Meteo',
  }
}
