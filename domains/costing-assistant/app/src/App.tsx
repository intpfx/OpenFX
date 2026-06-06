import React from 'react';
import { Layout, Typography, Row, Col, Card, Space, Button, Divider } from 'antd';
import {
  CalculatorOutlined,
  GithubOutlined,
  ClearOutlined,
} from '@ant-design/icons';
import { FileUploader } from './components/upload';
import { GlobalParamsPanel } from './components/params';
import { ResultsTable, ResultsToolbar, SummaryFooter } from './components/results';
import { DictionaryManager } from './components/dictionary';
import { useAppStore } from './store';

const { Header, Content, Footer } = Layout;
const { Title, Text } = Typography;

const App: React.FC = () => {
  const { resetAll, dictionaryData, quantityData } = useAppStore();
  const hasAnyData = dictionaryData.length > 0 || quantityData.length > 0;

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          background: '#fff',
          borderBottom: '1px solid #f0f0f0',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Space>
          <CalculatorOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          <Title level={4} style={{ margin: 0 }}>
            工程计价助手
          </Title>
          <Text type="secondary">云端静态版</Text>
        </Space>

        {hasAnyData && (
          <Button
            danger
            icon={<ClearOutlined />}
            onClick={() => {
              if (window.confirm('确定要清除所有数据吗？')) {
                resetAll();
              }
            }}
          >
            清除全部
          </Button>
        )}
      </Header>

      <Content style={{ padding: '24px', background: '#f5f5f5' }}>
        {/* 上传区域 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col xs={24} lg={12}>
            <FileUploader
              type="dictionary"
              title="导入字典文件"
              description="支持 .xlsx/.xls 格式，需包含：材料简写、材料规格、单价、安全文明施工费"
            />
          </Col>
          <Col xs={24} lg={12}>
            <FileUploader
              type="quantity"
              title="导入竣工量文件"
              description="支持 .xlsx/.xls 格式，需包含：物资名称、规格型号、工程量"
            />
          </Col>
        </Row>

        {/* 字典数据管理 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <DictionaryManager />
          </Col>
        </Row>

        {/* 参数设置 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={24}>
            <GlobalParamsPanel />
          </Col>
        </Row>

        {/* 数据表格 */}
        <Card size="small" style={{ marginBottom: 16 }}>
          <ResultsToolbar />
          <ResultsTable />
        </Card>

        {/* 计算结果汇总 */}
        <SummaryFooter />
      </Content>

      <Footer style={{ textAlign: 'center', background: '#fff', borderTop: '1px solid #f0f0f0' }}>
        <Space split={<Divider type="vertical" />}>
          <Text type="secondary">工程计价助手 v1.0.0</Text>
          <Text type="secondary">
            基于《中燃集团建筑安装工程综合价格（2023）V1.0》
          </Text>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#999' }}
          >
            <GithubOutlined /> GitHub
          </a>
        </Space>
      </Footer>

      <style>{`
        .row-unmatched {
          background-color: #fff2f0 !important;
        }
        .row-unmatched:hover > td {
          background-color: #ffebe8 !important;
        }
        .row-ambiguous {
          background-color: #fffbe6 !important;
        }
        .row-ambiguous:hover > td {
          background-color: #fff7cc !important;
        }
      `}</style>
    </Layout>
  );
};

export default App;
