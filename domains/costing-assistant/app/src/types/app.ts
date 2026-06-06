import type { NormalizedDictEntry } from './dictionary';
import type { EnrichedQuantityRow } from './quantity';

/**
 * 全局参数
 */
export interface GlobalParams {
  coefficient: number;              // 工程系数，默认 1.0
  applyXuzhouDiscount: boolean;     // 是否应用徐州17%下浮
  xuzhouDiscountRate: number;       // 下浮比例，默认 0.17
  manualBuriedPipeline: boolean | null;  // 手动设置埋地管道，null 表示使用自动判定
}

/**
 * 列映射配置
 */
export interface ColumnMapping {
  [excelHeader: string]: string;
}

/**
 * 计算结果汇总
 */
export interface CalculationSummary {
  totalPipelineLength: number;      // 管线总长度
  isBuried: boolean;                // 是否埋地管道项目
  buriedDetectedBy: 'auto' | 'manual';  // 判定方式
  totalBaseCost: number;            // 基础施工费合计
  standardFee: number;              // 标准费用（非埋地规则）
  finalConstructionFee: number;     // 最终施工费
  totalPackageFee: number;          // 工程总包施工费
  subcontractFee: number | null;    // 分包结算价（徐州下浮后）
}

/**
 * 应用状态
 */
export interface AppState {
  // 文件数据
  dictionaryData: NormalizedDictEntry[];
  quantityData: EnrichedQuantityRow[];

  // 全局参数
  globalParams: GlobalParams;

  // 列映射
  dictionaryMapping: ColumnMapping;
  quantityMapping: ColumnMapping;

  // 计算结果
  calculationSummary: CalculationSummary | null;

  // UI 状态
  showUnmatchedOnly: boolean;
  isCalculating: boolean;
}

/**
 * 默认全局参数
 */
export const DEFAULT_GLOBAL_PARAMS: GlobalParams = {
  coefficient: 1.0,
  applyXuzhouDiscount: false,
  xuzhouDiscountRate: 0.17,
  manualBuriedPipeline: null,
};

/**
 * 字典文件必需的列
 */
export const DICTIONARY_REQUIRED_COLUMNS = ['材料简写', '材料规格', '单价', '安全文明施工费'] as const;

/**
 * 竣工量文件必需的列
 */
export const QUANTITY_REQUIRED_COLUMNS = ['物资名称', '规格型号', '工程量'] as const;
