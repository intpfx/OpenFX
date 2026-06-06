import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  NormalizedDictEntry,
  EnrichedQuantityRow,
  GlobalParams,
  CalculationSummary,
  DictionaryRow,
  QuantityRow,
} from '../types';
import { DEFAULT_GLOBAL_PARAMS } from '../types';
import { generateMatchKey, generateId } from '../utils/normalize';
import { buildDictionaryIndex, matchQuantityWithDictionary } from '../utils/matching';
import { calculateProjectTotal, updateRowsCost } from '../utils/calculation';

/**
 * 重复项信息
 */
export interface DuplicateEntry {
  newEntry: DictionaryRow;
  existingEntry: NormalizedDictEntry;
}

/**
 * 检查重复项结果
 */
export interface DuplicateCheckResult {
  uniqueEntries: DictionaryRow[];
  duplicates: DuplicateEntry[];
}

/**
 * 检查字典数据中的重复项
 */
export function checkDuplicates(
  newEntries: DictionaryRow[],
  existingData: NormalizedDictEntry[]
): DuplicateCheckResult {
  const existingKeys = new Map<string, NormalizedDictEntry>();
  existingData.forEach((entry) => {
    existingKeys.set(entry.normalizedKey, entry);
  });

  const uniqueEntries: DictionaryRow[] = [];
  const duplicates: DuplicateEntry[] = [];
  const seenNewKeys = new Set<string>();

  for (const entry of newEntries) {
    const key = generateMatchKey(entry.材料简写, entry.材料规格);

    // 检查是否与已有数据重复
    const existingEntry = existingKeys.get(key);
    if (existingEntry) {
      duplicates.push({ newEntry: entry, existingEntry });
    } else if (seenNewKeys.has(key)) {
      // 新数据内部重复，跳过后续重复项
      continue;
    } else {
      uniqueEntries.push(entry);
      seenNewKeys.add(key);
    }
  }

  return { uniqueEntries, duplicates };
}

/**
 * 工程信息
 */
export interface ProjectInfo {
  projectName?: string;
  projectCode?: string;
}

interface AppStore {
  // === 数据状态 ===
  dictionaryData: NormalizedDictEntry[];
  quantityData: EnrichedQuantityRow[];
  globalParams: GlobalParams;
  calculationSummary: CalculationSummary | null;
  projectInfo: ProjectInfo | null;

  // === UI 状态 ===
  showUnmatchedOnly: boolean;
  isCalculating: boolean;
  dictionaryFileName: string;
  quantityFileName: string;

  // === 操作方法 ===
  // 字典数据
  setDictionaryData: (rows: DictionaryRow[], fileName: string) => void;
  addDictionaryEntry: (entry: DictionaryRow) => void;
  addDictionaryEntries: (entries: DictionaryRow[]) => void;
  updateDictionaryEntry: (id: string, entry: Partial<DictionaryRow>) => void;
  deleteDictionaryEntry: (id: string) => void;
  replaceDictionaryEntry: (existingId: string, newEntry: DictionaryRow) => void;
  clearDictionaryData: () => void;
  findDuplicateEntry: (entry: DictionaryRow) => NormalizedDictEntry | undefined;

  // 竣工量数据
  setQuantityData: (rows: QuantityRow[], fileName: string, projectInfo?: ProjectInfo) => void;
  clearQuantityData: () => void;
  updateQuantityRow: (id: string, updates: Partial<EnrichedQuantityRow>) => void;

  // 全局参数
  setGlobalParams: (params: Partial<GlobalParams>) => void;
  resetGlobalParams: () => void;

  // 计算
  recalculate: () => void;
  rematchQuantityData: () => void;

  // UI
  setShowUnmatchedOnly: (show: boolean) => void;

  // 重置
  resetAll: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // === 初始状态 ===
      dictionaryData: [],
      quantityData: [],
      globalParams: DEFAULT_GLOBAL_PARAMS,
      calculationSummary: null,
      projectInfo: null,
      showUnmatchedOnly: false,
      isCalculating: false,
      dictionaryFileName: '',
      quantityFileName: '',

      // === 字典数据操作 ===
      setDictionaryData: (rows, fileName) => {
        const normalizedEntries: NormalizedDictEntry[] = rows.map((row, index) => ({
          id: generateId(),
          rawKey: `${row.材料简写}||${row.材料规格}`,
          normalizedKey: generateMatchKey(row.材料简写, row.材料规格),
          materialAbbr: row.材料简写,
          materialSpec: row.材料规格,
          unitPrice: row.单价,
          safetyFee: row.安全文明施工费,
          sourceRowIndex: index + 1,
        }));

        set({ dictionaryData: normalizedEntries, dictionaryFileName: fileName });

        // 如果已有竣工量数据，重新匹配
        const { quantityData } = get();
        if (quantityData.length > 0) {
          const dictIndex = buildDictionaryIndex(normalizedEntries);
          const rawQuantityRows: QuantityRow[] = quantityData.map((row) => ({
            物资名称: row.materialName,
            规格型号: row.specModel,
            工程量: row.quantity,
            单位: row.unit,
            备注: row.remarks,
          }));
          const matchedRows = matchQuantityWithDictionary(rawQuantityRows, dictIndex);
          set({ quantityData: matchedRows });
          get().recalculate();
        }
      },

      clearDictionaryData: () => {
        set({ dictionaryData: [], dictionaryFileName: '', calculationSummary: null });
      },

      // 新增单个字典条目
      addDictionaryEntry: (entry) => {
        const { dictionaryData } = get();
        const newEntry: NormalizedDictEntry = {
          id: generateId(),
          rawKey: `${entry.材料简写}||${entry.材料规格}`,
          normalizedKey: generateMatchKey(entry.材料简写, entry.材料规格),
          materialAbbr: entry.材料简写,
          materialSpec: entry.材料规格,
          unitPrice: entry.单价,
          safetyFee: entry.安全文明施工费,
          sourceRowIndex: dictionaryData.length + 1,
        };
        set({ dictionaryData: [...dictionaryData, newEntry] });
        get().rematchQuantityData();
      },

      // 批量新增字典条目
      addDictionaryEntries: (entries) => {
        const { dictionaryData } = get();
        const newEntries: NormalizedDictEntry[] = entries.map((entry, index) => ({
          id: generateId(),
          rawKey: `${entry.材料简写}||${entry.材料规格}`,
          normalizedKey: generateMatchKey(entry.材料简写, entry.材料规格),
          materialAbbr: entry.材料简写,
          materialSpec: entry.材料规格,
          unitPrice: entry.单价,
          safetyFee: entry.安全文明施工费,
          sourceRowIndex: dictionaryData.length + index + 1,
        }));
        set({ dictionaryData: [...dictionaryData, ...newEntries] });
        get().rematchQuantityData();
      },

      // 查找重复条目
      findDuplicateEntry: (entry) => {
        const { dictionaryData } = get();
        const key = generateMatchKey(entry.材料简写, entry.材料规格);
        return dictionaryData.find((item) => item.normalizedKey === key);
      },

      // 替换已有条目（用新数据覆盖旧数据）
      replaceDictionaryEntry: (existingId, newEntry) => {
        const { dictionaryData } = get();
        const updatedData = dictionaryData.map((item) => {
          if (item.id === existingId) {
            return {
              ...item,
              materialAbbr: newEntry.材料简写,
              materialSpec: newEntry.材料规格,
              unitPrice: newEntry.单价,
              safetyFee: newEntry.安全文明施工费,
              rawKey: `${newEntry.材料简写}||${newEntry.材料规格}`,
              normalizedKey: generateMatchKey(newEntry.材料简写, newEntry.材料规格),
            };
          }
          return item;
        });
        set({ dictionaryData: updatedData });
        get().rematchQuantityData();
      },

      // 更新字典条目
      updateDictionaryEntry: (id, entry) => {
        const { dictionaryData } = get();
        const updatedData = dictionaryData.map((item) => {
          if (item.id === id) {
            const materialAbbr = entry.材料简写 ?? item.materialAbbr;
            const materialSpec = entry.材料规格 ?? item.materialSpec;
            return {
              ...item,
              materialAbbr,
              materialSpec,
              unitPrice: entry.单价 ?? item.unitPrice,
              safetyFee: entry.安全文明施工费 ?? item.safetyFee,
              rawKey: `${materialAbbr}||${materialSpec}`,
              normalizedKey: generateMatchKey(materialAbbr, materialSpec),
            };
          }
          return item;
        });
        set({ dictionaryData: updatedData });
        get().rematchQuantityData();
      },

      // 删除字典条目
      deleteDictionaryEntry: (id) => {
        const { dictionaryData } = get();
        set({ dictionaryData: dictionaryData.filter((item) => item.id !== id) });
        get().rematchQuantityData();
      },

      // === 竣工量数据操作 ===
      setQuantityData: (rows, fileName, projectInfo) => {
        const { dictionaryData } = get();
        const dictIndex = buildDictionaryIndex(dictionaryData);
        const matchedRows = matchQuantityWithDictionary(rows, dictIndex);

        set({ quantityData: matchedRows, quantityFileName: fileName, projectInfo: projectInfo || null });
        get().recalculate();
      },

      clearQuantityData: () => {
        set({ quantityData: [], quantityFileName: '', calculationSummary: null, projectInfo: null });
      },

      updateQuantityRow: (id, updates) => {
        const { quantityData } = get();
        const updatedRows = quantityData.map((row) => {
          if (row.id === id) {
            const updatedRow = { ...row, ...updates };
            // 如果更新了 quantity，需要重新计算该行基础施工费
            return updatedRow;
          }
          return row;
        });
        set({ quantityData: updatedRows });
        get().recalculate();
      },

      // === 全局参数操作 ===
      setGlobalParams: (params) => {
        const { globalParams } = get();
        set({ globalParams: { ...globalParams, ...params } });
        get().recalculate();
      },

      resetGlobalParams: () => {
        set({ globalParams: DEFAULT_GLOBAL_PARAMS });
        get().recalculate();
      },

      // === 计算 ===
      recalculate: () => {
        const { quantityData, globalParams } = get();
        if (quantityData.length === 0) {
          set({ calculationSummary: null });
          return;
        }

        set({ isCalculating: true });

        try {
          // 更新每行的基础施工费
          const rowsWithCost = updateRowsCost(quantityData, globalParams.coefficient);
          const summary = calculateProjectTotal(rowsWithCost, globalParams);

          set({
            quantityData: rowsWithCost,
            calculationSummary: summary,
            isCalculating: false,
          });
        } catch (error) {
          console.error('计算错误:', error);
          set({ isCalculating: false });
        }
      },

      // 重新匹配竣工量数据与字典
      rematchQuantityData: () => {
        const { quantityData, dictionaryData } = get();
        if (quantityData.length === 0) return;

        const dictIndex = buildDictionaryIndex(dictionaryData);
        const rawQuantityRows: QuantityRow[] = quantityData.map((row) => ({
          物资名称: row.materialName,
          规格型号: row.specModel,
          工程量: row.quantity,
          单位: row.unit,
          备注: row.remarks,
        }));
        const matchedRows = matchQuantityWithDictionary(rawQuantityRows, dictIndex);
        set({ quantityData: matchedRows });
        get().recalculate();
      },

      // === UI 操作 ===
      setShowUnmatchedOnly: (show) => {
        set({ showUnmatchedOnly: show });
      },

      // === 重置 ===
      resetAll: () => {
        set({
          dictionaryData: [],
          quantityData: [],
          globalParams: DEFAULT_GLOBAL_PARAMS,
          calculationSummary: null,
          showUnmatchedOnly: false,
          isCalculating: false,
          dictionaryFileName: '',
          quantityFileName: '',
        });
      },
    }),
    {
      name: 'costing-assistant-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // 持久化全局参数和字典数据
        globalParams: state.globalParams,
        dictionaryData: state.dictionaryData,
        dictionaryFileName: state.dictionaryFileName,
      }),
    }
  )
);
