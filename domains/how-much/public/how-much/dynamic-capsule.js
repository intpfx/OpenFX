class DynamicCapsule extends HTMLElement {
  // 添加报告阈值常量，用于判断价格数据有效性
  static REPORT_THRESHOLD = 5;

  static get observedAttributes() {
    return ["ui-state"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    // 默认状态为 search
    this.currentState = "search";
    this.supportsViewTransition = "startViewTransition" in document;
    // 初始化数据存储
    this.data = {
      suggestions: [],
      productInfo: null,
      locationData: null,
      priceData: [], // 添加价格数据存储
    };
    // 添加通知状态存储
    this.notifications = {
      uploadSuccess: false,
      uploadError: false,
      reportSuccess: false,
      reportError: false,
    };
    // 添加视图转换锁，防止并发视图转换
    this.viewTransitionLock = false;
    this.transitionQueue = [];
    this.render();
  }

  async connectedCallback() {
    if (!this.hasAttribute("ui-state")) {
      this.setAttribute("ui-state", "search");
    }

    // 不再需要地图组件位置相关的事件监听
    this.setupEventListeners();

    // 页面加载完成后立即获取当前位置
    await this.fetchCurrentLocation();
  }

  disconnectedCallback() {
    // 在组件销毁时清理所有事件监听器
    this._cleanupEventListeners();
  }

  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === "ui-state") {
      this.currentState = newValue;
      this.applyStateChange();
    }
  }

  // 保存事件监听器引用，方便后续移除
  _eventListeners = {
    search: {},
    product: {},
    form: {},
    prices: {}, // 添加价格浮窗状态的事件监听器
  };

  render() {
    const css = /*html*/ `
    <style>
      :host {
        display: block;
        width: 100%;
        max-width: 24rem;
        position: fixed;
        transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      }
      
      /* 搜索状态：整体垂直居中 */
      :host([ui-state="search"]) {
        top: 50%;
        transform: translateY(-50%);
      }
      
      /* 结果、上传、价格状态和通知状态：底部固定定位 */
      :host([ui-state="results"]),
      :host([ui-state="upload"]),
      :host([ui-state="prices"]),
      :host([ui-state="upload-success"]),
      :host([ui-state="upload-error"]),
      :host([ui-state="report-success"]),
      :host([ui-state="report-error"]) {
        bottom: 1.25rem;
        top: auto;
      }

      /* 隐藏所有滚动条 */
      ::-webkit-scrollbar {
        display: none;
      }

      .component-container {
        position: relative;
        width: 100%;
      }

      .glass-effect {
        background: rgba(255, 255, 255, 0.75);
        backdrop-filter: blur(0.75rem);
        -webkit-backdrop-filter: blur(0.75rem);
        border-radius: 1.125rem;
        box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.9);
        transition: all 0.2s ease;
      }

      /* 价格浮窗样式 - 更接近上传形态 */
      .price-popup {
        position: absolute;
        display: none;
        visibility: hidden;
        opacity: 0;
        width: 92%;
        max-width: 22rem;
        margin: 0 auto;
        left: 0;
        right: 0;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(0.75rem);
        -webkit-backdrop-filter: blur(0.75rem);
        border-radius: 1.125rem;
        box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.1);
        z-index: 1000;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        transform: scale(0.7) translateY(1.875rem);
        border: 0.5px solid rgba(255, 255, 255, 0.9);
        pointer-events: none;
      }
      
      /* 价格浮窗可见状态 */
      :host([ui-state="prices"]) .price-popup {
        display: block;
        visibility: visible;
        opacity: 1;
        transform: scale(1) translateY(-100%);
        max-height: 90dvh;
        pointer-events: auto;
        z-index: 3;
      }
      
      .popup-container {
        padding: 0;
        overflow-y: auto;
        max-height: 90dvh; /* 明确设置最大高度匹配父元素 */
        height: 100%;
        -webkit-overflow-scrolling: touch; /* 为iOS设备提供平滑滚动 */
      }
      
      .popup-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 1.125rem;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
      }
      
      .popup-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: #333;
        display: flex;
        align-items: center;
        letter-spacing: 0.01em;
      }
      
      .city-name {
        margin-right: 6px;
        color: #0070F3;
      }
      
      .close-button-popup {
        background: none;
        border: none;
        font-size: 1.125rem;
        color: #888;
        cursor: pointer;
        padding: 0.1875rem;
        border-radius: 50%;
        width: 1.75rem;
        height: 1.75rem;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-button-popup:hover {
        background-color: rgba(0, 0, 0, 0.04);
        color: #333;
      }
      
      .chart-section {
        padding: 1rem;
        height: 180px;
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        position: relative;
      }
      
      .chart-container {
        width: 100%;
        height: 100%;
      }
      
      .no-data-message {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #999;
        font-size: 14px;
        text-align: center;
      }
      
      .stats-section {
        padding: 1rem 1.125rem;
      }
      
      .stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.875rem;
      }
      
      .stat-card {
        background: rgba(240, 240, 240, 0.5);
        border-radius: 0.625rem;
        padding: 0.875rem;
        display: flex;
        flex-direction: column;
      }
      
      .stat-label {
        font-size: 0.875rem;
        color: #666;
        margin-bottom: 0.25rem;
        font-weight: 500;
      }
      
      .stat-value {
        font-size: 1.125rem;
        font-weight: 600;
        color: #333;
      }
      
      .stat-value.highest {
        color: #E53E3E;
      }
      
      .stat-value.lowest {
        color: #38A169;
      }
      
      .stat-value.average {
        color: #3182CE;
      }
      
      .stat-value.latest {
        color: #805AD5;
      }

      .price-item {
        border-bottom: 1px solid rgba(0, 0, 0, 0.05);
        padding: 0.75rem 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .price-details {
        flex: 1;
      }

      .price-value {
        font-weight: 600;
        color: #333;
        font-size: 1rem;
      }

      .price-date {
        color: #666;
        font-size: 0.875rem;
        margin-top: 0.25rem;
      }

      .price-note {
        color: #666;
        font-style: italic;
        font-size: 0.875rem;
        margin-top: 0.25rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 200px;
      }

      .report-button {
        background-color: #f8f9fa;
        border: none;
        border-radius: 0.5rem;
        padding: 0.375rem 0.75rem;
        font-size: 0.875rem;
        color: #666;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .report-button:hover {
        background-color: #f1f3f5;
        color: #E53E3E;
      }

      .report-button.reported {
        background-color: #FED7D7;
        color: #E53E3E;
      }

      .invalid-price {
        opacity: 0.6;
        position: relative;
      }

      .invalid-price::after {
        content: "数据无效";
        position: absolute;
        right: 1rem;
        top: 50%;
        transform: translateY(-50%);
        background-color: #FED7D7;
        color: #E53E3E;
        padding: 0.25rem 0.5rem;
        border-radius: 0.25rem;
        font-size: 0.75rem;
      }
      
      /* 搜索形态 */
      .search-container {
        width: 92%;
        max-width: 22rem;
        margin: 0 auto;
        position: absolute;
        left: 0;
        right: 0;
        opacity: 0;
        transform: scale(0.7);
        transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1;
        pointer-events: none;
        display: none;
      }
      
      :host([ui-state="search"]) .search-container {
        opacity: 1;
        transform: scale(1);
        pointer-events: auto;
        z-index: 3;
        display: block;
      }

      .search-input-container {
        width: 100%;
      }
      
      .search-input {
        width: 100%;
        height: 3.25rem;
        padding: 1.5rem;
        border-radius: 9999px;
        border: none;
        outline: none;
        font-size: 1rem;
        box-sizing: border-box;
        letter-spacing: 0.01em;
        font-weight: 400;
        color: #333;
      }
      
      .search-input::placeholder {
        color: #999;
        opacity: 0.8;
      }
      
      .search-input:focus {
        box-shadow: 0 0.125rem 0.75rem rgba(0, 0, 0, 0.08);
      }

      .search-suggestions {
        position: absolute;
        width: 100%;
        bottom: 100%;
        margin-bottom: 0.5rem;
        padding: 0.875rem;
        z-index: 10;
        opacity: 0;
        transform: translateY(0.625rem);
        display: none;
      }
      
      /* 当显示时执行建议出现动画 */
      .search-suggestions.show {
        display: block;
        animation: suggestionAppear 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      }
      
      @keyframes suggestionAppear {
        from {
          opacity: 0;
          transform: translateY(0.625rem) scale(0.95);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      
      .suggestion-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4375rem;
      }
      
      .chip {
        padding: 0.4375rem 0.875rem;
        background-color: rgba(224, 231, 255, 0.85);
        border-radius: 1.125rem;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s ease;
        border: 0.5px solid rgba(255, 255, 255, 0.8);
      }
      
      .chip:hover {
        background-color: rgba(214, 222, 255, 0.9);
        transform: translateY(-1px);
      }

      /* 结果胶囊（模拟笔记卡片） */
      .result-capsule {
        width: 92%;
        max-width: 22rem;
        position: relative;
        margin: 0 auto;
        opacity: 0;
        transform: scale(0.7) translateY(1.875rem);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1;
        pointer-events: none;
        display: none;
      }
      
      :host([ui-state="results"]) .result-capsule {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
        z-index: 3;
        display: block;
      }

      .capsule-container {
        box-sizing: border-box;
        background: rgba(255, 255, 255, 0.78);
        backdrop-filter: blur(0.75rem);
        -webkit-backdrop-filter: blur(0.75rem);
        border-radius: 9999px;
        padding: 0.4375rem 1.125rem;
        box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        border: 0.5px solid rgba(255, 255, 255, 0.9);
      }
      
      .product-name {
        padding: 0.5rem 1rem;
        border: 2px solid rgba(0, 0, 0, 0.05);
        border-radius: 9999px;
        font-size: 1rem;
        font-weight: 500;
        display: flex;
        align-items: center;
        cursor: pointer;
        color: #333;
        letter-spacing: 0.01em;
        transition: all 0.2s ease;
      }
      
      .product-name:hover {
        color: #0056D6;
      }
      
      .upload-button {
        font-size: 2rem;
        width: 1.75em;
        height: 1.75em;
        background-color: transparent;
        display: grid;
        place-items: center;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        line-height: 0;
        padding: 0;
        margin-left: 0.125rem;
        color: #888;
      }
      
      .upload-button:hover {
        transform: scale(1.05);
        color: #0056D6;
      }
      
      .upload-button span {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      /* 上传表单（展开后的详细视图） */
      .upload-form-container {
        width: 92%;
        max-width: 22rem;
        position: relative;
        margin: 0 auto;
        opacity: 0;
        transform: scale(0.7) translateY(1.875rem);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1;
        pointer-events: none;
        display: none;
      }
      
      :host([ui-state="upload"]) .upload-form-container {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
        z-index: 3;
        display: block;
      }

      .upload-form {
        padding: 1.375rem;
        border-radius: 1.125rem;
        background: rgba(255, 255, 255, 0.85);
        backdrop-filter: blur(0.75rem);
        -webkit-backdrop-filter: blur(0.75rem);
        box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.06);
        border: 0.5px solid rgba(255, 255, 255, 0.9);
      }
      
      .form-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 1.25rem;
      }
      
      .form-title {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 500;
        color: #333;
        letter-spacing: 0.01em;
      }
      
      .close-button {
        background: none;
        border: none;
        font-size: 1.125rem;
        color: #888;
        cursor: pointer;
        padding: 0.1875rem;
        border-radius: 50%;
        width: 1.75rem;
        height: 1.75rem;
        transition: all 0.2s ease;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      
      .close-button:hover {
        background-color: rgba(0, 0, 0, 0.04);
        color: #333;
      }
      
      .form-group {
        margin-bottom: 1.125rem;
      }
      
      .form-input {
        width: 100%;
        padding: 0.6875rem 0.75rem;
        border-radius: 0.625rem;
        border: 1px solid rgba(226, 232, 240, 0.8);
        background-color: rgba(255, 255, 255, 0.9);
        font-size: 0.9375rem;
        box-sizing: border-box;
        transition: all 0.2s ease;
        color: #333;
      }
      
      .note-input {
        resize: none; /* 隐藏textarea右下角的调整大小角标 */
      }
      
      .form-input:focus {
        outline: none;
        border-color: #007AFF;
        box-shadow: 0 0 0 2px rgba(0, 122, 255, 0.15);
      }
      
      .price-input-container {
        position: relative;
        display: flex;
        align-items: center;
      }
      
      .price-symbol {
        position: absolute;
        left: 0.75rem;
        color: #666;
        font-size: 0.9375rem;
      }
      
      .price-input {
        padding-left: 1.625rem;
      }

      input[type="number"]::-webkit-inner-spin-button,
      input[type="number"]::-webkit-outer-spin-button {
        -webkit-appearance: none;
        margin: 0;
      }
      
      .submit-button {
        width: 100%;
        padding: 0.6875rem;
        background-color: #0070F3;
        color: white;
        border: none;
        border-radius: 0.625rem;
        font-size: 1rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        letter-spacing: 0.01em;
        margin-top: 0.5rem;
      }
      
      .submit-button:hover {
        background-color: #0056D6;
        transform: translateY(-1px);
        box-shadow: 0 0.25rem 0.75rem rgba(0, 86, 214, 0.2);
      }
      
      .submit-button:active {
        transform: translateY(0) scale(0.98);
      }

      .submit-button:disabled {
        background-color: #B0BEC5;
        cursor: not-allowed;
      }
      .submit-button:disabled:hover {
        background-color: #B0BEC5;
        transform: none;
        box-shadow: none;
      }

      /* 通知形态 */
      .notification-container {
        width: 92%;
        max-width: 22rem;
        position: relative;
        margin: 0 auto;
        opacity: 0;
        transform: scale(0.7) translateY(1.875rem);
        transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
        z-index: 1;
        pointer-events: none;
        display: none;
      }
      
      :host([ui-state="upload-success"]) .notification-container.upload-success,
      :host([ui-state="upload-error"]) .notification-container.upload-error,
      :host([ui-state="report-success"]) .notification-container.report-success,
      :host([ui-state="report-error"]) .notification-container.report-error {
        opacity: 1;
        transform: scale(1) translateY(0);
        pointer-events: auto;
        z-index: 3;
        display: block;
      }
      
      .notification {
        box-sizing: border-box;
        backdrop-filter: blur(0.75rem);
        -webkit-backdrop-filter: blur(0.75rem);
        border-radius: 9999px;
        padding: 1.25rem;
        box-shadow: 0 0.125rem 0.5rem rgba(0, 0, 0, 0.06);
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        border: 0.5px solid rgba(255, 255, 255, 0.9);
      }
      
      .notification.success {
        background: rgba(240, 255, 244, 0.78);
      }
      
      .notification.error {
        background: rgba(254, 226, 226, 0.78);
      }
      
      .notification-content {
        flex: 1;
      }
      
      .notification-title {
        font-weight: 500;
        font-size: 0.95rem;
        color: #333;
        letter-spacing: 0.01em;
      }
      
      .notification-message {
        font-size: 0.85rem;
        color: #666;
      }
      
      .notification-close {
        font-size: 1.5rem;
        color: #888;
        cursor: pointer;
        width: 1.75rem;
        height: 1.75rem;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: all 0.2s ease;
      }
      
      .notification-close:hover {
        background-color: rgba(0, 0, 0, 0.04);
        color: #333;
      }
    </style>
  `;

    const content = /*html*/ `
    <div class="component-container">
      <!-- 搜索形态 -->
      <div class="search-container">
        <div id="suggestions" class="search-suggestions">
          <div class="suggestion-chips">
            <!-- 动态加载的搜索建议 -->
          </div>
        </div>
        <div class="search-input-container">
          <input type="text" placeholder="搜索商品" class="search-input glass-effect">
        </div>
      </div>

      <!-- 结果形态 -->
      <div class="result-capsule">
        <div class="capsule-container">
          <div class="product-name"></div>
          <button id="uploadBtn" class="upload-button">+</button>
        </div>
      </div>

      <!-- 上传形态 -->
      <div class="upload-form-container">
        <div class="upload-form glass-effect">
          <div class="form-header">
            <h3 class="form-title">
              <span name="location" class="city-name"></span>- <span name="productName"></span>
            </h3>
            <button id="closeForm" class="close-button">✕</button>
          </div>
          <form id="priceForm">
            <div class="form-group">
              <div class="price-input-container">
                <span class="price-symbol">¥</span>
                <input type="number" name="price" placeholder="请输入该商品的单价" class="form-input price-input" step="0.01" required>
              </div>
            </div>
            <div class="form-group">
              <textarea name="note" placeholder="添加备注信息（可选）" class="form-input note-input" rows="3"></textarea>
            </div>
            <button type="submit" class="submit-button">确认提交</button>
          </form>
        </div>
      </div>

      <!-- 价格浮窗 - 现在和上传表单形态类似 -->
      <div class="price-popup glass-effect" id="pricePopup">
        <div class="popup-container">
          <div class="popup-header">
            <h3 class="popup-title">
              <span class="city-name" id="popupCityName">城市</span>价格分析
            </h3>
            <button class="close-button-popup" id="closePopup">✕</button>
          </div>
          <div class="chart-section">
            <div class="chart-container" id="chartContainer"></div>
            <div class="no-data-message" id="noDataMessage">暂无价格数据</div>
          </div>
          <div class="stats-section">
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-label">最高价</div>
                <div class="stat-value highest" id="highestPrice">--</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">最低价</div>
                <div class="stat-value lowest" id="lowestPrice">--</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">平均价</div>
                <div class="stat-value average" id="averagePrice">--</div>
              </div>
              <div class="stat-card">
                <div class="stat-label">最新价</div>
                <div class="stat-value latest" id="latestPrice">--</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 通知形态 -->
      <!-- 上传成功通知 -->
      <div class="notification-container upload-success">
        <div class="notification success">
          <div class="notification-content">
            <div class="notification-title">上传成功</div>
            <div class="notification-message">您的价格信息已成功提交！</div>
          </div>
          <div class="notification-close" id="closeUploadSuccess">×</div>
        </div>
      </div>
      
      <!-- 上传失败通知 -->
      <div class="notification-container upload-error">
        <div class="notification error">
          <div class="notification-content">
            <div class="notification-title">上传失败</div>
            <div class="notification-message">价格信息提交失败，请稍后再试</div>
          </div>
          <div class="notification-close" id="closeUploadError">×</div>
        </div>
      </div>
      
      <!-- 报告成功通知 -->
      <div class="notification-container report-success">
        <div class="notification success">
          <div class="notification-content">
            <div class="notification-title">报告成功</div>
            <div class="notification-message">感谢您对价格数据的反馈！</div>
          </div>
          <div class="notification-close" id="closeReportSuccess">×</div>
        </div>
      </div>
      
      <!-- 报告失败通知 -->
      <div class="notification-container report-error">
        <div class="notification error">
          <div class="notification-content">
            <div class="notification-title">报告失败</div>
            <div class="notification-message">数据报告提交失败，请稍后再试</div>
          </div>
          <div class="notification-close" id="closeReportError">×</div>
        </div>
      </div>
    </div>
    `;

    const renderContent = () => {
      // 先清理已有的事件监听器，避免重复绑定
      this._cleanupEventListeners();

      this.shadowRoot.innerHTML = css + content;

      // 应用状态改变，但无需再次绑定事件（避免重复）
      this.applyStateChange();

      // 绑定新的事件监听器
      this.setupEventListeners();
    };

    // 使用View Transition API提供平滑过渡
    if (this.supportsViewTransition) {
      document.startViewTransition(renderContent);
    } else {
      renderContent();
    }
  }

  setupEventListeners() {
    // 先清理已有的事件监听器，避免重复绑定
    this._cleanupEventListeners();

    const searchInput = this.shadowRoot.querySelector(".search-input");
    const suggestions = this.shadowRoot.querySelector("#suggestions");
    const productName = this.shadowRoot.querySelector(".product-name");
    const uploadBtn = this.shadowRoot.querySelector("#uploadBtn");
    const closeForm = this.shadowRoot.querySelector("#closeForm");
    const form = this.shadowRoot.querySelector("#priceForm");
    const closePopup = this.shadowRoot.querySelector("#closePopup");
    const pricePopup = this.shadowRoot.querySelector("#pricePopup");

    if (searchInput) {
      // 为搜索输入框创建事件处理函数
      this._eventListeners.search.input = () => {
        const query = searchInput.value.trim();
        if (query === "") {
          suggestions?.classList.remove("show");
        } else {
          if (query.length > 0) {
            suggestions?.classList.add("show");
            this.fetchSuggestions(query);
          } else {
            suggestions?.classList.remove("show");
          }
        }
      };

      // 添加焦点事件，确保在重新聚焦时根据输入框内容显示/隐藏建议
      this._eventListeners.search.focus = () => {
        const query = searchInput.value.trim();
        if (query.length > 1) {
          suggestions?.classList.add("show");
        } else {
          suggestions?.classList.remove("show");
        }
      };

      this._eventListeners.search.keypress = (e) => {
        if (e.key === "Enter") {
          const query = searchInput.value.trim();
          if (query) {
            this.performSearch(query);
          }
        }
      };

      // 绑定事件处理函数
      searchInput.addEventListener("input", this._eventListeners.search.input);
      searchInput.addEventListener("focus", this._eventListeners.search.focus);
      searchInput.addEventListener(
        "keypress",
        this._eventListeners.search.keypress,
      );
    }

    // 绑定建议芯片的点击事件
    this.shadowRoot.querySelectorAll(".chip").forEach((chip) => {
      chip._clickHandler = () => {
        if (searchInput) {
          searchInput.value = chip.textContent;
          this.performSearch(chip.textContent);
        }
      };
      chip.addEventListener("click", chip._clickHandler);
    });

    if (productName) {
      this._eventListeners.product.click = () => {
        // 点击产品名称时回退到搜索形态
        this.animateToSearch();

        // 获取搜索框并聚焦，但不清空内容
        const searchInput = this.shadowRoot.querySelector(".search-input");
        if (searchInput) {
          // 如果有当前产品信息且搜索框为空，则填充产品名称
          if (
            this.data.productInfo && this.data.productInfo.name &&
            !searchInput.value
          ) {
            searchInput.value = this.data.productInfo.name;
          }
          // 聚焦到搜索框，方便用户修改
          searchInput.focus();
        }
      };
      productName.addEventListener("click", this._eventListeners.product.click);
    }

    if (uploadBtn) {
      this._eventListeners.form.uploadClick = () => this.showUploadForm();
      uploadBtn.addEventListener(
        "click",
        this._eventListeners.form.uploadClick,
      );
    }

    if (closeForm) {
      this._eventListeners.form.closeClick = () => this.hideUploadForm();
      closeForm.addEventListener("click", this._eventListeners.form.closeClick);
    }

    if (form) {
      this._eventListeners.form.submit = async (e) => {
        e.preventDefault();

        // 获取价格输入框和备注输入框的值
        const priceInput = form.querySelector('input[name="price"]');
        const noteInput = form.querySelector('textarea[name="note"]');
        const price = parseFloat(priceInput.value);
        const note = noteInput.value.trim();

        // 获取产品名称和位置
        const productNameElement = this.shadowRoot.querySelector(
          'span[name="productName"]',
        );
        const locationElement = this.shadowRoot.querySelector(
          'span[name="location"]',
        );

        // 构建价格数据对象
        const priceData = {
          productName: productNameElement?.textContent ||
            this.data.productInfo?.name,
          price: price,
          location: locationElement?.textContent ||
            this.data.locationData?.city,
          note: note,
        };

        // 验证价格是否有效
        if (isNaN(priceData.price) || priceData.price <= 0) {
          console.error("错误：请输入有效的价格");
          return;
        }

        try {
          await this.submitPriceInfo(priceData);
          form.reset();
          // 显示上传成功通知，而不是直接隐藏表单
          this.showNotification("upload-success");
        } catch (_error) {
          console.error("错误：提交失败，请重试");
          // 显示上传失败通知
          this.showNotification("upload-error");
        }
      };
      form.addEventListener("submit", this._eventListeners.form.submit);
    }

    if (closePopup) {
      closePopup.addEventListener("click", () => {
        pricePopup.classList.remove("visible");
      });
    }

    // 初始化notifications对象如果不存在
    if (!this._eventListeners.notifications) {
      this._eventListeners.notifications = {};
    }

    // 添加通知关闭按钮的事件监听
    const closeUploadSuccess = this.shadowRoot.querySelector(
      "#closeUploadSuccess",
    );
    if (closeUploadSuccess) {
      this._eventListeners.notifications.closeUploadSuccess = () =>
        this.hideNotification("upload-success");
      closeUploadSuccess.addEventListener(
        "click",
        this._eventListeners.notifications.closeUploadSuccess,
      );
    }

    const closeUploadError = this.shadowRoot.querySelector("#closeUploadError");
    if (closeUploadError) {
      this._eventListeners.notifications.closeUploadError = () =>
        this.hideNotification("upload-error");
      closeUploadError.addEventListener(
        "click",
        this._eventListeners.notifications.closeUploadError,
      );
    }

    const closeReportSuccess = this.shadowRoot.querySelector(
      "#closeReportSuccess",
    );
    if (closeReportSuccess) {
      this._eventListeners.notifications.closeReportSuccess = () =>
        this.hideNotification("report-success");
      closeReportSuccess.addEventListener(
        "click",
        this._eventListeners.notifications.closeReportSuccess,
      );
    }

    const closeReportError = this.shadowRoot.querySelector("#closeReportError");
    if (closeReportError) {
      this._eventListeners.notifications.closeReportError = () =>
        this.hideNotification("report-error");
      closeReportError.addEventListener(
        "click",
        this._eventListeners.notifications.closeReportError,
      );
    }

    // 监听地图组件发出的区域选择事件
    document.addEventListener(
      "region-selected",
      this.handleRegionSelected.bind(this),
    );

    // 监听地图重置事件
    document.addEventListener("map-reset", this.handleMapReset.bind(this));

    // 监听城市匹配尝试事件
    document.addEventListener(
      "city-match-attempt",
      this.handleCityMatchAttempt.bind(this),
    );
  }

  _cleanupEventListeners() {
    // 清理搜索相关的事件监听器
    const searchInput = this.shadowRoot?.querySelector(".search-input");
    if (searchInput && this._eventListeners.search.input) {
      searchInput.removeEventListener(
        "input",
        this._eventListeners.search.input,
      );
      searchInput.removeEventListener(
        "keypress",
        this._eventListeners.search.keypress,
      );
    }

    // 清理产品信息相关的事件监听器
    const productName = this.shadowRoot?.querySelector(".product-name");
    if (productName && this._eventListeners.product.click) {
      productName.removeEventListener(
        "click",
        this._eventListeners.product.click,
      );
    }

    // 清理表单相关的事件监听器
    const uploadBtn = this.shadowRoot?.querySelector("#uploadBtn");
    if (uploadBtn && this._eventListeners.form.uploadClick) {
      uploadBtn.removeEventListener(
        "click",
        this._eventListeners.form.uploadClick,
      );
    }

    const closeForm = this.shadowRoot?.querySelector("#closeForm");
    if (closeForm && this._eventListeners.form.closeClick) {
      closeForm.removeEventListener(
        "click",
        this._eventListeners.form.closeClick,
      );
    }

    const form = this.shadowRoot?.querySelector("#priceForm");
    if (form && this._eventListeners.form.submit) {
      form.removeEventListener("submit", this._eventListeners.form.submit);
    }

    // 清理建议芯片的事件监听器
    this.shadowRoot?.querySelectorAll(".chip").forEach((chip) => {
      if (chip._clickHandler) {
        chip.removeEventListener("click", chip._clickHandler);
      }
    });

    // 清理通知相关的事件监听器
    if (this._eventListeners.notifications) {
      const closeUploadSuccess = this.shadowRoot?.querySelector(
        "#closeUploadSuccess",
      );
      if (
        closeUploadSuccess &&
        this._eventListeners.notifications.closeUploadSuccess
      ) {
        closeUploadSuccess.removeEventListener(
          "click",
          this._eventListeners.notifications.closeUploadSuccess,
        );
      }

      const closeUploadError = this.shadowRoot?.querySelector(
        "#closeUploadError",
      );
      if (
        closeUploadError && this._eventListeners.notifications.closeUploadError
      ) {
        closeUploadError.removeEventListener(
          "click",
          this._eventListeners.notifications.closeUploadError,
        );
      }

      const closeReportSuccess = this.shadowRoot?.querySelector(
        "#closeReportSuccess",
      );
      if (
        closeReportSuccess &&
        this._eventListeners.notifications.closeReportSuccess
      ) {
        closeReportSuccess.removeEventListener(
          "click",
          this._eventListeners.notifications.closeReportSuccess,
        );
      }

      const closeReportError = this.shadowRoot?.querySelector(
        "#closeReportError",
      );
      if (
        closeReportError && this._eventListeners.notifications.closeReportError
      ) {
        closeReportError.removeEventListener(
          "click",
          this._eventListeners.notifications.closeReportError,
        );
      }
    }
  }

  /**
   * 显示指定类型的通知
   * @param {string} notificationType - 通知类型：'upload-success', 'upload-error', 'report-success', 'report-error'
   */
  showNotification(notificationType) {
    // 保存上一个状态，以便在通知关闭后恢复
    this.previousState = this.currentState;

    // 使用相同的过渡动画方法切换状态
    this.performViewTransition(() => {
      this.setAttribute("ui-state", notificationType);
    });

    // 设置当前通知状态为激活
    this.notifications[notificationType.replace("-", "")] = true;
  }

  /**
   * 隐藏指定类型的通知
   * @param {string} notificationType - 通知类型：'upload-success', 'upload-error', 'report-success', 'report-error'
   */
  hideNotification(notificationType) {
    // 复位通知状态
    this.notifications[notificationType.replace("-", "")] = false;

    // 使用相同的过渡动画方法恢复到之前的状态
    const stateToRestore = this.previousState || "results";
    this.performViewTransition(() => {
      this.setAttribute("ui-state", stateToRestore);
      this.currentState = stateToRestore;
    });
  }

  // 搜索方法
  async performSearch(query) {
    if (!query) return;

    this.showLoadingState();

    try {
      const response = await fetch(
        `/api/how-much/search?query=${encodeURIComponent(query)}`,
      );
      if (!response.ok) throw new Error("搜索请求失败");

      const data = await response.json();
      // 检查返回数据中是否包含 products 数组
      if (
        data.products && Array.isArray(data.products) &&
        data.products.length > 0
      ) {
        // 保存产品信息
        this.data.productInfo = {
          name: data.products[0].productName,
        };

        // 对位置数据进行分组
        const pricesByCity = new Map();

        data.products.forEach((product) => {
          const city = product.location.split(/[省市区县]/, 1)[0]; // 提取省市主名称
          if (!pricesByCity.has(city)) {
            pricesByCity.set(city, []);
          }

          pricesByCity.get(city).push({
            price: product.price,
            note: product.note || "",
            date: product.timestamp || product.createdTime,
            reportCount: product.reportCount || 0,
          });
        });

        // 计算每个城市的平均价格
        this.data.cityAverages = Array.from(pricesByCity.entries()).map(
          ([city, prices]) => {
            // 只计算有效数据的平均价格（reportCount小于阈值的）
            const validPrices = prices.filter((p) =>
              (p.reportCount || 0) < DynamicCapsule.REPORT_THRESHOLD
            );
            const sum = validPrices.reduce((acc, curr) => acc + curr.price, 0);
            const avgPrice = validPrices.length > 0 ? sum / validPrices.length : 0;

            return {
              city,
              avgPrice,
              prices, // 保存完整的价格数据数组
              validCount: validPrices.length,
              totalCount: prices.length,
            };
          },
        ).sort((a, b) => b.avgPrice - a.avgPrice);

        // 更新数据存储
        this.data.pricesByLocation = pricesByCity;

        // 更新产品信息并切换到结果视图
        this.updateProductInfo();
        this.animateToResults();

        // 找到地图组件并更新数据
        const vectorMap = document.querySelector("vector-map");
        if (vectorMap) {
          // 延迟一点时间让UI更新完成
          setTimeout(() => {
            // 计算价格颜色映射
            const priceData = this.calculatePriceColorMapping(
              this.data.cityAverages,
            );

            // 使用地图组件提供的API方法更新数据
            if (typeof vectorMap.updatePriceData === "function") {
              vectorMap.updatePriceData(priceData, this.data.productInfo.name);
            }
          }, 100);
        }
      } else {
        this.data.productInfo = {
          name: query,
        };
        console.warn(`警告：未能找到与"${query}"相关的产品数据`);
        // 更新产品信息并切换到结果视图
        this.updateProductInfo();
        this.animateToResults();
      }
    } catch (error) {
      console.error("搜索失败:", error);
    } finally {
      this.hideLoadingState();
    }
  }

  showLoadingState() {
    const searchInput = this.shadowRoot.querySelector(".search-input");
    if (searchInput) {
      searchInput.disabled = true;
      searchInput.placeholder = "搜索中...";
    }
  }

  hideLoadingState() {
    const searchInput = this.shadowRoot.querySelector(".search-input");
    if (searchInput) {
      searchInput.disabled = false;
      searchInput.placeholder = "搜索商品";
    }
  }

  // 添加状态改变后的动画效果
  applyStateChange() {
    // 状态改变后添加额外的弹性动画
    const activeContainer = this.shadowRoot.querySelector(
      `.${this.currentState}-container, .result-capsule, .upload-form-container`,
    );
    if (activeContainer) {
      activeContainer.style.transition =
        "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease";

      // 添加临时类以触发额外的动画效果
      setTimeout(() => {
        activeContainer.classList.add("bounce-animation");
        setTimeout(() => {
          activeContainer.classList.remove("bounce-animation");
        }, 600);
      }, 10);
    }
  }

  // 更新产品信息并切换到结果视图
  updateProductInfo() {
    const productInfo = this.data.productInfo;
    if (!productInfo) return;

    const productNameEl = this.shadowRoot.querySelector(".product-name");

    if (productNameEl) {
      // 获取当前选中的地块名称
      let selectedRegion = "";
      const vectorMap = document.querySelector("vector-map");
      if (vectorMap) {
        // 从data-selected属性获取当前选中的地块名称
        selectedRegion = vectorMap.getAttribute("data-selected") || "";
      }

      // 如果有选中地块，则显示"地块名-产品名"的格式
      if (selectedRegion) {
        productNameEl.textContent = `${selectedRegion} - ${productInfo.name}`;
      } else {
        // 否则只显示产品名称
        productNameEl.textContent = productInfo.name;
      }
    }
  }

  // 状态切换动画 - 带有锁定机制防止并发转换
  async performViewTransition(updateCallback) {
    // 创建一个转换请求
    const transitionRequest = { callback: updateCallback, promise: null };

    // 如果已有转换正在进行，则将此请求加入队列
    if (this.viewTransitionLock) {
      return new Promise((resolve, reject) => {
        // 添加到队列并返回Promise
        transitionRequest.promise = { resolve, reject };
        this.transitionQueue.push(transitionRequest);
      });
    }

    // 获取锁
    this.viewTransitionLock = true;

    try {
      // 执行视图转换
      if (this.supportsViewTransition) {
        const transition = document.startViewTransition(() => {
          updateCallback();
          // 为视图过渡添加一点弹性效果
          const roots = this.shadowRoot.querySelectorAll(
            ".search-container, .result-capsule, .upload-form-container, .price-popup, .notification-container",
          );
          roots.forEach((root) => {
            if (root) {
              root.style.transition =
                "transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease";
            }
          });
        });

        // 等待转换完成
        await transition.ready;
        await transition.finished;
      } else {
        // 对于不支持视图转换API的浏览器，直接执行回调
        updateCallback();
      }
    } catch (error) {
      console.error("视图转换失败:", error);
    } finally {
      // 释放锁
      this.viewTransitionLock = false;

      // 处理队列中的下一个转换请求
      if (this.transitionQueue.length > 0) {
        const nextTransition = this.transitionQueue.shift();
        // 异步执行下一个转换，避免堆栈溢出
        setTimeout(() => {
          this.performViewTransition(nextTransition.callback)
            .then(() => nextTransition.promise?.resolve())
            .catch((error) => nextTransition.promise?.reject(error));
        }, 0);
      }
    }
  }

  animateToResults() {
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "results");
    });
  }

  animateToSearch() {
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "search");
    });
  }

  showUploadForm() {
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "upload");

      // 自动填充当前产品名称
      const productNameSpan = this.shadowRoot.querySelector('span[name="productName"]');
      if (productNameSpan && this.data.productInfo) {
        productNameSpan.textContent = this.data.productInfo.name || "";
      }

      // 获取离productNameSpan最近的span[name="location"]元素
      const locationSpan = this.shadowRoot.querySelector('span[name="location"]');
      // 如果locationSpan的textContent为"未知地区" 则禁止提交按钮的点击
      const uploadBtn = this.shadowRoot.querySelector(".submit-button");
      if (locationSpan && locationSpan.textContent === "未知地区") {
        uploadBtn.disabled = true;
      } else {
        uploadBtn.disabled = false;
      }
    });
  }

  hideUploadForm() {
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "results");
    });
  }

  // 添加API请求方法
  async fetchSuggestions(query) {
    const response = await fetch(
      `/api/how-much/suggestions?query=${encodeURIComponent(query)}`,
    );
    if (!response.ok) throw new Error("获取建议失败");

    const data = await response.json();
    this.data.suggestions = data.suggestions || [];
    this.updateSuggestions();
  }

  async submitPriceInfo(priceData) {
    try {
      const response = await fetch("/api/how-much/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(priceData),
      });
      if (!response.ok) throw new Error("提交价格信息失败");

      // 获取提交成功的返回数据
      const result = await response.json();

      // 上传成功后，直接从服务器获取最新数据并更新视图
      await this.fetchLatestDataAndUpdateViews(priceData.productName);

      return result;
    } catch (error) {
      console.error("错误：提交价格信息失败", error.message);
      throw error;
    }
  }

  // 新增：从后端获取最新数据并更新视图
  async fetchLatestDataAndUpdateViews(productName) {
    try {
      // 如果没有产品名称，则使用当前保存的产品名称
      const queryProduct = productName || this.data.productInfo?.name;

      if (!queryProduct) {
        console.warn("缺少产品名称，无法获取最新数据");
        return;
      }

      // 使用正确的API接口：api/search
      const response = await fetch(
        `/api/how-much/search?query=${encodeURIComponent(queryProduct)}`,
      );

      if (!response.ok) throw new Error("获取最新数据失败");

      const latestData = await response.json();

      if (
        !latestData || !latestData.products ||
        !Array.isArray(latestData.products)
      ) {
        console.warn("获取的数据格式不正确");
        return;
      }

      // 更新本地存储的数据
      this.updateLocalDataFromServer(latestData);

      // 更新UI视图
      this.updateViewsWithLatestData();
    } catch (error) {
      console.error("获取最新数据失败:", error);
    }
  }

  // 新增：使用从服务器获取的数据更新本地数据
  updateLocalDataFromServer(serverData) {
    // 更新产品信息
    if (serverData.productInfo) {
      this.data.productInfo = serverData.productInfo;
    }

    // 对位置数据进行分组
    const pricesByCity = new Map();

    if (serverData.products && Array.isArray(serverData.products)) {
      serverData.products.forEach((product) => {
        const city = product.location.split(/[省市区县]/, 1)[0]; // 提取省市主名称
        if (!pricesByCity.has(city)) {
          pricesByCity.set(city, []);
        }

        pricesByCity.get(city).push({
          price: product.price,
          note: product.note || "",
          date: product.timestamp || product.createdTime,
          reportCount: product.reportCount || 0,
        });
      });

      // 计算每个城市的平均价格
      this.data.cityAverages = Array.from(pricesByCity.entries()).map(
        ([city, prices]) => {
          // 只计算有效数据的平均价格（reportCount小于阈值的）
          const validPrices = prices.filter((p) =>
            (p.reportCount || 0) < DynamicCapsule.REPORT_THRESHOLD
          );
          const sum = validPrices.reduce((acc, curr) => acc + curr.price, 0);
          const avgPrice = validPrices.length > 0 ? sum / validPrices.length : 0;

          return {
            city,
            avgPrice,
            prices, // 保存完整的价格数据数组
            validCount: validPrices.length,
            totalCount: prices.length,
          };
        },
      ).sort((a, b) => b.avgPrice - a.avgPrice);

      // 更新按位置分组的价格数据
      this.data.pricesByLocation = pricesByCity;
    }

    // 如果当前有显示浮窗，更新当前显示的价格数据
    if (this.cityName && this.data.pricesByLocation) {
      const cityData = this.data.pricesByLocation.get(this.cityName);
      if (cityData) {
        this.priceData = [...cityData];
      }
    }
  }

  // 更新视图以显示最新数据
  updateViewsWithLatestData() {
    // 1. 如果价格浮窗正在显示，更新浮窗
    if (this.getAttribute("ui-state") === "prices" && this.shadowRoot) {
      const popup = this.shadowRoot.querySelector(".price-popup");
      if (popup) {
        // 更新统计信息
        this._updatePopupStats(popup);

        // 重绘图表
        setTimeout(() => {
          this._renderPopupChart();
        }, 100);
      }
    }

    // 2. 更新地图显示
    this.updateMapWithLatestPriceData();
  }

  // 更新地图价格数据
  updateMapWithLatestPriceData() {
    // 找到地图组件
    const vectorMap = document.querySelector("vector-map");
    if (!vectorMap) return;

    // 如果有价格数据，重新计算颜色映射
    if (this.data.cityAverages && this.data.cityAverages.length > 0) {
      const priceData = this.calculatePriceColorMapping(this.data.cityAverages);

      // 使用地图组件的API更新数据
      if (typeof vectorMap.updatePriceData === "function") {
        vectorMap.updatePriceData(priceData, this.data.productInfo?.name);
      }
    }
  }

  // 更新UI方法
  updateSuggestions() {
    const suggestionsContainer = this.shadowRoot.querySelector(
      ".suggestion-chips",
    );
    if (!suggestionsContainer) return;

    // 清除现有建议
    suggestionsContainer.innerHTML = "";

    // 添加从API获取的建议
    this.data.suggestions.forEach((suggestion) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = suggestion;
      chip.addEventListener("click", () => {
        const searchInput = this.shadowRoot.querySelector(".search-input");
        if (searchInput) {
          searchInput.value = suggestion;
          this.performSearch(suggestion);
        }
      });
      suggestionsContainer.appendChild(chip);
    });
  }

  // 计算价格颜色映射
  calculatePriceColorMapping(cityAverages) {
    if (!cityAverages || cityAverages.length === 0) {
      return [];
    }

    // 找出价格范围
    const prices = cityAverages.map((city) => city.avgPrice).filter((price) =>
      !isNaN(price) && price > 0
    );
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1; // 避免除以零

    // 生成颜色映射数据
    return cityAverages.map((cityData) => {
      const { city, avgPrice, prices } = cityData;

      // 计算颜色值 - 使用HSL色彩空间实现更平滑的渐变
      // 从绿色(120°)到红色(0°)
      const normalizedPrice = (avgPrice - minPrice) / priceRange;
      const hue = Math.max(0, Math.min(120, 120 * (1 - normalizedPrice)));
      const saturation = 75; // 75%
      const lightness = 40 + 20 * normalizedPrice; // 亮度40-60%之间变化

      return {
        city,
        avgPrice,
        // 将价格详细数据也添加到映射中，供浮窗显示使用
        prices: prices.map((p) => ({
          price: p.price,
          date: p.date || p.timestamp,
          reportCount: p.reportCount || 0,
          note: p.note || "",
        })),
        // 使用HSL颜色模型，渐变效果更加平滑
        color: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        normalizedValue: normalizedPrice,
      };
    });
  }

  // 获取当前位置数据
  async fetchCurrentLocation() {
    // 首先调用浏览器的地理位置API获取lat和lng
    await new Promise(() => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const response = await fetch("/api/how-much/location", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
            }),
          });

          if (!response.ok) throw new Error("获取位置信息失败");
          const locationNames = await response.json();

          // 保存位置数组
          this.data.locationData = {
            names: locationNames,
          };

          // 尝试匹配地图
          this.tryMatchLocationWithMap(locationNames);
        },
        (err) => {
          console.error("获取地理位置失败:", err);
          this.data.locationData = { names: ["未知地区"] };

          this.tryMatchLocationWithMap(this.data.locationData.names);
          this.dispatchEvent(
            new CustomEvent("location-fallback-used", {
              bubbles: true,
              composed: true,
              detail: { locationData: this.data.locationData },
            }),
          );
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 5000,
        },
      );
    });
  }

  /**
   * 尝试使用地名数组匹配地图
   * @param {string[]} locationNames - 地名数组
   */
  tryMatchLocationWithMap(locationNames) {
    if (!Array.isArray(locationNames) || locationNames.length === 0) {
      console.warn("无效的地名数组，无法匹配地图");
      return;
    }

    // 找到地图组件
    const vectorMap = document.querySelector("vector-map");
    if (!vectorMap) {
      console.warn("无法找到地图组件，无法更新选中区域");
      return;
    }

    // 记录初始位置
    let displayLocationName = locationNames[0];
    let matchSuccess = false;

    // 依次尝试每个地名，直到找到一个可以匹配的
    for (const locationName of locationNames) {
      // 尝试将地名设置到地图组件
      try {
        vectorMap.setAttribute("data-selected", locationName);

        // 如果地图组件有专门的选择区域的方法，也调用它
        if (typeof vectorMap.selectRegion === "function") {
          vectorMap.selectRegion(locationName);

          // 如果没有抛出异常，则认为匹配成功
          displayLocationName = locationName;
          matchSuccess = true;
          break;
        }
      } catch (error) {
        console.warn(`地图匹配失败: ${locationName}`, error);
        // 继续尝试下一个地名
      }
    }

    // 如果所有地名都匹配失败，记录警告但仍使用第一个地名作为显示
    if (!matchSuccess) {
      console.warn(`所有地名都无法匹配地图: ${locationNames.join(", ")}`);
    }

    // 更新UI上显示的位置名称
    const locationSpans = this.shadowRoot.querySelectorAll('span[name="location"]');
    if (locationSpans) {
      locationSpans.forEach((locationSpan) => {
        locationSpan.textContent = displayLocationName;
      });
    }

    // 分发地图匹配结果事件
    this.dispatchEvent(
      new CustomEvent("location-map-match", {
        bubbles: true,
        composed: true,
        detail: {
          locationNames: locationNames,
          matchedName: displayLocationName,
          success: matchSuccess,
        },
      }),
    );
  }

  // 更新地图组件选中的区域
  updateMapSelectedRegion(cityName) {
    if (!cityName) return;

    // 如果传入的是单个地名，将其转换为数组后调用尝试匹配方法
    this.tryMatchLocationWithMap([cityName]);
  }

  /**
   * 显示价格浮窗
   * @param {Object} options - 显示选项
   * @param {Array} options.priceData - 价格数据
   * @param {string} options.cityName - 城市名称
   * @param {string} options.productName - 产品名称
   * @param {number} options.x - 水平位置
   * @param {number} options.y - 垂直位置
   */
  showPricePopup(options) {
    const popup = this.shadowRoot.querySelector(".price-popup");
    if (!popup) {
      console.error("[DEBUG-浮窗] 找不到价格浮窗元素");
      return;
    }

    // 存储数据
    this.priceData = options.priceData || [];
    this.cityName = options.cityName || "";
    this.productName = options.productName || "";

    // 更新标题
    const cityNameEl = popup.querySelector(".city-name");
    if (cityNameEl) {
      cityNameEl.textContent = this.cityName;
    }

    const popupTitle = popup.querySelector(".popup-title");
    if (popupTitle && this.productName) {
      // 在城市名后添加产品名称
      const productSpan = document.createElement("span");
      productSpan.textContent = ` - ${this.productName}`;
      productSpan.style.color = "#333";

      // 清除可能存在的旧产品名称
      Array.from(popupTitle.childNodes).forEach((node) => {
        if (
          node.nodeType === Node.TEXT_NODE ||
          (node.nodeType === Node.ELEMENT_NODE && node !== cityNameEl)
        ) {
          popupTitle.removeChild(node);
        }
      });

      popupTitle.appendChild(productSpan);
    }

    // 更新统计信息
    this._updatePopupStats(popup);

    // 更改组件状态为价格浮窗状态，而非简单地显示弹窗
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "prices");
    });

    // 渲染图表
    setTimeout(() => {
      this._renderPopupChart();
    }, 100);

    // 设置关闭按钮的点击事件
    const closeBtn = popup.querySelector(".close-button-popup");
    if (closeBtn) {
      // 移除旧的事件监听器
      if (this._eventListeners.prices.closeClick) {
        closeBtn.removeEventListener(
          "click",
          this._eventListeners.prices.closeClick,
        );
      }

      // 添加新的事件监听器
      this._eventListeners.prices.closeClick = () => this.hidePricePopup();
      closeBtn.addEventListener(
        "click",
        this._eventListeners.prices.closeClick,
      );
    }

    // 添加点击外部关闭事件
    document.addEventListener("click", this._handleClickOutside.bind(this));
  }

  /**
   * 隐藏价格浮窗
   */
  hidePricePopup() {
    // 切换回结果状态
    this.performViewTransition(() => {
      this.setAttribute("ui-state", "results");
    });

    // 触发事件通知地图组件重置浮窗状态
    document.dispatchEvent(
      new CustomEvent("popup-closed", {
        bubbles: true,
        composed: true,
      }),
    );

    // 移除点击外部关闭的事件监听
    document.removeEventListener("click", this._handleClickOutside);
  }

  /**
   * 处理区域选择事件
   * @param {CustomEvent} event - 包含区域信息的事件对象
   */
  handleRegionSelected(event) {
    const regionData = event.detail;

    // 如果有区域名称，更新产品名称显示
    if (regionData && regionData.name) {
      this.updateInfoForRegion(regionData.name);
    }

    // 分发组件内部事件，通知子元素区域已选中
    this.dispatchEvent(
      new CustomEvent("internal-region-selected", {
        detail: regionData,
        bubbles: true,
        composed: false,
      }),
    );
  }

  /**
   * 处理地图重置事件
   */
  handleMapReset(event) {
    if (event.detail && event.detail.success) {
      // 隐藏任何可能的浮窗
      this.hidePricePopup();

      // 通知组件内部元素重置
      this.dispatchEvent(
        new CustomEvent("internal-map-reset", {
          bubbles: true,
          composed: false,
        }),
      );
    }
  }

  /**
   * 处理城市匹配尝试事件
   * @param {CustomEvent} event - 包含匹配信息的事件对象
   */
  handleCityMatchAttempt(event) {
    const matchData = event.detail;
    // 可以记录匹配尝试信息，用于调试或显示
    console.debug(
      `城市匹配尝试: ${matchData.cityName}, 类型: ${matchData.matchType}, 成功: ${matchData.success}`,
    );

    // 如果匹配失败并且有数据，可以添加警告或建议
    if (!matchData.success && this.currentPriceData) {
      // 可以添加一些逻辑来处理未匹配的情况
    }
  }

  /**
   * 向其他组件发送价格数据
   * @param {Array} priceData - 价格数据
   * @param {string} productName - 产品名称
   */
  broadcastPriceData(priceData, productName) {
    if (!priceData || !Array.isArray(priceData)) {
      console.warn("广播价格数据: 数据无效");
      return false;
    }

    // 创建自定义事件并分发
    const event = new CustomEvent("price-data-update", {
      detail: {
        data: priceData,
        productName: productName || "未知产品",
        timestamp: new Date().getTime(),
      },
      bubbles: true,
      composed: true,
    });

    this.dispatchEvent(event);

    // 保存当前数据用于内部引用
    this.currentPriceData = priceData;
    this.currentProductName = productName;

    return true;
  }

  /**
   * 处理点击外部事件
   * @param {Event} event - 点击事件
   * @private
   */
  _handleClickOutside(event) {
    // 检查当前状态是否为价格浮窗状态
    if (this.getAttribute("ui-state") !== "prices") {
      return;
    }

    const popup = this.shadowRoot.querySelector(".price-popup");

    if (
      popup && !popup.contains(event.target) && !this.contains(event.target)
    ) {
      this.hidePricePopup();
    }
  }

  /**
   * 更新浮窗统计信息
   * @param {HTMLElement} popup - 浮窗元素
   * @private
   */
  _updatePopupStats(popup) {
    if (!this.priceData || this.priceData.length === 0) {
      // 设置默认值或null值占位
      popup.querySelector(".stat-value.highest").textContent = "¥ --";
      popup.querySelector(".stat-value.lowest").textContent = "¥ --";
      popup.querySelector(".stat-value.average").textContent = "¥ --";
      popup.querySelector(".stat-value.latest").textContent = "¥ --";
      return;
    }

    // 计算统计数据
    const prices = this.priceData.map((item) => item.price);
    const highest = Math.max(...prices);
    const lowest = Math.min(...prices);
    const average = prices.reduce((a, b) => a + b, 0) / prices.length;

    // 获取最新价格（按日期排序）
    const latestItem = [...this.priceData].sort((a, b) => {
      return new Date(b.date) - new Date(a.date);
    })[0];
    const latest = latestItem ? latestItem.price : null;

    // 更新DOM
    popup.querySelector(".stat-value.highest").textContent =
      highest != null && !isNaN(highest) ? `¥ ${highest.toFixed(2)}` : "¥ --";
    popup.querySelector(".stat-value.lowest").textContent =
      lowest != null && !isNaN(lowest) ? `¥ ${lowest.toFixed(2)}` : "¥ --";
    popup.querySelector(".stat-value.average").textContent =
      average != null && !isNaN(average) ? `¥ ${average.toFixed(2)}` : "¥ --";
    popup.querySelector(".stat-value.latest").textContent =
      latest != null && !isNaN(latest) ? `¥ ${latest.toFixed(2)}` : "¥ --";
  }

  /**
   * 渲染浮窗图表
   * @private
   */
  _renderPopupChart() {
    const popup = this.shadowRoot.querySelector(".price-popup");
    if (!popup) return;

    const chartContainer = popup.querySelector(".chart-container");
    const noDataMessage = popup.querySelector(".no-data-message");

    // 确保数据存在，如果没有数据则显示占位信息
    if (!this.priceData || this.priceData.length === 0) {
      chartContainer.style.display = "none";
      noDataMessage.style.display = "flex";
      noDataMessage.textContent = "此地区暂无价格数据";
      return;
    }

    chartContainer.style.display = "block";
    noDataMessage.style.display = "none";

    // 确保D3.js已加载
    this._loadD3IfNeeded()
      .then(() => {
        // 清空容器
        chartContainer.innerHTML = "";

        // 整理数据 - 按日期排序
        const sortedData = [...this.priceData].sort((a, b) => {
          return new Date(a.date) - new Date(b.date);
        });

        // 分离有效和无效的数据点
        const validData = sortedData.filter((d) =>
          (d.reportCount || 0) < DynamicCapsule.REPORT_THRESHOLD
        );
        const invalidData = sortedData.filter((d) =>
          (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD
        );

        // 准备图表尺寸和边距
        const margin = { top: 20, right: 20, bottom: 30, left: 50 };
        const width = chartContainer.clientWidth - margin.left - margin.right;
        const height = chartContainer.clientHeight - margin.top - margin.bottom;

        // 创建SVG元素
        const svg = d3.select(chartContainer)
          .append("svg")
          .attr("width", width + margin.left + margin.right)
          .attr("height", height + margin.top + margin.bottom)
          .append("g")
          .attr("transform", `translate(${margin.left},${margin.top})`);

        // X轴为时间比例尺 (基于所有数据点)
        const x = d3.scaleTime()
          .domain(d3.extent(sortedData, (d) => new Date(d.date)))
          .range([0, width]);

        // Y轴为线性比例尺 (基于所有数据点)
        const prices = sortedData.map((d) => d.price).filter((p) =>
          p != null && !isNaN(p)
        );

        // 如果没有有效价格数据，设置默认价格范围
        let minPrice = 0;
        let maxPrice = 100;

        if (prices.length > 0) {
          minPrice = d3.min(prices) * 0.95; // 稍微低一点，留出空间
          maxPrice = d3.max(prices) * 1.05; // 稍微高一点，留出空间
        }

        const y = d3.scaleLinear()
          .domain([minPrice, maxPrice])
          .range([height, 0]);

        // 添加X轴
        svg.append("g")
          .attr("transform", `translate(0,${height})`)
          .call(
            d3.axisBottom(x)
              .ticks(5)
              .tickFormat((d) => {
                const date = new Date(d);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }),
          )
          .call((g) => g.select(".domain").attr("stroke", "#ccc"))
          .call((g) => g.selectAll(".tick line").attr("stroke", "#ccc"))
          .call((g) =>
            g.selectAll(".tick text").attr("fill", "#888").attr(
              "font-size",
              "10px",
            )
          );

        // 添加Y轴
        svg.append("g")
          .call(
            d3.axisLeft(y)
              .ticks(5)
              .tickFormat((d) => `¥${d.toFixed(0)}`),
          )
          .call((g) => g.select(".domain").attr("stroke", "#ccc"))
          .call((g) => g.selectAll(".tick line").attr("stroke", "#ccc"))
          .call((g) =>
            g.selectAll(".tick text").attr("fill", "#888").attr(
              "font-size",
              "10px",
            )
          );

        // 添加网格线
        svg.append("g")
          .attr("class", "grid")
          .selectAll("line")
          .data(y.ticks(5))
          .enter()
          .append("line")
          .attr("x1", 0)
          .attr("x2", width)
          .attr("y1", (d) => y(d))
          .attr("y2", (d) => y(d))
          .attr("stroke", "rgba(0, 0, 0, 0.05)")
          .attr("stroke-dasharray", "3,3");

        // 只对有效数据点绘制线条
        if (validData.length > 0) {
          // 定义线条生成器
          const line = d3.line()
            .x((d) => x(new Date(d.date)))
            .y((d) => y(d.price || 0)) // 处理null值
            .defined((d) => d.price != null && !isNaN(d.price)) // 只对有效价格值绘制线条
            .curve(d3.curveMonotoneX); // 使用平滑曲线

          // 添加线条路径 - 只连接有效数据点
          svg.append("path")
            .datum(validData)
            .attr("fill", "none")
            .attr("stroke", "#3182CE")
            .attr("stroke-width", 2)
            .attr("d", line)
            .attr("opacity", 0)
            .transition()
            .duration(1000)
            .attr("opacity", 1);

          // 添加区域渐变填充 - 只用于有效数据点
          const area = d3.area()
            .x((d) => x(new Date(d.date)))
            .y0(height)
            .y1((d) => y(d.price || 0))
            .defined((d) => d.price != null && !isNaN(d.price)) // 只对有效价格值填充区域
            .curve(d3.curveMonotoneX); // 使用平滑曲线

          svg.append("path")
            .datum(validData)
            .attr("fill", "rgba(49, 130, 206, 0.1)")
            .attr("d", area)
            .attr("opacity", 0)
            .transition()
            .duration(1000)
            .attr("opacity", 1);
        }

        // 创建报告确认弹窗
        const confirmDialog = d3.select(chartContainer)
          .append("div")
          .attr("class", "confirm-dialog")
          .style("position", "absolute")
          .style("padding", "12px")
          .style("background-color", "white")
          .style("border-radius", "8px")
          .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
          .style("z-index", "1001")
          .style("display", "none")
          .style("max-width", "220px");

        // 添加确认对话框内容
        confirmDialog.append("div")
          .attr("class", "dialog-title")
          .style("font-weight", "500")
          .style("margin-bottom", "8px")
          .text("确认报告此价格数据?");

        const buttonContainer = confirmDialog.append("div")
          .style("display", "flex")
          .style("justify-content", "flex-end")
          .style("gap", "8px")
          .style("margin-top", "12px");

        buttonContainer.append("button")
          .attr("class", "cancel-button")
          .style("padding", "4px 10px")
          .style("border", "1px solid #ddd")
          .style("border-radius", "4px")
          .style("background", "none")
          .style("cursor", "pointer")
          .text("取消")
          .on("click", () => {
            confirmDialog.style("display", "none");
          });

        buttonContainer.append("button")
          .attr("class", "confirm-button")
          .style("padding", "4px 10px")
          .style("border", "none")
          .style("border-radius", "4px")
          .style("background", "#E53E3E")
          .style("color", "white")
          .style("cursor", "pointer")
          .text("确认报告")
          .style("font-weight", "500");

        // 添加所有数据点，包括有效和无效的
        // 过滤掉价格为null的点
        const dataPointsToRender = sortedData.filter((d) =>
          d.price != null && !isNaN(d.price)
        );

        svg.selectAll(".dot")
          .data(dataPointsToRender)
          .enter()
          .append("circle")
          .attr("class", "dot")
          .attr("cx", (d) => x(new Date(d.date)))
          .attr("cy", (d) => y(d.price))
          .attr("r", 4)
          .attr("fill", "#FFFFFF")
          .attr("stroke", (d) => {
            // 报告次数超过阈值的点显示为红色
            return (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD
              ? "#E53E3E"
              : "#3182CE";
          })
          .attr("stroke-width", 2)
          .attr("opacity", 0)
          .style("cursor", "pointer") // 设置鼠标指针为手型，提示可点击
          .transition()
          .delay((_d, i) => i * 100)
          .duration(500)
          .attr("opacity", 1);

        // 添加tooltip功能
        const tooltip = d3.select(chartContainer)
          .append("div")
          .attr("class", "tooltip")
          .style("position", "absolute")
          .style("padding", "12px 15px")
          .style("background-color", "rgba(255, 255, 255, 0.95)")
          .style("border-radius", "12px")
          .style("box-shadow", "0 4px 15px rgba(0,0,0,0.1)")
          .style("border", "0.5px solid rgba(255, 255, 255, 0.9)")
          .style("pointer-events", "none") // 初始状态为none，固定时将改为auto
          .style("opacity", 0)
          .style(
            "transition",
            "opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
          )
          .style("transform", "scale(0.95)")
          .style("transform-origin", "center top")
          .style("z-index", "1000")
          .style(
            "font-family",
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
          );

        // 当前选中的数据点
        let selectedDataPoint = null;
        // 是否处于固定tooltip状态
        let tooltipFixed = false;

        // 添加点击事件和交互: 点悬停时的tooltip
        svg.selectAll(".dot").on("mouseover", (event, d) => {
          // 如果tooltip已经固定，则不显示新的tooltip
          if (tooltipFixed) return;

          const date = new Date(d.date);
          const formattedDate = `${date.getFullYear()}/${
            date.getMonth() + 1
          }/${date.getDate()}`;

          // 根据报告次数显示不同的提示信息
          const reportStatus = (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD
            ? '<span style="color: #E53E3E;">• 数据已被标记为无效</span>'
            : (d.reportCount || 0) > 0
            ? `<span style="color: #ED8936;">• ${d.reportCount}人报告</span>`
            : "";

          // 添加备注信息，如果存在的话
          // 为无效数据点添加删除线样式
          const isInvalid = (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD;
          const noteInfo = d.note && d.note.trim() !== ""
            ? `<div style="color: #666; margin-top: 3px; font-size: 0.85em;${
              isInvalid ? " text-decoration: line-through;" : ""
            }">${d.note}</div>`
            : "";

          tooltip
            .style("opacity", 1)
            .html(`
                  <div style="color: #333; font-weight: 600; margin-bottom: 5px;">
                    ${formattedDate}
                  </div>
                  <div style="color: #666;">
                    <span style="color: #3182CE; font-weight: 600;${
              isInvalid ? " text-decoration: line-through;" : ""
            }">¥${d.price != null ? d.price.toFixed(2) : "--"}</span>
                  </div>
                  ${noteInfo}
                  <div style="font-size: 0.8em; margin-top: 3px;">
                    ${reportStatus}
                  </div>
                  <div style="font-size: 0.8em; margin-top: 5px; color: #718096;">
                    点击可固定此信息
                  </div>
                `);

          // 计算并设置tooltip位置
          const tooltipNode = tooltip.node();
          const containerRect = chartContainer.getBoundingClientRect();
          const svgRect = svg.node().getBoundingClientRect();

          const position = this._calculateTooltipPosition(
            event,
            tooltipNode,
            containerRect,
            svgRect,
          );

          // 应用计算后的位置
          tooltip
            .style("left", position.left + "px")
            .style("top", position.top + "px");

          d3.select(event.currentTarget)
            .transition()
            .duration(300)
            .attr("r", 6);
        })
          .on("mousemove", (event) => {
            // 如果tooltip已经固定，则不移动tooltip
            if (tooltipFixed) return;

            // 计算并设置tooltip位置
            const tooltipNode = tooltip.node();
            const containerRect = chartContainer.getBoundingClientRect();
            const svgRect = svg.node().getBoundingClientRect();

            const position = this._calculateTooltipPosition(
              event,
              tooltipNode,
              containerRect,
              svgRect,
            );

            // 应用计算后的位置
            tooltip
              .style("left", position.left + "px")
              .style("top", position.top + "px");
          })
          .on("mouseout", (event) => {
            // 如果tooltip已经固定，则不隐藏tooltip
            if (tooltipFixed) return;

            tooltip.style("opacity", 0);

            d3.select(event.currentTarget)
              .transition()
              .duration(300)
              .attr("r", 4);
          })
          .on("click", (event, d) => {
            // 如果tooltip已经固定，点击其他数据点无效
            if (tooltipFixed) return;

            // 记录当前被点击的数据点，并固定tooltip
            selectedDataPoint = d;
            tooltipFixed = true;

            // 设置tooltip可交互
            tooltip.style("pointer-events", "auto");

            const date = new Date(d.date);
            const formattedDate = `${date.getFullYear()}/${
              date.getMonth() + 1
            }/${date.getDate()}`;

            // 根据报告次数显示不同的提示信息
            const reportStatus = (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD
              ? '<span style="color: #E53E3E;">• 数据已被标记为无效</span>'
              : (d.reportCount || 0) > 0
              ? `<span style="color: #ED8936;">• ${d.reportCount}人报告</span>`
              : "";

            // 添加备注信息，如果存在的话
            // 为无效数据点添加删除线样式
            const isInvalid = (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD;
            const noteInfo = d.note && d.note.trim() !== ""
              ? `<div style="color: #666; margin-top: 3px; font-size: 0.85em;${
                isInvalid ? " text-decoration: line-through;" : ""
              }">${d.note}</div>`
              : "";

            // 更新tooltip内容，添加按钮
            tooltip
              .style("opacity", 1)
              .html(`
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div style="color: #333; font-weight: 600;">
                    ${formattedDate}
                  </div>
                  <button class="tooltip-close" style="background: none; border: none; color: #888; cursor: pointer; font-size: 16px; padding: 0 4px;">×</button>
                </div>
                <div style="color: #666; margin-bottom: 8px;">
                  <span style="color: #3182CE; font-weight: 600;${
                isInvalid ? " text-decoration: line-through;" : ""
              }">¥${d.price != null ? d.price.toFixed(2) : "--"}</span>
                </div>
                ${noteInfo}
                <div style="font-size: 0.8em; margin-bottom: 10px;">
                  ${reportStatus}
                </div>
                ${
                (d.reportCount || 0) >= DynamicCapsule.REPORT_THRESHOLD
                  ? ``
                  : `<div style="text-align: right;">
                    <button class="report-price-btn" style="background: #f1f3f5; border: none; border-radius: 4px; padding: 5px 10px; font-size: 0.8em; cursor: pointer; color: #E53E3E;">报告价格不准确</button>
                  </div>`
              }
              `);

            // 添加关闭按钮事件
            tooltip.select(".tooltip-close").on("click", () => {
              // 恢复tooltip为非固定状态
              tooltipFixed = false;
              tooltip.style("opacity", 0);
              tooltip.style("pointer-events", "none");

              // 恢复数据点样式
              d3.select(event.currentTarget)
                .transition()
                .duration(300)
                .attr("r", 4);
            });

            // 只有当数据点未被标记为无效时才添加报告按钮事件
            if ((d.reportCount || 0) < DynamicCapsule.REPORT_THRESHOLD) {
              tooltip.select(".report-price-btn").on("click", async () => {
                try {
                  const response = await fetch("/api/how-much/report", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      productName: this.productName,
                      timestamp: selectedDataPoint.date,
                    }),
                  });

                  if (response.ok) {
                    // 更新数据点状态
                    selectedDataPoint.reportCount =
                      (selectedDataPoint.reportCount || 0) + 1;

                    // 更新数据点的颜色
                    if (
                      selectedDataPoint.reportCount >=
                        DynamicCapsule.REPORT_THRESHOLD
                    ) {
                      // 立即更新当前点的视觉样式
                      d3.select(event.currentTarget)
                        .transition()
                        .duration(300)
                        .attr("stroke", "#E53E3E");

                      // 如果一个有效点被标记为无效，需要重新绘制线条
                      if (validData.includes(selectedDataPoint)) {
                        // 更新有效数据集
                        const index = validData.indexOf(selectedDataPoint);
                        if (index > -1) {
                          // 从有效数据中移除
                          validData.splice(index, 1);
                          // 添加到无效数据中
                          invalidData.push(selectedDataPoint);

                          // 重新绘制线条和区域 - 先删除旧的
                          svg.selectAll("path").remove();

                          // 如果还有有效数据，重新绘制
                          if (validData.length > 1) {
                            // 重新绘制线条
                            const newLine = d3.line()
                              .x((d) => x(new Date(d.date)))
                              .y((d) => y(d.price || 0))
                              .defined((d) => d.price != null && !isNaN(d.price))
                              .curve(d3.curveMonotoneX);

                            svg.append("path")
                              .datum(validData)
                              .attr("fill", "none")
                              .attr("stroke", "#3182CE")
                              .attr("stroke-width", 2)
                              .attr("d", newLine);

                            // 重新绘制区域填充
                            const newArea = d3.area()
                              .x((d) => x(new Date(d.date)))
                              .y0(height)
                              .y1((d) => y(d.price || 0))
                              .defined((d) => d.price != null && !isNaN(d.price))
                              .curve(d3.curveMonotoneX);

                            svg.append("path")
                              .datum(validData)
                              .attr("fill", "rgba(49, 130, 206, 0.1)")
                              .attr("d", newArea);
                          }
                        }
                      }
                    }

                    // 恢复tooltip为非固定状态
                    tooltipFixed = false;
                    tooltip.style("opacity", 0);
                    tooltip.style("pointer-events", "none");

                    // 显示报告成功通知
                    this.showNotification("report-success");
                  }
                } catch (error) {
                  console.error("报告失败:", error);
                  // 显示报告失败通知
                  this.showNotification("report-error");
                }
              });
            }

            // 计算并设置tooltip位置
            const tooltipNode = tooltip.node();
            const containerRect = chartContainer.getBoundingClientRect();
            const svgRect = svg.node().getBoundingClientRect();

            const position = this._calculateTooltipPosition(
              event,
              tooltipNode,
              containerRect,
              svgRect,
            );

            // 应用计算后的位置
            tooltip
              .style("left", position.left + "px")
              .style("top", position.top + "px");

            // 保持数据点突出显示
            d3.select(event.currentTarget)
              .transition()
              .duration(300)
              .attr("r", 6);
          });
      })
      .catch((error) => {
        console.error("加载D3.js失败:", error);
        if (noDataMessage) {
          noDataMessage.textContent = "图表加载失败";
          noDataMessage.style.display = "flex";
        }
      });
  }

  /**
   * 计算对话框最佳位置
   * @param {Object} params - 计算位置所需参数
   * @param {number} params.pointX - 参考点X坐标
   * @param {number} params.pointY - 参考点Y坐标
   * @param {number} params.dialogWidth - 对话框宽度
   * @param {number} params.dialogHeight - 对话框高度
   * @param {number} params.containerWidth - 容器宽度
   * @param {number} params.containerHeight - 容器高度
   * @param {number} [params.margin=10] - 边距
   * @returns {Object} 对话框最佳位置坐标及变换原点
   * @private
   */
  _calculateDialogPosition(params) {
    const {
      pointX,
      pointY,
      dialogWidth,
      dialogHeight,
      containerWidth,
      containerHeight,
      margin = 10,
    } = params;

    // 计算初始位置 - 尝试优先放在参考点右侧
    let left = pointX + 15;
    let top = pointY - dialogHeight / 2;

    // 水平方向调整
    if (left + dialogWidth > containerWidth - margin) {
      // 右侧空间不足，尝试放在左侧
      left = pointX - dialogWidth - 15;

      // 如果左侧也不行，则水平居中（但保持在容器内）
      if (left < margin) {
        left = Math.max(
          margin,
          Math.min(
            containerWidth - dialogWidth - margin,
            (containerWidth - dialogWidth) / 2,
          ),
        );
      }
    }

    // 垂直方向调整
    if (top < margin) {
      // 上方空间不足，放在点下方
      top = pointY + 15;
    }

    // 检查底部是否有足够空间
    if (top + dialogHeight > containerHeight - margin) {
      // 下方空间不足，尝试放在上方
      top = pointY - dialogHeight - 15;

      // 如果上方也空间不足，尽量保持在容器内
      if (top < margin) {
        top = Math.max(
          margin,
          Math.min(
            containerHeight - dialogHeight - margin,
            (containerHeight - dialogHeight) / 2,
          ),
        );
      }
    }

    // 确保最低限度的边距
    left = Math.max(
      margin,
      Math.min(containerWidth - dialogWidth - margin, left),
    );
    top = Math.max(
      margin,
      Math.min(containerHeight - dialogHeight - margin, top),
    );

    // 计算变换的原点，使弹出动画从点击的数据点开始
    const transformOrigin = `${pointX - left}px ${pointY - top}px`;

    return {
      left,
      top,
      transformOrigin,
    };
  }

  _loadD3IfNeeded() {
    return new Promise((resolve, reject) => {
      if (globalThis.d3) {
        resolve(globalThis.d3);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://d3js.org/d3.v7.min.js";
      script.onload = () => resolve(globalThis.d3);
      script.onerror = () => reject(new Error("无法加载D3.js库"));
      document.head.appendChild(script);
    });
  }

  /**
   * 计算tooltip的最佳位置
   * @param {Event} event - 鼠标事件
   * @param {HTMLElement} tooltipNode - tooltip DOM节点
   * @param {HTMLElement} containerRect - 容器的DOM矩形
   * @param {HTMLElement} svgRect - SVG容器的DOM矩形
   * @returns {Object} 包含left和top位置的对象
   * @private
   */
  _calculateTooltipPosition(event, tooltipNode, containerRect, svgRect) {
    const tooltipWidth = tooltipNode.offsetWidth;
    const tooltipHeight = tooltipNode.offsetHeight;

    // 计算鼠标位置相对于svg容器的坐标
    const mouseX = event.clientX - svgRect.left;
    const mouseY = event.clientY - svgRect.top;

    // 初始定位设置
    let left = mouseX + 15;
    let top = mouseY - 28;

    // 调整以避免右侧溢出
    if (left + tooltipWidth > containerRect.width) {
      left = mouseX - tooltipWidth - 10; // 将tooltip放在点的左侧
    }

    // 调整以避免底部溢出
    if (top + tooltipHeight > containerRect.height) {
      top = mouseY - tooltipHeight - 10; // 将tooltip放在点的上方
    }

    // 调整以避免顶部溢出
    if (top < 0) {
      top = mouseY + 15; // 将tooltip放在点的下方
    }

    // 调整以避免左侧溢出
    if (left < 0) {
      left = 10; // 保持最小的左边距
    }

    return { left, top };
  }

  /**
   * 更新区域信息到产品名称显示
   * @param {string} regionName - 选中的地区名称
   */
  updateInfoForRegion(regionName) {
    // 如果当前处于结果模式，需要更新产品名称显示
    if (this.getAttribute("ui-state") === "results" && this.data.productInfo) {
      const productNameEl = this.shadowRoot.querySelector(".product-name");
      if (productNameEl) {
        // 如果有选中地块，则显示"地块名-产品名"的格式
        if (regionName) {
          productNameEl.textContent = `${regionName} - ${this.data.productInfo.name}`;
        } else {
          // 否则只显示产品名称
          productNameEl.textContent = this.data.productInfo.name;
        }
      }
    }
  }
}

customElements.define("dynamic-capsule", DynamicCapsule);
