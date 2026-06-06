import type { EnrichedQuantityRow } from '../types';

/**
 * 检测是否包含埋地管道关键词
 */
function containsBuriedKeyword(text: string | undefined): boolean {
  if (!text) return false;
  const upperText = text.toUpperCase();
  return upperText.includes('PE');
}

/**
 * 自动判定是否为埋地管道项目
 * 逻辑：若任一行的 物资名称 或 匹配到的 材料简写 包含 "PE"（不区分大小写），
 *       则整单判定为"是埋地管道项目"
 *
 * @param rows 增强后的竣工量行数组
 * @returns true 表示是埋地管道项目
 */
export function detectBuriedPipeline(rows: EnrichedQuantityRow[]): boolean {
  return rows.some((row) => {
    // 检查物资名称
    if (containsBuriedKeyword(row.materialName)) {
      return true;
    }
    // 检查匹配到的材料简写
    if (containsBuriedKeyword(row.matchedDictEntry?.materialAbbr)) {
      return true;
    }
    return false;
  });
}

/**
 * 获取埋地管道判定结果
 * @param rows 增强后的竣工量行数组
 * @param manualSetting 手动设置值，null 表示使用自动判定
 * @returns { isBuried: boolean, detectedBy: 'auto' | 'manual' }
 */
export function getBuriedPipelineStatus(
  rows: EnrichedQuantityRow[],
  manualSetting: boolean | null
): { isBuried: boolean; detectedBy: 'auto' | 'manual' } {
  if (manualSetting !== null) {
    return { isBuried: manualSetting, detectedBy: 'manual' };
  }

  const autoDetected = detectBuriedPipeline(rows);
  return { isBuried: autoDetected, detectedBy: 'auto' };
}
