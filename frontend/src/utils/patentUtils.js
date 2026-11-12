/**
 * 專利通用資料處理與統計工具模組 (Patent General Utilities)
 * 負責欄位識別、公開公告合併、同公開公告號去重、心智圖維度關聯性判定等核心規則。
 */

// 專利公開公告號候選欄位清單 (通配大小寫、中文、底線、空格)
export const PUB_NUMBER_CANDIDATES = [
  'Publication Number',
  'publication number',
  'Publication_Number',
  '專利公開公告號',
  '公開公告號',
  '公開號',
  '公告號',
  '專利號',
  'pub no',
  'pub_no',
  'patent no',
  'patent_no',
  'publication_no'
];

// 專利申請號候選欄位清單
export const APP_NUMBER_CANDIDATES = [
  'Application Number',
  'application number',
  'Application_Number',
  '申請號',
  '申請案號',
  'app no',
  'app_no',
  'appl. no.',
  'application_no'
];

// 專利公開日/公告日候選欄位清單
export const PUB_DATE_CANDIDATES = [
  'Publication Date',
  'publication date',
  'Publication_Date',
  '公開日',
  '公告日',
  '公開公告日',
  'pub_date',
  'publication_date',
  '發證日'
];

// 專利家族號候選欄位清單
export const FAMILY_ID_CANDIDATES = [
  'INPADOC Family ID',
  'Family ID',
  'family id',
  '專利家族號',
  '家族編號',
  'inpadoc family',
  'inpadoc'
];

// 心智圖核心 5 大分類維度
export const TAXONOMY_DIMENSION_NAMES = new Set([
  '技術1階',
  '技術2階',
  '技術3階',
  '功效節點',
  '應用領域'
]);

/**
 * 大小寫與空白容錯搜尋欄位 Key
 */
export const findFieldKeyCaseInsensitive = (sample, candidates) => {
  if (!sample || typeof sample !== 'object') return null;
  const keys = Object.keys(sample);

  // 1. 完全一致比對
  for (const c of candidates) {
    if (sample[c] !== undefined) return c;
  }

  // 2. 忽略大小寫與底線空格比對
  for (const c of candidates) {
    const normC = c.toLowerCase().replace(/[\s_\-]+/g, '');
    const found = keys.find(k => k.toLowerCase().replace(/[\s_\-]+/g, '') === normC);
    if (found) return found;
  }

  // 3. 部分包含比對
  for (const c of candidates) {
    const normC = c.toLowerCase().replace(/[\s_\-]+/g, '');
    const found = keys.find(k => k.toLowerCase().replace(/[\s_\-]+/g, '').includes(normC));
    if (found) return found;
  }

  return null;
};

/**
 * 提取專利公開公告號 (正規化：去空白、轉大寫)
 */
export const getPatentPubNumber = (patent, customKey = null) => {
  if (!patent || typeof patent !== 'object') return '';
  if (customKey && patent[customKey] !== undefined && patent[customKey] !== null) {
    const val = String(patent[customKey]).trim();
    if (val && !['nan', 'none', '-', 'null'].includes(val.toLowerCase())) {
      return val.toUpperCase();
    }
  }

  // 通配搜尋
  for (const k of PUB_NUMBER_CANDIDATES) {
    if (patent[k] !== undefined && patent[k] !== null) {
      const val = String(patent[k]).trim();
      if (val && !['nan', 'none', '-', 'null'].includes(val.toLowerCase())) {
        return val.toUpperCase();
      }
    }
  }

  return '';
};

/**
 * 提取 4 位數西元年份 (相容 YYYY-MM-DD, YYYY/MM/DD, YYYYMMDD 等)
 */
export const extract4DigitYear = (dateVal) => {
  if (!dateVal && dateVal !== 0) return null;
  const s = String(dateVal).trim();
  const m = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (m) return parseInt(m[1], 10);
  if (/^\d{8}$/.test(s)) {
    const y = parseInt(s.substring(0, 4), 10);
    if (y >= 1900 && y <= 2099) return y;
  }
  return null;
};

/**
 * 判斷所提供的維度清單中是否與技術1-3階、功效節點、應用領域任何一個有關
 */
export const isTaxonomyRelated = (dimensions) => {
  if (!dimensions) return false;
  const list = Array.isArray(dimensions) ? dimensions : [dimensions];
  return list.some(d => {
    if (!d) return false;
    const str = String(d).trim();
    return TAXONOMY_DIMENSION_NAMES.has(str);
  });
};

/**
 * 標準專利件數母體去重：
 * 步驟 1: 公開公告合併 (同 Application Number 僅保留 Publication Date 最新 1 件；無申請號者保留)
 * 步驟 2: 公開公告號去重 (同 Publication Number 僅保留 1 件；若重複保留最新公開日；無公開號者獨立保留)
 */
export const mergePatentsByAppAndPub = (rawPatents) => {
  if (!Array.isArray(rawPatents) || rawPatents.length === 0) return [];
  const sample = rawPatents[0] || {};

  const appNumKey = findFieldKeyCaseInsensitive(sample, APP_NUMBER_CANDIDATES);
  const pubDateKey = findFieldKeyCaseInsensitive(sample, PUB_DATE_CANDIDATES);
  const pubNumKey = findFieldKeyCaseInsensitive(sample, PUB_NUMBER_CANDIDATES);

  // 1. 公開公告合併 (依申請號)
  let preMerged = [];
  if (!appNumKey) {
    preMerged = rawPatents;
  } else {
    const appMap = new Map();
    const noAppNumList = [];

    rawPatents.forEach((p) => {
      const rawApp = p[appNumKey];
      const appNum = rawApp !== undefined && rawApp !== null ? String(rawApp).trim() : '';
      if (!appNum || ['nan', 'none', '-', 'null'].includes(appNum.toLowerCase())) {
        noAppNumList.push(p);
      } else {
        if (!appMap.has(appNum)) {
          appMap.set(appNum, []);
        }
        appMap.get(appNum).push(p);
      }
    });

    const result = [...noAppNumList];
    appMap.forEach((group) => {
      if (group.length === 1) {
        result.push(group[0]);
        return;
      }
      const sorted = [...group].sort((a, b) => {
        const dateA = pubDateKey ? (extract4DigitYear(a[pubDateKey]) || 0) : 0;
        const dateB = pubDateKey ? (extract4DigitYear(b[pubDateKey]) || 0) : 0;
        return dateB - dateA;
      });
      result.push(sorted[0]);
    });
    preMerged = result;
  }

  // 2. 同公開公告號 (Publication Number) 去重 (計為 1 件，重複者保留最新公開日)
  const pubMap = new Map();
  const noPubList = [];

  preMerged.forEach((p) => {
    const pubNum = getPatentPubNumber(p, pubNumKey);
    if (!pubNum) {
      noPubList.push(p);
    } else {
      if (!pubMap.has(pubNum)) {
        pubMap.set(pubNum, p);
      } else {
        const existing = pubMap.get(pubNum);
        const dateExisting = pubDateKey ? (extract4DigitYear(existing[pubDateKey]) || 0) : 0;
        const dateNew = pubDateKey ? (extract4DigitYear(p[pubDateKey]) || 0) : 0;
        if (dateNew > dateExisting) {
          pubMap.set(pubNum, p);
        }
      }
    }
  });

  return [...noPubList, ...Array.from(pubMap.values())];
};

