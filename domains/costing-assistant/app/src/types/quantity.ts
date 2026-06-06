import type { NormalizedDictEntry } from './dictionary';

/**
 * 竣工量文件原始行数据
 */
export interface QuantityRow {
  物资名称: string;
  规格型号: string;
  工程量: number;
  单位?: string;
  备注?: string;
}

/**
 * 匹配状态
 */
export type MatchStatus = 'matched' | 'unmatched' | 'ambiguous';

/**
 * 经过匹配和计算增强后的竣工量行
 */
export interface EnrichedQuantityRow {
  id: string;
  rawKey: string;
  normalizedKey: string;
  materialName: string;       // 物资名称
  specModel: string;          // 规格型号
  quantity: number;           // 工程量（也是管道长度数据来源）
  unit?: string;              // 单位
  remarks?: string;           // 备注
  sourceRowIndex: number;     // 原始行号

  // === 匹配的字典数据 ===
  matchedDictId?: string;
  matchedDictEntry?: NormalizedDictEntry;
  unitPrice?: number;         // 从字典匹配的单价
  safetyFee?: number;         // 从字典匹配的安全文明施工费
  matchStatus: MatchStatus;
  matchCandidates?: NormalizedDictEntry[];  // 歧义匹配候选

  // === 计算结果 ===
  baseCost?: number;          // 该行基础施工费
}
