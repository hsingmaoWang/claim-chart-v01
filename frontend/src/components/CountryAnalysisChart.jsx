import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-dist-min';
import { Sun, Moon, Globe, Info, AlertTriangle } from 'lucide-react';
import html2canvas from 'html2canvas';
import {
  COUNTRY_METADATA,
  getCountryMeta,
  parseAssigneeCountry,
  extractApplicationCountry
} from '../utils/countryUtils';

const Plot = createPlotlyComponent(Plotly);

// Country priority list based on patent-list-processing skill: US > WO > EP > TW > CN > JP > KR
const COUNTRY_PRIORITY = {
  'US': 1, 'WO': 2, 'EP': 3, 'TW': 4, 'CN': 5, 'JP': 6, 'KR': 7
};

const extractCountryCode = (pubNumber) => {
  if (!pubNumber) return '';
  const match = String(pubNumber).trim().match(/^([A-Za-z]{2})/);
  return match ? match[1].toUpperCase() : '';
};

const extract4DigitYear = (dateVal) => {
  if (dateVal === undefined || dateVal === null) return null;
  const str = String(dateVal).trim();
  if (!str || str.toLowerCase() === 'nan' || str.toLowerCase() === 'nat') return null;

  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 70000) {
    try {
      const jsDate = new Date((num - 25569) * 86400 * 1000);
      const y = jsDate.getFullYear();
      if (y >= 1900 && y <= 2099) return y;
    } catch (e) { }
  }

  const match = str.match(/(19\d{2}|20\d{2})/);
  if (match) return parseInt(match[1], 10);
  return null;
};

const findFieldKeyCaseInsensitive = (sampleItem, candidateKeys) => {
  if (!sampleItem) return null;
  const keys = Object.keys(sampleItem);

  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
      if (kNorm === candNorm) return k;
    }
  }

  for (const candidate of candidateKeys) {
    const candNorm = candidate.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
    for (const k of keys) {
      const kNorm = k.toLowerCase().replace(/[\s_\-/\.]+/g, '').trim();
      if (kNorm.includes(candNorm) || candNorm.includes(kNorm)) return k;
    }
  }
  return null;
};

const CountryAnalysisChart = ({ treeData, onCaptureReady, authState }) => {
  // 日間 / 夜間模式狀態 (預設 light)
  const [theme, setTheme] = useState('light');
  const isDark = theme === 'dark';

  // 子圖表類型: 'application' (申請國分析圖) vs 'assignee' (所屬國分析圖)
  const [chartSubtype, setChartSubtype] = useState('application');

  // 選中突顯的國家 (點擊側邊欄表格可高亮聚焦)
  const [selectedCountry, setSelectedCountry] = useState(null);

  const chartContainerRef = useRef(null);

  // 1. 提取原始專利資料清單
  const rawPatents = useMemo(() => {
    if (!treeData) return [];
    if (Array.isArray(treeData.patents)) return treeData.patents;
    for (const key in treeData) {
      if (Array.isArray(treeData[key])) return treeData[key];
    }
    return [];
  }, [treeData]);

  // 2. 欄位自動探測比對
  const columnKeys = useMemo(() => {
    if (!rawPatents || rawPatents.length === 0) {
      return {
        appNum: null,
        pubNum: null,
        pubDate: null,
        familyId: null,
        pubCountry: null,
        assignee: null
      };
    }
    const sample = rawPatents[0] || {};

    const appNumKey = findFieldKeyCaseInsensitive(sample, [
      'Application Number', 'application number', '申請號', 'app no', 'app_no', 'appl. no.', '申請案號'
    ]);

    const pubNumKey = findFieldKeyCaseInsensitive(sample, [
      'Publication Number', 'publication number', '公開號', '公告號', '專利公開公告號', '專利號', 'pub no', 'pub_no'
    ]);

    const pubDateKey = findFieldKeyCaseInsensitive(sample, [
      'Publication Date', 'publication date', '公開日', '公告日', '公開公告日', 'pub_date', 'publication_date', '發證日'
    ]);

    const familyIdKey = findFieldKeyCaseInsensitive(sample, [
      'INPADOC Family ID', 'Family ID', 'family id', '專利家族號', '家族編號', 'inpadoc family', 'inpadoc'
    ]);

    const pubCountryKey = findFieldKeyCaseInsensitive(sample, [
      'Publication Country Code', 'publication country code', 'Publication Country', 'Country Code',
      'country code', '申請國別', '公開國別', '國別', 'Country', 'country'
    ]);

    const assigneeKey = findFieldKeyCaseInsensitive(sample, [
      'Assignee/Applicant', 'Assignee / Applicant', 'Applicant / Assignee', 'Assignee', 'Applicant',
      '申請人', '專利權人', '受讓人', 'Original Assignee', 'Standardized Assignee'
    ]);

    return {
      appNum: appNumKey,
      pubNum: pubNumKey,
      pubDate: pubDateKey,
      familyId: familyIdKey,
      pubCountry: pubCountryKey,
      assignee: assigneeKey
    };
  }, [rawPatents]);

  // 3. 公開公告合併 (Publication/Grant Merge) -> 「件」數母體 (Pieces)
  // 同 Application Number 僅保留 Publication Date 最新的一件，計為 1 件。無申請號者獨立保留。
  // 此外，同公開公告號 (Publication Number) 僅計算為 1 件，不重複計算。
  const mergedPatents = useMemo(() => {
    if (!rawPatents || rawPatents.length === 0) return [];
    const { appNum: appNumKey, pubDate: pubDateKey, pubNum: pubNumKey } = columnKeys;

    let preMerged = [];
    if (!appNumKey) {
      preMerged = rawPatents;
    } else {
      const appMap = new Map();
      const noAppNumList = [];

      rawPatents.forEach((p) => {
        const rawApp = p[appNumKey];
        const appNum = rawApp !== undefined && rawApp !== null ? String(rawApp).trim() : '';
        if (!appNum || appNum.toLowerCase() === 'nan' || appNum === '-') {
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

    // 當統計中有同樣的公開公告號 (Publication Number) 時，僅計算為 1 件，不重複計算
    if (!pubNumKey) {
      return preMerged;
    }

    const pubMap = new Map();
    const noPubList = [];

    preMerged.forEach((p) => {
      const rawPub = p[pubNumKey];
      const pubNum = rawPub !== undefined && rawPub !== null ? String(rawPub).trim().toUpperCase() : '';
      if (!pubNum || pubNum === 'NAN' || pubNum === '-') {
        noPubList.push(p);
      } else {
        if (!pubMap.has(pubNum)) {
          pubMap.set(pubNum, p);
        } else {
          // 若已有同公開公告號，保留最新公開日
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
  }, [rawPatents, columnKeys]);

  // 4. 專利家族合併 (Patent Family Consolidation) -> 「案」數母體 (Cases)
  // 同 INPADOC Family ID 歸為同家族 (1案)，依國別優先順序 US > WO > EP > TW > CN > JP > KR 挑選一件代表專利。
  // 此外，同公開公告號 (Publication Number) 僅計算為 1 案，不重複計算。
  const familyRepresentativePatents = useMemo(() => {
    if (!mergedPatents || mergedPatents.length === 0) return [];
    const { familyId: familyKey, pubNum: pubNumKey, pubDate: pubDateKey } = columnKeys;

    let candidates = [];
    if (!familyKey) {
      candidates = mergedPatents;
    } else {
      const familyGroups = new Map();
      const noFamilyList = [];

      mergedPatents.forEach((p) => {
        const rawFam = p[familyKey];
        const famId = rawFam !== undefined && rawFam !== null ? String(rawFam).trim() : '';
        if (!famId || famId.toLowerCase() === 'nan' || famId === '-') {
          noFamilyList.push(p);
        } else {
          if (!familyGroups.has(famId)) {
            familyGroups.set(famId, []);
          }
          familyGroups.get(famId).push(p);
        }
      });

      const result = [...noFamilyList];
      familyGroups.forEach((members) => {
        if (members.length === 1) {
          result.push(members[0]);
          return;
        }

        // 國別優先權評分與排序
        const scored = members.map((item) => {
          const pubNo = pubNumKey ? item[pubNumKey] : '';
          const cCode = extractCountryCode(pubNo);
          const priority = COUNTRY_PRIORITY[cCode] || 999;
          const pubYear = pubDateKey ? (extract4DigitYear(item[pubDateKey]) || 0) : 0;
          return { item, priority, pubYear };
        });

        scored.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return b.pubYear - a.pubYear;
        });

        result.push(scored[0].item);
      });

      candidates = result;
    }

    // 當統計中有同樣的公開公告號 (Publication Number) 時，僅計算為 1 案，不重複計算
    if (!pubNumKey) {
      return candidates;
    }

    const pubMap = new Map();
    const noPubList = [];

    candidates.forEach((p) => {
      const rawPub = p[pubNumKey];
      const pubNum = rawPub !== undefined && rawPub !== null ? String(rawPub).trim().toUpperCase() : '';
      if (!pubNum || pubNum === 'NAN' || pubNum === '-') {
        noPubList.push(p);
      } else {
        if (!pubMap.has(pubNum)) {
          pubMap.set(pubNum, p);
        } else {
          // 若有相同公開號代表案，優先保留高優先級國別或最新年份
          const existing = pubMap.get(pubNum);
          const priExisting = COUNTRY_PRIORITY[extractCountryCode(existing[pubNumKey])] || 999;
          const priNew = COUNTRY_PRIORITY[extractCountryCode(p[pubNumKey])] || 999;
          if (priNew < priExisting) {
            pubMap.set(pubNum, p);
          } else if (priNew === priExisting) {
            const dateExisting = pubDateKey ? (extract4DigitYear(existing[pubDateKey]) || 0) : 0;
            const dateNew = pubDateKey ? (extract4DigitYear(p[pubDateKey]) || 0) : 0;
            if (dateNew > dateExisting) {
              pubMap.set(pubNum, p);
            }
          }
        }
      }
    });

    return [...noPubList, ...Array.from(pubMap.values())];
  }, [mergedPatents, columnKeys]);

  // 5. 統計運算：申請國統計 (件數) vs 所屬國統計 (案數)
  const analysisStats = useMemo(() => {
    const isAppMode = chartSubtype === 'application';
    const activePatents = isAppMode ? mergedPatents : familyRepresentativePatents;
    const unit = isAppMode ? '件' : '案';
    const { pubNum: pubNumKey, pubCountry: pubCountryKey, assignee: assigneeKey } = columnKeys;

    if (!activePatents || activePatents.length === 0) {
      return {
        unit,
        total: 0,
        validTotal: 0,
        countryList: [],
        countryCounts: {},
        unknownCount: 0,
        hasMissingField: false,
        missingFieldName: ''
      };
    }

    const counts = {};
    let unknownCount = 0;
    const seenPubNums = new Set();

    if (isAppMode) {
      // 申請國分析
      if (!pubCountryKey && !pubNumKey) {
        return {
          unit,
          total: activePatents.length,
          validTotal: 0,
          countryList: [],
          countryCounts: {},
          unknownCount: activePatents.length,
          hasMissingField: true,
          missingFieldName: 'Publication Country Code 或 Publication Number'
        };
      }

      activePatents.forEach((p) => {
        // 同樣的公開公告號僅計算為 1 件，不重複計算
        if (pubNumKey) {
          const rawPub = p[pubNumKey];
          const pubNum = rawPub !== undefined && rawPub !== null ? String(rawPub).trim().toUpperCase() : '';
          if (pubNum && pubNum !== 'NAN' && pubNum !== '-') {
            if (seenPubNums.has(pubNum)) return;
            seenPubNums.add(pubNum);
          }
        }

        const cCode = extractApplicationCountry(p, pubCountryKey, pubNumKey);
        if (cCode) {
          counts[cCode] = (counts[cCode] || 0) + 1;
        } else {
          unknownCount++;
        }
      });
    } else {
      // 所屬國分析
      if (!assigneeKey) {
        return {
          unit,
          total: activePatents.length,
          validTotal: 0,
          countryList: [],
          countryCounts: {},
          unknownCount: activePatents.length,
          hasMissingField: true,
          missingFieldName: 'Assignee/Applicant (申請人/專利權人)'
        };
      }

      activePatents.forEach((p) => {
        // 同樣的公開公告號僅計算為 1 案，不重複計算
        if (pubNumKey) {
          const rawPub = p[pubNumKey];
          const pubNum = rawPub !== undefined && rawPub !== null ? String(rawPub).trim().toUpperCase() : '';
          if (pubNum && pubNum !== 'NAN' && pubNum !== '-') {
            if (seenPubNums.has(pubNum)) return;
            seenPubNums.add(pubNum);
          }
        }

        const rawAssignee = p[assigneeKey];
        const cCode = parseAssigneeCountry(rawAssignee);
        if (cCode) {
          counts[cCode] = (counts[cCode] || 0) + 1;
        } else {
          unknownCount++;
        }
      });
    }

    const validTotal = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const total = validTotal + unknownCount;

    // 格式化國別清單並依件/案數排序
    const countryList = Object.keys(counts).map((code) => {
      const meta = getCountryMeta(code) || {
        code,
        name: code,
        iso3: code,
        label: `${code} (${code})`,
        lat: 0,
        lon: 0
      };
      const count = counts[code];
      const percent = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0';
      return {
        code,
        name: meta.name,
        iso3: meta.iso3,
        label: meta.label,
        count,
        percent,
        lat: meta.lat,
        lon: meta.lon
      };
    });

    countryList.sort((a, b) => b.count - a.count);

    return {
      unit,
      total,
      validTotal,
      countryList,
      countryCounts: counts,
      unknownCount,
      hasMissingField: false,
      missingFieldName: ''
    };
  }, [chartSubtype, mergedPatents, familyRepresentativePatents, columnKeys]);

  // 6. 建構 Plotly Choropleth 與 Scattergeo 繪圖數據
  const plotlyChartData = useMemo(() => {
    const { countryList, unit, total } = analysisStats;
    if (!countryList || countryList.length === 0) return null;

    // 將資料依據 ISO-3 聚合 (例如 EP 與 AT 都對應至 AUT, WO 與 CH 都對應至 CHE)
    const iso3Map = new Map();
    countryList.forEach((item) => {
      const iso3 = item.iso3;
      if (!iso3) return;
      if (!iso3Map.has(iso3)) {
        iso3Map.set(iso3, {
          iso3,
          count: 0,
          countryCodes: [],
          details: [],
          lat: item.lat,
          lon: item.lon
        });
      }
      const entry = iso3Map.get(iso3);
      entry.count += item.count;
      entry.countryCodes.push(item.code);
      entry.details.push(`${item.label}: ${item.count}${unit} (${item.percent}%)`);
      // 若尚未有經緯度座標，補充座標
      if (!entry.lat && item.lat) entry.lat = item.lat;
      if (!entry.lon && item.lon) entry.lon = item.lon;
    });

    const choroplethLocations = [];
    const choroplethZ = [];
    const choroplethText = [];

    iso3Map.forEach((entry) => {
      choroplethLocations.push(entry.iso3);
      choroplethZ.push(entry.count);
      choroplethText.push(entry.details.join('<br>'));
    });

    // 著色色彩漸層 (日夜間調配)
    const choroplethColorscale = isDark
      ? [
        [0.0, '#559dfbff'],
        [0.2, '#4ab0f8ff'],
        [0.5, '#56f72dff'],
        [0.8, '#f8e238ff'],
        [1.0, '#fa3939ff']
      ]
      : [
        [0.0, '#559dfbff'],
        [0.2, '#4ab0f8ff'],
        [0.5, '#56f72dff'],
        [0.8, '#f8e238ff'],
        [1.0, '#fa3939ff']
      ];

    // (1) 底層區塊著色圖 (Choropleth Trace)
    const choroplethTrace = {
      type: 'choropleth',
      locationmode: 'ISO-3',
      locations: choroplethLocations,
      z: choroplethZ,
      text: choroplethText,
      hoverinfo: 'text',
      colorscale: choroplethColorscale,
      autocolorscale: false,
      showscale: true,
      colorbar: {
        title: {
          text: '' // 標題改由 layout.annotations 精確置中對齊並向上拉開間距
        },
        tickfont: { color: isDark ? '#94a3b8' : '#64748b', size: 12 },
        thickness: 14,
        len: 0.6,
        x: 0.98,
        y: 0.5,
        xanchor: 'center',
        yanchor: 'middle'
      },
      marker: {
        line: {
          color: isDark ? '#334155' : '#cbd5e1',
          width: 0.8
        }
      }
    };

    // (2) 頂層數值標籤文字 (Scattergeo Trace) - 直接標示件數或案數，並賦予擴大透明熱區與 Tooltip
    const labelLats = [];
    const labelLons = [];
    const labelTexts = [];
    const labelHoverTexts = [];

    iso3Map.forEach((entry) => {
      if (entry.lat && entry.lon && entry.count > 0) {
        labelLats.push(entry.lat);
        labelLons.push(entry.lon);
        labelTexts.push(`<b>${entry.count}</b>`);
        labelHoverTexts.push(entry.details.join('<br>'));
      }
    });

    const scatterGeoTrace = {
      type: 'scattergeo',
      lat: labelLats,
      lon: labelLons,
      mode: 'text+markers',
      text: labelTexts,
      textfont: {
        family: 'Inter, system-ui, sans-serif',
        size: 14,
        color: isDark ? '#ffffff' : '#0f172a'
      },
      textposition: 'middle center',
      marker: {
        size: 36, // 擴大感應熱區半徑，當滑鼠接近標籤數字時即可極容易觸發 Tooltip
        color: 'rgba(0,0,0,0)', // 完全透明，不遮擋底層顏色與邊界
        opacity: 0
      },
      hoverinfo: 'text',
      hovertext: labelHoverTexts
    };

    return [choroplethTrace, scatterGeoTrace];
  }, [analysisStats, chartSubtype, isDark]);

  // 7. Plotly Layout 佈局設定
  const plotlyLayout = useMemo(() => {
    const titleText = chartSubtype === 'application' ? '專利申請國分析圖' : '專利所屬國分析圖';
    const colorbarTitleText = chartSubtype === 'application' ? '申請件數' : '所屬案數';

    return {
      title: {
        text: `<b>${titleText}</b>`,
        font: {
          size: 24,
          color: isDark ? '#f8fafc' : '#0f172a',
          family: 'Inter, system-ui, sans-serif'
        },
        y: 0.97
      },
      hovermode: 'closest',
      hoverdistance: 40,
      hoverlabel: {
        bgcolor: isDark ? '#1e293b' : '#ffffff',
        bordercolor: isDark ? '#38bdf8' : '#0284c7',
        font: {
          family: 'Inter, system-ui, sans-serif',
          size: 13,
          color: isDark ? '#f8fafc' : '#0f172a'
        }
      },
      annotations: [
        {
          xref: 'paper',
          yref: 'paper',
          x: 0.99,
          y: 0.81, // 適度向上移動，增加文字底部與 colorscale bar 上端的空間
          // xanchor: 'center', // 讓文字與 colorscale bar (x: 0.98) 垂直中線精確置中對齊
          yanchor: 'bottom',
          text: `<b>${colorbarTitleText}</b>`,
          showarrow: false,
          font: {
            color: isDark ? '#e2e8f0' : '#334155',
            size: 13,
            family: 'Inter, system-ui, sans-serif'
          }
        }
      ],
      geo: {
        showframe: false,
        showcoastlines: true,
        coastlinecolor: isDark ? '#1354a4ff' : '#c7defaff',
        projection: {
          type: 'natural earth'
        },
        bgcolor: 'transparent',
        lakecolor: isDark ? '#0f172a' : '#f8fafc',
        landcolor: isDark ? '#1e293b' : '#f1f5f9',
        showland: true,
        showlakes: true,
        showcountries: true,
        countrycolor: isDark ? '#334155' : '#e2e8f0',
        countrywidth: 0.6
      },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      margin: { l: 0, r: 0, t: 55, b: 20 },
      autosize: true
    };
  }, [chartSubtype, isDark]);

  // 8. 截圖下載功能 (PNG Export - 方案 B: 混合高解析合成，解決 SVG <linearGradient> 色彩刻度尺空白問題)
  const captureImage = useCallback(async () => {
    const container = chartContainerRef.current;
    if (!container) return;

    const plotDiv = container.querySelector('.js-plotly-plot');
    let tempImg = null;
    let plotContainer = null;
    let originalDisplay = '';

    try {
      const bgColor = isDark ? '#0f172a' : '#ffffff';

      // 步驟 1: 使用 Plotly.toImage 原生光柵化地圖與 Color scale，解決 html2canvas 無法解析 SVG 漸層填色的問題
      if (plotDiv) {
        const w = plotDiv.offsetWidth || 1200;
        const h = plotDiv.offsetHeight || 680;

        const plotDataUrl = await Plotly.toImage(plotDiv, {
          format: 'png',
          scale: 2,
          width: w,
          height: h
        });

        tempImg = document.createElement('img');
        tempImg.src = plotDataUrl;
        tempImg.style.width = '100%';
        tempImg.style.height = '100%';
        tempImg.style.display = 'block';
        tempImg.style.objectFit = 'contain';

        if (tempImg.decode) {
          await tempImg.decode().catch(() => { });
        } else {
          await new Promise((resolve) => {
            tempImg.onload = resolve;
            tempImg.onerror = resolve;
          });
        }

        plotContainer = plotDiv.querySelector('.plot-container') || plotDiv.firstElementChild;
        if (plotContainer) {
          originalDisplay = plotContainer.style.display;
          plotContainer.style.display = 'none';
        }
        plotDiv.appendChild(tempImg);
      }

      // 步驟 2: 使用 html2canvas 擷取包含完整色彩刻度尺與右側國別排行的全景儀表板
      const canvas = await html2canvas(container, {
        scale: 2,
        backgroundColor: bgColor,
        useCORS: true,
        logging: false
      });

      const dataUrl = canvas.toDataURL('image/png');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const subtypeName = chartSubtype === 'application' ? '申請國分析圖' : '所屬國分析圖';
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `patent_country_${subtypeName}_${timestamp}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      if (authState?.session_id) {
        const base64Data = dataUrl.split(',')[1] || '';
        const padding = base64Data.endsWith('==') ? 2 : base64Data.endsWith('=') ? 1 : 0;
        const fileSizeBytes = Math.floor((base64Data.length * 3) / 4) - padding;
        fetch('/api/usage/log-png', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: authState.session_id, file_size_bytes: fileSizeBytes })
        }).catch((err) => console.error('Failed to log PNG download', err));
      }
    } catch (err) {
      console.error('Failed to capture country analysis chart image', err);
    } finally {
      // 步驟 3: 恢復原生 Plotly DOM 與互動功能
      if (tempImg && tempImg.parentNode) {
        tempImg.parentNode.removeChild(tempImg);
      }
      if (plotContainer) {
        plotContainer.style.display = originalDisplay;
      }
    }
  }, [authState, chartSubtype, isDark]);

  useEffect(() => {
    if (onCaptureReady) {
      onCaptureReady(() => captureImage);
    }
  }, [captureImage, onCaptureReady]);

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: '100%',
        minHeight: '780px',
        background: isDark ? '#0f172a' : '#ffffff',
        color: isDark ? '#f8fafc' : '#0f172a',
        borderRadius: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'Inter, system-ui, sans-serif',
        position: 'relative'
      }}
    >
      {/* 頂部操作控制列 */}
      <div
        style={{
          padding: '0.75rem 1.5rem',
          borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(248, 250, 252, 0.9)',
          backdropFilter: 'blur(8px)'
        }}
      >
        {/* 左側：分析模式切換 (申請國 vs 所屬國) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#38bdf8' : '#0284c7' }}>
            <Globe size={18} />
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>國別分析：</span>
          </div>

          <div
            style={{
              display: 'inline-flex',
              background: isDark ? 'rgba(30, 41, 59, 0.9)' : 'rgba(226, 232, 240, 0.85)',
              borderRadius: '0.5rem',
              padding: '3px',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)'}`
            }}
          >
            <button
              onClick={() => {
                setChartSubtype('application');
                setSelectedCountry(null);
              }}
              style={{
                padding: '0.35rem 0.9rem',
                borderRadius: '0.35rem',
                border: 'none',
                background: chartSubtype === 'application' ? '#0ea5e9' : 'transparent',
                color: chartSubtype === 'application' ? '#ffffff' : isDark ? '#94a3b8' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              申請國分析圖
            </button>
            <button
              onClick={() => {
                setChartSubtype('assignee');
                setSelectedCountry(null);
              }}
              style={{
                padding: '0.35rem 0.9rem',
                borderRadius: '0.35rem',
                border: 'none',
                background: chartSubtype === 'assignee' ? '#0ea5e9' : 'transparent',
                color: chartSubtype === 'assignee' ? '#ffffff' : isDark ? '#94a3b8' : '#475569',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem'
              }}
            >
              所屬國分析圖
            </button>
          </div>
        </div>

        {/* 右側：日間/夜間模式膠囊切換鈕 (格式與位置與其他圖表完全相同) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div
            style={{
              background: isDark ? 'rgba(30, 41, 59, 0.85)' : 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(8px)',
              borderRadius: '2rem',
              padding: '3px',
              display: 'inline-flex',
              gap: '2px',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
          >
            <button
              title="夜間模式"
              onClick={() => setTheme('dark')}
              style={{
                background: theme === 'dark' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: theme === 'dark' ? '#fcef7aff' : '#ffffffff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Moon size={14} />
            </button>
            <button
              title="日間模式"
              onClick={() => setTheme('light')}
              style={{
                background: theme === 'light' ? '#0ea5e9' : 'transparent',
                border: 'none',
                color: theme === 'light' ? '#fcef7aff' : '#ffffffff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <Sun size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 警示訊息 (若缺乏關鍵欄位) */}
      {analysisStats.hasMissingField && (
        <div
          style={{
            margin: '1rem 1.5rem 0',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            background: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fef2f2',
            border: `1px solid ${isDark ? '#ef4444' : '#fecaca'}`,
            color: isDark ? '#fca5a5' : '#b91c1c',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: '0.85rem'
          }}
        >
          <AlertTriangle size={16} />
          <span>上傳的資料集中未偵測到 <strong>{analysisStats.missingFieldName}</strong> 欄位，無法進行國別統計。</span>
        </div>
      )}

      {/* 主工作區：左側世界地圖 + 右側國別排名統計清單 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'row',
          position: 'relative',
          minHeight: '680px'
        }}
      >
        {/* 左側 Plotly 世界地圖 */}
        <div style={{ flex: 1, position: 'relative', minHeight: '620px' }}>
          {plotlyChartData ? (
            <Plot
              data={plotlyChartData}
              layout={plotlyLayout}
              config={{
                responsive: true,
                displayModeBar: true,
                displaylogo: false,
                scrollZoom: true,
                modeBarButtonsToRemove: ['lasso2d', 'select2d']
              }}
              style={{ width: '100%', height: '100%', minHeight: '620px' }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: isDark ? '#94a3b8' : '#64748b',
                fontSize: '0.95rem'
              }}
            >
              暫無有效國別資料可供顯示
            </div>
          )}
        </div>

        {/* 右側國別分佈排名清單 */}
        <div
          style={{
            width: '320px',
            borderLeft: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
            background: isDark ? 'rgba(15, 23, 42, 0.5)' : 'rgba(248, 250, 252, 0.7)',
            padding: '1.25rem 1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.0rem', fontWeight: 700, color: isDark ? '#f8fafc' : '#0f172a' }}>
              {chartSubtype === 'application' ? '申請國別排行' : '所屬國別排行'}
            </span>
            <span style={{ fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b' }}>
              共 {analysisStats.total} {analysisStats.unit}
            </span>
          </div>

          {/* 總結指標卡片 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.5rem',
              marginBottom: '0.25rem'
            }}
          >
            <div
              style={{
                padding: '0.55rem',
                borderRadius: '0.45rem',
                background: isDark ? 'rgba(30, 41, 59, 0.7)' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`
              }}
            >
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>涵蓋國家/地區</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0ea5e9' }}>
                {analysisStats.countryList.length} 國
              </div>
            </div>
            <div
              style={{
                padding: '0.55rem',
                borderRadius: '0.45rem',
                background: isDark ? 'rgba(30, 41, 59, 0.7)' : '#ffffff',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`
              }}
            >
              <div style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b' }}>識別統計總數</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#10b981' }}>
                {analysisStats.validTotal} {analysisStats.unit}
              </div>
            </div>
          </div>

          {/* 國家明細列表 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem', overflowY: 'auto' }}>
            {analysisStats.countryList.map((item, idx) => {
              const isSelected = selectedCountry === item.code;
              return (
                <div
                  key={item.code}
                  onClick={() => setSelectedCountry(isSelected ? null : item.code)}
                  style={{
                    padding: '0.5rem 0.65rem',
                    borderRadius: '0.45rem',
                    background: isSelected
                      ? isDark ? 'rgba(14, 165, 233, 0.25)' : 'rgba(224, 242, 254, 0.9)'
                      : isDark ? 'rgba(30, 41, 59, 0.6)' : '#ffffff',
                    border: `1px solid ${isSelected ? '#0ea5e9' : isDark ? 'rgba(255, 255, 255, 0.06)' : '#f1f5f9'}`,
                    cursor: 'pointer',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: idx < 3 ? '#f59e0b' : isDark ? '#94a3b8' : '#64748b',
                          minWidth: '16px'
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                        {item.label}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0ea5e9' }}>
                      {item.count} {analysisStats.unit} ({item.percent}%)
                    </div>
                  </div>

                  {/* 佔比進度條 */}
                  <div
                    style={{
                      height: '5px',
                      borderRadius: '3px',
                      background: isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${item.percent}%`,
                        background: idx === 0 ? '#0ea5e9' : idx === 1 ? '#38bdf8' : idx === 2 ? '#0284c7' : '#94a3b8',
                        borderRadius: '3px',
                        transition: 'width 0.3s'
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* 未註明 / 其他 (Unknown) */}
            {analysisStats.unknownCount > 0 && (
              <div
                style={{
                  padding: '0.5rem 0.65rem',
                  borderRadius: '0.45rem',
                  background: isDark ? 'rgba(30, 41, 59, 0.3)' : '#f8fafc',
                  border: `1px dashed ${isDark ? 'rgba(255, 255, 255, 0.15)' : '#cbd5e1'}`,
                  color: isDark ? '#94a3b8' : '#64748b',
                  fontSize: '0.8rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <span>未註明 / 無法識別</span>
                <span style={{ fontWeight: 600 }}>
                  {analysisStats.unknownCount} {analysisStats.unit} ({((analysisStats.unknownCount / analysisStats.total) * 100).toFixed(1)}%)
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 底部說明小語 */}
      <div
        style={{
          padding: '0.5rem 1.5rem',
          borderTop: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'}`,
          fontSize: '0.8rem',
          color: isDark ? '#94a3b8' : '#64748b',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem'
        }}
      >
        <Info size={13} />
        <span>
          {chartSubtype === 'application'
            ? '申請國分析圖以「件」為單位統計 (依同申請號最新公開日合併，且同公開號僅計1件)，地圖標示件數，支援滾輪局部縮放與拖曳平移地圖。'
            : '所屬國分析圖以「案」為單位統計 (依 INPADOC 家族代表案申請人地址判斷，且同公開號僅計1案)，地圖標示案數，支援滾輪局部縮放與拖曳平移地圖。'}
        </span>
      </div>
    </div>
  );
};

export default CountryAnalysisChart;

