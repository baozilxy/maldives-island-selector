/**
 * astro.js - 天文计算工具
 * 用于计算月相、月出月落、银心可见度、日落时间
 * 所有算法基于天文公式实现，无外部依赖
 */

const Astro = {
  /**
   * 计算给定日期的儒略日
   * @param {number} year - 年份
   * @param {number} month - 月份 (1-12)
   * @param {number} day - 日期
   * @returns {number} 儒略日数
   */
  julianDay: function(year, month, day) {
    const y = month <= 2 ? year - 1 : year;
    const m = month <= 2 ? month + 12 : month;
    const a = Math.floor(y / 100);
    const b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
  },

  /**
   * 计算月相年龄（从新月开始的天数）
   * @param {number} jd - 儒略日
   * @returns {number} 月龄（0-29.53）
   */
  moonAge: function(jd) {
    const daysSinceNew = jd - 2451550.1;
    const lunations = daysSinceNew / 29.53058867;
    return (lunations - Math.floor(lunations)) * 29.53058867;
  },

  /**
   * 获取月相名称
   * @param {number} age - 月龄
   * @returns {string} 月相名称
   */
  moonPhaseName: function(age) {
    if (age < 1.5) return '🌑 新月';
    if (age < 6.5) return '🌒 蛾眉月';
    if (age < 8.5) return '🌓 上弦月';
    if (age < 13.5) return '🌔 盈凸月';
    if (age < 15.5) return '🌕 满月';
    if (age < 20.5) return '🌖 亏凸月';
    if (age < 22.5) return '🌗 下弦月';
    if (age < 27.0) return '🌘 残月';
    return '🌑 新月';
  },

  /**
   * 判断月相是否适合银河摄影（月龄 < 5 或 > 25 为佳）
   * @param {number} age - 月龄
   * @returns {{ score: string, good: boolean }}
   */
  moonPhaseRating: function(age) {
    if (age < 5 || age > 25) return { score: '优', good: true };
    if (age < 8 || age > 22) return { score: '良', good: true };
    if (age < 11 || age > 19) return { score: '中', good: false };
    return { score: '差', good: false };
  },

  /**
   * 计算月出/月落近似时间（小时，UTC）
   * 简化算法：月出每天推迟约50分钟
   * @param {number} dayOfMonth - 当月第几天
   * @returns {{ rise: number, set: number }} 月出月落时间（UTC小时）
   */
  moonRiseSet: function(dayOfMonth) {
    const rise = (dayOfMonth * 0.83 + 6) % 24;
    const set = (rise + 12.5) % 24;
    return { rise, set };
  },

  /**
   * 计算给定纬度和日期的日落时间（当地小时）
   * @param {number} lat - 纬度（度）
   * @param {number} jd - 儒略日
   * @returns {number} 日落时间（当地小时）
   */
  sunsetTime: function(lat, jd) {
    const n = jd - 2451545.0;
    const meanAnomaly = (357.5291 + 0.98560028 * n) * Math.PI / 180;
    const equationOfCenter = 1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly);
    const eclipticLongitude = (280.4665 + 0.98560028 * n + equationOfCenter + 180) * Math.PI / 180;
    const declination = Math.asin(Math.sin(23.44 * Math.PI / 180) * Math.sin(eclipticLongitude));

    const latRad = lat * Math.PI / 180;
    const cosHourAngle = -Math.tan(latRad) * Math.tan(declination);

    if (Math.abs(cosHourAngle) > 1) {
      return cosHourAngle > 1 ? 24 : 0;
    }

    const hourAngle = Math.acos(cosHourAngle);
    const sunsetLST = hourAngle * 180 / Math.PI / 15 + 12;
    return sunsetLST;
  },

  /**
   * 计算民用黄昏结束时间（日落 + 大约18分钟）
   * @param {number} sunsetLocal - 日落时间（当地小时）
   * @returns {number} 民用黄昏结束时间
   */
  civilTwilightEnd: function(sunsetLocal) {
    return sunsetLocal + 0.3;
  },

  /**
   * 计算银心可见度评估
   * @param {number} month - 月份 (1-12)
   * @param {number} lat - 纬度
   * @returns {{ visible: boolean, bestTime: string }}
   */
  milkyWayCore: function(month, lat) {
    const isVisible = (month >= 2 && month <= 10);
    let bestTime;
    if (month >= 2 && month <= 4) bestTime = '凌晨2点-天亮前';
    else if (month >= 5 && month <= 7) bestTime = '晚上10点-凌晨2点';
    else if (month >= 8 && month <= 10) bestTime = '黄昏后-凌晨12点';
    else bestTime = '银心不可见';
    return { visible: isVisible, bestTime };
  },

  /**
   * 综合银河摄影评分
   * @param {object} options
   * @param {Date} options.date - 出行日期
   * @param {number} options.lat - 岛屿纬度
   * @param {number} options.bortle - 光污染等级 (1-9)
   * @param {string} options.lightControl - 岛上灯光控制
   * @returns {{ score: string, details: string, good: boolean }}
   */
  galaxyPhotographyScore: function({ date, lat, bortle, lightControl }) {
    const jd = Astro.julianDay(date.getFullYear(), date.getMonth() + 1, date.getDate());
    const month = date.getMonth() + 1;
    const age = Astro.moonAge(jd);
    const moonRating = Astro.moonPhaseRating(age);
    const sunsetLocal = Astro.sunsetTime(lat, jd);
    const twilightEnd = Astro.civilTwilightEnd(sunsetLocal);
    const mw = Astro.milkyWayCore(month, lat);
    const moon = Astro.moonRiseSet(date.getDate());

    let score = 0;
    const reasons = [];

    // 1. 月相评分 (权重: 3)
    if (moonRating.good) {
      if (moonRating.score === '优') { score += 3; reasons.push('🌙 月相极佳'); }
      else { score += 2; reasons.push('🌙 月相尚可'); }
    } else {
      reasons.push('🌙 月相不佳（近满月）');
    }

    // 2. 银心可见 (权重: 4)
    if (mw.visible) {
      score += 4;
      reasons.push('🌌 银心可见（' + mw.bestTime + '）');
    } else {
      reasons.push('🌌 银心不可见（非银河季）');
    }

    // 3. 光污染 (权重: 3)
    if (bortle <= 2) { score += 3; reasons.push('💡 光污染极低（Bortle ' + bortle + '）'); }
    else if (bortle <= 4) { score += 2; reasons.push('💡 光污染较低（Bortle ' + bortle + '）'); }
    else { score += 0; reasons.push('💡 光污染明显（Bortle ' + bortle + '）'); }

    // 4. 岛上灯光 (权重: 2)
    if (lightControl === '优秀') { score += 2; reasons.push('🔦 灯光控制优秀'); }
    else if (lightControl === '良好') { score += 1; reasons.push('🔦 灯光控制良好'); }
    else { score += 0; reasons.push('🔦 灯光控制一般'); }

    let result;
    if (score >= 10) result = { score: '⭐⭐⭐ 优', good: true };
    else if (score >= 7) result = { score: '⭐⭐ 良', good: true };
    else result = { score: '⭐ 差', good: false };

    return {
      ...result,
      details: reasons.join(' · '),
      sunsetTime: twilightEnd.toFixed(1) + '时（黄昏结束）',
      moonPhase: Astro.moonPhaseName(age)
    };
  }
};

window.Astro = Astro;
