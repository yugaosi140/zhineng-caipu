/**
 * 湖北地域加权。
 *
 * 城市是推荐上下文的一部分：天气决定"适不适合现在吃"，地域决定"是不是这里该吃的"。
 *
 * 加权分两层：
 *   1. 代表菜（specialty）—— 明确公认的本地招牌，加权最强
 *   2. 同地归属（region）—— 菜谱 region 字段落在该市辖内，轻度加权
 *
 * 分值刻意压在 ±1 以内。环境契合分单维贡献约 ±1，若地域分给到 2 以上，
 * 武汉的早餐会永远是那六样，天气引擎就白做了。地域应该是"同分时优先本地"，
 * 而不是"本地一票通过"。
 */

/** 市州代表菜。名称必须和 dishes.hubei.json 里的 name 完全一致。 */
const CITY_SPECIALTIES = {
  wuhan: ['热干面', '三鲜豆皮', '糊汤粉', '面窝', '欢喜坨', '重油烧梅'],
  huangshi: ['黄石港饼'],
  shiyan: ['十堰懒豆腐', '山药排骨汤'],
  yichang: ['酸辣粉', '红烧鮰鱼'],
  xiangyang: ['牛肉粉', '襄阳牛油面'],
  ezhou: ['清蒸武昌鱼', '鄂州武昌鱼豆腐煲'],
  jingmen: ['钟祥蟠龙菜'],
  xiaogan: ['汽水包', '鳝鱼粉', '蛋酒', '米酒汤圆'],
  jingzhou: ['公安锅盔', '荆沙鱼糕', '酸菜财鱼', '皮条鳝鱼', '清炒藕带'],
  huanggang: ['黄州东坡饼', '东坡肉', '梅菜扣肉', '米粑'],
  xianning: ['板栗炖鸭'],
  suizhou: ['随州香菇炖鸡'],
  enshi: ['恩施合渣', '恩施炕洋芋'],
  xiantao: ['沔阳三蒸'],
  qianjiang: ['油焖大虾'],
  tianmen: ['珍珠圆子', '粉蒸排骨'],
  shennongjia: ['山药排骨汤'],
}

const CITY_LABELS = {
  wuhan: '武汉',
  huangshi: '黄石',
  shiyan: '十堰',
  yichang: '宜昌',
  xiangyang: '襄阳',
  ezhou: '鄂州',
  jingmen: '荆门',
  xiaogan: '孝感',
  jingzhou: '荆州',
  huanggang: '黄冈',
  xianning: '咸宁',
  suizhou: '随州',
  enshi: '恩施',
  xiantao: '仙桃',
  qianjiang: '潜江',
  tianmen: '天门',
  shennongjia: '神农架',
}

/**
 * 菜谱 region 字段 → 市州 id。
 *
 * 数据里有三个区县级归属（黄陂属武汉，公安和洪湖属荆州），
 * 只按市名匹配会漏掉它们，所以显式列出。
 */
const REGION_TO_CITY = {
  武汉: 'wuhan',
  黄陂: 'wuhan',
  黄石: 'huangshi',
  十堰: 'shiyan',
  宜昌: 'yichang',
  襄阳: 'xiangyang',
  鄂州: 'ezhou',
  荆门: 'jingmen',
  孝感: 'xiaogan',
  荆州: 'jingzhou',
  公安: 'jingzhou',
  洪湖: 'jingzhou',
  黄冈: 'huanggang',
  咸宁: 'xianning',
  随州: 'suizhou',
  恩施: 'enshi',
  仙桃: 'xiantao',
  潜江: 'qianjiang',
  天门: 'tianmen',
  神农架: 'shennongjia',
}

/** 代表菜加权。早餐地方特色最鲜明，晚餐最弱。 */
const SPECIALTY_WEIGHT = { breakfast: 0.9, lunch: 0.7, dinner: 0.4 }

/** 同地归属加权，比代表菜低一档。 */
const SAME_REGION_WEIGHT = { breakfast: 0.35, lunch: 0.3, dinner: 0.2 }

/** 菜谱归属的市州 id，无法归类时返回 null。 */
export function cityOfDish(dish) {
  return REGION_TO_CITY[dish?.region] ?? null
}

/**
 * 地域契合分。
 *
 * @param {object} dish
 * @param {object} [opts]
 * @param {string} [opts.cityId] 当前选中的市州 id
 * @param {string} [opts.meal]   breakfast|lunch|dinner
 * @returns {{score:number, note:string, kind:'specialty'|'same-region'|'none'}}
 */
export function regionalFit(dish, { cityId = '', meal = '' } = {}) {
  const label = CITY_LABELS[cityId]
  if (!label) return { score: 0, note: '', kind: 'none' }

  if ((CITY_SPECIALTIES[cityId] ?? []).includes(dish.name)) {
    return {
      score: SPECIALTY_WEIGHT[meal] ?? 0.4,
      note: `${label}代表菜`,
      kind: 'specialty',
    }
  }

  if (cityOfDish(dish) === cityId) {
    return {
      score: SAME_REGION_WEIGHT[meal] ?? 0.2,
      note: `${label}本地菜`,
      kind: 'same-region',
    }
  }

  return { score: 0, note: '', kind: 'none' }
}

export { CITY_SPECIALTIES, CITY_LABELS, REGION_TO_CITY }
