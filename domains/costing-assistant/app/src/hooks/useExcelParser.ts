import { useCallback } from 'react';
import * as XLSX from 'xlsx';
import type { DictionaryRow, QuantityRow } from '../types';
import { DICTIONARY_REQUIRED_COLUMNS } from '../types';

interface ParseResult<T> {
  success: boolean;
  data: T[];
  headers: string[];
  error?: string;
  projectInfo?: {
    projectName?: string;
    projectCode?: string;
  };
}

/**
 * 解析 Excel 文件（简单模式，第一行为表头）
 */
function parseExcelFile(file: File): Promise<{ data: Record<string, unknown>[]; headers: string[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // 读取第一个工作表
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // 获取表头
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const headers: string[] = [];
        for (let col = range.s.c; col <= range.e.c; col++) {
          const cellAddress = XLSX.utils.encode_cell({ r: range.s.r, c: col });
          const cell = worksheet[cellAddress];
          headers.push(cell ? String(cell.v).trim() : `列${col + 1}`);
        }

        // 转换为 JSON
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
          defval: '',
        });

        resolve({ data: jsonData, headers });
      } catch (error) {
        reject(new Error('文件解析失败，请确保文件格式正确'));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * 竣工量表格的必需列（用于识别表头行）
 */
const QUANTITY_HEADER_KEYWORDS = ['物资名称', '规格型号', '工程量'];

/**
 * 解析竣工量 Excel 文件（智能识别表头行）
 * 支持格式：
 * - 第1行：标题（如"竣工工程量确认书"）
 * - 第2行：工程信息（工程名称、工程编号）
 * - 第3行：数据表头（序号、物资名称、规格型号、单位、工程量、备注）
 * - 第4行起：数据行
 */
function parseQuantityExcelFile(file: File): Promise<{
  data: Record<string, unknown>[];
  headers: string[];
  projectInfo?: { projectName?: string; projectCode?: string };
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // 读取第一个工作表
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

        // 辅助函数：获取某行所有单元格值
        const getRowValues = (rowIndex: number): string[] => {
          const values: string[] = [];
          for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: col });
            const cell = worksheet[cellAddress];
            values.push(cell ? String(cell.v).trim() : '');
          }
          return values;
        };

        // 查找表头行（包含"物资名称"、"规格型号"、"工程量"的行）
        let headerRowIndex = -1;
        for (let row = range.s.r; row <= Math.min(range.s.r + 10, range.e.r); row++) {
          const rowValues = getRowValues(row);
          const hasAllKeywords = QUANTITY_HEADER_KEYWORDS.every((keyword) =>
            rowValues.some((val) => val.includes(keyword))
          );
          if (hasAllKeywords) {
            headerRowIndex = row;
            break;
          }
        }

        if (headerRowIndex === -1) {
          reject(new Error('未找到有效的表头行（需包含：物资名称、规格型号、工程量）'));
          return;
        }

        // 获取表头
        const headers = getRowValues(headerRowIndex);

        // 提取工程信息（表头行之前的行）
        let projectName: string | undefined;
        let projectCode: string | undefined;

        for (let row = range.s.r; row < headerRowIndex; row++) {
          const rowValues = getRowValues(row);

          // 查找工程名称
          const nameIndex = rowValues.findIndex((v) => v.includes('工程名称'));
          if (nameIndex !== -1 && rowValues[nameIndex + 1]) {
            projectName = rowValues[nameIndex + 1];
          }

          // 查找工程编号
          const codeIndex = rowValues.findIndex((v) => v.includes('工程编号'));
          if (codeIndex !== -1 && rowValues[codeIndex + 1]) {
            projectCode = rowValues[codeIndex + 1];
          }
        }

        // 构建列索引映射
        const columnIndexMap: Record<string, number> = {};
        headers.forEach((header, index) => {
          if (header) {
            columnIndexMap[header] = index;
          }
        });

        // 解析数据行（从表头行的下一行开始）
        const jsonData: Record<string, unknown>[] = [];
        for (let row = headerRowIndex + 1; row <= range.e.r; row++) {
          const rowValues = getRowValues(row);

          // 跳过空行和签章信息行（检测是否包含"施工单位"、"监理单位"等关键词）
          const rowText = rowValues.join('');
          if (!rowText || rowText.includes('施工单位') || rowText.includes('监理单位') ||
            rowText.includes('建设单位') || rowText.includes('现场代表') ||
            rowText.includes('项目经理') || rowText.includes('盖章')) {
            continue;
          }

          // 构建行数据对象
          const rowData: Record<string, unknown> = {};
          headers.forEach((header, index) => {
            if (header) {
              rowData[header] = rowValues[index];
            }
          });

          jsonData.push(rowData);
        }

        resolve({
          data: jsonData,
          headers: headers.filter((h) => h),
          projectInfo: { projectName, projectCode },
        });
      } catch (error) {
        reject(new Error('文件解析失败，请确保文件格式正确'));
      }
    };

    reader.onerror = () => {
      reject(new Error('文件读取失败'));
    };

    reader.readAsArrayBuffer(file);
  });
}

/**
 * 验证字典文件必需列
 */
function validateDictionaryHeaders(headers: string[]): string | null {
  const missingColumns = DICTIONARY_REQUIRED_COLUMNS.filter(
    (col) => !headers.includes(col)
  );

  if (missingColumns.length > 0) {
    return `缺少必需列：${missingColumns.join('、')}`;
  }
  return null;
}

/**
 * 转换为数字，处理各种格式
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[,，\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

/**
 * Excel 解析 Hook
 */
export function useExcelParser() {
  /**
   * 解析字典文件
   */
  const parseDictionaryFile = useCallback(async (file: File): Promise<ParseResult<DictionaryRow>> => {
    try {
      const { data, headers } = await parseExcelFile(file);

      // 验证必需列
      const validationError = validateDictionaryHeaders(headers);
      if (validationError) {
        return { success: false, data: [], headers, error: validationError };
      }

      // 转换数据
      const rows: DictionaryRow[] = data.map((row) => ({
        材料简写: String(row['材料简写'] || '').trim(),
        材料规格: String(row['材料规格'] || '').trim(),
        单价: toNumber(row['单价']),
        安全文明施工费: toNumber(row['安全文明施工费']),
      })).filter((row) => row.材料简写 && row.材料规格); // 过滤空行

      return { success: true, data: rows, headers };
    } catch (error) {
      return {
        success: false,
        data: [],
        headers: [],
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }, []);

  /**
   * 解析竣工量文件（智能识别格式）
   */
  const parseQuantityFile = useCallback(async (file: File): Promise<ParseResult<QuantityRow>> => {
    try {
      const { data, headers, projectInfo } = await parseQuantityExcelFile(file);

      // 转换数据
      const rows: QuantityRow[] = data.map((row) => ({
        物资名称: String(row['物资名称'] || '').trim(),
        规格型号: String(row['规格型号'] || '').trim(),
        工程量: toNumber(row['工程量']),
        单位: row['单位'] ? String(row['单位']).trim() : undefined,
        备注: row['备注'] ? String(row['备注']).trim() : undefined,
      })).filter((row) => row.物资名称 && row.规格型号 && row.工程量 > 0); // 过滤空行和无效行

      return { success: true, data: rows, headers, projectInfo };
    } catch (error) {
      return {
        success: false,
        data: [],
        headers: [],
        error: error instanceof Error ? error.message : '未知错误',
      };
    }
  }, []);

  return {
    parseDictionaryFile,
    parseQuantityFile,
  };
}
