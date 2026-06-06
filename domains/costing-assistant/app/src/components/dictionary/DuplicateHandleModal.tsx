import React from 'react';
import { Modal, Table, Button, Space, Typography, Radio } from 'antd';
import { WarningOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { DictionaryRow } from '../../types';
import type { DuplicateEntry } from '../../store';

const { Text } = Typography;

interface DuplicateHandleModalProps {
  open: boolean;
  duplicates: DuplicateEntry[];
  onResolve: (resolutions: Map<string, 'keep-existing' | 'use-new'>) => void;
  onCancel: () => void;
}

interface TableRow {
  key: string;
  existingId: string;
  materialAbbr: string;
  materialSpec: string;
  existingPrice: number;
  existingSafetyFee: number;
  newPrice: number;
  newSafetyFee: number;
  newEntry: DictionaryRow;
  resolution: 'keep-existing' | 'use-new';
}

export const DuplicateHandleModal: React.FC<DuplicateHandleModalProps> = ({
  open,
  duplicates,
  onResolve,
  onCancel,
}) => {
  const [resolutions, setResolutions] = React.useState<Map<string, 'keep-existing' | 'use-new'>>(
    () => new Map(duplicates.map((d) => [d.existingEntry.id, 'keep-existing']))
  );

  React.useEffect(() => {
    // 当 duplicates 变化时重置 resolutions
    setResolutions(new Map(duplicates.map((d) => [d.existingEntry.id, 'keep-existing'])));
  }, [duplicates]);

  const tableData: TableRow[] = duplicates.map((dup, index) => ({
    key: `${index}`,
    existingId: dup.existingEntry.id,
    materialAbbr: dup.existingEntry.materialAbbr,
    materialSpec: dup.existingEntry.materialSpec,
    existingPrice: dup.existingEntry.unitPrice,
    existingSafetyFee: dup.existingEntry.safetyFee,
    newPrice: dup.newEntry.单价,
    newSafetyFee: dup.newEntry.安全文明施工费,
    newEntry: dup.newEntry,
    resolution: resolutions.get(dup.existingEntry.id) || 'keep-existing',
  }));

  const handleResolutionChange = (existingId: string, value: 'keep-existing' | 'use-new') => {
    setResolutions((prev) => {
      const newMap = new Map(prev);
      newMap.set(existingId, value);
      return newMap;
    });
  };

  const handleConfirm = () => {
    onResolve(resolutions);
  };

  const handleKeepAllExisting = () => {
    setResolutions(new Map(duplicates.map((d) => [d.existingEntry.id, 'keep-existing'])));
  };

  const handleUseAllNew = () => {
    setResolutions(new Map(duplicates.map((d) => [d.existingEntry.id, 'use-new'])));
  };

  const columns: ColumnsType<TableRow> = [
    {
      title: '材料简写',
      dataIndex: 'materialAbbr',
      key: 'materialAbbr',
      width: 120,
    },
    {
      title: '材料规格',
      dataIndex: 'materialSpec',
      key: 'materialSpec',
      width: 100,
    },
    {
      title: '已有数据',
      key: 'existing',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>单价: ¥{record.existingPrice.toFixed(2)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            安全费: ¥{record.existingSafetyFee.toFixed(2)}
          </Text>
        </Space>
      ),
    },
    {
      title: '新数据',
      key: 'new',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <Text>单价: ¥{record.newPrice.toFixed(2)}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>
            安全费: ¥{record.newSafetyFee.toFixed(2)}
          </Text>
        </Space>
      ),
    },
    {
      title: '选择保留',
      key: 'resolution',
      width: 160,
      render: (_, record) => (
        <Radio.Group
          value={record.resolution}
          onChange={(e) => handleResolutionChange(record.existingId, e.target.value)}
          size="small"
        >
          <Radio.Button value="keep-existing">保留已有</Radio.Button>
          <Radio.Button value="use-new">使用新</Radio.Button>
        </Radio.Group>
      ),
    },
  ];

  return (
    <Modal
      title={
        <Space>
          <WarningOutlined style={{ color: '#faad14' }} />
          <span>发现 {duplicates.length} 条重复数据</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={750}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消导入
        </Button>,
        <Button key="confirm" type="primary" onClick={handleConfirm}>
          确认处理
        </Button>,
      ]}
    >
      <div style={{ marginBottom: 16 }}>
        <Text type="secondary">
          以下数据的「材料简写 + 材料规格」与已有字典数据重复，请选择保留哪一条：
        </Text>
      </div>

      <div style={{ marginBottom: 12 }}>
        <Space>
          <Text>快捷操作：</Text>
          <Button size="small" onClick={handleKeepAllExisting}>
            全部保留已有
          </Button>
          <Button size="small" onClick={handleUseAllNew}>
            全部使用新数据
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={tableData}
        size="small"
        scroll={{ y: 300 }}
        pagination={false}
      />
    </Modal>
  );
};
