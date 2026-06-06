/**
 * 字符串标准化工具
 * 用于匹配前的文本预处理
 */

/**
 * 全角字符转半角
 */
function fullWidthToHalfWidth(str: string): string {
  return str.replace(/[\uff01-\uff5e]/g, (ch) => {
    return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
  });
}

/**
 * 中文标点转英文标点
 */
function normalizePunctuation(str: string): string {
  const punctuationMap: Record<string, string> = {
    '（': '(',
    '）': ')',
    '，': ',',
    '。': '.',
    '：': ':',
    '；': ';',
    '／': '/',
    '＊': '*',
    '×': 'x',
    '＋': '+',
    '－': '-',
    '　': ' ',  // 全角空格
  };

  return str.replace(/[（），。：；／＊×＋－　]/g, (ch) => punctuationMap[ch] || ch);
}

/**
 * 标准化字符串用于匹配
 * 1. 去除首尾空白
 * 2. 全角转半角
 * 3. 中文标点转英文
 * 4. 合并连续空白为单个空格
 * 5. 转小写
 */
export function normalizeString(str: string): string {
  if (!str) return '';

  let result = str.trim();
  result = fullWidthToHalfWidth(result);
  result = normalizePunctuation(result);
  result = result.replace(/\s+/g, ' ');
  result = result.toLowerCase();

  return result;
}

/**
 * 生成用于匹配的复合键
 * @param part1 第一部分（如 物资名称 或 材料简写）
 * @param part2 第二部分（如 规格型号 或 材料规格）
 */
export function generateMatchKey(part1: string, part2: string): string {
  const normalizedPart1 = normalizeString(part1);
  const normalizedPart2 = normalizeString(part2);
  return `${normalizedPart1}||${normalizedPart2}`;
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
