import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import * as d3 from 'd3';
import { Sun, Moon, FileText, RotateCcw, ChevronRight, Layers, Info, Award } from 'lucide-react';
import html2canvas from 'html2canvas';

// IPC 八大部主題色彩系統（日間 / 夜間模式分開調配）
const SECTION_PALETTES = {
  light: {
    A: { fill: '#818cf8', stroke: '#4f46e5', text: '#1e1b4b', subFill: '#c7d2fe' }, // 人類生活需要 (藍紫)
    B: { fill: '#86efac', stroke: '#16a34a', text: '#064e3b', subFill: '#bbf7d0' }, // 作業；運輸 (綠)
    C: { fill: '#fdba74', stroke: '#ea580c', text: '#7c2d12', subFill: '#fed7aa' }, // 化學；冶金 (橘)
    D: { fill: '#6ee7b7', stroke: '#059669', text: '#022c22', subFill: '#a7f3d0' }, // 紡織；造紙 (青綠)
    E: { fill: '#f472b6', stroke: '#db2777', text: '#831843', subFill: '#fbcfe8' }, // 固定構造物 (粉紅)
    F: { fill: '#fde047', stroke: '#ca8a04', text: '#713f12', subFill: '#fef08a' }, // 機械工程；照明 (金黃)
    G: { fill: '#38bdf8', stroke: '#0284c7', text: '#082f49', subFill: '#bae6fd' }, // 物理 (湛藍)
    H: { fill: '#c084fc', stroke: '#9333ea', text: '#3b0764', subFill: '#e9d5ff' }, // 電學 (紫)
    default: { fill: '#cbd5e1', stroke: '#64748b', text: '#1e293b', subFill: '#f1f5f9' }
  },
  dark: {
    A: { fill: '#6366f1', stroke: '#a5b4fc', text: '#e0e7ff', subFill: '#4338ca' },
    B: { fill: '#22c55e', stroke: '#86efac', text: '#dcfce7', subFill: '#15803d' },
    C: { fill: '#f97316', stroke: '#fdba74', text: '#ffedd5', subFill: '#c2410c' },
    D: { fill: '#14b8a6', stroke: '#5eead4', text: '#ccfbf1', subFill: '#0f766e' },
    E: { fill: '#ec4899', stroke: '#f472b6', text: '#fce7f3', subFill: '#be185d' },
    F: { fill: '#eab308', stroke: '#fde047', text: '#fef9c3', subFill: '#a16207' },
    G: { fill: '#0284c7', stroke: '#38bdf8', text: '#e0f2fe', subFill: '#0369a1' },
    H: { fill: '#a855f7', stroke: '#d8b4fe', text: '#f3e8ff', subFill: '#7e22ce' },
    default: { fill: '#475569', stroke: '#94a3b8', text: '#f8fafc', subFill: '#334155' }
  }
};

const SECTION_NAMES = {
  A: '人類生活需要',
  B: '作業；運輸',
  C: '化學；冶金',
  D: '紡織；造紙',
  E: '固定構造物',
  F: '機械工程；照明；加熱；武器；爆破',
  G: '物理',
  H: '電學'
};

/**
 * 依據規範解析 IPC Subgroup 字串：
 * a. 以 ", " 分割
 * b. 前 4 碼為 IPC 部類碼 (Subclass)
 * c. 第 5-8 碼去除 5-7 碼前導 "0"
 * d. 號碼 + "/" + 第 9 碼以後剩下未取的號碼 = IPC主次目
 */
function parseIpcCode(rawCode) {
  if (!rawCode) return null;
  const s = String(rawCode).trim();
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

const IpcCirclePackingChart = ({ treeData, onCaptureReady, authState }) => {
  const containerRef = useRef(null);
  const svgRef = useRef(null);
  const [theme, setTheme] = useState('light'); // 'light' | 'dark'
  const isDark = theme === 'dark';

  // Tooltip 狀態
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    data: null
  });

  // 當前縮放聚焦節點 (麵包屑導航)
  const [currentFocus, setCurrentFocus] = useState(null);

  // 後端載入之 IPC 中文定義字典與全階層定義
  const [definitions, setDefinitions] = useState({});
  const [fullPaths, setFullPaths] = useState({});

  // 1. 取得專利資料（公開公告合併後）
  const rawPatents = useMemo(() => {
    if (!treeData) return [];
    if (Array.isArray(treeData.patents)) return treeData.patents;
    for (const key in treeData) {
      if (Array.isArray(treeData[key])) return treeData[key];
    }
    return [];
  }, [treeData]);

  // 統計家族案數與件數
  const totalPieces = rawPatents.length;
  const totalCases = useMemo(() => {
    if (!rawPatents.length) return 0;
    const sample = rawPatents[0] || {};
    const familyKey = Object.keys(sample).find(k => {
      const lower = k.toLowerCase().trim();
      return lower.includes('family') || lower.includes('家族');
    });
    if (!familyKey) return totalPieces;
    const famSet = new Set();
    let noFamCount = 0;
    rawPatents.forEach(p => {
      const f = p[familyKey];
      if (f && String(f).trim() && !['nan', '-', 'none'].includes(String(f).toLowerCase().trim())) {
        famSet.add(String(f).trim());
      } else {
        noFamCount += 1;
      }
    });
    return famSet.size + noFamCount;
  }, [rawPatents, totalPieces]);

  // 2. 依專利清單建構 5 階層巢狀樹狀結構 & 計算第 4 階 (Main Group 主目) 佔比 Top 5
  const { hierarchyRoot, uniqueIpcCodes, top5MainGroups } = useMemo(() => {
    if (!rawPatents.length) return { hierarchyRoot: null, uniqueIpcCodes: [], top5MainGroups: [] };

    const sample = rawPatents[0] || {};
    let ipcCol = Object.keys(sample).find(k => {
      const lower = k.toLowerCase().trim();
      return lower.includes('ipc') && lower.includes('subgroup');
    });
    if (!ipcCol) {
      ipcCol = Object.keys(sample).find(k => k.toLowerCase().includes('ipc'));
    }

    const sectionMap = new Map();
    const codeCollector = new Set();

    rawPatents.forEach(patent => {
      const pNo = patent['專利公開公告號'] || patent['publication number'] || patent['專利號'] || 'P';
      const rawIpcValue = ipcCol ? patent[ipcCol] : null;
      if (!rawIpcValue) return;

      const items = String(rawIpcValue).split(/[,;]\s*/);
      items.forEach(rawItem => {
        const parsed = parseIpcCode(rawItem);
        if (!parsed || !parsed.section) return;

        codeCollector.add(parsed.subgroupFull);
        if (parsed.mainGroupFull) codeCollector.add(parsed.mainGroupFull);
        codeCollector.add(parsed.subclass);
        codeCollector.add(parsed.classCode);
        codeCollector.add(parsed.section);

        const { section, classCode, subclass, mainGroupFull, subgroupFull, isMainGroup } = parsed;

        // Level 1: 部
        if (!sectionMap.has(section)) {
          sectionMap.set(section, {
            name: section,
            level: 1,
            levelName: '部 (Section)',
            code: section,
            patents: new Set(),
            classes: new Map()
          });
        }
        const secNode = sectionMap.get(section);
        secNode.patents.add(pNo);

        // Level 2: 大類
        if (!secNode.classes.has(classCode)) {
          secNode.classes.set(classCode, {
            name: classCode,
            level: 2,
            levelName: '大類 (Class)',
            code: classCode,
            section,
            patents: new Set(),
            subclasses: new Map()
          });
        }
        const clsNode = secNode.classes.get(classCode);
        clsNode.patents.add(pNo);

        // Level 3: 次類
        if (!clsNode.subclasses.has(subclass)) {
          clsNode.subclasses.set(subclass, {
            name: subclass,
            level: 3,
            levelName: '次類 (Subclass)',
            code: subclass,
            section,
            patents: new Set(),
            mainGroups: new Map()
          });
        }
        const subclsNode = clsNode.subclasses.get(subclass);
        subclsNode.patents.add(pNo);

        // Level 4: 主目
        const mgKey = mainGroupFull || `${subclass} 0/00`;
        if (!subclsNode.mainGroups.has(mgKey)) {
          subclsNode.mainGroups.set(mgKey, {
            name: mgKey,
            level: 4,
            levelName: '主目 (Main Group)',
            code: mgKey,
            section,
            patents: new Set(),
            subgroups: new Map()
          });
        }
        const mgNode = subclsNode.mainGroups.get(mgKey);
        mgNode.patents.add(pNo);

        // Level 5: 次目
        if (!isMainGroup && subgroupFull) {
          if (!mgNode.subgroups.has(subgroupFull)) {
            mgNode.subgroups.set(subgroupFull, {
              name: subgroupFull,
              level: 5,
              levelName: '次目 (Subgroup)',
              code: subgroupFull,
              section,
              patents: new Set()
            });
          }
          const sgNode = mgNode.subgroups.get(subgroupFull);
          sgNode.patents.add(pNo);
        }
      });
    });

    // 依據各第 4 階 (主目 Main Group) 涵蓋的專利件數計算 Top 5
    const mainGroupList = [];
    sectionMap.forEach(sec => {
      sec.classes.forEach(cls => {
        cls.subclasses.forEach(subcls => {
          subcls.mainGroups.forEach(mg => {
            const mgCount = mg.patents.size;
            mainGroupList.push({
              code: mg.code,
              name: mg.name,
              count: mgCount,
              percent: ((mgCount / (totalPieces || 1)) * 100).toFixed(1)
            });
          });
        });
      });
    });

    const top5MainGroups = mainGroupList
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((item, idx) => ({
        ...item,
        rank: idx + 1
      }));

    // 轉換成 D3 hierarchy 格式
    const children = [];
    sectionMap.forEach(sec => {
      const clsChildren = [];
      sec.classes.forEach(cls => {
        const subclsChildren = [];
        cls.subclasses.forEach(subcls => {
          const mgChildren = [];
          subcls.mainGroups.forEach(mg => {
            const sgChildren = [];
            mg.subgroups.forEach(sg => {
              const sgCount = sg.patents.size;
              sgChildren.push({
                name: sg.name,
                level: 5,
                levelName: sg.levelName,
                code: sg.code,
                section: sg.section,
                count: sgCount,
                percent: ((sgCount / (totalPieces || 1)) * 100).toFixed(1),
                value: sgCount
              });
            });

            const mgCount = mg.patents.size;
            mgChildren.push({
              name: mg.name,
              level: 4,
              levelName: mg.levelName,
              code: mg.code,
              section: mg.section,
              count: mgCount,
              percent: ((mgCount / (totalPieces || 1)) * 100).toFixed(1),
              children: sgChildren.length > 0 ? sgChildren : undefined,
              value: sgChildren.length === 0 ? mgCount : undefined
            });
          });

          const subclsCount = subcls.patents.size;
          subclsChildren.push({
            name: subcls.name,
            level: 3,
            levelName: subcls.levelName,
            code: subcls.code,
            section: subcls.section,
            count: subclsCount,
            percent: ((subclsCount / (totalPieces || 1)) * 100).toFixed(1),
            children: mgChildren.length > 0 ? mgChildren : undefined,
            value: mgChildren.length === 0 ? subclsCount : undefined
          });
        });

        const clsCount = cls.patents.size;
        clsChildren.push({
          name: cls.name,
          level: 2,
          levelName: cls.levelName,
          code: cls.code,
          section: cls.section,
          count: clsCount,
          percent: ((clsCount / (totalPieces || 1)) * 100).toFixed(1),
          children: subclsChildren.length > 0 ? subclsChildren : undefined,
          value: subclsChildren.length === 0 ? clsCount : undefined
        });
      });

      const secCount = sec.patents.size;
      children.push({
        name: sec.name,
        level: 1,
        levelName: sec.levelName,
        code: sec.code,
        section: sec.name,
        count: secCount,
        percent: ((secCount / (totalPieces || 1)) * 100).toFixed(1),
        children: clsChildren.length > 0 ? clsChildren : undefined,
        value: clsChildren.length === 0 ? secCount : undefined
      });
    });

    const root = {
      name: 'IPC 分類總圖',
      level: 0,
      levelName: '根目錄',
      code: 'ROOT',
      count: totalPieces,
      percent: '100.0',
      children: children
    };

    return {
      hierarchyRoot: root,
      uniqueIpcCodes: Array.from(codeCollector),
      top5MainGroups
    };
  }, [rawPatents, totalPieces]);

  // 3. 向後端查詢 IPC 中文定義 (雙保險機制：支援 API 查詢與本機 public/data/ipc_dict.json 靜態備份)
  useEffect(() => {
    let isMounted = true;

    const loadDefinitions = async () => {
      let loaded = false;

      // 優先呼叫後端 API
      if (uniqueIpcCodes && uniqueIpcCodes.length > 0) {
        try {
          const resp = await fetch('/api/mindmap/ipc_lookup', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(authState?.token ? { Authorization: `Bearer ${authState.token}` } : {})
            },
            body: JSON.stringify({ ipc_codes: uniqueIpcCodes })
          });
          if (resp.ok) {
            const res = await resp.json();
            if (isMounted && res.definitions && Object.keys(res.definitions).length > 0) {
              setDefinitions(res.definitions || {});
              setFullPaths(res.full_paths || {});
              loaded = true;
            }
          }
        } catch (err) {
          console.warn('API /api/mindmap/ipc_lookup error, will try static fallback:', err);
        }
      }

      // 若 API 未成功或離線，自動備援讀取靜態字典 public/data/ipc_dict.json
      if (!loaded) {
        try {
          const staticResp = await fetch('/data/ipc_dict.json');
          if (staticResp.ok) {
            const rawDict = await staticResp.json();
            if (isMounted) {
              const mappedDefs = {};
              Object.entries(rawDict).forEach(([k, desc]) => {
                mappedDefs[k] = desc;
                if (k.includes('#')) {
                  const [c, s] = k.split('#');
                  if (s) {
                    mappedDefs[`${c} ${s}`] = desc;
                    mappedDefs[`${c}${s}`] = desc;
                    mappedDefs[`${c} ${s.trim()}`] = desc;
                  } else {
                    mappedDefs[c] = desc;
                  }
                }
              });
              setDefinitions(prev => ({ ...mappedDefs, ...prev }));
            }
          }
        } catch (staticErr) {
          console.warn('Static ipc_dict.json load fallback failed:', staticErr);
        }
      }
    };

    loadDefinitions();
    return () => {
      isMounted = false;
    };
  }, [uniqueIpcCodes, authState]);

  // 解決空格與各式鍵名不匹配的智慧解析函式 (需求 2 核心保險)
  const getResolvedDesc = useCallback(
    (name, code) => {
      if (!name && !code) return '';
      const n = String(name || '').trim();
      const c = String(code || '').trim();

      // 1. 直查
      if (definitions[n]) return definitions[n];
      if (definitions[c]) return definitions[c];

      // 2. 空格容錯查驗：例如 'A47C 1/02' -> 查 'A47C#1/02'、'A47C# 1/02'、'A47C1/02'
      const parts = n.split(/\s+/);
      if (parts.length >= 2) {
        const subcls = parts[0];
        const sub = parts.slice(1).join(' ').trim();
        const kHash = `${subcls}#${sub}`;
        if (definitions[kHash]) return definitions[kHash];
        const kHashSpace = `${subcls}# ${sub}`;
        if (definitions[kHashSpace]) return definitions[kHashSpace];
        const kNoSpace = `${subcls}${sub}`;
        if (definitions[kNoSpace]) return definitions[kNoSpace];
      }

      // 3. 部別內建備用
      if (SECTION_NAMES[c]) return SECTION_NAMES[c];
      if (SECTION_NAMES[n]) return SECTION_NAMES[n];

      return '';
    },
    [definitions]
  );

  // 4. 註冊 PNG 下載回呼
  useEffect(() => {
    if (!onCaptureReady) return;
    const handleCapture = async () => {
      if (!containerRef.current) return;
      try {
        const canvas = await html2canvas(containerRef.current, {
          backgroundColor: isDark ? '#0f172a' : '#ffffff',
          scale: 2,
          useCORS: true
        });
        const url = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        a.href = url;
        a.download = `IPC_Circle_Packing_${new Date().toISOString().slice(0, 10)}.png`;
        a.click();
      } catch (err) {
        console.error('Failed to export IPC PNG:', err);
      }
    };
    onCaptureReady(() => handleCapture);
  }, [onCaptureReady, isDark]);

  // 5. 渲染 D3 Zoomable Circle Packing
  useEffect(() => {
    if (!hierarchyRoot || !svgRef.current) return;

    const width = 960;
    const height = 500;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    svg
      .attr('viewBox', `-${width / 2} -${height / 2} ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%')
      .style('display', 'block')
      .style('cursor', 'default');

    // 建立 D3 Pack Layout
    const pack = d3
      .pack()
      .size([width - 10, height - 10])
      .padding(d => (d.depth === 1 ? 8 : 4));

    const root = d3
      .hierarchy(hierarchyRoot)
      .sum(d => d.value || (d.children ? 0 : 1))
      .sort((a, b) => b.value - a.value);

    const nodes = pack(root).descendants();

    // 建立 Top 5 Main Group 查詢 Map
    const top5Map = new Map();
    top5MainGroups.forEach(item => {
      top5Map.set(item.code, item);
      top5Map.set(item.name, item);
    });

    let focus = root;
    let view;

    // 定義外發光濾鏡與 Top 5 金色發光濾鏡
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'circle-glow').attr('x', '-20%').attr('y', '-20%').attr('width', '140%').attr('height', '140%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    filter.append('feComposite').attr('in', 'SourceGraphic').attr('in2', 'blur').attr('operator', 'over');

    const top5Glow = defs.append('filter').attr('id', 'top5-glow').attr('x', '-30%').attr('y', '-30%').attr('width', '160%').attr('height', '160%');
    top5Glow.append('feDropShadow').attr('dx', '0').attr('dy', '0').attr('stdDeviation', '5').attr('flood-color', '#f59e0b').attr('flood-opacity', '0.9');

    // 外層縮放容器 (支援滑鼠滾輪放大/縮小與拖曳平移)
    const zoomContainer = svg.append('g').attr('id', 'zoom-container');

    // 背景全覆蓋矩形 (用於接聽空白處點擊返回與拖曳平移)
    zoomContainer
      .append('rect')
      .attr('x', -width * 4)
      .attr('y', -height * 4)
      .attr('width', width * 8)
      .attr('height', height * 8)
      .attr('fill', 'transparent')
      .style('cursor', 'grab')
      .on('click', () => {
        zoom(root);
      });

    const g = zoomContainer.append('g').attr('id', 'circle-content');

    // 色彩輔助
    const getColorConfig = d => {
      const secKey = d.data.section || 'default';
      const palette = (SECTION_PALETTES[theme] || SECTION_PALETTES.light)[secKey] || (SECTION_PALETTES[theme] || SECTION_PALETTES.light).default;
      return palette;
    };

    // 畫圓
    const node = g
      .append('g')
      .selectAll('circle')
      .data(nodes.slice(1)) // 排除最頂層 root 虛擬圓
      .join('circle')
      .attr('class', d => `node-circle level-${d.data.level}`)
      .attr('fill', d => {
        const pal = getColorConfig(d);
        if (d.data.level === 1) return isDark ? `${pal.fill}33` : `${pal.fill}26`;
        if (d.data.level === 2) return isDark ? `${pal.fill}55` : `${pal.fill}44`;
        if (d.data.level === 3) return isDark ? `${pal.fill}77` : `${pal.fill}66`;
        if (d.data.level === 4) return isDark ? `${pal.fill}99` : `${pal.fill}88`;
        return pal.fill;
      })
      .attr('stroke', d => {
        // 僅第 4 階 (主目 Main Group) 佔比前 5 大圓圈外框以醒目金黃色高亮取代
        if (d.data.level === 4 && top5Map.has(d.data.name)) {
          return '#f59e0b';
        }
        const pal = getColorConfig(d);
        return pal.stroke;
      })
      .attr('stroke-width', d => {
        if (d.data.level === 4 && top5Map.has(d.data.name)) return 3.5;
        return d.data.level === 1 ? 2.5 : d.data.level === 2 ? 1.8 : 1.2;
      })
      .attr('filter', d => (d.data.level === 4 && top5Map.has(d.data.name) ? 'url(#top5-glow)' : null))
      .style('cursor', 'pointer')
      .style('transition', 'fill-opacity 0.2s, stroke-width 0.2s')
      .on('mouseover', function (event, d) {
        d3.select(this)
          .attr('stroke-width', d.data.level === 4 && top5Map.has(d.data.name) ? 4.8 : 3.5)
          .attr('filter', 'url(#circle-glow)')
          .style('fill-opacity', 0.95);

        const fullDesc = fullPaths[d.data.name] || fullPaths[d.data.code] || '';
        const curDesc = getResolvedDesc(d.data.name, d.data.code);
        const top5Info = d.data.level === 4 ? top5Map.get(d.data.name) || null : null;

        setTooltip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          data: {
            ...d.data,
            curDesc,
            fullDesc,
            top5Info
          }
        });
      })
      .on('mousemove', event => {
        setTooltip(prev => ({
          ...prev,
          x: event.clientX,
          y: event.clientY
        }));
      })
      .on('mouseout', function (event, d) {
        d3.select(this)
          .attr('stroke-width', d.data.level === 4 && top5Map.has(d.data.name) ? 3.5 : d.data.level === 1 ? 2.5 : d.data.level === 2 ? 1.8 : 1.2)
          .attr('filter', d.data.level === 4 && top5Map.has(d.data.name) ? 'url(#top5-glow)' : null)
          .style('fill-opacity', 1);

        setTooltip(prev => ({ ...prev, visible: false }));
      })
      .on('click', (event, d) => {
        event.stopPropagation();
        if (focus !== d) {
          zoom(d);
        } else if (d.parent) {
          zoom(d.parent);
        }
      });

    // 標籤文字群組 (Label)
    const labelGroup = g.append('g').style('pointer-events', 'none');

    const label = labelGroup
      .selectAll('g')
      .data(nodes.slice(1))
      .join('g')
      .attr('class', 'node-label')
      .style('font-family', 'Inter, system-ui, sans-serif')
      .style('text-anchor', 'middle')
      .style('display', 'none')
      .style('opacity', 0);

    // 標籤背景底色徽章 (確保文字極致清晰)
    label
      .append('rect')
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('fill', d => (d.data.level === 4 && top5Map.has(d.data.name) ? (isDark ? 'rgba(245, 158, 11, 0.4)' : 'rgba(254, 243, 199, 0.5)') : isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.9)'))
      .attr('stroke', d => (d.data.level === 4 && top5Map.has(d.data.name) ? 'transparent' : isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)'))
      .attr('stroke-width', d => (d.data.level === 4 && top5Map.has(d.data.name) ? 1.5 : 0.8))
      .style('display', 'none');

    // 標籤文字主體
    const labelText = label
      .append('text')
      .style('fill', d => (d.data.level === 4 && top5Map.has(d.data.name) ? (isDark ? '#0f172a' : '#78350f') : isDark ? '#ffffff' : '#0f172a'))
      .style('font-weight', '700');

    // 第一行：IPC 名稱 (若為第 4 階 Top 5 主目則標明排名)
    labelText
      .append('tspan')
      .attr('class', 'tspan-title')
      .attr('x', 0)
      .attr('y', '-0.35em')
      .style('font-size', d => (d.data.level === 4 && top5Map.has(d.data.name) ? '12.5px' : d.data.level <= 2 ? '13px' : '10.5px'))
      .text(d => {
        if (d.data.level === 4 && top5Map.has(d.data.name)) {
          const rank = top5Map.get(d.data.name).rank;
          return `★${rank}. ${d.data.name}`;
        }
        if (d.data.level === 1) {
          const secName = SECTION_NAMES[d.data.name] ? ` (${SECTION_NAMES[d.data.name].substring(0, 4)})` : '';
          return `${d.data.name}部${secName}`;
        }
        return d.data.name;
      });

    // 第二行：件數與百分比 (如: 42件, 12.8%)
    labelText
      .append('tspan')
      .attr('class', 'tspan-meta')
      .attr('x', 0)
      .attr('y', '1.15em')
      .style('font-size', d => (d.data.level === 4 && top5Map.has(d.data.name) ? '11px' : '9.5px'))
      .style('opacity', 0.92)
      .text(d => `${d.data.count}件 ${d.data.percent}%`);

    // 縮放與座標映射函式 (以面板高度 height 為基準，確保在高度上恰佔指定比例)
    function zoomTo(v) {
      const k = height / v[2];
      view = v;

      label.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('transform', d => `translate(${(d.x - v[0]) * k},${(d.y - v[1]) * k})`);
      node.attr('r', d => d.r * k);
    }

    // 核心層級切換邏輯 (嚴格限制：根目錄僅標示第 4 階 Top 5 主目)
    function zoom(d) {
      focus = d;
      setCurrentFocus(d === root ? null : d);

      const isRoot = d === root;
      // 根節點整體佔 80% 面板；展開下階時，該分支節點整體佔 75% 面板
      const targetDiameter = isRoot ? (d.r * 2) / 1.3 : (d.r * 2) / 0.9;
      const targetView = [d.x, d.y, targetDiameter];

      // 取得焦點節點之所有子孫節點集合
      const focusDescendants = new Set(d.descendants());

      const transition = g
        .transition()
        .duration(750)
        .tween('zoom', () => {
          const i = d3.interpolateZoom(view, targetView);
          return t => zoomTo(i(t));
        });

      // 僅顯示當前焦點分支圖形，隱藏其他平行與無關圖案
      node
        .transition(transition)
        .style('opacity', child => {
          if (isRoot) return 1;
          return focusDescendants.has(child) ? 1 : 0;
        })
        .style('display', child => {
          if (isRoot) return 'inline';
          return focusDescendants.has(child) ? 'inline' : 'none';
        })
        .style('pointer-events', child => {
          if (isRoot) return 'all';
          return focusDescendants.has(child) ? 'all' : 'none';
        });

      // 根目錄下：Label 僅標示第 4 階 (Main Group 主目) 佔比前 5 大之標籤，完全排除第 5 階次目與第 1~3 階
      label
        .transition(transition)
        .style('opacity', child => {
          if (isRoot) {
            return (child.data.level === 4 && top5Map.has(child.data.name)) ? 1 : 0;
          }
          return child === d || child.parent === d ? 1 : 0;
        })
        .on('start', function (child) {
          if (isRoot) {
            if (child.data.level === 4 && top5Map.has(child.data.name)) {
              this.style.display = 'inline';
              const bbox = d3.select(this).select('text').node()?.getBBox();
              if (bbox) {
                d3.select(this)
                  .select('rect')
                  .style('display', 'inline')
                  .attr('x', bbox.x - 6)
                  .attr('y', bbox.y - 2)
                  .attr('width', bbox.width + 12)
                  .attr('height', bbox.height + 4);
              }
            } else {
              this.style.display = 'none';
            }
          } else if (child === d || child.parent === d) {
            this.style.display = 'inline';
            d3.select(this).select('rect').style('display', 'none');
          } else {
            this.style.display = 'none';
          }
        })
        .on('end', function (child) {
          if (isRoot) {
            if (!(child.data.level === 4 && top5Map.has(child.data.name))) {
              this.style.display = 'none';
            }
          } else {
            if (child !== d && child.parent !== d) {
              this.style.display = 'none';
            }
          }
        });
    }

    // 支援滑鼠滾輪局部縮放與拖曳平移
    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.5, 6])
      .filter(event => {
        if (event.type === 'wheel') return true;
        if (event.type === 'mousedown') return event.target.tagName === 'rect' || event.target.tagName === 'svg';
        return false;
      })
      .on('zoom', event => {
        zoomContainer.attr('transform', event.transform);
      });

    svg.call(zoomBehavior);

    // 初始化視角：根節點縮為 80% 大小
    const initialDiameter = (root.r * 2) / 0.8;
    zoomTo([root.x, root.y, initialDiameter]);

    // 觸發初始標籤與節點能見度
    zoom(root);

    // 暴露還原與跳轉介面
    svgRef.current.__resetZoom = () => {
      svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
      zoom(root);
    };
    svgRef.current.__zoomTo = targetNode => {
      svg.transition().duration(500).call(zoomBehavior.transform, d3.zoomIdentity);
      zoom(targetNode);
    };
  }, [hierarchyRoot, theme, isDark, definitions, fullPaths, top5MainGroups, getResolvedDesc]);

  // 麵包屑導航路徑清單
  const breadcrumbList = useMemo(() => {
    if (!currentFocus) return [];
    const list = [];
    let curr = currentFocus;
    while (curr && curr.data.level > 0) {
      list.unshift(curr);
      curr = curr.parent;
    }
    return list;
  }, [currentFocus]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        minHeight: '820px',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        background: isDark ? '#090d16' : '#f8fafc',
        borderRadius: '0.75rem',
        overflow: 'hidden',
        color: isDark ? '#f1f5f9' : '#0f172a',
        transition: 'background 0.3s'
      }}
    >
      {/* 頂部 Meta 資訊列 */}
      <div
        style={{
          padding: '0.65rem 1.25rem',
          borderBottom: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#e2e8f0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          background: isDark ? 'rgba(15, 23, 42, 0.85)' : '#ffffff',
          backdropFilter: 'blur(8px)',
          zIndex: 10
        }}
      >
        {/* 左側：統計母體資訊 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#38bdf8' : '#0369a1', fontSize: '0.88rem', fontWeight: 600 }}>
            <FileText size={16} />
            <span>統計母體：{totalCases} 專利家族案 (INPADOC Family) / {totalPieces} 專利件數 (公開公告合併後)</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: isDark ? '#a78bfa' : '#6366f1', fontSize: '0.88rem', fontWeight: 600 }}>
            <Layers size={16} />
            <span>IPC 互動 5 階層圓形樹狀圖 (Circle Packing)</span>
          </div>
        </div>

        {/* 右側：返回頂層按鈕 + 日間/夜間模式膠囊切換鈕 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {currentFocus && (
            <button
              onClick={() => svgRef.current?.__resetZoom && svgRef.current.__resetZoom()}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.35rem 0.75rem',
                borderRadius: '0.4rem',
                border: isDark ? '1px solid rgba(255,255,255,0.2)' : '1px solid #cbd5e1',
                background: isDark ? 'rgba(30, 41, 59, 0.8)' : '#ffffff',
                color: isDark ? '#38bdf8' : '#0284c7',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              <RotateCcw size={13} />
              返回頂層
            </button>
          )}

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
                color: theme === 'dark' ? '#fcef7a' : '#ffffff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0
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
                color: theme === 'light' ? '#fcef7a' : '#ffffff',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                padding: 0
              }}
            >
              <Sun size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* 互動操作說明與麵包屑導航 */}
      <div
        style={{
          padding: '0.5rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
          fontSize: '0.82rem',
          color: isDark ? '#94a3b8' : '#64748b',
          borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : '#f1f5f9'}`
        }}
      >
        {/* 麵包屑路徑 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexWrap: 'wrap' }}>
          <span
            onClick={() => svgRef.current?.__resetZoom && svgRef.current.__resetZoom()}
            style={{ cursor: 'pointer', color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 600 }}
          >
            IPC 八大部別 (總覽)
          </span>
          {breadcrumbList.map((nodeItem, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight size={13} style={{ opacity: 0.6 }} />
              <span
                onClick={() => svgRef.current?.__zoomTo && svgRef.current.__zoomTo(nodeItem)}
                style={{
                  cursor: 'pointer',
                  color: idx === breadcrumbList.length - 1 ? (isDark ? '#f1f5f9' : '#0f172a') : (isDark ? '#38bdf8' : '#0284c7'),
                  fontWeight: idx === breadcrumbList.length - 1 ? 700 : 500
                }}
              >
                {nodeItem.data.name} {getResolvedDesc(nodeItem.data.name, nodeItem.data.code) ? `(${getResolvedDesc(nodeItem.data.name, nodeItem.data.code).substring(0, 8)}...)` : ''}
              </span>
            </React.Fragment>
          ))}
        </div>

        {/* 操作提示小語 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', opacity: 0.9 }}>
          <Info size={13} />
          <span>滾輪縮放畫布；點擊展開下階(佔75%)；金黃邊框為 Top 5 主目 (第4階)</span>
        </div>
      </div>

      {/* SVG 圖表主體 */}
      <div style={{ flex: 1, position: 'relative', width: '100%', minHeight: '720px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg ref={svgRef} />

        {/* 懸浮視窗 (Tooltip) - 使用 Portal 貼齊游標 */}
        {typeof document !== 'undefined' &&
          tooltip.visible &&
          tooltip.data &&
          createPortal(
            <div
              style={{
                position: 'fixed',
                left: `${Math.min(tooltip.x + 14, window.innerWidth - 390)}px`,
                top: `${Math.min(tooltip.y + 14, window.innerHeight - 280)}px`,
                pointerEvents: 'none',
                zIndex: 99999,
                background: isDark ? 'rgba(15, 23, 42, 0.96)' : 'rgba(255, 255, 255, 0.98)',
                color: isDark ? '#f8fafc' : '#0f172a',
                border: `1.5px solid ${isDark ? 'rgba(56, 189, 248, 0.5)' : 'rgba(2, 132, 199, 0.35)'}`,
                borderRadius: '0.75rem',
                padding: '0.85rem 1.15rem',
                maxWidth: '380px',
                boxShadow: isDark ? '0 12px 30px rgba(0,0,0,0.7)' : '0 12px 30px rgba(0,0,0,0.15)',
                backdropFilter: 'blur(12px)',
                fontSize: '0.85rem',
                lineHeight: '1.45'
              }}
            >
              {/* 頂部階層徽章與件數佔比 */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.4rem', gap: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.55rem',
                    borderRadius: '999px',
                    background: isDark ? 'rgba(56, 189, 248, 0.2)' : 'rgba(2, 132, 199, 0.12)',
                    color: isDark ? '#38bdf8' : '#0284c7'
                  }}
                >
                  第 {tooltip.data.level} 階：{tooltip.data.levelName}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {tooltip.data.top5Info && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.15rem',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        color: '#f59e0b',
                        background: 'rgba(245, 158, 11, 0.15)',
                        padding: '0.1rem 0.4rem',
                        borderRadius: '0.25rem'
                      }}
                    >
                      <Award size={11} />
                      Top #{tooltip.data.top5Info.rank} 主目
                    </span>
                  )}
                  <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#f59e0b' }}>
                    {tooltip.data.count} 件 ({tooltip.data.percent}%)
                  </span>
                </div>
              </div>

              {/* 核心主角：分類代碼與本階分類定義文字敘述 */}
              <div style={{ marginBottom: '0.4rem' }}>
                <div style={{ fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b', fontWeight: 600 }}>
                  分類代碼：<span style={{ color: isDark ? '#38bdf8' : '#0284c7', fontWeight: 800 }}>{tooltip.data.name}</span>
                </div>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: '1rem',
                    marginTop: '0.2rem',
                    color: isDark ? '#f1f5f9' : '#0f172a',
                    lineHeight: '1.35'
                  }}
                >
                  {tooltip.data.curDesc || '(查無中文定義)'}
                </div>
              </div>

              {/* 上下階層完整定義脈絡串接 */}
              {tooltip.data.fullDesc && (
                <div
                  style={{
                    marginTop: '0.45rem',
                    paddingTop: '0.45rem',
                    borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0'}`,
                    fontSize: '0.76rem',
                    color: isDark ? '#94a3b8' : '#64748b'
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: '0.25rem', color: isDark ? '#38bdf8' : '#0369a1' }}>
                    層級完整定義脈絡：
                  </div>
                  <div style={{ wordBreak: 'break-word', lineHeight: '1.4', opacity: 0.95 }}>
                    {tooltip.data.fullDesc}
                  </div>
                </div>
              )}
            </div>,
            document.body
          )}
      </div>
    </div>
  );
};

export default IpcCirclePackingChart;
