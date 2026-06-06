import React, { createContext, useContext, useState, useEffect } from 'react';
import versionFeatures from '../config/versionFeatures.json' with { type: "json" };
import { defaultScalePolicy } from '../utils/pipelineSpec.js';
import { normalizeProjectData } from '../utils/normalizeProject.js';

// 创建ProjectContext
const ProjectContext = createContext();

/**
 * 项目上下文提供者组件
 * @param {Object} props - 组件属性
 * @param {React.ReactNode} props.children - 子组件
 * @returns {JSX.Element} ProjectContext.Provider组件
 */
export const ProjectProvider = ({ children }) => {
  // 项目相关状态
  const [projects, setProjects] = useState([]);
  const [currentProjectId, setCurrentProjectId] = useState(null);
  const [showProjectList, setShowProjectList] = useState(false);
  // 旧弹窗相关状态已移除，改用组件内联编辑

  // 项目数据状态
  const [segments, setSegments] = useState([]);
  const [components, setComponents] = useState([]);
  const [fittings, setFittings] = useState([]);
  // 手动添加的支撑件（立柱/支架）列表，按段关联
  const [manualFittings, setManualFittings] = useState([]);
  const [designStartPoint, setDesignStartPoint] = useState({ x: 200, y: 200 });
  const [currentPoint, setCurrentPoint] = useState({ x: 200, y: 200 });
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [showLabels, setShowLabels] = useState(false);
  // 标注可见性开关：镀锌管件、封堵、接驳点、活接、设计起点
  const [labelVisibility, setLabelVisibility] = useState({ galvanized: true, blockage: true, junction: true, union: true, designStart: true });
  // 文本标注偏移：按视图分别存储，键为标注 key，单位为世界坐标
  const [labelOffsetsSystem, setLabelOffsetsSystem] = useState({});
  const [labelOffsetsPlane, setLabelOffsetsPlane] = useState({});
  // 平面视图覆盖位置（仅影响平面视图渲染，不回写系统视图）
  const [planComponentPositions, setPlanComponentPositions] = useState({});
  const [planFittingPositions, setPlanFittingPositions] = useState({});
  // 新建工程后是否需要将设计起点居中显示（仅对新建生效，不影响既有工程加载）
  const [shouldCenterOnNewProject, setShouldCenterOnNewProject] = useState(false);

  // 清理不存在元素的平面视图覆盖数据，避免残留
  useEffect(() => {
    setPlanComponentPositions(prev => {
      const next = {};
      (components || []).forEach((comp) => {
        if (!comp || comp.id == null) return;
        const override = prev?.[comp.id];
        if (override && Number.isFinite(override.x) && Number.isFinite(override.y)) {
          next[comp.id] = override;
        }
      });
      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next);
      const same = prevKeys.length === nextKeys.length && prevKeys.every((key) => {
        const ovPrev = prev[key];
        const ovNext = next[key];
        return !!ovNext && Math.abs((ovPrev?.x ?? 0) - ovNext.x) < 1e-9 && Math.abs((ovPrev?.y ?? 0) - ovNext.y) < 1e-9;
      });
      if (same) {
        return prev;
      }
      return next;
    });
  }, [components]);

  useEffect(() => {
    setPlanFittingPositions(prev => {
      const next = {};
      (fittings || []).forEach((fitting) => {
        if (!fitting || fitting.id == null) return;
        const override = prev?.[fitting.id];
        if (override && Number.isFinite(override.x) && Number.isFinite(override.y)) {
          next[fitting.id] = override;
        }
      });
      const prevKeys = Object.keys(prev || {});
      const nextKeys = Object.keys(next);
      const same = prevKeys.length === nextKeys.length && prevKeys.every((key) => {
        const ovPrev = prev[key];
        const ovNext = next[key];
        return !!ovNext && Math.abs((ovPrev?.x ?? 0) - ovNext.x) < 1e-9 && Math.abs((ovPrev?.y ?? 0) - ovNext.y) < 1e-9;
      });
      if (same) {
        return prev;
      }
      return next;
    });
  }, [fittings]);

  // 全局 UI 模式与插入设备选择（持久化模式）
  const MODE_KEY = 'gasmap.uiMode';
  const [uiMode, setUiMode] = useState(() => {
    try {
      const saved = localStorage.getItem(MODE_KEY);
      return (saved === 'insert' || saved === 'draw' || saved === 'property' || saved === 'move' || saved === 'delete') ? saved : 'draw';
    }
    // eslint-disable-next-line no-unused-vars
    catch (_err) { return 'draw'; }
  });
  useEffect(() => {
    try { localStorage.setItem(MODE_KEY, uiMode); }
    // eslint-disable-next-line no-unused-vars
    catch (_err) { /* ignore */ }
  }, [uiMode]);
  const [insertDeviceType, setInsertDeviceType] = useState(null);
  // 插入模式下的参数选项（就地浮层设置），按设备类型存储
  // 结构示例：{ meterSpec: 'G4', regulatorSpec: 'RX25', pillar: { diameter: 'DN25', height: 6, quantity: 1 } }
  const [insertOptions, setInsertOptions] = useState({});

  // 版本历史与操作日志（轻量持久化）
  const [history, setHistory] = useState([]); // 每项：{ ts, segments, components, fittings, note }
  // 重做栈：当执行撤销时会把当前快照推入此栈，便于重做
  const [redoHistory, setRedoHistory] = useState([]);
  const [operationLogs, setOperationLogs] = useState([]); // 每项：{ ts, type, payload }
  const MAX_HISTORY = 30; // 限制历史深度，避免 localStorage 过大

  // 视图模式（系统 / 平面）持久化
  const VIEW_MODE_KEY = 'gasmap.viewMode';
  const [viewMode, setViewMode] = useState(() => {
    try {
      const stored = localStorage.getItem(VIEW_MODE_KEY);
      return stored === 'plane' ? 'plane' : 'system';
    } catch (_err) {
      return 'system';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_KEY, viewMode);
    } catch (_err) {
      /* noop */
    }
  }, [viewMode]);

  // Onboarding control: counter and opener to trigger onboarding tour
  const [onboardingCounter, setOnboardingCounter] = useState(0);
  const openOnboarding = () => setOnboardingCounter(c => c + 1);

  // 从localStorage加载项目数据
  useEffect(() => {
    const savedProjectsStr = localStorage.getItem('pipelineProjects');
    let parsed = [];
    try {
      parsed = savedProjectsStr ? JSON.parse(savedProjectsStr) : [];
    } catch (_err) {
      parsed = [];
    }

    if (Array.isArray(parsed) && parsed.length > 0) {
      setProjects(parsed);
      setCurrentProjectId(parsed[0].id);
      loadProjectData(parsed[0]);
    } else {
      // 启动时无任何工程：自动创建一个默认工程
      try {
        createProject('未命名工程-1');
      } catch (_err) {
            console.error('Failed to auto-create default project', _err);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当当前工程ID变化时，加载该工程的数据，避免保存导致的 projects 变化回滚当前状态
  useEffect(() => {
    if (!currentProjectId) return;
    const project = projects.find(p => p.id === currentProjectId);
    if (project) {
      loadProjectData(project);
    }
  }, [currentProjectId]);

  // 加载项目数据
  const loadProjectData = (project) => {
    setSegments(project.segments || []);
    setComponents(project.components || []);
    setFittings(project.fittings || []);
    setManualFittings(project.manualFittings || []);
    setDesignStartPoint(project.designStartPoint || { x: 200, y: 200 });
    setCurrentPoint(project.currentPoint || { x: 200, y: 200 });
    setCanvasOffset(project.canvasOffset || { x: 0, y: 0 });
    setScale(project.scale || 1);
    setShowLabels(project.showLabels !== undefined ? project.showLabels : false);
    setLabelVisibility(project.labelVisibility || { galvanized: true, blockage: true, junction: true, union: true, designStart: true });
    // 兼容旧数据：若仅存在 labelOffsets，则认为是系统图偏移
    setLabelOffsetsSystem(project.labelOffsetsSystem || project.labelOffsets || {});
    setLabelOffsetsPlane(project.labelOffsetsPlane || {});
    setHistory(project.history || []);
    setOperationLogs(project.operationLogs || []);
    setPlanComponentPositions(project.planComponentPositions || {});
    setPlanFittingPositions(project.planFittingPositions || {});
  };
  // 保存项目到localStorage
  const saveProjects = (updatedProjects) => {
    try {
      console.log('[ProjectContext] saveProjects', { count: (updatedProjects || []).length });
    } catch (_err) { /* noop */ }
    localStorage.setItem('pipelineProjects', JSON.stringify(updatedProjects));
    setProjects(updatedProjects);
  };

  // 保存当前项目
  const saveCurrentProject = () => {
    if (!currentProjectId) {
      console.error('[ProjectContext] saveCurrentProject aborted: no currentProjectId');
      return;
    }
    try { console.log('[ProjectContext] saveCurrentProject for', currentProjectId, { segments: segments.length, components: components.length, fittings: fittings.length }); } catch (_err) { /* noop */ }
    const updatedProjects = projects.map(project => {
      if (project.id === currentProjectId) {
        return {
          ...project,
          segments,
          components,
          fittings,
          manualFittings,
          designStartPoint,
          currentPoint,
          canvasOffset,
          scale,
          showLabels,
          // 为兼容旧版本，同时保存汇总字段 labelOffsets（等同系统图）
          labelOffsets: labelOffsetsSystem,
          labelOffsetsSystem,
          labelOffsetsPlane,
          labelVisibility,
          planComponentPositions,
          planFittingPositions,
          history,
          operationLogs,
          lastModified: new Date().toISOString()
        };
      }
      return project;
    });
    
    saveProjects(updatedProjects);
  };

  // 创建新项目
  // Create a new project. Optional `initialData` can pre-populate segments/components/etc.
  const createProject = (name, initialData = {}) => {
    if (!name.trim()) {
      throw new Error('项目名称不能为空');
    }

    // 基础工程配置：确保新工程具备必要的默认结构
    const defaultConfig = {
      version: 1,
      unit: 'meter',
      grid: { enabled: true, size: 10 },
      snap: { enabled: true, tolerance: 4 },
      // 比例策略：统一“现实长度→像素”映射与像素范围约束
      scalePolicy: { ...defaultScalePolicy },
      // 校准信息：记录一次标尺校准结果，便于后续导出与合并
      calibration: { done: false, unitsPerMeter: 1, reference: { worldLen: 0, meters: 0 } },
      metadata: { author: '', description: '' }
    };

    const resolvedConfig = (() => {
      if (initialData?.config && typeof initialData.config === 'object') {
        return { ...defaultConfig, ...initialData.config };
      }
      return { ...defaultConfig };
    })();

    const defaultLabelVisibility = { galvanized: true, blockage: true, junction: true, union: true, designStart: true };
    const resolvedLabelVisibility = (() => {
      if (initialData?.labelVisibility && typeof initialData.labelVisibility === 'object') {
        return { ...defaultLabelVisibility, ...initialData.labelVisibility };
      }
      return { ...defaultLabelVisibility };
    })();

    const newProject = {
      id: Date.now().toString(),
      name: name.trim(),
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
      segments: initialData.segments || [],
      components: initialData.components || [],
      fittings: initialData.fittings || [],
      manualFittings: initialData.manualFittings || [],
      planComponentPositions: initialData.planComponentPositions || {},
      planFittingPositions: initialData.planFittingPositions || {},
      designStartPoint: initialData.designStartPoint || { x: 200, y: 200 },
      currentPoint: initialData.currentPoint || { x: 200, y: 200 },
      canvasOffset: initialData.canvasOffset || { x: 0, y: 0 },
      scale: typeof initialData.scale === 'number' ? initialData.scale : 1,
      showLabels: initialData.showLabels !== undefined ? initialData.showLabels : false,
      // 兼容字段：保留 labelOffsets 但内部使用按视图拆分
      labelOffsets: initialData.labelOffsets || {},
      labelOffsetsSystem: initialData.labelOffsetsSystem || initialData.labelOffsets || {},
      labelOffsetsPlane: initialData.labelOffsetsPlane || {},
      labelVisibility: resolvedLabelVisibility,
      config: resolvedConfig,
      history: [],
      operationLogs: []
    };

    const updatedProjects = [...projects, newProject];
    saveProjects(updatedProjects);
    console.log('[ProjectContext] createProject created', { id: newProject.id, totalProjects: updatedProjects.length });
    setCurrentProjectId(newProject.id);
    loadProjectData(newProject);
    // 标记：新建工程需要居中当前设计起点到屏幕中心
    setShouldCenterOnNewProject(true);
    return newProject;
  };

  // 删除项目
  const deleteProject = (projectId) => {
    const updatedProjects = projects.filter(p => p !== null && p.id !== projectId);
    saveProjects(updatedProjects);

    if (currentProjectId === projectId) {
      if (updatedProjects.length > 0) {
        setCurrentProjectId(updatedProjects[0].id);
        loadProjectData(updatedProjects[0]);
      } else {
        setCurrentProjectId(null);
        // 重置所有状态
        setSegments([]);
        setComponents([]);
        setFittings([]);
        setManualFittings([]);
        setDesignStartPoint({ x: 200, y: 200 });
        setCurrentPoint({ x: 200, y: 200 });
        setCanvasOffset({ x: 0, y: 0 });
        setScale(1);
        setShowLabels(false);
        setHistory([]);
        setOperationLogs([]);
        setPlanComponentPositions({});
        setPlanFittingPositions({});
      }
    }
  };

  // 重命名项目
  const renameProject = (projectId, newName) => {
    if (!newName.trim()) {
      throw new Error('项目名称不能为空');
    }

    const updatedProjects = projects.map(p => {
      if (p.id === projectId) {
        return {
          ...p,
          name: newName.trim(),
          lastModified: new Date().toISOString()
        };
      }
      return p;
    });

    saveProjects(updatedProjects);
  };

  // 获取当前项目
  const getCurrentProject = () => {
    return projects.find(p => p.id === currentProjectId) || null;
  };

  // 便捷方法：添加/移除手动支撑件
  const addManualFitting = (item) => {
    setManualFittings(prev => [...prev, item]);
    saveCurrentProject();
  };

  const removeManualFittingById = (id) => {
    setManualFittings(prev => prev.filter(i => i.id !== id));
    saveCurrentProject();
  };

  // 平面视图覆盖位置信息维护
  const updatePlanComponentPosition = (id, position) => {
    if (!id) return;
    setPlanComponentPositions(prev => {
      const current = prev || {};
      const shouldRemove = !position || !Number.isFinite(position.x) || !Number.isFinite(position.y);
      if (shouldRemove) {
        if (!(id in current)) return current;
        const { [id]: _ignored, ...rest } = current;
        return rest;
      }
      const nextPos = { x: position.x, y: position.y };
      const existing = current[id];
      if (existing && Math.abs(existing.x - nextPos.x) < 1e-9 && Math.abs(existing.y - nextPos.y) < 1e-9) {
        return current;
      }
      return { ...current, [id]: nextPos };
    });
  };

  const updatePlanFittingPosition = (id, position) => {
    if (!id) return;
    setPlanFittingPositions(prev => {
      const current = prev || {};
      const shouldRemove = !position || !Number.isFinite(position.x) || !Number.isFinite(position.y);
      if (shouldRemove) {
        if (!(id in current)) return current;
        const { [id]: _ignored, ...rest } = current;
        return rest;
      }
      const nextPos = { x: position.x, y: position.y };
      const existing = current[id];
      if (existing && Math.abs(existing.x - nextPos.x) < 1e-9 && Math.abs(existing.y - nextPos.y) < 1e-9) {
        return current;
      }
      return { ...current, [id]: nextPos };
    });
  };

  const clearPlanViewOverrides = () => {
    setPlanComponentPositions({});
    setPlanFittingPositions({});
  };

  // 数据校验函数
  const validateProjectData = (data) => {
    const errors = [];
    
    // 检查必需字段
    if (!data || typeof data !== 'object') {
      errors.push('数据格式无效');
      return { isValid: false, errors };
    }

    if (!data.name || typeof data.name !== 'string') {
      errors.push('工程名称无效');
    }

    if (!data.version) {
      errors.push('缺少版本信息');
    }

    // 检查数组字段
    const arrayFields = ['segments', 'components', 'fittings', 'manualFittings'];
    arrayFields.forEach(field => {
      if (data[field] && !Array.isArray(data[field])) {
        errors.push(`${field} 字段格式无效`);
      }
    });

    // 检查坐标点
    const pointFields = ['designStartPoint', 'currentPoint', 'canvasOffset'];
    pointFields.forEach(field => {
      if (data[field]) {
        const point = data[field];
        if (typeof point !== 'object' || 
            typeof point.x !== 'number' || 
            typeof point.y !== 'number') {
          errors.push(`${field} 坐标格式无效`);
        }
      }
    });

    // 检查数值字段
    if (data.scale && (typeof data.scale !== 'number' || data.scale <= 0)) {
      errors.push('缩放比例无效');
    }

    if (data.planComponentPositions && typeof data.planComponentPositions !== 'object') {
      errors.push('planComponentPositions 格式无效');
    }
    if (data.planFittingPositions && typeof data.planFittingPositions !== 'object') {
      errors.push('planFittingPositions 格式无效');
    }
    if (data.labelOffsetsSystem && typeof data.labelOffsetsSystem !== 'object') {
      errors.push('labelOffsetsSystem 格式无效');
    }
    if (data.labelOffsetsPlane && typeof data.labelOffsetsPlane !== 'object') {
      errors.push('labelOffsetsPlane 格式无效');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  };

  // 导出工程数据
  const exportProject = (projectId = null) => {
    try {
      const targetProject = projectId 
        ? projects.find(p => p.id === projectId)
        : getCurrentProject();

      if (!targetProject) {
        throw new Error('未找到要导出的工程');
      }

      // 构建导出数据结构
      const exportData = {
        // 基本信息
        name: targetProject.name,
        version: targetProject.version || 1,
        exportedAt: new Date().toISOString(),
        exportedBy: 'GasMap',
        
        // 工程配置
        config: targetProject.config || {
          version: 1,
          unit: 'meter',
          grid: { enabled: true, size: 10 },
          snap: { enabled: true, tolerance: 4 },
          display: { theme: 'light' },
          scalePolicy: { ...defaultScalePolicy },
          calibration: { done: false, unitsPerMeter: 1, reference: { worldLen: 0, meters: 0 } },
          metadata: { author: '', description: '' }
        },

        // 工程数据
        segments: targetProject.segments || [],
        components: targetProject.components || [],
        fittings: targetProject.fittings || [],
        manualFittings: targetProject.manualFittings || [],
        planComponentPositions: targetProject.planComponentPositions || {},
        planFittingPositions: targetProject.planFittingPositions || {},
        
        // 视图状态
        designStartPoint: targetProject.designStartPoint || { x: 200, y: 200 },
        currentPoint: targetProject.currentPoint || { x: 200, y: 200 },
        canvasOffset: targetProject.canvasOffset || { x: 0, y: 0 },
        scale: targetProject.scale || 1,
        showLabels: targetProject.showLabels || false,
        // 同步导出三种形式以兼容历史数据与新特性
        labelOffsets: targetProject.labelOffsetsSystem || targetProject.labelOffsets || {},
        labelOffsetsSystem: targetProject.labelOffsetsSystem || {},
        labelOffsetsPlane: targetProject.labelOffsetsPlane || {},
        labelVisibility: targetProject.labelVisibility || { galvanized: true, blockage: true, junction: true, union: true, designStart: true },

        // 元数据
        metadata: {
          createdAt: targetProject.createdAt,
          lastModified: targetProject.lastModified,
          originalId: targetProject.id
        }
      };

      // 验证导出数据
      const validation = validateProjectData(exportData);
      if (!validation.isValid) {
        throw new Error(`数据校验失败: ${validation.errors.join(', ')}`);
      }

      // 创建下载
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${targetProject.name}_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return { success: true, message: '工程导出成功' };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  // 导入工程数据
  const importProject = (file) => {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('请选择要导入的文件'));
        return;
      }

      if (!file.name.toLowerCase().endsWith('.json')) {
        reject(new Error('请选择JSON格式的文件'));
        return;
      }

      const reader = new FileReader();
      
      reader.onload = (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          
          // 验证导入数据
          const validation = validateProjectData(jsonData);
          if (!validation.isValid) {
            reject(new Error(`数据校验失败: ${validation.errors.join(', ')}`));
            return;
          }

          // 检查是否存在同名工程
          let importName = jsonData.name;
          let counter = 1;
          while (projects.some(p => p.name === importName)) {
            importName = `${jsonData.name}_导入${counter}`;
            counter++;
          }

          // 规范化导入数据（重建连接关系、生成新ID、清理覆盖位置信息）
          const normalized = normalizeProjectData(jsonData);

          // 创建新工程
          const newProject = {
            id: Date.now().toString(),
            name: importName,
            createdAt: new Date().toISOString(),
            lastModified: new Date().toISOString(),
            version: normalized.version || jsonData.version || 1,
            
            // 导入的工程数据
            segments: normalized.segments || [],
            components: normalized.components || [],
            fittings: normalized.fittings || [],
            manualFittings: normalized.manualFittings || jsonData.manualFittings || [],
            planComponentPositions: normalized.planComponentPositions || {},
            planFittingPositions: normalized.planFittingPositions || {},
            
            // 视图状态
            designStartPoint: normalized.designStartPoint || jsonData.designStartPoint || { x: 200, y: 200 },
            currentPoint: normalized.currentPoint || jsonData.currentPoint || { x: 200, y: 200 },
            canvasOffset: { x: 0, y: 0 },
            scale: 1,
            showLabels: Boolean(jsonData.showLabels),
            labelOffsets: jsonData.labelOffsets || {},
            labelOffsetsSystem: jsonData.labelOffsetsSystem || jsonData.labelOffsets || {},
            labelOffsetsPlane: jsonData.labelOffsetsPlane || {},
            labelVisibility: jsonData.labelVisibility || { galvanized: true, blockage: true, junction: true, union: true, designStart: true },

            // 配置信息
            config: jsonData.config || {
              version: 1,
              unit: 'meter',
              grid: { enabled: true, size: 10 },
              snap: { enabled: true, tolerance: 4 },
              display: { theme: 'light' },
              scalePolicy: { ...defaultScalePolicy },
              calibration: { done: false, unitsPerMeter: 1, reference: { worldLen: 0, meters: 0 } },
              metadata: { author: '', description: '' }
            },
            history: jsonData.history || [],
            operationLogs: jsonData.operationLogs || []
          };

          // 保存新工程
          const updatedProjects = [...projects, newProject];
          saveProjects(updatedProjects);
          
          // 切换到导入的工程
          setCurrentProjectId(newProject.id);
          loadProjectData(newProject);

          resolve({ 
            success: true, 
            message: `工程 "${importName}" 导入成功`,
            project: newProject 
          });
        } catch (error) {
          reject(new Error('文件格式错误，请检查JSON文件是否有效'));
        }
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsText(file);
    });
  };

  // 版本历史: 推入
  const pushHistory = (note = '') => {
    const snapshot = {
      ts: new Date().toISOString(),
      note,
      segments: JSON.parse(JSON.stringify(segments)),
      components: JSON.parse(JSON.stringify(components)),
      fittings: JSON.parse(JSON.stringify(fittings))
    };
    setHistory(prev => {
      const next = [...prev, snapshot];
      return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
    });
    // 新的历史分支加入后，清空 redo 栈（常见行为：任何新的操作都会使 redo 失效）
    setRedoHistory([]);
  };

  // 版本历史: 撤销
  const undoLast = () => {
    // 在撤销前，将当前快照推入 redo 栈，以便后续进行重做
    const currentSnap = {
      ts: new Date().toISOString(),
      note: 'pre-undo-snapshot',
      segments: JSON.parse(JSON.stringify(segments)),
      components: JSON.parse(JSON.stringify(components)),
      fittings: JSON.parse(JSON.stringify(fittings))
    };
    setRedoHistory(prevRedo => [...prevRedo, currentSnap]);

    setHistory(prev => {
      if (!prev || prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setSegments(last.segments || []);
      setComponents(last.components || []);
      setFittings(last.fittings || []);
      const rest = prev.slice(0, prev.length - 1);
      // 立即保存当前项目（撤销后）
      setTimeout(saveCurrentProject, 0);
      return rest;
    });
  };

  // 版本历史: 重做（将 redo 栈顶部快照重新应用）
  const redoLast = () => {
    setRedoHistory(prev => {
      if (!prev || prev.length === 0) return prev;
      const lastRedo = prev[prev.length - 1];

      // 应用 redo 快照
      setSegments(lastRedo.segments || []);
      setComponents(lastRedo.components || []);
      setFittings(lastRedo.fittings || []);

      // 将该快照也推回到 history 中，形成可继续撤销的记录
      setHistory(h => {
        const snap = {
          ts: new Date().toISOString(),
          note: 'redo-applied',
          segments: JSON.parse(JSON.stringify(lastRedo.segments)),
          components: JSON.parse(JSON.stringify(lastRedo.components)),
          fittings: JSON.parse(JSON.stringify(lastRedo.fittings))
        };
        const next = [...h, snap];
        return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
      });

      // 立即保存当前项目（重做后）
      setTimeout(saveCurrentProject, 0);

      return prev.slice(0, prev.length - 1);
    });
  };

  // 操作日志：记录
  const logOperation = (type, payload) => {
    const op = {
      ts: new Date().toISOString(),
      type,
      payload: {
        operator: (localStorage.getItem('gasmap.username') || 'anonymous'),
        ...payload
      }
    };
    setOperationLogs(prev => [...prev, op]);
  };

  // 导出上下文值
  // 许可证与版本配置（从配置文件读取）
  const LICENSE_KEY = 'gasmap_subscription_version';
  const EXPIRY_KEY = 'gasmap_subscription_expiry';

  const [licenseVersion, setLicenseVersion] = useState('trial');
  const [subscriptionExpiry, setSubscriptionExpiry] = useState('');

  // 初始化许可证信息
  useEffect(() => {
    try {
      const storedVersion = localStorage.getItem(LICENSE_KEY);
      const storedExpiry = localStorage.getItem(EXPIRY_KEY);
      if (storedVersion && storedExpiry) {
        const ts = parseInt(storedExpiry, 10);
        if (!Number.isNaN(ts) && ts > Date.now()) {
          setLicenseVersion(storedVersion in versionFeatures ? storedVersion : 'trial');
          setSubscriptionExpiry(new Date(ts).toISOString().split('T')[0]);
          return;
        }
      }
      // default to trial
      setLicenseVersion('trial');
    } catch (e) {
        console.warn('[ProjectContext] failed to load license info', e);
    }
  }, []);

  const activateVersion = (versionKey, expiryDateString) => {
    try {
      const expiryDate = new Date(expiryDateString + 'T23:59:59');
      const expiryTs = expiryDate.getTime();
      localStorage.setItem(LICENSE_KEY, versionKey);
      localStorage.setItem(EXPIRY_KEY, String(expiryTs));
      setLicenseVersion(versionKey in versionFeatures ? versionKey : 'trial');
      setSubscriptionExpiry(expiryDateString);
      return true;
    } catch (e) {
      console.error('[ProjectContext] activateVersion failed', e);
      return false;
    }
  };

  const getVersionConfig = (versionKey) => {
    try {
      const base = versionFeatures?.base?.features || {};
      const ver = versionFeatures[versionKey] || null;
      if (!ver) return null;
      // Deep-merge base.features with version-specific features (version overrides/additions)
      const merged = JSON.parse(JSON.stringify(base));
      const vfeats = ver.features || {};
      Object.keys(vfeats).forEach(group => {
        merged[group] = merged[group] || {};
        const sub = vfeats[group] || {};
        Object.keys(sub).forEach(key => {
          merged[group][key] = sub[key];
        });
      });
      return { ...ver, features: merged };
    } catch (e) {
      return versionFeatures[versionKey] || null;
    }
  };

  const isFeatureEnabled = (group, key, versionKey = licenseVersion) => {
    try {
      const cfg = getVersionConfig(versionKey) || getVersionConfig('trial');
      return !!(cfg?.features?.[group] && cfg.features[group][key]);
    } catch (_e) {
      return false;
    }
  };
  const value = {
    // 状态
    projects,
    currentProject: getCurrentProject(),
    showProjectList,

    // 项目数据状态
    segments,
    components,
    fittings,
    manualFittings,
    designStartPoint,
    currentPoint,
    canvasOffset,
    scale,
    showLabels,
    labelOffsetsSystem,
    labelOffsetsPlane,
    labelVisibility,
    planComponentPositions,
    planFittingPositions,
    shouldCenterOnNewProject,
    uiMode,
    insertDeviceType,
    insertOptions,
    history,
    operationLogs,
    viewMode,

    // 状态更新方法
    setShowProjectList,
    setCurrentProjectId,
    setSegments,
    setComponents,
    setFittings,
    setManualFittings,
    setDesignStartPoint,
    setCurrentPoint,
    setCanvasOffset,
    setScale,
    setShowLabels,
    setLabelOffsetsSystem,
    setLabelOffsetsPlane,
    setLabelVisibility,
    updatePlanComponentPosition,
    updatePlanFittingPosition,
    clearPlanViewOverrides,
    setShouldCenterOnNewProject,
    setUiMode,
    setInsertDeviceType,
    setInsertOptions,
    setViewMode,

    // 项目操作方法
    createProject,
    deleteProject,
    renameProject,
    saveCurrentProject,
    loadProjectData,
    addManualFitting,
    removeManualFittingById,
    
    // 导入导出方法
    exportProject,
    importProject,
    validateProjectData,

    // 历史与日志
    pushHistory,
    undoLast,
    redoLast,
    redoHistory,
    logOperation
    ,
    // 版本/许可证信息
    licenseVersion,
    subscriptionExpiry,
    activateVersion,
    getVersionConfig,
    isFeatureEnabled,
    versionFeatures
    ,
    // onboarding control
    onboardingCounter,
    openOnboarding
  };

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
};

/**
 * 使用项目上下文的Hook
 * @returns {Object} 项目上下文值
 */
export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};