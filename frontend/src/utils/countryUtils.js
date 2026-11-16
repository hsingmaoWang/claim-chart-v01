/**
 * 國別分析工具模組 (Country Analysis Utilities)
 * 負責 ISO-2 與 ISO-3 代碼轉換、國家座標與標籤生成、申請人地址/國別比對規則引擎
 */

// 國別標準資訊字典 (含 ISO-2、名稱、ISO-3、中心經緯度)
export const COUNTRY_METADATA = {
  // 核心規範要求格式
  'US': { code: 'US', name: 'United States', iso3: 'USA', label: 'US (United States)', lat: 38.0, lon: -97.0 },
  'TW': { code: 'TW', name: 'Taiwan', iso3: 'TWN', label: 'TW (Taiwan)', lat: 23.7, lon: 121.0 },
  'CN': { code: 'CN', name: 'China', iso3: 'CHN', label: 'CN (China)', lat: 35.8, lon: 104.1 },
  'JP': { code: 'JP', name: 'Japan', iso3: 'JPN', label: 'JP (Japan)', lat: 36.2, lon: 138.2 },
  'KR': { code: 'KR', name: 'Korea', iso3: 'KOR', label: 'KR (Korea)', lat: 35.9, lon: 127.7 },
  'EP': { code: 'EP', name: 'Austria', iso3: 'AUT', label: 'EP (Austria)', lat: 47.5, lon: 14.5 },
  'WO': { code: 'WO', name: 'Schweiz', iso3: 'CHE', label: 'WO (Schweiz)', lat: 46.8, lon: 8.2 },

  // 常見專利國家
  'DE': { code: 'DE', name: 'Germany', iso3: 'DEU', label: 'DE (Germany)', lat: 51.1, lon: 10.4 },
  'GB': { code: 'GB', name: 'United Kingdom', iso3: 'GBR', label: 'GB (United Kingdom)', lat: 55.3, lon: -3.4 },
  'FR': { code: 'FR', name: 'France', iso3: 'FRA', label: 'FR (France)', lat: 46.2, lon: 2.2 },
  'CA': { code: 'CA', name: 'Canada', iso3: 'CAN', label: 'CA (Canada)', lat: 56.1, lon: -106.3 },
  'IN': { code: 'IN', name: 'India', iso3: 'IND', label: 'IN (India)', lat: 20.5, lon: 78.9 },
  'AU': { code: 'AU', name: 'Australia', iso3: 'AUS', label: 'AU (Australia)', lat: -25.2, lon: 133.7 },
  'SG': { code: 'SG', name: 'Singapore', iso3: 'SGP', label: 'SG (Singapore)', lat: 1.35, lon: 103.8 },
  'IL': { code: 'IL', name: 'Israel', iso3: 'ISR', label: 'IL (Israel)', lat: 31.0, lon: 34.8 },
  'NL': { code: 'NL', name: 'Netherlands', iso3: 'NLD', label: 'NL (Netherlands)', lat: 52.1, lon: 5.2 },
  'IT': { code: 'IT', name: 'Italy', iso3: 'ITA', label: 'IT (Italy)', lat: 41.8, lon: 12.5 },
  'ES': { code: 'ES', name: 'Spain', iso3: 'ESP', label: 'ES (Spain)', lat: 40.4, lon: -3.7 },
  'SE': { code: 'SE', name: 'Sweden', iso3: 'SWE', label: 'SE (Sweden)', lat: 60.1, lon: 18.6 },
  'CH': { code: 'CH', name: 'Switzerland', iso3: 'CHE', label: 'CH (Switzerland)', lat: 46.8, lon: 8.2 },
  'AT': { code: 'AT', name: 'Austria', iso3: 'AUT', label: 'AT (Austria)', lat: 47.5, lon: 14.5 },
  'FI': { code: 'FI', name: 'Finland', iso3: 'FIN', label: 'FI (Finland)', lat: 61.9, lon: 25.7 },
  'NO': { code: 'NO', name: 'Norway', iso3: 'NOR', label: 'NO (Norway)', lat: 60.4, lon: 8.4 },
  'DK': { code: 'DK', name: 'Denmark', iso3: 'DNK', label: 'DK (Denmark)', lat: 56.2, lon: 9.5 },
  'BE': { code: 'BE', name: 'Belgium', iso3: 'BEL', label: 'BE (Belgium)', lat: 50.5, lon: 4.4 },
  'RU': { code: 'RU', name: 'Russia', iso3: 'RUS', label: 'RU (Russia)', lat: 61.5, lon: 105.3 },
  'BR': { code: 'BR', name: 'Brazil', iso3: 'BRA', label: 'BR (Brazil)', lat: -14.2, lon: -51.9 },
  'MX': { code: 'MX', name: 'Mexico', iso3: 'MEX', label: 'MX (Mexico)', lat: 23.6, lon: -102.5 },
  'NZ': { code: 'NZ', name: 'New Zealand', iso3: 'NZL', label: 'NZ (New Zealand)', lat: -40.9, lon: 174.8 },
  'ZA': { code: 'ZA', name: 'South Africa', iso3: 'ZAF', label: 'ZA (South Africa)', lat: -30.5, lon: 22.9 },
  'MY': { code: 'MY', name: 'Malaysia', iso3: 'MYS', label: 'MY (Malaysia)', lat: 4.2, lon: 101.9 },
  'TH': { code: 'TH', name: 'Thailand', iso3: 'THA', label: 'TH (Thailand)', lat: 15.8, lon: 100.9 },
  'VN': { code: 'VN', name: 'Vietnam', iso3: 'VNM', label: 'VN (Vietnam)', lat: 14.0, lon: 108.2 },
  'ID': { code: 'ID', name: 'Indonesia', iso3: 'IDN', label: 'ID (Indonesia)', lat: -0.7, lon: 113.9 },
  'PH': { code: 'PH', name: 'Philippines', iso3: 'PHL', label: 'PH (Philippines)', lat: 12.8, lon: 121.7 },
  'IE': { code: 'IE', name: 'Ireland', iso3: 'IRL', label: 'IE (Ireland)', lat: 53.1, lon: -7.6 },
  'PL': { code: 'PL', name: 'Poland', iso3: 'POL', label: 'PL (Poland)', lat: 51.9, lon: 19.1 },
  'CZ': { code: 'CZ', name: 'Czech Republic', iso3: 'CZE', label: 'CZ (Czech Republic)', lat: 49.8, lon: 15.4 },
  'HU': { code: 'HU', name: 'Hungary', iso3: 'HUN', label: 'HU (Hungary)', lat: 47.1, lon: 19.5 }
};

// 美國 50 州及哥倫比亞特區代碼表
export const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
]);

// 快速查詢或備援解析
export const getCountryMeta = (rawCode) => {
  if (!rawCode) return null;
  const upper = String(rawCode).trim().toUpperCase();
  if (COUNTRY_METADATA[upper]) {
    return COUNTRY_METADATA[upper];
  }
  // 未在清單中的有效 2 碼代碼
  if (/^[A-Z]{2}$/.test(upper)) {
    return {
      code: upper,
      name: upper,
      iso3: upper, // 部分國家 ISO3 同名或 Plotly 自動比對
      label: `${upper} (${upper})`,
      lat: 0,
      lon: 0
    };
  }
  return null;
};

/**
 * 所屬國別判斷規則引擎 (Assignee/Applicant Country Parser)
 * 範例 1: "Shandong Inspur Science Research Institute Co. Ltd.,Jinan,Shandong,250100,CN | 山东浪潮科学研究院有限公司,济南市,山东省,250100,CN" -> "CN"
 * 範例 2: "ADVANCED MICRO DEVICES INC.,Sunnyvale CA 94088-3453,US,00328125" -> "US"
 * 範例 3: "International Business Machines Corporation,Armonk,NY" (NY為美國紐約州) -> "US"
 */
export const parseAssigneeCountry = (assigneeRaw) => {
  if (!assigneeRaw) return null;
  const str = String(assigneeRaw).trim();
  if (!str || ['nan', 'none', '-', 'null'].includes(str.toLowerCase())) return null;

  // 1. 若有多位申請人，以 '|' 或 ';' 分割，依專利實務以第一順位申請人為主要所屬判定
  const entities = str.split(/[|;]/).map(s => s.trim()).filter(Boolean);

  for (const entity of entities) {
    // 依逗點分割實體各欄位 [公司名, 城市/州, 郵遞區號, 國別碼, ID]
    const parts = entity.split(',').map(s => s.trim()).filter(Boolean);

    // 從後往前搜尋最具鑑別度的國別代碼或州別代碼
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i].toUpperCase();

      // (a) 精確匹配已知國家代碼 (如 CN, US, TW, JP, KR, DE, GB 等)
      if (COUNTRY_METADATA[part]) {
        return part;
      }

      // (b) 精確匹配美國 50 州代碼 (如 NY, CA, TX, WA) -> 歸為 US
      if (US_STATES.has(part)) {
        return 'US';
      }

      // (c) 檢查欄位末端包含州別與郵遞區號 (如 "Sunnyvale CA 94088-3453" 或 "Armonk NY")
      const stateZipMatch = part.match(/\b([A-Z]{2})\b(?:\s+\d{5}(?:-\d{4})?)?$/);
      if (stateZipMatch && US_STATES.has(stateZipMatch[1])) {
        return 'US';
      }

      // (d) 檢查欄位為純2碼大寫英文字母
      if (/^[A-Z]{2}$/.test(part)) {
        return part;
      }
    }

    // (e) 常用地名與企業關鍵字備援比對
    if (/taiwan|r\.?o\.?c\.?|台灣|臺灣|新竹科學園區/i.test(entity)) return 'TW';
    if (/china|中国|中國|beijing|shanghai|shenzhen/i.test(entity)) return 'CN';
    if (/japan|日本|tokyo|osaka/i.test(entity)) return 'JP';
    if (/korea|republic of korea|韩国|韓國|seoul/i.test(entity)) return 'KR';
    if (/united states|usa|u\.s\.a|california|new york/i.test(entity)) return 'US';
    if (/germany|deutschland|munich|berlin/i.test(entity)) return 'DE';
    if (/united kingdom|great britain|london/i.test(entity)) return 'GB';
    if (/france|paris/i.test(entity)) return 'FR';
    if (/canada|toronto|ontario|vancouver/i.test(entity)) return 'CA';
  }

  return null;
};

/**
 * 申請國別提取函式 (Application Country Extractor)
 * 優先從 "Publication Country Code" 欄位獲取；若無，取 "Publication Number" 最左側前 2 碼
 */
export const extractApplicationCountry = (patent, pubCountryKey, pubNumKey) => {
  if (!patent) return null;

  // 1. 優先從 Publication Country Code 欄位資料獲得
  if (pubCountryKey && patent[pubCountryKey] !== undefined && patent[pubCountryKey] !== null) {
    const val = String(patent[pubCountryKey]).trim().toUpperCase();
    const match = val.match(/^([A-Z]{2})/);
    if (match) return match[1];
  }

  // 2. 以 Publication Number 欄位資料最左邊的前 2 碼為申請國別
  if (pubNumKey && patent[pubNumKey] !== undefined && patent[pubNumKey] !== null) {
    const val = String(patent[pubNumKey]).trim().toUpperCase();
    const match = val.match(/^([A-Z]{2})/);
    if (match) return match[1];
  }

  return null;
};

/**
 * 將手動填寫的 2 碼國別代碼追加至原始 Assignee 字串末端
 * 例: "工研院" + "TW" -> "工研院,TW"
 * 例: "TSMC, Hsinchu" + "TW" -> "TSMC, Hsinchu,TW"
 */
export const appendCountryCodeToAssignee = (rawAssignee, countryCode) => {
  if (!countryCode) return rawAssignee || '';
  const code = String(countryCode).trim().toUpperCase();
  if (!code) return rawAssignee || '';

  const orig = rawAssignee !== undefined && rawAssignee !== null ? String(rawAssignee).trim() : '';
  if (!orig || ['nan', 'none', '-', 'null'].includes(orig.toLowerCase())) {
    return code;
  }

  // 避免重複追加相同的國別代碼
  if (orig.endsWith(`,${code}`) || orig.endsWith(`, ${code}`)) {
    return orig;
  }

  return `${orig},${code}`;
};


