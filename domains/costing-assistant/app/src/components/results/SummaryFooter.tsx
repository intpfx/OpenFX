import React from 'react';
import { Card, Statistic, Row, Col, Typography, Tag, Divider, Space, Collapse, Tooltip, message } from 'antd';
import {
  CalculatorOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  QuestionCircleOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { useAppStore } from '../../store';

const { Text, Paragraph } = Typography;

/**
 * 复制金额到剪贴板
 */
const copyAmountToClipboard = async (value: number, label: string) => {
  try {
    await navigator.clipboard.writeText(value.toFixed(2));
    message.success(`已复制${label}：¥${value.toFixed(2)}`);
  } catch {
    message.error('复制失败');
  }
};

/**
 * 可复制的统计组件
 */
const CopyableStatistic: React.FC<{
  title: string;
  value: number;
  prefix?: string;
  precision?: number;
  valueStyle?: React.CSSProperties;
}> = ({ title, value, prefix = '¥', precision = 2, valueStyle }) => (
  <div
    style={{ cursor: 'pointer', position: 'relative' }}
    onClick={() => copyAmountToClipboard(value, title)}
  >
    <Statistic
      title={
        <Space size={4}>
          <span>{title}</span>
          <Tooltip title="点击复制金额">
            <CopyOutlined style={{ color: '#1890ff', fontSize: 12 }} />
          </Tooltip>
        </Space>
      }
      value={value}
      prefix={prefix}
      precision={precision}
      valueStyle={valueStyle}
    />
  </div>
);

export const SummaryFooter: React.FC = () => {
  const { calculationSummary, globalParams, quantityData } = useAppStore();

  if (!calculationSummary) {
    return (
      <Card size="small">
        <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>
          <CalculatorOutlined style={{ fontSize: 24, marginBottom: 8 }} />
          <div>请上传字典文件和竣工量文件后查看计算结果</div>
        </div>
      </Card>
    );
  }

  const matchedCount = quantityData.filter((r) => r.matchStatus === 'matched').length;
  const unmatchedCount = quantityData.filter((r) => r.matchStatus === 'unmatched').length;
  const ambiguousCount = quantityData.filter((r) => r.matchStatus === 'ambiguous').length;

  return (
    <Card
      title={
        <Space>
          <CalculatorOutlined />
          <span>计算结果汇总</span>
        </Space>
      }
      size="small"
    >
      {/* 匹配状态统计 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a' }} />
            <Text>已匹配：</Text>
            <Tag color="green">{matchedCount} 项</Tag>
          </Space>
        </Col>
        <Col span={8}>
          <Space>
            <WarningOutlined style={{ color: '#faad14' }} />
            <Text>待确认：</Text>
            <Tag color="orange">{ambiguousCount} 项</Tag>
          </Space>
        </Col>
        <Col span={8}>
          <Space>
            <WarningOutlined style={{ color: '#ff4d4f' }} />
            <Text>未匹配：</Text>
            <Tag color="red">{unmatchedCount} 项</Tag>
          </Space>
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* 管线与规则信息 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Statistic
            title="管线总长度"
            value={calculationSummary.totalPipelineLength}
            suffix="米"
            precision={2}
          />
        </Col>
        <Col span={8}>
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>埋地管道</Text>
            <div style={{ marginTop: 4 }}>
              <Tag color={calculationSummary.isBuried ? 'orange' : 'blue'}>
                {calculationSummary.isBuried ? '是' : '否'}
              </Tag>
              <Tag>
                {calculationSummary.buriedDetectedBy === 'auto' ? '自动判定' : '手动设置'}
              </Tag>
            </div>
          </div>
        </Col>
        <Col span={8}>
          <Statistic
            title="工程系数"
            value={globalParams.coefficient}
            precision={2}
          />
        </Col>
      </Row>

      <Divider style={{ margin: '12px 0' }} />

      {/* 费用计算结果 */}
      <Row gutter={16}>
        <Col span={6}>
          <CopyableStatistic
            title="基础施工费合计"
            value={calculationSummary.totalBaseCost}
          />
        </Col>
        <Col span={6}>
          {!calculationSummary.isBuried && (
            <CopyableStatistic
              title="标准费用"
              value={calculationSummary.standardFee}
            />
          )}
        </Col>
        <Col span={6}>
          <CopyableStatistic
            title="工程总包施工费"
            value={calculationSummary.totalPackageFee}
            valueStyle={{ color: '#1890ff', fontWeight: 'bold' }}
          />
        </Col>
        <Col span={6}>
          {calculationSummary.subcontractFee !== null ? (
            <CopyableStatistic
              title={`分包结算价 (下浮${(globalParams.xuzhouDiscountRate * 100).toFixed(0)}%)`}
              value={calculationSummary.subcontractFee}
              valueStyle={{ color: '#52c41a', fontWeight: 'bold' }}
            />
          ) : (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>分包结算价</Text>
              <div style={{ fontSize: 20, color: '#999' }}>--</div>
            </div>
          )}
        </Col>
      </Row>

      <Divider style={{ margin: '16px 0 12px' }} />

      {/* 计算说明 */}
      <Collapse
        ghost
        size="small"
        items={[
          {
            key: 'explanation',
            label: (
              <Space>
                <QuestionCircleOutlined />
                <Text type="secondary">费用计算说明</Text>
              </Space>
            ),
            children: (
              <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                <Paragraph style={{ marginBottom: 12 }}>
                  <Text strong>1. 基础施工费合计</Text>
                  <br />
                  <Text type="secondary">
                    各行施工费之和。单行公式：((单价 - 安全文明施工费) × 工程系数 + 安全文明施工费) × 工程量
                  </Text>
                </Paragraph>

                <Paragraph style={{ marginBottom: 12 }}>
                  <Text strong>2. 标准费用</Text>
                  <Text type="secondary">（仅非埋地管道适用）</Text>
                  <br />
                  <Text type="secondary">
                    管线 ≤10米：2000元；超过10米：每增加5米加100元（不足5米按5米计）。
                    <br />
                    当前管线{calculationSummary.totalPipelineLength}米，标准费用 = ¥{calculationSummary.standardFee.toFixed(2)}
                  </Text>
                </Paragraph>

                <Paragraph style={{ marginBottom: 12 }}>
                  <Text strong>3. 工程总包施工费</Text>
                  <br />
                  <Text type="secondary">
                    {calculationSummary.isBuried ? (
                      <>
                        <Tag color="orange" style={{ marginRight: 4 }}>埋地管道规则</Tag>
                        基础施工费 ≤3000元按3000元包干，&gt;3000元按实际计取。
                      </>
                    ) : (
                      <>
                        <Tag color="blue" style={{ marginRight: 4 }}>非埋地管道规则</Tag>
                        基础施工费 &gt;3000元按实际计取，≤3000元取「标准费用」与「基础施工费」较大值。
                      </>
                    )}
                  </Text>
                </Paragraph>

                <Paragraph style={{ marginBottom: 0 }}>
                  <Text strong>4. 分包结算价</Text>
                  <br />
                  <Text type="secondary">
                    徐州项目部2025财年结算规则：分包结算价 = 工程总包施工费 × (1 - {(globalParams.xuzhouDiscountRate * 100).toFixed(0)}%)
                    {!globalParams.applyXuzhouDiscount && (
                      <Tag color="default" style={{ marginLeft: 8 }}>当前未启用</Tag>
                    )}
                  </Text>
                </Paragraph>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};
