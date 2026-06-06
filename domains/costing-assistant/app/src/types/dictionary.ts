/**
 * 字典文件原始行数据
 */
export interface DictionaryRow {
  材料简写: string;
  材料规格: string;
  单价: number;
  安全文明施工费: number;
}

/**
 * 标准化后的字典条目
 */
export interface NormalizedDictEntry {
  id: string;
  rawKey: string;
  normalizedKey: string;
  materialAbbr: string;      // 材料简写
  materialSpec: string;      // 材料规格
  unitPrice: number;         // 单价
  safetyFee: number;         // 安全文明施工费
  sourceRowIndex: number;    // 原始行号
}
