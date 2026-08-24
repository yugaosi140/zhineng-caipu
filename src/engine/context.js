/**
 * 环境画像：把 Open-Meteo 的原始读数翻译成"想吃什么"这个层面的可读维度。
 *
 * 纯函数，无副作用，方便单测。
 */

/** WMO weather_code 归类。https://open-meteo.com 文档中的 weather code 表。 */
const WMO = {
  clear: [0, 1],
  cloudy: [2, 3],
  fog: [45, 48],
  drizzle: [51, 53, 55, 56, 57],
  rain: [61, 63, 65, 66, 67, 80, 81, 82],
  snow: [71, 73, 75, 77, 85, 86],
  thunder: [95, 96, 99],
}

function wmoGroup(code) {
  for (const [name, codes] of Object.entries(WMO)) {
    if (codes.includes(code)) return name
  }
  return 'unknown'
}

/**
 * 体感带。用体感温度而非气温 —— 40°C 体感和 34°C 气温对食欲的影响完全不同。
 */
export function feelBand(apparent) {
  if (apparent == null) return { key: 'mild', label: '温和' }
  if (apparent >= 35) return { key: 'scorching', label: '酷热' }
  if (apparent >= 28) return { key: 'hot', label: '热' }
  if (apparent >= 18) return { key: 'mild', label: '温和' }
  if (apparent >= 10) return { key: 'cool', label: '凉' }
  return { key: 'cold', label: '冷' }
}

export function humidityBand(rh) {
  if (rh == null) return { key: 'normal', label: '适中' }
  if (rh > 75) return { key: 'humid', label: '潮湿' }
  if (rh < 40) return { key: 'dry', label: '干燥' }
  return { key: 'normal', label: '适中' }
}

/** 风速单位为 km/h（Open-Meteo 默认）。 */
export function windBand(kmh) {
  if (kmh == null) return { key: 'calm', label: '微风' }
  if (kmh >= 25) return { key: 'strong', label: '大风' }
  if (kmh >= 12) return { key: 'breezy', label: '有风' }
  return { key: 'calm', label: '微风' }
}

export function precipBand(mm, code) {
  const group = wmoGroup(code)
  if (group === 'thunder') return { key: 'storm', label: '雷雨' }
  if (group === 'snow') return { key: 'snow', label: '雪' }
  if (mm >= 2.5 || group === 'rain') return { key: 'rain', label: '有雨' }
  if (mm > 0 || group === 'drizzle') return { key: 'drizzle', label: '小雨' }
  return { key: 'none', label: '无降水' }
}

/**
 * 海拔带。在湖北这一维是真有意义的：武汉 25m 到神农架 1700m，
 * 跨度足以改变沸点和体感，进而改变"该吃什么、该怎么做"。
 *
 * 阈值按省内实际分布取：江汉平原诸市都在 100m 以下（低地），
 * 十堰 380m、恩施 450m 属山区（中海拔），神农架 1700m 是唯一的高海拔。
 */
export function altitudeBand(elevation) {
  if (elevation == null) return { key: 'low', label: '平原' }
  if (elevation >= 1200) return { key: 'high', label: '高海拔' }
  if (elevation >= 300) return { key: 'mid', label: '山区' }
  return { key: 'low', label: '平原' }
}

/**
 * 沸点估算。每升高 300m 约降 1°C，这个线性近似在 2000m 以内足够用。
 *
 * 这不是装饰性数字：神农架 1700m 沸点约 94°C，炖煮类菜品确实煮不透，
 * demand.js 的 highAltitude 规则和 altitudePenalty 都依赖它。
 */
export function boilingPoint(elevation) {
  if (elevation == null) return 100
  return Math.round((100 - elevation / 300) * 10) / 10
}

/** 季节。按月份粗分，够推荐用。 */
export function season(now = new Date()) {
  const m = now.getMonth() + 1
  if (m >= 3 && m <= 5) return { key: 'spring', label: '春' }
  if (m >= 6 && m <= 8) return { key: 'summer', label: '夏' }
  if (m >= 9 && m <= 11) return { key: 'autumn', label: '秋' }
  return { key: 'winter', label: '冬' }
}

/**
 * 二十四节气。用每月两个节气的常见日期近似（多数年份误差 ±1 天）。
 *
 * 精确节气要算太阳黄经，对"今天吃什么"来说没有必要 ——
 * 差一天不会改变推荐结果，这里只作为时令的可读标签。
 */
const SOLAR_TERMS = [
  ['小寒', '大寒'], ['立春', '雨水'], ['惊蛰', '春分'],
  ['清明', '谷雨'], ['立夏', '小满'], ['芒种', '夏至'],
  ['小暑', '大暑'], ['立秋', '处暑'], ['白露', '秋分'],
  ['寒露', '霜降'], ['立冬', '小雪'], ['大雪', '冬至'],
]

export function solarTerm(now = new Date()) {
  const [first, second] = SOLAR_TERMS[now.getMonth()]
  return now.getDate() < 15 ? first : second
}

/**
 * 梅雨季。湖北入梅约 6 月中旬，出梅约 7 月中旬。
 * 湿度高、闷热，本地饮食讲究吃辣祛湿，demand.js 会据此加权。
 */
export function isPlumRain(now = new Date()) {
  const m = now.getMonth() + 1
  const d = now.getDate()
  if (m === 6) return d >= 15
  if (m === 7) return d <= 15
  return false
}

/**
 * 三伏天。初伏起于夏至后第三个庚日，精确推算要查干支历；
 * 这里用 7 月中旬到 8 月下旬的近似区间，对推荐足够。
 */
export function isDogDays(now = new Date()) {
  const m = now.getMonth() + 1
  const d = now.getDate()
  if (m === 7) return d >= 15
  if (m === 8) return d <= 25
  return false
}

/**
 * 天气读数 → 环境画像。
 *
 * @param {object} weather Open-Meteo current 块 + elevation
 * @param {Date} [now]
 */
export function buildContext(weather = {}, now = new Date()) {
  const {
    temperature = null,
    apparentTemperature = null,
    humidity = null,
    windSpeed = null,
    precipitation = 0,
    weatherCode = 0,
    elevation = null,
  } = weather

  // 体感缺失时退回气温，保证画像不因单字段缺失而失真。
  const feelSource = apparentTemperature ?? temperature

  return {
    raw: { temperature, apparentTemperature, humidity, windSpeed, precipitation, weatherCode, elevation },
    feel: feelBand(feelSource),
    humidity: humidityBand(humidity),
    wind: windBand(windSpeed),
    precip: precipBand(precipitation, weatherCode),
    altitude: altitudeBand(elevation),
    boilingPoint: boilingPoint(elevation),
    sky: wmoGroup(weatherCode),
    season: season(now),
    solarTerm: solarTerm(now),
    plumRain: isPlumRain(now),
    dogDays: isDogDays(now),
    date: now,
  }
}

/** 一句话人话描述，用于推荐理由的开头。 */
export function describeContext(ctx) {
  const parts = []
  const t = ctx.raw.apparentTemperature ?? ctx.raw.temperature
  if (t != null) parts.push(`体感 ${Math.round(t)}°C`)
  if (ctx.raw.humidity != null) parts.push(`湿度 ${Math.round(ctx.raw.humidity)}%`)
  if (ctx.wind.key !== 'calm') parts.push(ctx.wind.label)
  if (ctx.precip.key !== 'none') parts.push(ctx.precip.label)
  if (ctx.altitude.key !== 'low') parts.push(`${ctx.altitude.label} ${Math.round(ctx.raw.elevation)}m`)
  if (ctx.plumRain) parts.push('梅雨季')
  else if (ctx.dogDays) parts.push('三伏')
  return parts.join('、')
}
