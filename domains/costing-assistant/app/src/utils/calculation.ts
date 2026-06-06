import Decimal from 'decimal.js';
import type { EnrichedQuantityRow, GlobalParams, CalculationSummary } from '../types';
import { getBuriedPipelineStatus } from './pipelineDetection';

// 配置 Decimal.js 使用银行家舍入（四舍六入五成双）
Decimal.set({ rounding: Decimal.ROUND_HALF_EVEN });

/**
 * 计算单行的基础施工费
 * 公式: ((单价 - 安全文明施工费) × 工程系数 + 安全文明施工费) × 工程量
 */
export function calculateRowBaseCost(
  row: EnrichedQuantityRow,
  coefficient: number
): number {
  if (row.matchStatus !== 'matched' || row.unitPrice === undefined) {
    return 0;
  }

  const unitPrice = new Decimal(row.unitPrice);
  const safetyFee = new Decimal(row.safetyFee ?? 0);
  const qty = new Decimal(row.quantity);
  const coef = new Decimal(coefficient);

  // ((单价 - 安全文明施工费) × 工程系数 + 安全文明施工费) × 工程量
  const baseCost = unitPrice
    .minus(safetyFee)
    .times(coef)
    .plus(safetyFee)
    .times(qty);

  return baseCost.toDecimalPlaces(2).toNumber();
}

/**
 * 计算非埋地管道的标准费用
 * 规则：
 *   - 管道在10米（含）以下按2000元结算
 *   - 如超长，每增加5米，增加100元（不足5米按5米计算）
 */
export function calculateStandardFee(totalPipelineLength: number): number {
  const length = new Decimal(totalPipelineLength);
  const threshold = new Decimal(10);
  const baseFee = new Decimal(2000);

  if (length.lessThanOrEqualTo(threshold)) {
    return baseFee.toNumber();
  }

  // 超长部分
  const excess = length.minus(threshold);
  // 每5米一个增量段，不足5米按5米计算（向上取整）
  const increments = excess.dividedBy(5).ceil();
  // 每增量段加100元
  const additionalFee = increments.times(100);

  return baseFee.plus(additionalFee).toNumber();
}

/**
 * 计算项目总价
 * @param rows 增强后的竣工量行数组
 * @param globalParams 全局参数
 * @returns 计算结果汇总
 */
export function calculateProjectTotal(
  rows: EnrichedQuantityRow[],
  globalParams: GlobalParams
): CalculationSummary {
  const { coefficient, applyXuzhouDiscount, xuzhouDiscountRate, manualBuriedPipeline } = globalParams;

  // 1. 计算管线总长度（所有行工程量之和）
  const totalPipelineLength = rows.reduce((sum, row) => {
    return new Decimal(sum).plus(row.quantity || 0).toNumber();
  }, 0);

  // 2. 判定是否埋地管道
  const { isBuried, detectedBy } = getBuriedPipelineStatus(rows, manualBuriedPipeline);

  // 3. 计算每行基础施工费并汇总
  const rowsWithCost = rows.map((row) => ({
    ...row,
    baseCost: calculateRowBaseCost(row, coefficient),
  }));

  const totalBaseCost = rowsWithCost.reduce((sum, row) => {
    return new Decimal(sum).plus(row.baseCost || 0).toNumber();
  }, 0);

  // 4. 应用规则计算最终施工费
  let finalConstructionFee: number;
  let standardFee = 0;

  if (!isBuried) {
    // 非埋地管道规则
    standardFee = calculateStandardFee(totalPipelineLength);

    if (totalBaseCost > 3000) {
      // 工程施工费>3000元，按实际工程费计取
      finalConstructionFee = totalBaseCost;
    } else {
      // 取标准费用和基础施工费中的较大值
      finalConstructionFee = Math.max(standardFee, totalBaseCost);
    }
  } else {
    // 埋地管道规则
    if (totalBaseCost <= 3000) {
      // 工程施工费≤3000元，结算金额按3000元包干
      finalConstructionFee = 3000;
    } else {
      // 工程施工费>3000元，按实际工程费计取
      finalConstructionFee = totalBaseCost;
    }
  }

  // 5. 工程总包施工费
  const totalPackageFee = new Decimal(finalConstructionFee).toDecimalPlaces(2).toNumber();

  // 6. 分包结算价（徐州下浮17%）
  let subcontractFee: number | null = null;
  if (applyXuzhouDiscount) {
    subcontractFee = new Decimal(totalPackageFee)
      .times(1 - xuzhouDiscountRate)
      .toDecimalPlaces(2)
      .toNumber();
  }

  return {
    totalPipelineLength: new Decimal(totalPipelineLength).toDecimalPlaces(2).toNumber(),
    isBuried,
    buriedDetectedBy: detectedBy,
    totalBaseCost: new Decimal(totalBaseCost).toDecimalPlaces(2).toNumber(),
    standardFee,
    finalConstructionFee: new Decimal(finalConstructionFee).toDecimalPlaces(2).toNumber(),
    totalPackageFee,
    subcontractFee,
  };
}

/**
 * 更新所有行的基础施工费
 */
export function updateRowsCost(
  rows: EnrichedQuantityRow[],
  coefficient: number
): EnrichedQuantityRow[] {
  return rows.map((row) => ({
    ...row,
    baseCost: calculateRowBaseCost(row, coefficient),
  }));
}
