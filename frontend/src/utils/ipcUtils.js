/**
 * IPC (International Patent Classification) 相關公用處理函式
 */

/**
 * 依據規範解析 IPC Subgroup 字串：
 * a. 以 ", " 分割
 * b. 前 4 碼為 IPC 部類碼 (Subclass)
 * c. 第 5-8 碼去除 5-7 碼前導 "0"
 * d. 號碼 + "/" + 第 9 碼以後剩下未取的號碼 = IPC主次目
 */
export function parseIpcCode(rawCode) {
  if (!rawCode) return null;
  const s = String(rawCode).replace(/\u200B/g, '').trim();
  if (!s || ['nan', 'none', '-'].includes(s.toLowerCase())) return null;

  // 1. 標準格式相容 e.g. "A47C 1/02" 或 "A47C 1/00"
  const mStd = s.match(/^([A-H]\d{2}[A-Z])\s*(\d{1,4})\/(\d{2,6})$/i);
  if (mStd) {
    const subclass = mStd[1].toUpperCase();
    const mgNum = String(parseInt(mStd[2], 10));
    let sgSuffix = mStd[3];
    if (sgSuffix.length > 2) {
      sgSuffix = sgSuffix.substring(0, 2) + sgSuffix.substring(2).replace(/0+$/, '');
    }
    const section = subclass[0];
    const classCode = subclass.substring(0, 3);
    const subgroupNum = `${mgNum}/${sgSuffix}`;
    const mainGroupNum = `${mgNum}/00`;
    return {
      section,
      classCode,
      subclass,
      mainGroupNum,
      subgroupNum,
      mainGroupFull: `${subclass} ${mainGroupNum}`,
      subgroupFull: `${subclass} ${subgroupNum}`,
      isMainGroup: subgroupNum.endsWith('/00')
    };
  }

  // 2. 固定寬度碼或無空格格式
  const clean = s.replace(/\s+/g, '');
  if (clean.length < 4) return null;

  const subclass = clean.substring(0, 4).toUpperCase();
  const section = subclass[0];
  const classCode = subclass.substring(0, 3);

  if (clean.length === 4) {
    return {
      section,
      classCode,
      subclass,
      mainGroupNum: '',
      subgroupNum: '',
      mainGroupFull: '',
      subgroupFull: subclass,
      isMainGroup: false
    };
  }

  let mgNum = '0';
  let subgroupNum = '';
  let mainGroupNum = '';

  if (clean.substring(4).includes('/')) {
    const parts = clean.substring(4).split('/');
    mgNum = String(parseInt(parts[0], 10) || parts[0].replace(/^0+/, '') || '0');
    let sgPart = parts[1];
    if (sgPart.length > 2) {
      sgPart = sgPart.substring(0, 2) + sgPart.substring(2).replace(/0+$/, '');
    }
    subgroupNum = `${mgNum}/${sgPart}`;
    mainGroupNum = `${mgNum}/00`;
  } else {
    // 依序擷取第 5-8 碼 (index 4 to 8)
    const part58 = clean.length >= 8 ? clean.substring(4, 8) : clean.substring(4);
    mgNum = part58.replace(/^0+/, '') || '0';
    // 第 9 碼以後
    let part9Plus = clean.length > 8 ? clean.substring(8) : '00';
    if (part9Plus.length > 2) {
      part9Plus = part9Plus.substring(0, 2) + part9Plus.substring(2).replace(/0+$/, '');
    }
    subgroupNum = `${mgNum}/${part9Plus}`;
    mainGroupNum = `${mgNum}/00`;
  }

  return {
    section,
    classCode,
    subclass,
    mainGroupNum,
    subgroupNum,
    mainGroupFull: `${subclass} ${mainGroupNum}`,
    subgroupFull: `${subclass} ${subgroupNum}`,
    isMainGroup: subgroupNum.endsWith('/00')
  };
}

/**
 * 判斷欄位維度是否為 "IPC Subgroup"
 */
export function isIpcSubgroupDimension(dim) {
  if (!dim) return false;
  const norm = String(dim).trim().toLowerCase().replace(/[\s_\-]+/g, ' ');
  return norm === 'ipc subgroup' || norm === 'ipc sub group';
}

/**
 * 單一 IPC Subgroup 代碼轉換為標準顯示格式
 * 例如：G06N000308 -> G06N 3/08；G06N002000 -> G06N 20/00
 */
export function formatIpcSubgroupLabel(rawCode) {
  if (!rawCode) return rawCode || '';
  let clean = String(rawCode).replace(/\u200B/g, '').trim();
  if (clean.startsWith("['") && clean.endsWith("']")) clean = clean.slice(2, -2).trim();
  else if (clean.startsWith('["') && clean.endsWith('"]')) clean = clean.slice(2, -2).trim();
  else if (clean.startsWith('[') && clean.endsWith(']')) clean = clean.slice(1, -1).replace(/^['"]|['"]$/g, '').trim();

  // 若以分號或逗號分隔多個分類號，逐一轉換並保留分隔符號
  if (clean.includes(';') || clean.includes(',')) {
    const parts = clean.split(/([,;]\s*)/);
    return parts.map(part => {
      if (/^[,;]\s*$/.test(part)) return part;
      const parsed = parseIpcCode(part);
      return (parsed && parsed.subgroupFull) ? parsed.subgroupFull : part;
    }).join('');
  }

  const parsed = parseIpcCode(clean);
  if (parsed && parsed.subgroupFull) {
    return parsed.subgroupFull;
  }
  return clean;
}

/**
 * 檢查是否為已轉換的標準 IPC Subgroup 代碼格式（例如 "G06N 3/08", "G06N 20/00"）
 */
export function isFormattedIpcCode(text) {
  if (!text || typeof text !== 'string') return false;
  return /^[A-H]\d{2}[A-Z]\s*\d+\/\d+$/i.test(text.trim());
}

/**
 * 根據維度名稱決定是否對該欄位值進行轉換
 */
export function formatDimensionValue(val, dimName) {
  if (!val) return '';
  if (isIpcSubgroupDimension(dimName)) {
    return formatIpcSubgroupLabel(val);
  }
  return val;
}

/**
 * 複合維度標籤轉換（若維度中包含 IPC Subgroup，將該層級轉成標準格式顯示）
 * 例如：'人工智慧 > G06N000308' (dims=['技術1階', 'IPC Subgroup']) -> '人工智慧 > G06N 3/08'
 */
export function formatComboLabel(fullLabel, dims) {
  if (!fullLabel || !dims || dims.length === 0) return fullLabel || '';
  const parts = String(fullLabel).split(' > ');
  const formattedParts = parts.map((part, idx) => {
    const dim = dims[idx] || dims[0];
    return formatDimensionValue(part, dim);
  });
  return formattedParts.join(' > ');
}

