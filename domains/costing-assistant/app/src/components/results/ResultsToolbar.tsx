import React from 'react';
import { Space, Button, Switch, Typography } from 'antd';
import { DownloadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useAppStore } from '../../store';
import { useExport } from '../../hooks';

const { Text } = Typography;

export const ResultsToolbar: React.FC = () => {
  const {
    quantityData,
    calculationSummary,
    globalParams,
    showUnmatchedOnly,
    setShowUnmatchedOnly,
    recalculate,
  } = useAppStore();

  const { exportToExcel } = useExport();

  const hasData = quantityData.length > 0;
  const unmatchedCount = quantityData.filter(
    (r) => r.matchStatus === 'unmatched' || r.matchStatus === 'ambiguous'
  ).length;

  const handleExport = () => {
    exportToExcel(quantityData, calculationSummary, globalParams);
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
      }}
    >
      <Space>
        <Text strong>数据明细</Text>
        {hasData && (
          <Text type="secondary">
            共 {quantityData.length} 条记录
          </Text>
        )}
      </Space>

      <Space>
        {unmatchedCount > 0 && (
          <Space>
            <Text type="secondary">仅显示未匹配：</Text>
            <Switch
              size="small"
              checked={showUnmatchedOnly}
              onChange={setShowUnmatchedOnly}
            />
          </Space>
        )}

        <Button
          icon={<ReloadOutlined />}
          onClick={recalculate}
          disabled={!hasData}
        >
          重新计算
        </Button>

        <Button
          type="primary"
          icon={<DownloadOutlined />}
          onClick={handleExport}
          disabled={!hasData}
        >
          导出 Excel
        </Button>
      </Space>
    </div>
  );
};
