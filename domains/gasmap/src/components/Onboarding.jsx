import { useEffect, useRef } from 'react';
import { driver } from "driver.js";
import "driver.js/dist/driver.css";

import { useProject } from '../contexts/ProjectContext.jsx';
import onboardingConfig from '../config/onboarding.json' with { type: 'json' };

const STORAGE_KEY = 'gm_onboarding_shown_v1';
const ENTERPRISE_MODE_KEY = 'gm_enterprise_mode';
const ORIGINAL_VERSION_KEY = 'gm_original_version_before_enterprise';

export default function Onboarding() {
  const driverObjRef = useRef(null);
  const { licenseVersion, activateVersion } = useProject();
  const originalVersionRef = useRef(null);

  useEffect(() => {
    // 检查是否已经显示过
    let shouldShow = false;
    try {
      const flag = window.localStorage.getItem(STORAGE_KEY);
      if (!flag) shouldShow = true;
    } catch (e) { 
      shouldShow = true; 
    }

    // 配置 driver.js
    const steps = (onboardingConfig && onboardingConfig.steps) || [];
    const driverSteps = steps.map((step, index) => {
      const driverStep = {
        popover: {
          title: step.title,
          description: step.body,
          // 禁用箭头显示，只保留高亮效果
          showArrow: false,
          // 合并 JSON 配置中的 popover 设置（side, align 等）
          ...(step.popover || {})
        }
      };
      
      // 如果有 selector，添加 element 属性
      if (step.selector) {
        driverStep.element = step.selector;
        
        // 为特定步骤添加 onHighlightStarted 回调，确保目标元素可见
        driverStep.onHighlightStarted = () => {
          const selector = step.selector;
          
          // 对于工程列表按钮，打开下拉菜单
          if (selector === '#gm-btn-project-name') {
            const projectNameBtn = document.querySelector('#gm-btn-project-name');
            if (projectNameBtn) {
              projectNameBtn.click();
              // 等待下拉菜单展开
              return new Promise(resolve => setTimeout(resolve, 350));
            }
          }
          
          // 对于项目列表相关的按钮（导入、合并），确保下拉菜单已打开
          if (selector === '#gm-btn-import-project' || selector === '#gm-btn-merge-projects') {
            return new Promise(resolve => {
              // 检查下拉菜单是否已经打开
              const projectListPanel = document.querySelector('#gm-btn-project-name')?.closest('div')?.querySelector('div[style*="max-height"]');
              const isPanelOpen = projectListPanel && projectListPanel.style.maxHeight !== '0px';
              
              if (!isPanelOpen) {
                // 如果面板未打开，打开它
                const projectNameBtn = document.querySelector('#gm-btn-project-name');
                if (projectNameBtn) {
                  projectNameBtn.click();
                }
              }
              
              // 等待面板展开（或已经打开的情况下等待一小段时间）
              setTimeout(() => {
                // 对于合并按钮，临时移除 disabled 属性以便高亮
                if (selector === '#gm-btn-merge-projects') {
                  const mergeBtn = document.querySelector('#gm-btn-merge-projects');
                  if (mergeBtn) {
                    mergeBtn.removeAttribute('disabled');
                    // 保存原始样式
                    mergeBtn.setAttribute('data-onboarding-temp', 'true');
                  }
                }
                resolve();
              }, isPanelOpen ? 100 : 350);
            });
          }
          
          // 对于导出相关的按钮，先打开数据面板
          if (selector === '#gm-btn-export-statistics' || 
              selector === '#gm-btn-export-design' || 
              selector === '#gm-btn-export-drawing' || 
              selector === '#gm-btn-export-project') {
            // 先点击数据面板按钮打开面板
            const dataPanelBtn = document.querySelector('#gm-btn-data-panel');
            if (dataPanelBtn) {
              // 检查面板是否已经打开
              const panel = document.querySelector('#gm-live-center-zone > div:nth-child(2)');
              const isOpen = panel && panel.style.maxHeight !== '0px';
              if (!isOpen) {
                dataPanelBtn.click();
                // 等待面板展开
                return new Promise(resolve => setTimeout(resolve, 350));
              }
            }
          }
          
          return Promise.resolve();
        };
        
        // 添加 onDeselected 回调，在离开某些步骤时关闭下拉菜单
        driverStep.onDeselected = () => {
          const selector = step.selector;
          
          // 只有在离开合并按钮步骤后才关闭项目列表下拉，而不是在工程列表或导入按钮步骤后关闭
          if (selector === '#gm-btn-merge-projects') {
            // 恢复合并按钮的 disabled 状态
            const mergeBtn = document.querySelector('#gm-btn-merge-projects');
            if (mergeBtn && mergeBtn.getAttribute('data-onboarding-temp') === 'true') {
              mergeBtn.removeAttribute('data-onboarding-temp');
              // 让 React 重新控制按钮状态，通过触发一个微小的更新
              // 实际上应该由 LiveDock 组件根据 canMerge 自动管理
            }
            
            // 延迟关闭项目列表下拉菜单
            setTimeout(() => {
              const projectNameBtn = document.querySelector('#gm-btn-project-name');
              if (projectNameBtn) {
                projectNameBtn.click();
              }
            }, 100);
          }
          
          // 离开工程列表步骤后，不要关闭下拉，因为下一步可能是导入或合并按钮
          // 只需确保面板保持打开状态
          
          // 离开最后一个导出按钮步骤后，关闭数据面板
          if (selector === '#gm-btn-export-project') {
            setTimeout(() => {
              const dataPanelBtn = document.querySelector('#gm-btn-data-panel');
              if (dataPanelBtn) {
                dataPanelBtn.click();
              }
            }, 100);
          }
        };
      }
      
      return driverStep;
    });

    driverObjRef.current = driver({
      showProgress: true,
      showButtons: ['next', 'previous', 'close'],
      nextBtnText: '下一步',
      prevBtnText: '上一步',
      doneBtnText: '完成',
      closeBtnText: '×',
      progressText: '{{current}} / {{total}}',
      popoverClass: 'gm-onboarding-popover-no-arrow',
      onDestroyStarted: () => {
        // 引导结束前，恢复原始版本
        try {
          const originalVersion = originalVersionRef.current;
          if (originalVersion && originalVersion !== 'enterprise') {
            // 直接通过 activateVersion 恢复原始版本，无需刷新
            // 设置一个长期有效的过期时间
            const futureExpiry = new Date();
            futureExpiry.setFullYear(futureExpiry.getFullYear() + 100);
            const expiryDateString = futureExpiry.toISOString().split('T')[0];
            activateVersion(originalVersion, expiryDateString);
            
            // 清理标记
            window.localStorage.removeItem(ENTERPRISE_MODE_KEY);
            window.localStorage.removeItem(ORIGINAL_VERSION_KEY);
            originalVersionRef.current = null;
          }
        } catch (e) {
          console.error('Failed to restore original version:', e);
        }
        
        // 当用户完成或关闭教程时，标记为已显示
        try {
          window.localStorage.setItem(STORAGE_KEY, 'true');
        } catch (e) {}
        
        if (!driverObjRef.current.hasNextStep()) {
          driverObjRef.current.destroy();
        }
      },
      steps: driverSteps
    });

    // 如果应该显示，启动教程
    if (shouldShow) {
      // 检查是否已经在 enterprise 模式
      try {
        const inEnterpriseMode = window.localStorage.getItem(ENTERPRISE_MODE_KEY);
        
        // 如果还不在 enterprise 模式，需要切换
        if (!inEnterpriseMode && licenseVersion !== 'enterprise') {
          // 保存原始版本到 ref
          originalVersionRef.current = licenseVersion;
          window.localStorage.setItem(ORIGINAL_VERSION_KEY, licenseVersion);
          
          // 直接通过 activateVersion 切换到 enterprise 版本，无需刷新
          // 设置一个长期有效的过期时间
          const futureExpiry = new Date();
          futureExpiry.setFullYear(futureExpiry.getFullYear() + 100);
          const expiryDateString = futureExpiry.toISOString().split('T')[0];
          activateVersion('enterprise', expiryDateString);
          
          window.localStorage.setItem(ENTERPRISE_MODE_KEY, 'true');
          
          // 等待状态更新后再启动引导
          setTimeout(() => {
            if (driverObjRef.current) {
              driverObjRef.current.drive();
            }
          }, 100);
          return;
        }
        
        // 已经在 enterprise 模式，直接启动引导
        setTimeout(() => {
          if (driverObjRef.current) {
            driverObjRef.current.drive();
          }
        }, 500);
      } catch (e) {
        console.error('Failed to switch to enterprise version:', e);
        // 即使切换失败也启动引导
        driverObjRef.current.drive();
      }
    }

    // Allow other parts of the app to open onboarding by dispatching a window event
    const handler = () => {
      if (driverObjRef.current) {
        // 手动触发时也需要切换版本
        try {
          const inEnterpriseMode = window.localStorage.getItem(ENTERPRISE_MODE_KEY);
          
          if (!inEnterpriseMode && licenseVersion !== 'enterprise') {
            // 保存原始版本并切换
            originalVersionRef.current = licenseVersion;
            window.localStorage.setItem(ORIGINAL_VERSION_KEY, licenseVersion);
            
            // 直接通过 activateVersion 切换到 enterprise
            const futureExpiry = new Date();
            futureExpiry.setFullYear(futureExpiry.getFullYear() + 100);
            const expiryDateString = futureExpiry.toISOString().split('T')[0];
            activateVersion('enterprise', expiryDateString);
            
            window.localStorage.setItem(ENTERPRISE_MODE_KEY, 'true');
            
            // 等待状态更新
            setTimeout(() => {
              if (driverObjRef.current) {
                driverObjRef.current.drive();
              }
            }, 100);
            return;
          }
        } catch (e) {
          console.error('Failed to switch to enterprise version:', e);
        }
        
        driverObjRef.current.drive();
      }
    };
    
    try {
      window.addEventListener('openOnboarding', handler);
    } catch (e) { /* ignore */ }
    
    return () => {
      try { 
        window.removeEventListener('openOnboarding', handler);
        if (driverObjRef.current) {
          driverObjRef.current.destroy();
        }
      } catch (e) {}
    };
  }, [licenseVersion, activateVersion]);

  // driver.js 会处理所有的渲染，所以不需要返回任何 JSX
  return null;
}
