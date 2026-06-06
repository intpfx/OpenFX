import React from 'react';
import { Table, Tag, InputNumber, Select, Tooltip, Empty, Space, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  CheckCircleOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  CopyOutlined,
  FileTextOutlined,
  NumberOutlined,
} from '@ant-design/icons';
import type { EnrichedQuantityRow, NormalizedDictEntry } from '../../types';
import { useAppStore } from '../../store';
import { updateRowMatch } from '../../utils/matching';

const { Text } = Typography;

/**
 * 复制文本到剪贴板
 */
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    message.success(`已复制${label}`);
  } catch {
    message.error('复制失败');
  }
};

/**
 * 可复制的文本组件
 */
const CopyableText: React.FC<{ text: string; label: string; icon?: React.ReactNode }> = ({
  text,
  label,
  icon,
}) => (
  <Space
    style={{ cursor: 'pointer' }}
    onClick={() => copyToClipboard(text, label)}
  >
    {icon}
    <Text>{text}</Text>
    <Tooltip title={`点击复制${label}`}>
      <CopyOutlined style={{ color: '#1890ff', fontSize: 12 }} />
    </Tooltip>
  </Space>
);

export const ResultsTable: React.FC = () => {
  const {
    quantityData,
    showUnmatchedOnly,
    updateQuantityRow,
    projectInfo,
  } = useAppStore();

  // 过滤数据
  const filteredData = showUnmatchedOnly
    ? quantityData.filter((r) => r.matchStatus !== 'matched')
    : quantityData;

  // 处理工程量编辑
  const handleQuantityChange = (id: string, value: number | null) => {
    if (value !== null && value >= 0) {
      updateQuantityRow(id, { quantity: value });
    }
  };

  // 处理手动选择匹配
  const handleMatchSelect = (row: EnrichedQuantityRow, dictEntry: NormalizedDictEntry) => {
    const updatedRow = updateRowMatch(row, dictEntry);
    updateQuantityRow(row.id, updatedRow);
  };

  // 匹配状态渲染
  const renderMatchStatus = (status: EnrichedQuantityRow['matchStatus']) => {
    switch (status) {
      case 'matched':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            已匹配
          </Tag>
        );
      case 'ambiguous':
        return (
          <Tag icon={<WarningOutlined />} color="warning">
            待确认
          </Tag>
        );
      case 'unmatched':
        return (
          <Tag icon={<CloseCircleOutlined />} color="error">
            未匹配
          </Tag>
        );
    }
  };

  const columns: ColumnsType<EnrichedQuantityRow> = [
    {
      title: '序号',
      dataIndex: 'sourceRowIndex',
      key: 'sourceRowIndex',
      width: 60,
      align: 'center',
    },
    {
      title: '物资名称',
      dataIndex: 'materialName',
      key: 'materialName',
      width: 150,
      ellipsis: true,
    },
    {
      title: '规格型号',
      dataIndex: 'specModel',
      key: 'specModel',
      width: 120,
      ellipsis: true,
    },
    {
      title: '工程量',
      dataIndex: 'quantity',
      key: 'quantity',
      width: 100,
      render: (value: number, record) => (
        <InputNumber
          value={value}
          onChange={(v) => handleQuantityChange(record.id, v)}
          min={0}
          step={0.1}
          precision={2}
          size="small"
          style={{ width: '100%' }}
        />
      ),
    },
    {
      title: '单位',
      dataIndex: 'unit',
      key: 'unit',
      width: 60,
      align: 'center',
    },
    {
      title: '匹配状态',
      dataIndex: 'matchStatus',
      key: 'matchStatus',
      width: 100,
      align: 'center',
      render: renderMatchStatus,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 90,
      align: 'right',
      render: (value: number | undefined, record) => {
        if (record.matchStatus === 'ambiguous' && record.matchCandidates) {
          return (
            <Select
              size="small"
              placeholder="选择"
              style={{ width: '100%' }}
              onChange={(dictId) => {
                const selected = record.matchCandidates?.find((c) => c.id === dictId);
                if (selected) {
                  handleMatchSelect(record, selected);
                }
              }}
              options={record.matchCandidates.map((c) => ({
                value: c.id,
                label: (
                  <Tooltip title={`${c.materialAbbr} - ${c.materialSpec}`}>
                    ¥{c.unitPrice.toFixed(2)}
                  </Tooltip>
                ),
              }))}
            />
          );
        }
        return value !== undefined ? `¥${value.toFixed(2)}` : '--';
      },
    },
    {
      title: '安全文明施工费',
      dataIndex: 'safetyFee',
      key: 'safetyFee',
      width: 120,
      align: 'right',
      render: (value: number | undefined) =>
        value !== undefined ? `¥${value.toFixed(2)}` : '--',
    },
    {
      title: '基础施工费',
      dataIndex: 'baseCost',
      key: 'baseCost',
      width: 110,
      align: 'right',
      render: (value: number | undefined) =>
        value !== undefined ? (
          <span style={{ color: '#1890ff', fontWeight: 500 }}>
            ¥{value.toFixed(2)}
          </span>
        ) : (
          '--'
        ),
    },
    {
      title: '备注',
      dataIndex: 'remarks',
      key: 'remarks',
      width: 120,
      ellipsis: true,
    },
  ];

  if (quantityData.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="请上传竣工量文件查看数据"
        style={{ padding: '40px 0' }}
      />
    );
  }

  return (
    <div>
      {/* 工程信息展示 */}
      {projectInfo && (projectInfo.projectName || projectInfo.projectCode) && (
        <div
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            background: '#f6f8fa',
            borderRadius: 6,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          {projectInfo.projectName && (
            <CopyableText
              text={projectInfo.projectName}
              label="工程名称"
              icon={<FileTextOutlined style={{ color: '#1890ff' }} />}
            />
          )}
          {projectInfo.projectCode && (
            <CopyableText
              text={projectInfo.projectCode}
              label="工程编号"
              icon={<NumberOutlined style={{ color: '#52c41a' }} />}
            />
          )}
        </div>
      )}

      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="id"
        size="small"
        scroll={{ x: 1100, y: 500 }}
        pagination={false}
        rowClassName={(record) => {
          if (record.matchStatus === 'unmatched') return 'row-unmatched';
          if (record.matchStatus === 'ambiguous') return 'row-ambiguous';
          return '';
        }}
      />
    </div>
  );
};
