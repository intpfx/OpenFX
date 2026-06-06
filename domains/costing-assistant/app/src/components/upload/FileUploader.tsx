import React, { useState } from 'react';
import { Upload, Card, Button, message, Space, Typography, Tag } from 'antd';
import { InboxOutlined, FileExcelOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd/es/upload';
import { useExcelParser } from '../../hooks';
import { useAppStore } from '../../store';

const { Dragger } = Upload;
const { Text } = Typography;

interface FileUploaderProps {
  type: 'dictionary' | 'quantity';
  title: string;
  description: string;
}

export const FileUploader: React.FC<FileUploaderProps> = ({ type, title, description }) => {
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [loading, setLoading] = useState(false);

  const { parseDictionaryFile, parseQuantityFile } = useExcelParser();
  const {
    setDictionaryData,
    setQuantityData,
    clearDictionaryData,
    clearQuantityData,
    dictionaryData,
    quantityData,
    dictionaryFileName,
    quantityFileName,
  } = useAppStore();

  const currentFileName = type === 'dictionary' ? dictionaryFileName : quantityFileName;
  const currentDataCount = type === 'dictionary' ? dictionaryData.length : quantityData.length;
  const hasData = currentDataCount > 0;

  const handleUpload = async (file: File) => {
    setLoading(true);

    try {
      if (type === 'dictionary') {
        const result = await parseDictionaryFile(file);
        if (result.success) {
          setDictionaryData(result.data, file.name);
          message.success(`成功导入 ${result.data.length} 条字典数据`);
        } else {
          message.error(result.error || '解析失败');
        }
      } else {
        const result = await parseQuantityFile(file);
        if (result.success) {
          setQuantityData(result.data, file.name, result.projectInfo);
          message.success(`成功导入 ${result.data.length} 条竣工量数据`);
        } else {
          message.error(result.error || '解析失败');
        }
      }
    } catch (error) {
      message.error('文件处理失败');
    } finally {
      setLoading(false);
      setFileList([]);
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    accept: '.xlsx,.xls',
    fileList,
    beforeUpload: (file) => {
      handleUpload(file);
      return false; // 阻止自动上传
    },
    onChange: (info) => {
      setFileList(info.fileList.slice(-1)); // 只保留最后一个文件
    },
  };

  const handleClear = () => {
    if (type === 'dictionary') {
      clearDictionaryData();
    } else {
      clearQuantityData();
    }
    setFileList([]);
    message.info('已清除数据');
  };

  return (
    <Card
      title={
        <Space>
          <FileExcelOutlined />
          <span>{title}</span>
          {hasData && <Tag color="green">{currentDataCount} 条数据</Tag>}
        </Space>
      }
      extra={
        hasData && (
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={handleClear}
          >
            清除
          </Button>
        )
      }
      size="small"
    >
      {hasData ? (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <FileExcelOutlined style={{ fontSize: 32, color: '#52c41a', marginBottom: 8 }} />
          <div>
            <Text strong>{currentFileName}</Text>
          </div>
          <div>
            <Text type="secondary">已导入 {currentDataCount} 条数据</Text>
          </div>
          <div style={{ marginTop: 12 }}>
            <Upload {...uploadProps} showUploadList={false}>
              <Button size="small">重新上传</Button>
            </Upload>
          </div>
        </div>
      ) : (
        <Dragger {...uploadProps} disabled={loading}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint">{description}</p>
        </Dragger>
      )}
    </Card>
  );
};
