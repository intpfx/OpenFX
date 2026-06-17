import React from 'react';
import { Card, Form, InputNumber, Switch, Space, Typography, Tooltip, Divider, Tag } from 'antd';
import { SettingOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useAppStore } from '../../store';

const { Text } = Typography;

export const GlobalParamsPanel: React.FC = () => {
  const {
    globalParams,
    setGlobalParams,
    calculationSummary,
    quantityData,
  } = useAppStore();

  const hasData = quantityData.length > 0;
  const autoDetectedBuried = calculationSummary?.isBuried ?? false;
  const isManualMode = globalParams.manualBuriedPipeline !== null;

  return (
    <Card
      title={
        <Space>
          <SettingOutlined />
          <span>全局参数设置</span>
        </Space>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        {/* 工程系数 */}
        <Form.Item
          label={
            <Space>
              <span>工程系数</span>
              <Tooltip title="统一应用于所有行的计算，默认为 1.0">
                <QuestionCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
        >
          <InputNumber
            value={globalParams.coefficient}
            onChange={(value) => setGlobalParams({ coefficient: value ?? 1.0 })}
            min={0.01}
            max={10}
            step={0.01}
            precision={2}
            style={{ width: 120 }}
          />
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        {/* 埋地管道设置 */}
        <Form.Item
          label={
            <Space>
              <span>埋地管道判定</span>
              <Tooltip title="手动设置时跳过自动判定；自动判定逻辑：若物资名称或材料简写包含'PE'则判定为埋地管道项目">
                <QuestionCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
        >
          <Space direction="vertical" size="small">
            <Space>
              <Switch
                checked={isManualMode}
                onChange={(checked) => {
                  if (checked) {
                    setGlobalParams({ manualBuriedPipeline: autoDetectedBuried });
                  } else {
                    setGlobalParams({ manualBuriedPipeline: null });
                  }
                }}
                checkedChildren="手动"
                unCheckedChildren="自动"
              />
              {isManualMode ? (
                <Switch
                  checked={globalParams.manualBuriedPipeline === true}
                  onChange={(checked) => setGlobalParams({ manualBuriedPipeline: checked })}
                  checkedChildren="是埋地"
                  unCheckedChildren="非埋地"
                />
              ) : (
                <Tag color={hasData ? (autoDetectedBuried ? 'orange' : 'blue') : 'default'}>
                  {hasData
                    ? autoDetectedBuried
                      ? '自动判定：是埋地管道'
                      : '自动判定：非埋地管道'
                    : '等待数据导入'}
                </Tag>
              )}
            </Space>
          </Space>
        </Form.Item>

        <Divider style={{ margin: '12px 0' }} />

        {/* 专项下浮 */}
        <Form.Item
          label={
            <Space>
              <span>专项下浮</span>
              <Tooltip title="按项目结算规则计算：分包结算价 = 总包价按设定比例下浮">
                <QuestionCircleOutlined style={{ color: '#999' }} />
              </Tooltip>
            </Space>
          }
        >
          <Space>
            <Switch
              checked={globalParams.applySpecialDiscount}
              onChange={(checked) => setGlobalParams({ applySpecialDiscount: checked })}
              checkedChildren="启用"
              unCheckedChildren="停用"
            />
            {globalParams.applySpecialDiscount && (
              <Space>
                <Text type="secondary">下浮比例：</Text>
                <InputNumber
                  value={globalParams.specialDiscountRate * 100}
                  onChange={(value) =>
                    setGlobalParams({ specialDiscountRate: (value ?? 17) / 100 })
                  }
                  min={0}
                  max={100}
                  step={1}
                  precision={0}
                  formatter={(value) => `${value}%`}
                  parser={(value) => parseFloat(value?.replace('%', '') || '17')}
                  style={{ width: 80 }}
                />
              </Space>
            )}
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};
