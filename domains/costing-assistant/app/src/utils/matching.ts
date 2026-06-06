import type { NormalizedDictEntry, EnrichedQuantityRow, QuantityRow } from '../types';
import { generateMatchKey, generateId } from './normalize';

/**
 * 构建字典索引
 * @param dictEntries 标准化后的字典条目数组
 * @returns 以 normalizedKey 为键的 Map
 */
export function buildDictionaryIndex(
  dictEntries: NormalizedDictEntry[]
): Map<string, NormalizedDictEntry[]> {
  const index = new Map<string, NormalizedDictEntry[]>();

  for (const entry of dictEntries) {
    const existing = index.get(entry.normalizedKey);
    if (existing) {
      existing.push(entry);
    } else {
      index.set(entry.normalizedKey, [entry]);
    }
  }

  return index;
}

/**
 * 匹配竣工量行与字典
 * @param quantityRows 竣工量原始数据
 * @param dictIndex 字典索引
 * @returns 增强后的竣工量行数组
 */
export function matchQuantityWithDictionary(
  quantityRows: QuantityRow[],
  dictIndex: Map<string, NormalizedDictEntry[]>
): EnrichedQuantityRow[] {
  return quantityRows.map((row, index) => {
    const rawKey = `${row.物资名称}||${row.规格型号}`;
    const normalizedKey = generateMatchKey(row.物资名称, row.规格型号);

    const matches = dictIndex.get(normalizedKey);

    const enrichedRow: EnrichedQuantityRow = {
      id: generateId(),
      rawKey,
      normalizedKey,
      materialName: row.物资名称,
      specModel: row.规格型号,
      quantity: row.工程量,
      unit: row.单位,
      remarks: row.备注,
      sourceRowIndex: index + 1,
      matchStatus: 'unmatched',
    };

    if (matches && matches.length === 1) {
      // 精确匹配到唯一项
      const match = matches[0];
      enrichedRow.matchStatus = 'matched';
      enrichedRow.matchedDictId = match.id;
      enrichedRow.matchedDictEntry = match;
      enrichedRow.unitPrice = match.unitPrice;
      enrichedRow.safetyFee = match.safetyFee;
    } else if (matches && matches.length > 1) {
      // 匹配到多项，需要用户选择
      enrichedRow.matchStatus = 'ambiguous';
      enrichedRow.matchCandidates = matches;
    }
    // 未匹配情况保持默认的 'unmatched'

    return enrichedRow;
  });
}

/**
 * 更新单行的匹配结果（用于用户手动选择）
 */
export function updateRowMatch(
  row: EnrichedQuantityRow,
  selectedDict: NormalizedDictEntry
): EnrichedQuantityRow {
  return {
    ...row,
    matchStatus: 'matched',
    matchedDictId: selectedDict.id,
    matchedDictEntry: selectedDict,
    unitPrice: selectedDict.unitPrice,
    safetyFee: selectedDict.safetyFee,
    matchCandidates: undefined,
  };
}
