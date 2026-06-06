import React, { useState, useCallback } from 'react';
import {
  Modal,
  Upload,
  Button,
  Progress,
  Typography,
  Space,
  Alert,
  Table,
  message,
  Spin,
} from 'antd';
import { CameraOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload';
import Tesseract from 'tesseract.js';
import type { DictionaryRow } from '../../types';

const { Dragger } = Upload;
const { Text, Paragraph } = Typography;

interface OcrImportModalProps {
  open: boolean;
  onClose: () => void;
  onImport: (entries: DictionaryRow[]) => void;
}

interface ParsedRow {
  key: string;
  材料简写: string;
  材料规格: string;
  单价: number;
  安全文明施工费: number;
  valid: boolean;
}

/**
 * 解析 OCR 识别的文本为字典数据
 */
function parseOcrText(text: string): ParsedRow[] {
  const lines = text.split('\n').filter((line) => line.trim());
  const results: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // 尝试用多种分隔符分割：空格、制表符、竖线、逗号
    const parts = line.split(/[\s\t|,，]+/).filter((p) => p.trim());

    if (parts.length >= 4) {
      const 材料简写 = parts[0].trim();
      const 材料规格 = parts[1].trim();
      const 单价Str = parts[2].replace(/[¥￥,，]/g, '').trim();
      const 安全费Str = parts[3].replace(/[¥￥,，]/g, '').trim();

      const 单价 = parseFloat(单价Str);
      const 安全文明施工费 = parseFloat(安全费Str);

      const valid = 材料简写.length > 0 && 
                   材料规格.length > 0 && 
                   !isNaN(单价) && 
                   !isNaN(安全文明施工费);

      results.push({
        key: `${i}`,
        材料简写,
        材料规格,
        单价: isNaN(单价) ? 0 : 单价,
        安全文明施工费: isNaN(安全文明施工费) ? 0 : 安全文明施工费,
        valid,
      });
    } else if (parts.length >= 2) {
      // 尝试只解析材料简写和规格
      results.push({
        key: `${i}`,
        材料简写: parts[0].trim(),
        材料规格: parts[1].trim(),
        单价: 0,
        安全文明施工费: 0,
        valid: false,
      });
    }
  }

  return results;
}

export const OcrImportModal: React.FC<OcrImportModalProps> = ({
  open,
  onClose,
  onImport,
}) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ocrText, setOcrText] = useState('');
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<'upload' | 'preview'>('upload');

  const resetState = useCallback(() => {
    setFileList([]);
    setIsProcessing(false);
    setProgress(0);
    setOcrText('');
    setParsedData([]);
    setStep('upload');
  }, []);

  const handleClose = () => {
    resetState();
    onClose();
  };

  const processImage = async (file: File) => {
    setIsProcessing(true);
    setProgress(0);

    try {
      const result = await Tesseract.recognize(file, 'chi_sim+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text;
      setOcrText(text);

      // 解析文本
      const parsed = parseOcrText(text);
      setParsedData(parsed);
      setStep('preview');

      if (parsed.length === 0) {
        message.warning('未能从图片中识别出有效数据，请检查图片清晰度');
      }
    } catch (error) {
      console.error('OCR 识别失败:', error);
      message.error('图片识别失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpload = (file: File) => {
    processImage(file);
    return false;
  };

  const handleImport = () => {
    const validRows = parsedData.filter((row) => row.valid);
    if (validRows.length === 0) {
      message.warning('没有有效的数据可以导入');
      return;
    }

    const entries: DictionaryRow[] = validRows.map((row) => ({
      材料简写: row.材料简写,
      材料规格: row.材料规格,
      单价: row.单价,
      安全文明施工费: row.安全文明施工费,
    }));

    onImport(entries);
    handleClose();
  };

  const columns = [
    {
      title: '材料简写',
      dataIndex: '材料简写',
      key: '材料简写',
      width: 120,
    },
    {
      title: '材料规格',
      dataIndex: '材料规格',
      key: '材料规格',
      width: 100,
    },
    {
      title: '单价',
      dataIndex: '单价',
      key: '单价',
      width: 80,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '安全文明施工费',
      dataIndex: '安全文明施工费',
      key: '安全文明施工费',
      width: 120,
      render: (v: number) => `¥${v.toFixed(2)}`,
    },
    {
      title: '状态',
      dataIndex: 'valid',
      key: 'valid',
      width: 80,
      render: (valid: boolean) =>
        valid ? (
          <Text type="success">有效</Text>
        ) : (
          <Text type="danger">无效</Text>
        ),
    },
  ];

  const validCount = parsedData.filter((r) => r.valid).length;

  return (
    <Modal
      title={
        <Space>
          <CameraOutlined />
          <span>OCR 截图识别导入</span>
        </Space>
      }
      open={open}
      onCancel={handleClose}
      width={700}
      footer={
        step === 'preview'
          ? [
              <Button key="back" onClick={() => setStep('upload')}>
                重新上传
              </Button>,
              <Button
                key="import"
                type="primary"
                onClick={handleImport}
                disabled={validCount === 0}
              >
                导入 {validCount} 条数据
              </Button>,
            ]
          : null
      }
      destroyOnClose
    >
      {step === 'upload' && (
        <Spin spinning={isProcessing} tip={`识别中... ${progress}%`}>
          <Alert
            message="使用说明"
            description={
              <div>
                <Paragraph style={{ margin: 0 }}>
                  1. 上传包含字典数据的截图（支持 JPG/PNG 格式）
                </Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  2. 系统将自动识别图片中的文字
                </Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  3. 识别格式：每行包含 材料简写 | 材料规格 | 单价 | 安全文明施工费
                </Paragraph>
                <Paragraph style={{ margin: 0 }}>
                  4. 建议使用清晰的表格截图以提高识别准确率
                </Paragraph>
              </div>
            }
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Dragger
            accept="image/*"
            fileList={fileList}
            beforeUpload={handleUpload}
            onChange={({ fileList }) => setFileList(fileList.slice(-1))}
            disabled={isProcessing}
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽图片到此区域</p>
            <p className="ant-upload-hint">支持 JPG、PNG 等常见图片格式</p>
          </Dragger>

          {isProcessing && (
            <div style={{ marginTop: 16 }}>
              <Progress percent={progress} status="active" />
              <Text type="secondary">正在识别图片中的文字，请稍候...</Text>
            </div>
          )}
        </Spin>
      )}

      {step === 'preview' && (
        <>
          <Alert
            message={`识别完成：共 ${parsedData.length} 行，有效 ${validCount} 行`}
            type={validCount > 0 ? 'success' : 'warning'}
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Table
            columns={columns}
            dataSource={parsedData}
            size="small"
            scroll={{ y: 300 }}
            pagination={false}
            rowClassName={(record) => (record.valid ? '' : 'row-invalid')}
          />

          <details style={{ marginTop: 16 }}>
            <summary style={{ cursor: 'pointer', color: '#999' }}>
              查看原始识别文本
            </summary>
            <pre
              style={{
                background: '#f5f5f5',
                padding: 12,
                borderRadius: 4,
                maxHeight: 150,
                overflow: 'auto',
                fontSize: 12,
              }}
            >
              {ocrText || '(无内容)'}
            </pre>
          </details>

          <style>{`
            .row-invalid {
              background-color: #fff2f0 !important;
            }
          `}</style>
        </>
      )}
    </Modal>
  );
};
