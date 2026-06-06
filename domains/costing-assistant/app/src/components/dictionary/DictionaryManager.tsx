import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Typography,
  Tag,
  message,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  BookOutlined,
  SearchOutlined,
  CameraOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { NormalizedDictEntry, DictionaryRow } from '../../types';
import { useAppStore, checkDuplicates, type DuplicateEntry } from '../../store';
import { OcrImportModal } from './OcrImportModal';
import { DuplicateHandleModal } from './DuplicateHandleModal';

const { Text } = Typography;

interface DictFormValues {
  材料简写: string;
  材料规格: string;
  单价: number;
  安全文明施工费: number;
}

export const DictionaryManager: React.FC = () => {
  const {
    dictionaryData,
    dictionaryFileName,
    addDictionaryEntry,
    updateDictionaryEntry,
    deleteDictionaryEntry,
    clearDictionaryData,
    addDictionaryEntries,
    replaceDictionaryEntry,
  } = useAppStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<NormalizedDictEntry | null>(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm<DictFormValues>();

  // OCR 导入相关状态
  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);

  // 重复检测相关状态
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [pendingDuplicates, setPendingDuplicates] = useState<DuplicateEntry[]>([]);
  const [pendingNonDuplicates, setPendingNonDuplicates] = useState<DictionaryRow[]>([]);

  // 过滤数据
  const filteredData = searchText
    ? dictionaryData.filter(
        (item) =>
          item.materialAbbr.toLowerCase().includes(searchText.toLowerCase()) ||
          item.materialSpec.toLowerCase().includes(searchText.toLowerCase())
      )
    : dictionaryData;

  // 打开新增弹窗
  const handleAdd = () => {
    setEditingEntry(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  // 打开编辑弹窗
  const handleEdit = (record: NormalizedDictEntry) => {
    setEditingEntry(record);
    form.setFieldsValue({
      材料简写: record.materialAbbr,
      材料规格: record.materialSpec,
      单价: record.unitPrice,
      安全文明施工费: record.safetyFee,
    });
    setIsModalOpen(true);
  };

  // 删除条目
  const handleDelete = (id: string) => {
    deleteDictionaryEntry(id);
    message.success('删除成功');
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const entry: DictionaryRow = {
        材料简写: values.材料简写.trim(),
        材料规格: values.材料规格.trim(),
        单价: values.单价,
        安全文明施工费: values.安全文明施工费,
      };

      if (editingEntry) {
        updateDictionaryEntry(editingEntry.id, entry);
        message.success('更新成功');
      } else {
        // 检查单条新增是否重复
        const result = checkDuplicates([entry], dictionaryData);
        if (result.duplicates.length > 0) {
          setPendingDuplicates(result.duplicates);
          setPendingNonDuplicates([]);
          setDuplicateModalOpen(true);
        } else {
          addDictionaryEntry(entry);
          message.success('添加成功');
        }
      }

      setIsModalOpen(false);
      form.resetFields();
    } catch (error) {
      // 表单验证失败
    }
  };

  // 处理批量导入（来自 OCR）
  const handleBatchImport = (entries: DictionaryRow[]) => {
    const result = checkDuplicates(entries, dictionaryData);

    if (result.duplicates.length > 0) {
      // 有重复，需要用户处理
      setPendingDuplicates(result.duplicates);
      setPendingNonDuplicates(result.uniqueEntries);
      setDuplicateModalOpen(true);
    } else {
      // 没有重复，直接添加
      addDictionaryEntries(result.uniqueEntries);
      message.success(`成功导入 ${result.uniqueEntries.length} 条数据`);
    }
  };

  // 处理重复项解决
  const handleDuplicateResolve = (resolutions: Map<string, 'keep-existing' | 'use-new'>) => {
    let replacedCount = 0;
    let skippedCount = 0;

    resolutions.forEach((resolution, existingId) => {
      if (resolution === 'use-new') {
        const dup = pendingDuplicates.find((d) => d.existingEntry.id === existingId);
        if (dup) {
          replaceDictionaryEntry(existingId, dup.newEntry);
          replacedCount++;
        }
      } else {
        skippedCount++;
      }
    });

    // 添加非重复项
    if (pendingNonDuplicates.length > 0) {
      addDictionaryEntries(pendingNonDuplicates);
    }

    message.success(
      `导入完成：新增 ${pendingNonDuplicates.length} 条，替换 ${replacedCount} 条，跳过 ${skippedCount} 条`
    );

    setDuplicateModalOpen(false);
    setPendingDuplicates([]);
    setPendingNonDuplicates([]);
  };

  // 清空所有数据
  const handleClearAll = () => {
    clearDictionaryData();
    message.success('已清空所有字典数据');
  };

  const columns: ColumnsType<NormalizedDictEntry> = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: '材料简写',
      dataIndex: 'materialAbbr',
      key: 'materialAbbr',
      width: 150,
      ellipsis: true,
    },
    {
      title: '材料规格',
      dataIndex: 'materialSpec',
      key: 'materialSpec',
      width: 120,
      ellipsis: true,
    },
    {
      title: '单价',
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      width: 100,
      align: 'right',
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: '安全文明施工费',
      dataIndex: 'safetyFee',
      key: 'safetyFee',
      width: 130,
      align: 'right',
      render: (value: number) => `¥${value.toFixed(2)}`,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      align: 'center',
      render: (_, record) => (
        <Space size="small">
          <Button
            type="text"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          />
          <Popconfirm
            title="确定删除此条目吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <BookOutlined />
          <span>字典数据管理</span>
          <Tag color="blue">{dictionaryData.length} 条</Tag>
          {dictionaryFileName && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              来源：{dictionaryFileName}
            </Text>
          )}
        </Space>
      }
      extra={
        <Space>
          <Input
            placeholder="搜索材料..."
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 160 }}
            allowClear
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            新增
          </Button>
          <Button icon={<CameraOutlined />} onClick={() => setIsOcrModalOpen(true)}>
            OCR导入
          </Button>
          {dictionaryData.length > 0 && (
            <Popconfirm
              title="确定清空所有字典数据吗？"
              description="此操作不可恢复"
              onConfirm={handleClearAll}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button danger>清空</Button>
            </Popconfirm>
          )}
        </Space>
      }
      size="small"
    >
      {dictionaryData.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="暂无字典数据，请上传Excel或手动添加"
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
            添加第一条数据
          </Button>
        </Empty>
      ) : (
        <Table
          columns={columns}
          dataSource={filteredData}
          rowKey="id"
          size="small"
          scroll={{ y: 400 }}
          pagination={false}
        />
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editingEntry ? '编辑字典条目' : '新增字典条目'}
        open={isModalOpen}
        onOk={handleSubmit}
        onCancel={() => setIsModalOpen(false)}
        okText={editingEntry ? '保存' : '添加'}
        cancelText="取消"
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            单价: 0,
            安全文明施工费: 0,
          }}
        >
          <Form.Item
            name="材料简写"
            label="材料简写"
            rules={[{ required: true, message: '请输入材料简写' }]}
          >
            <Input placeholder="如：镀锌钢管、PE管、铜球阀" />
          </Form.Item>

          <Form.Item
            name="材料规格"
            label="材料规格"
            rules={[{ required: true, message: '请输入材料规格' }]}
          >
            <Input placeholder="如：DN32、DN25、D42.4" />
          </Form.Item>

          <Form.Item
            name="单价"
            label="单价（元）"
            rules={[{ required: true, message: '请输入单价' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              placeholder="请输入单价"
            />
          </Form.Item>

          <Form.Item
            name="安全文明施工费"
            label="安全文明施工费（元）"
            rules={[{ required: true, message: '请输入安全文明施工费' }]}
          >
            <InputNumber
              min={0}
              precision={2}
              style={{ width: '100%' }}
              placeholder="请输入安全文明施工费"
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* OCR 导入弹窗 */}
      <OcrImportModal
        open={isOcrModalOpen}
        onClose={() => setIsOcrModalOpen(false)}
        onImport={handleBatchImport}
      />

      {/* 重复数据处理弹窗 */}
      <DuplicateHandleModal
        open={duplicateModalOpen}
        duplicates={pendingDuplicates}
        onResolve={handleDuplicateResolve}
        onCancel={() => {
          setDuplicateModalOpen(false);
          setPendingDuplicates([]);
          setPendingNonDuplicates([]);
        }}
      />
    </Card>
  );
};
