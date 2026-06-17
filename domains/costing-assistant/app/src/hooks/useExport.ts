import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { EnrichedQuantityRow, CalculationSummary, GlobalParams } from '../types';

/**
 * 导出 Hook
 */
export function useExport() {
  /**
   * 导出计算结果为 Excel
   */
  const exportToExcel = useCallback(
    (
      rows: EnrichedQuantityRow[],
      summary: CalculationSummary | null,
      globalParams: GlobalParams,
      fileName?: string
    ) => {
      // 准备明细数据
      const detailData = rows.map((row, index) => ({
        序号: index + 1,
        物资名称: row.materialName,
        规格型号: row.specModel,
        工程量: row.quantity,
        单位: row.unit || '',
        单价: row.unitPrice ?? '',
        安全文明施工费: row.safetyFee ?? '',
        匹配状态: row.matchStatus === 'matched' ? '已匹配' : row.matchStatus === 'ambiguous' ? '待确认' : '未匹配',
        基础施工费: row.baseCost ?? '',
        备注: row.remarks || '',
      }));

      // 创建明细工作表
      const detailSheet = XLSX.utils.json_to_sheet(detailData);

      // 设置列宽
      detailSheet['!cols'] = [
        { wch: 6 },   // 序号
        { wch: 20 },  // 物资名称
        { wch: 15 },  // 规格型号
        { wch: 10 },  // 工程量
        { wch: 8 },   // 单位
        { wch: 10 },  // 单价
        { wch: 14 },  // 安全文明施工费
        { wch: 10 },  // 匹配状态
        { wch: 12 },  // 基础施工费
        { wch: 20 },  // 备注
      ];

      // 准备汇总数据
      const summaryData = summary
        ? [
          ['工程计价汇总报表'],
          [],
          ['项目', '数值', '说明'],
          ['管线总长度', `${summary.totalPipelineLength} 米`, '所有管线工程量之和'],
          ['是否埋地管道', summary.isBuried ? '是' : '否', `判定方式：${summary.buriedDetectedBy === 'auto' ? '自动判定' : '手动设置'}`],
          ['工程系数', globalParams.coefficient, '用户设置'],
          ['基础施工费合计', `¥${summary.totalBaseCost.toFixed(2)}`, '各项基础施工费之和'],
          ['标准费用', summary.isBuried ? '--' : `¥${summary.standardFee.toFixed(2)}`, summary.isBuried ? '埋地管道不适用' : '非埋地管道计算'],
          ['最终施工费', `¥${summary.finalConstructionFee.toFixed(2)}`, '应用规则后'],
          ['工程总包施工费', `¥${summary.totalPackageFee.toFixed(2)}`, ''],
          [],
          ['专项下浮', globalParams.applySpecialDiscount ? '是' : '否', `下浮比例：${(globalParams.specialDiscountRate * 100).toFixed(0)}%`],
          ['分包结算价', summary.subcontractFee !== null ? `¥${summary.subcontractFee.toFixed(2)}` : '--', globalParams.applySpecialDiscount ? '总包价下浮后' : '未启用'],
          [],
          ['生成时间', new Date().toLocaleString('zh-CN'), ''],
        ]
        : [['暂无计算结果']];

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      summarySheet['!cols'] = [{ wch: 16 }, { wch: 20 }, { wch: 25 }];

      // 合并标题单元格
      summarySheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }];

      // 创建工作簿
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, summarySheet, '汇总');
      XLSX.utils.book_append_sheet(workbook, detailSheet, '明细');

      // 生成文件并下载
      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const exportFileName = fileName || `计价结果_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`;
      saveAs(blob, exportFileName);
    },
    []
  );

  return { exportToExcel };
}
