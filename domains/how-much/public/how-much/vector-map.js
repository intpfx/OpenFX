class vectorMap extends HTMLElement {
  static get observedAttributes() {
    return ["data-url", "data-selected"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });

    // 创建组件基本结构
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: 100%;
          touch-action: none;
        }
        
        .container {
          width: 100%;
          height: 100%;
          background-color: #f0f8ff;
          position: relative;
        }
        
        .map {
          width: 100%;
          height: 100%;
          transition: opacity 0.5s ease;
          -webkit-backface-visibility: hidden; /* 防止闪烁 */
          backface-visibility: hidden;
        }
        
        .map.hidden {
          opacity: 0;
          pointer-events: none;
        }
        
        .region {
          stroke: #fff;
          stroke-width: 0.1px;
          fill:rgba(30, 32, 33, 0.36);
          transition: fill 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
          will-change: fill; /* 提示浏览器对此属性优化 */
          cursor: pointer;
        }
        
        .region:hover {
          fill: #f5deb3;
        }
        
        .region.active {
          fill: #ff8c00;
        }
        
        .region.others {
          fill-opacity: 0.3;
        }
        
        .region.highlighted {
          transition: fill 1.2s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        .color-transitioning {
          transition: fill 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94);
        }
        
        /* 已激活且有数据的区域使用特殊指针样式 */
        .region.active.has-data {
          cursor: zoom-in;
        }
      </style>
      
      <div class="container">
        <div class="map"></div>
      </div>
    `;

    // 组件内部属性
    this.width = 0;
    this.height = 0;
    this.svg = null;
    this.mapGroup = null;
    this.projection = null;
    this.path = null;
    this.regions = null;
    this.selectedRegion = null;
    this.zoom = null;
    this.isPinching = false;

    // 事件控制标志
    this._selectTimeout = null;
    this._clickInProgress = false;
    this._resetInProgress = false;
    this._selectInProgress = false;
    this._isZooming = false;
    this._recentManualClick = false;
    this._isPopupVisible = false; // 添加标志位，跟踪浮窗是否可见

    // 缓存DOM元素引用
    this._dynamicCapsule = null;

    // 数据源URL
    this.dataUrl = "map.topo.json";

    // 添加一个标记表示依赖是否加载完成
    this._dependenciesLoaded = false;

    // 添加一个属性保存当前产品名称和数据
    this._currentProductName = "";
    this._currentPriceData = null;
  }

  async connectedCallback() {
    try {
      // 首先加载依赖，然后初始化地图，最后加载数据
      if (await this.loadDependencies()) {
        this.initMap();
        this.handleResize = this.handleResize.bind(this);
        globalThis.addEventListener("resize", this.handleResize);

        // 检查是否有在连接后设置的 data-url
        if (this.dataUrl) {
          await this.loadData();
        }
      }
    } catch (error) {
      console.error("地图初始化失败", error.message);
    }

    // 添加价格数据更新事件监听
    this.addEventListener(
      "price-data-updated",
      this.handlePriceDataUpdate.bind(this),
    );

    // 添加点击事件监听，处理地块的二次点击事件
    this.shadowRoot.addEventListener("click", this.handleMapClick.bind(this));

    // 添加浮窗关闭事件监听，重置浮窗状态标志
    document.addEventListener("popup-closed", () => {
      this._isPopupVisible = false;
    });

    // 初始化 DOM 元素缓存
    this._initDomCache();
  }

  /**
   * 初始化 DOM 元素缓存
   * 缓存频繁使用的 DOM 元素引用，提高性能
   */
  _initDomCache() {
    // 缓存 dynamic-capsule 元素
    this._dynamicCapsule = document.querySelector("dynamic-capsule");
  }

  disconnectedCallback() {
    globalThis.removeEventListener("resize", this.handleResize);

    // 移除价格数据更新事件监听
    this.removeEventListener(
      "price-data-updated",
      this.handlePriceDataUpdate.bind(this),
    );

    // 移除点击事件监听
    this.shadowRoot.removeEventListener(
      "click",
      this.handleMapClick.bind(this),
    );
  }

  attributeChangedCallback(name, _oldValue, newValue) {
    if (name === "data-url" && newValue) {
      this.dataUrl = newValue;
      if (this.isConnected && this._dependenciesLoaded) {
        // 只有在依赖加载完成后才尝试加载数据
        this.loadData();
      }
    } else if (name === "data-selected") {
      // 空值或者无效值时重置地图显示全图
      if (!newValue) {
        if (this._dependenciesLoaded) {
          this.resetMap();
        }
        return;
      }

      // 如果地图还没加载完成，等待地图加载后再选中
      if (!this.regions) {
        this._pendingSelection = newValue;
        return;
      }

      // 防止无限循环
      if (this._skipAttributeChange) {
        this._skipAttributeChange = false;
        return;
      }

      this._selectRegionByName(newValue);
    }
  }

  _selectRegionByName(regionName) {
    if (!this.regions || !regionName) return;

    // 尝试不同的名称格式（省、市等）
    const searchNames = [
      regionName,
      regionName + "省",
      regionName + "市",
      regionName + "自治区",
    ];

    // 使用数组方法查找匹配的地区
    let matchingRegion = null;

    for (const searchName of searchNames) {
      const matches = Array.from(this.regions.nodes())
        .filter((node) => {
          const name = d3.select(node).datum().properties.name;
          return name === searchName || name.startsWith(searchName);
        });

      if (matches.length > 0) {
        matchingRegion = matches[0];
        break;
      }
    }

    if (matchingRegion) {
      const datum = d3.select(matchingRegion).datum();
      this.selectRegion(matchingRegion, datum, true);
    } else {
      // 使用控制台日志替代 IslandNoticeManager
      console.warn(`找不到名为 "${regionName}" 的地区`);
    }
  }

  /**
   * 辅助函数：异步加载外部JavaScript库
   * @param {string} url - 脚本的URL地址
   * @param {string} [name] - 用于日志的库名称
   * @returns {Promise} - 返回一个Promise，加载成功时解析，失败时拒绝
   */
  loadScriptAsync(url, name) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = url;
      script.onload = () => {
        resolve();
      };
      script.onerror = (_error) => {
        reject(new Error(`加载${name}失败`));
      };
      document.head.appendChild(script);
    });
  }

  async loadDependencies() {
    try {
      // 使用新的辅助函数加载 D3.js
      if (typeof d3 === "undefined") {
        await this.loadScriptAsync("https://d3js.org/d3.v7.min.js", "D3.js");
      }

      // 使用新的辅助函数加载 topojson
      if (typeof topojson === "undefined") {
        await this.loadScriptAsync("https://d3js.org/topojson.v3.min.js", "topojson");
      }

      // 验证库是否真的可用
      if (typeof d3 === "undefined") {
        throw new Error("D3.js库加载后仍然不可用");
      }

      if (typeof topojson === "undefined") {
        throw new Error("topojson库加载后仍然不可用");
      }

      // 标记依赖加载完成
      this._dependenciesLoaded = true;

      return true;
    } catch (error) {
      console.error(`加载依赖库失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 处理地图点击事件，检测是否点击了有数据的地块
   * @param {MouseEvent} event - 点击事件
   */
  handleMapClick(event) {
    // 检查点击的元素是否是地图区域
    const target = event.target;

    if (!target.classList.contains("region")) {
      return;
    }

    // 记录当前区域的标识信息
    const cityName = target.getAttribute("data-city") ||
      target.getAttribute("data-name") || "";

    // 检查浮窗状态
    if (this._checkPopupVisibility()) {
      return;
    }

    // 无论是否有数据都显示浮窗，只需要有cityName和产品数据
    if (cityName && this._currentPriceData) {
      // 查找该城市的价格数据（如果有的话）
      const cityData = this.findCityPriceData(cityName);

      // 即使没有找到对应的价格数据，也创建一个空数据并显示浮窗
      this._showPricePopup(event, cityName, cityData || {});
    } else {
      console.warn("[DEBUG-点击] 城市名称或产品数据为空，无法显示浮窗");
    }

    // 继续原有的区域选择逻辑
    this._selectRegionByClick(target.getAttribute("data-name") || "");
  }

  /**
   * 检查价格浮窗是否已经显示
   * @returns {boolean} 浮窗是否可见
   */
  _checkPopupVisibility() {
    // 使用缓存的 dynamic-capsule 元素引用
    if (this._dynamicCapsule) {
      const pricePopup = this._dynamicCapsule.shadowRoot.querySelector(
        ".price-popup.visible",
      );
      this._isPopupVisible = Boolean(pricePopup);
    } else {
      // 如果缓存不存在，尝试重新获取并缓存
      this._dynamicCapsule = document.querySelector("dynamic-capsule");
      this._isPopupVisible = this._dynamicCapsule
        ? Boolean(this._dynamicCapsule.shadowRoot.querySelector(".price-popup.visible"))
        : false;
    }

    return this._isPopupVisible;
  }

  /**
   * 显示价格浮窗
   * @param {MouseEvent} event - 点击事件
   * @param {string} cityName - 城市名称
   * @param {Object} cityData - 城市价格数据
   */
  _showPricePopup(event, cityName, cityData) {
    try {
      // 设置浮窗标志位
      this._isPopupVisible = true;

      // 处理价格数据结构
      let pricesData = [];
      if (cityData && cityData.prices && Array.isArray(cityData.prices)) {
        pricesData = cityData.prices;
      } else if (cityData && Array.isArray(cityData) && cityData.length > 0) {
        pricesData = cityData;
      }

      // 即使没有价格数据，也创建空数组以显示浮窗
      // 不再检查pricesData.length是否为0，无论是否有数据都显示

      // 使用缓存的 dynamic-capsule 元素引用
      if (!this._dynamicCapsule) {
        // 如果缓存不存在，尝试重新获取并缓存
        this._dynamicCapsule = document.querySelector("dynamic-capsule");
      }

      if (!this._dynamicCapsule) {
        console.warn("[DEBUG-点击] 找不到 dynamic-capsule 组件，无法显示浮窗");
        this._isPopupVisible = false;
        return;
      }

      // 获取鼠标点击的准确位置
      const clientX = event.clientX ||
        (event.sourceEvent && event.sourceEvent.clientX) ||
        globalThis.innerWidth / 2;
      const clientY = event.clientY ||
        (event.sourceEvent && event.sourceEvent.clientY) ||
        globalThis.innerHeight / 2;

      // 调用 dynamic-capsule 的 showPricePopup 方法
      this._dynamicCapsule.showPricePopup({
        priceData: pricesData,
        cityName: cityName,
        productName: this._currentProductName,
        x: clientX,
        y: clientY,
      });
    } catch (error) {
      console.error("[DEBUG-点击] 显示价格浮窗时发生错误:", error);
      // 如果发生错误，重置浮窗标志位
      this._isPopupVisible = false;
    }
  }

  /**
   * 点击选择区域
   * @param {string} regionName - 区域名称
   */
  _selectRegionByClick(regionName) {
    if (!regionName) return;

    // 避免重复点击
    if (this._clickInProgress) return;
    this._clickInProgress = true;

    requestAnimationFrame(() => {
      // 通过设置 data-selected 属性来选中地区
      this.setAttribute("data-selected", regionName);

      setTimeout(() => {
        this._clickInProgress = false;
      }, 100);
    });
  }

  initMap() {
    const container = this.shadowRoot.querySelector(".map");
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.svg = d3.select(container)
      .append("svg")
      .attr("width", this.width)
      .attr("height", this.height);

    this.mapGroup = this.svg.append("g");

    this.projection = d3.geoMercator()
      .center([105, 38])
      .scale(this.width / 1.5)
      .translate([this.width / 2, this.height / 2]);

    this.path = d3.geoPath().projection(this.projection);

    this.setupEventListeners();
  }

  async loadData() {
    // 确保依赖已加载
    if (!this._dependenciesLoaded) {
      console.warn("依赖库尚未加载完成，延迟加载地图数据");
      return;
    }

    try {
      const data = await d3.json(this.dataUrl);
      this.renderMap(data);
    } catch (error) {
      console.error(`加载地图数据出错: ${error.message}`);
    }
  }

  async renderMap(data) {
    const geojson = topojson.feature(
      data,
      data.objects.provinces || data.objects.china ||
        Object.values(data.objects)[0],
    );

    this.regions = this.mapGroup.selectAll(".region")
      .data(geojson.features)
      .enter()
      .append("path")
      .attr("class", "region")
      .attr("d", this.path)
      .attr("data-name", (d) => d.properties.name || "未命名区域");

    this.regions.on("click", (event, d) => this.handleRegionClick(event, d));

    // 处理待选中的地区
    if (this._pendingSelection) {
      await this._selectRegionByName(this._pendingSelection);
      this._pendingSelection = null;
    }
  }

  setupEventListeners() {
    this.svg.on("dblclick", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      requestAnimationFrame(() => {
        this.resetMap();
      });
    });

    this.zoom = d3.zoom()
      .scaleExtent([1, 8])
      .on("start", (event) => {
        this._isZooming = event.sourceEvent &&
          event.sourceEvent.type !== "click";
      })
      .on("zoom", (event) => {
        this.mapGroup.attr("transform", event.transform);
      })
      .on("end", (event) => {
        if (
          event.sourceEvent &&
          (event.sourceEvent.type === "dblclick" ||
            event.sourceEvent.type === "click")
        ) {
          return;
        }

        if (this._isZooming && event.transform.k > 2.5) {
          clearTimeout(this._selectTimeout);
          this._selectTimeout = setTimeout(() => {
            if (!this._recentManualClick) {
              this.selectRegionAtCenter(event.transform);
            }
          }, 100);
        }
        this._isZooming = false;
      });

    this.svg.call(this.zoom);
    this.svg.on("dblclick.zoom", null);
  }

  selectRegionAtCenter(transform) {
    if (this._selectInProgress || this._recentManualClick) return;
    this._selectInProgress = true;

    const viewCenter = [this.width / 2, this.height / 2];
    const point = this.screenToGeo(viewCenter[0], viewCenter[1], transform);

    let closestRegion = null;
    let closestDatum = null;
    let minDistance = Infinity;

    this.regions.each(function (d) {
      const centroid = d3.geoCentroid(d);
      const distance = d3.geoDistance(point, centroid);

      if (distance < minDistance) {
        minDistance = distance;
        closestRegion = this;
        closestDatum = d;
      }
    });

    if (closestRegion && closestDatum) {
      if (this.selectedRegion?.node() === closestRegion) {
        this._selectInProgress = false;
        return;
      }

      // 选中区域
      this.selectRegion(closestRegion, closestDatum, true);

      // 添加显示价格浮窗的逻辑
      setTimeout(() => {
        // 确保选择动画完成后再显示浮窗
        this._showPopupForRegion(closestRegion, closestDatum);
      }, 800); // 等待动画完成
    }
    this._selectInProgress = false;
  }

  /**
   * 公共方法：根据地区名称或DOM元素选中地区
   * 这个方法可以被外部组件调用，用于选中地图上的区域
   * @param {string|Element} region - 地区名称或地区DOM元素
   * @param {Object} [datum] - 可选的数据对象，适用于DOM元素方式调用
   * @param {boolean} [shouldAnimate=true] - 是否使用动画效果
   */
  selectRegion(region, datum, shouldAnimate = true) {
    // 如果输入是字符串（地区名称），调用名称选择方法
    if (typeof region === "string") {
      this._selectRegionByName(region);
      return;
    }

    // 处理已有的DOM元素方式调用
    if (this.selectedRegion) {
      this.selectedRegion.classed("active", false);
    }

    const targetRegion = d3.select(region);
    this.regions.classed("others", true);
    targetRegion.classed("active", true).classed("others", false);
    this.selectedRegion = targetRegion;

    // 获取数据对象
    const regionDatum = datum || d3.select(region).datum();
    if (!regionDatum) return;

    // 同步更新 data-selected 属性，但避免循环调用
    const regionName = regionDatum.properties.name || "";
    if (this.getAttribute("data-selected") !== regionName) {
      this._skipAttributeChange = true;
      this.setAttribute("data-selected", regionName);
      this._skipAttributeChange = false;
    }

    if (shouldAnimate) {
      const [x, y] = this.path.centroid(regionDatum);
      const bounds = this.path.bounds(regionDatum);
      const dx = bounds[1][0] - bounds[0][0];
      const dy = bounds[1][1] - bounds[0][1];
      const scale = 0.8 / Math.max(dx / this.width, dy / this.height);
      const translate = [
        this.width / 2 - scale * x,
        this.height / 2 - scale * y,
      ];

      this.svg.transition()
        .duration(750)
        .call(
          this.zoom.transform,
          d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale),
        );
    }

    this.dispatchEvent(
      new CustomEvent("region-selected", {
        detail: {
          name: regionName,
          properties: regionDatum.properties,
        },
        bubbles: true,
        composed: true,
      }),
    );
  }

  screenToGeo(x, y, transform) {
    const mapX = (x - transform.x) / transform.k;
    const mapY = (y - transform.y) / transform.k;
    return this.projection.invert([mapX, mapY]);
  }

  getElementAtPoint(x, y) {
    const svgRect = this.svg.node().getBoundingClientRect();
    const pointX = svgRect.left + x;
    const pointY = svgRect.top + y;
    const element = document.elementFromPoint(pointX, pointY);

    if (element && this.shadowRoot.contains(element)) {
      return element;
    }

    return null;
  }

  handleRegionClick(event, d) {
    event.stopPropagation();

    if (this._clickInProgress) {
      return;
    }
    this._clickInProgress = true;

    this._recentManualClick = true;
    setTimeout(() => {
      this._recentManualClick = false;
    }, 300);

    // 获取当前点击的区域元素
    const target = event.target;
    const cityName = d.properties.name || target.getAttribute("data-city") || "";

    // 检查浮窗状态
    // 首先查找 dynamic-capsule 组件中的浮窗是否已显示
    const dynamicCapsule = document.querySelector("dynamic-capsule");
    if (dynamicCapsule) {
      const pricePopup = dynamicCapsule.shadowRoot.querySelector(
        ".price-popup.visible",
      );
      this._isPopupVisible = Boolean(pricePopup);
    } else {
      this._isPopupVisible = false;
    }

    // 检查是否已有浮窗显示
    if (this._isPopupVisible) {
      return;
    } // 处理浮窗显示逻辑 - 无论是否有数据，只要有cityName和产品数据就显示浮窗
    else if (cityName && this._currentPriceData) {
      try {
        // 设置浮窗标志位
        this._isPopupVisible = true;

        // 使用改进的城市匹配方法查找城市数据
        const cityData = typeof this.findCityPriceData === "function"
          ? this.findCityPriceData(cityName)
          : this._currentPriceData.find((item) => item.city === cityName);

        // 处理价格数据结构
        let pricesData = [];
        if (cityData) {
          if (cityData.prices && Array.isArray(cityData.prices)) {
            pricesData = cityData.prices;
          } else if (Array.isArray(cityData) && cityData.length > 0) {
            pricesData = cityData;
          }
        }

        // 无论是否有价格数据都显示浮窗
        if (dynamicCapsule) {
          // 获取鼠标点击的准确位置
          const clientX = event.clientX ||
            (event.sourceEvent && event.sourceEvent.clientX) ||
            globalThis.innerWidth / 2;
          const clientY = event.clientY ||
            (event.sourceEvent && event.sourceEvent.clientY) ||
            globalThis.innerHeight / 2;

          // 调用 dynamic-capsule 的 showPricePopup 方法
          dynamicCapsule.showPricePopup({
            priceData: pricesData,
            cityName: cityName,
            productName: this._currentProductName,
            x: clientX,
            y: clientY,
          });
        } else {
          console.warn("[DEBUG-D3点击] 找不到 dynamic-capsule 组件，无法显示浮窗");
          this._isPopupVisible = false;
        }
      } catch (error) {
        console.error("[DEBUG-D3点击] 显示价格浮窗时发生错误:", error);
        // 如果发生错误，重置浮窗标志位
        this._isPopupVisible = false;
      }
    }

    // 继续原有的区域选择逻辑
    requestAnimationFrame(() => {
      // 通过设置 data-selected 属性来选中地区
      const regionName = d.properties.name || "";
      this.setAttribute("data-selected", regionName);

      setTimeout(() => {
        this._clickInProgress = false;
      }, 100);
    });
  }

  resetMap() {
    if (this._resetInProgress) return;
    this._resetInProgress = true;

    clearTimeout(this._selectTimeout);
    this.svg.interrupt();

    const initialTransform = d3.zoomIdentity
      .translate(0, 0)
      .scale(1);

    this.svg.transition()
      .duration(300)
      .call(this.zoom.transform, initialTransform)
      .on("end", () => {
        this._resetInProgress = false;
        if (this.selectedRegion) {
          this.regions.classed("active", false).classed("others", false);
          this.selectedRegion = null;

          // 清除 data-selected 属性，但不触发循环
          this._skipAttributeChange = true;
          this.setAttribute("data-selected", "");
          this._skipAttributeChange = false;
        }

        this.dispatchEvent(
          new CustomEvent("map-reset", {
            detail: { success: true },
            bubbles: true,
            composed: true,
          }),
        );
      })
      .on("interrupt", () => {
        this.svg.call(this.zoom.transform, initialTransform);
        this._resetInProgress = false;
      });
  }

  findClosestRegion(point) {
    let closestRegion = null;
    let minDistance = Infinity;

    this.regions.each(function (d) {
      try {
        const centroid = this.path.centroid(d);
        if (!isNaN(centroid[0]) && !isNaN(centroid[1])) {
          const dx = point[0] - centroid[0];
          const dy = point[1] - centroid[1];
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < minDistance) {
            minDistance = distance;
            closestRegion = this;
          }
        }
      } catch (e) {
        // 替换 console.warn 为 IslandNoticeManager.warning
        console.warn(`计算地区质心出错: ${d.properties.name}`, {
          detail: e.message,
          timeout: 3000,
        });
      }
    }.bind(this));

    return closestRegion ? d3.select(closestRegion) : null;
  }

  handleResize() {
    const container = this.shadowRoot.querySelector(".map");
    this.width = container.clientWidth;
    this.height = container.clientHeight;

    this.svg.attr("width", this.width).attr("height", this.height);
    this.projection.scale(this.width / 1.5).translate([
      this.width / 2,
      this.height / 2,
    ]);

    if (this.regions) {
      this.regions.attr("d", this.path);
    }
  }

  // 处理价格数据更新事件
  handlePriceDataUpdate(event) {
    const priceData = event.detail.data;
    if (!priceData || !Array.isArray(priceData)) {
      console.warn("接收到无效价格数据", event.detail);
      return;
    }

    // 保存当前产品名称和价格数据，用于后续点击浮窗显示
    this._currentProductName = event.detail.productName || "";
    this._currentPriceData = priceData;

    // 更新地图数据模式
    this.setAttribute("data-view", "data");

    // 获取SVG中的省份/城市路径
    const paths = this.shadowRoot.querySelectorAll(".region");
    if (!paths || paths.length === 0) {
      console.error("无法找到地图区域元素");
      return;
    }

    // 创建城市到颜色的映射，便于快速查找
    const cityColorMap = new Map();
    const cityDataMap = new Map(); // 存储每个城市的价格数据

    // 首先对地图数据结构进行详细记录
    priceData.forEach((item) => {
      if (item.city) {
        if (item.color) cityColorMap.set(item.city, item.color);

        // 收集每个城市的价格数据
        if (!cityDataMap.has(item.city)) {
          cityDataMap.set(item.city, []);
        }
        if (item.prices && Array.isArray(item.prices)) {
          cityDataMap.get(item.city).push(...item.prices);
        } else {
          // 如果没有prices属性，尝试将整个项作为价格数据
          if (item.price !== undefined) {
            cityDataMap.get(item.city).push(item);
          }
        }
      }
    });

    // 不再一次性重置所有区域，而是分批次应用颜色变化
    requestAnimationFrame(() => {
      // 第1步：为所有区域添加过渡类，但保留当前颜色
      paths.forEach((path) => {
        path.classList.add("color-transitioning");

        // 清除之前的数据状态
        path.classList.remove("has-data");
        path.removeAttribute("data-city");
      });

      // 第2步：使用动画帧在下一帧应用新颜色
      requestAnimationFrame(() => {
        let updatedRegions = 0;

        // 首先收集所有需要更新的元素及其目标颜色
        const updateTasks = [];

        priceData.forEach((item) => {
          if (!item.city) {
            console.warn("发现没有城市属性的数据项:", item);
            return;
          }

          if (!item.color) {
            console.warn(`城市 ${item.city} 没有颜色属性`);
          }

          // 查找对应元素
          const provinceElement = this.findProvinceElementByCity(item.city);
          if (provinceElement) {
            const hasData = cityDataMap.has(item.city) &&
              cityDataMap.get(item.city).length > 0;
            updateTasks.push({
              element: provinceElement,
              color: item.color || "#4682b4", // 使用默认蓝色如果没有颜色
              city: item.city,
              hasData: hasData,
            });
          } else {
            console.warn(`找不到对应 ${item.city} 的地图元素`);
          }
        });

        // 然后分批次应用更新，错开时间执行
        const batchSize = Math.max(1, Math.floor(updateTasks.length / 4));

        const applyBatchUpdate = (startIndex) => {
          const endIndex = Math.min(startIndex + batchSize, updateTasks.length);

          for (let i = startIndex; i < endIndex; i++) {
            const { element, color, city, hasData } = updateTasks[i];
            element.style.fill = color;
            element.classList.add("highlighted");

            // 标记有数据的区域，为点击事件做准备
            if (hasData) {
              element.classList.add("has-data");
              element.setAttribute("data-city", city);
            }

            updatedRegions++;
          }

          // 如果还有剩余批次，继续应用
          if (endIndex < updateTasks.length) {
            setTimeout(() => {
              applyBatchUpdate(endIndex);
            }, 50); // 每批次之间的延迟
          }
        };

        // 开始应用第一批更新
        applyBatchUpdate(0);
      });
    });
  }

  // 添加公共方法，供外部组件调用
  updatePriceData(priceData, productName) {
    if (!priceData || !Array.isArray(priceData)) {
      console.warn("传入的价格数据无效");
      return false;
    }

    // 保存当前数据，以便后续二次点击使用
    this._currentProductName = productName || "";
    this._currentPriceData = priceData;

    // 调用内部处理方法
    this.dispatchEvent(
      new CustomEvent("price-data-updated", {
        detail: {
          data: priceData,
          productName: productName,
        },
        bubbles: false,
        composed: false,
      }),
    );

    return true;
  }

  // 根据城市名称查找对应的省份/地区元素
  findProvinceElementByCity(cityName) {
    if (!cityName) {
      return null;
    }

    // 生成可能的名称变体
    const possibleNames = [
      cityName,
      cityName + "区",
      cityName + "县",
      cityName + "市",
      cityName + "盟",
      cityName + "省",
      cityName + "地区",
      cityName + "自治区",
      cityName + "自治县",
      cityName + "自治州",
      cityName + "特别行政区",
      cityName.replace("区", ""),
      cityName.replace("县", ""),
      cityName.replace("市", ""),
      cityName.replace("盟", ""),
      cityName.replace("省", ""),
      cityName.replace("地区", ""),
      cityName.replace("自治区", ""),
      cityName.replace("自治县", ""),
      cityName.replace("自治州", ""),
      cityName.replace("特别行政区", ""),
    ];

    // 查找匹配的元素
    let matchingElement = null;

    // 1. 先尝试精确匹配
    for (const name of possibleNames) {
      const selector = `.region[data-name="${name}"]`;
      const matchingNode = this.shadowRoot.querySelector(selector);
      if (matchingNode) {
        matchingElement = matchingNode;
        break;
      }
    }

    // 使用事件通知其他组件匹配进度
    this.dispatchEvent(
      new CustomEvent("city-match-attempt", {
        detail: {
          cityName,
          matchType: "exact",
          success: Boolean(matchingElement),
        },
        bubbles: true,
        composed: true,
      }),
    );

    // 2. 如果未找到精确匹配，遍历所有区域元素尝试部分匹配
    if (!matchingElement) {
      const allRegions = this.shadowRoot.querySelectorAll(".region");

      for (const region of allRegions) {
        const regionName = region.getAttribute("data-name");
        if (!regionName) continue;

        // 检查区域名称是否与任何可能的名称匹配
        if (
          possibleNames.some((name) =>
            regionName.includes(name) ||
            name.includes(regionName) ||
            // 特殊处理直辖市
            (["北京", "上海", "天津", "重庆"].includes(name) &&
              regionName.includes(name + "市"))
          )
        ) {
          matchingElement = region;
          break;
        }
      }
    }

    return matchingElement;
  }

  /**
   * 查找与指定城市名称最匹配的价格数据
   * @param {string} cityName - 城市名称
   * @returns {Object|null} - 匹配的城市价格数据或null
   */
  findCityPriceData(cityName) {
    if (
      !this._currentPriceData || !Array.isArray(this._currentPriceData) ||
      !cityName
    ) {
      return null;
    }

    const cityData = this._currentPriceData.find((item) => item.city === cityName);
    if (cityData) {
      return cityData;
    }

    // 尝试不同的名称格式（省、市等）
    const searchNames = [
      cityName,
      cityName + "区",
      cityName + "县",
      cityName + "市",
      cityName + "盟",
      cityName + "省",
      cityName + "地区",
      cityName + "自治区",
      cityName + "自治县",
      cityName + "自治州",
      cityName + "特别行政区",
      cityName.replace("区", ""),
      cityName.replace("县", ""),
      cityName.replace("市", ""),
      cityName.replace("盟", ""),
      cityName.replace("省", ""),
      cityName.replace("地区", ""),
      cityName.replace("自治区", ""),
      cityName.replace("自治县", ""),
      cityName.replace("自治州", ""),
      cityName.replace("特别行政区", ""),
    ];

    // 遍历所有可能的名称格式
    for (const name of searchNames) {
      const data = this._currentPriceData.find((item) => item.city === name);
      if (data) {
        return data;
      }
    }
    // 如果没有找到匹配的城市数据，尝试模糊匹配
    const fuzzyMatch = this._currentPriceData.find((item) =>
      item.city.includes(cityName) || cityName.includes(item.city)
    );
    if (fuzzyMatch) {
      return fuzzyMatch;
    }

    // 如果所有尝试都失败，记录详细信息并返回null
    console.warn(`[城市匹配] 找不到匹配数据: ${cityName}`);
    console.warn(
      `[城市匹配] 可用城市:`,
      this._currentPriceData.map((item) => item.city).join(", "),
    );
    return null;
  }

  /**
   * 为选中的区域显示价格浮窗
   * @param {Element} region - 地图区域DOM元素
   * @param {Object} datum - 区域数据
   * @private
   */
  _showPopupForRegion(region, datum) {
    if (!region || !datum || !this._currentPriceData) return;

    // 获取城市名称
    const cityName = datum.properties.name || "";
    if (!cityName) return;

    // 检查浮窗状态，如果已有浮窗显示则不处理
    if (this._checkPopupVisibility()) return;

    try {
      // 设置浮窗标志位
      this._isPopupVisible = true;

      // 查找城市价格数据
      const cityData = this.findCityPriceData(cityName);

      // 处理价格数据结构
      let pricesData = [];
      if (cityData) {
        if (cityData.prices && Array.isArray(cityData.prices)) {
          pricesData = cityData.prices;
        } else if (Array.isArray(cityData) && cityData.length > 0) {
          pricesData = cityData;
        }
      }

      // 确保dynamic-capsule存在
      if (!this._dynamicCapsule) {
        this._dynamicCapsule = document.querySelector("dynamic-capsule");
      }

      if (!this._dynamicCapsule) {
        console.warn("[DEBUG-自动选中] 找不到 dynamic-capsule 组件，无法显示浮窗");
        this._isPopupVisible = false;
        return;
      }

      // 获取区域在屏幕上的中心位置
      const regionElement = d3.select(region).node();
      const regionBounds = regionElement.getBoundingClientRect();
      const centerX = (regionBounds.left + regionBounds.right) / 2;
      const centerY = (regionBounds.top + regionBounds.bottom) / 2;

      // 调用 dynamic-capsule 的 showPricePopup 方法
      this._dynamicCapsule.showPricePopup({
        priceData: pricesData,
        cityName: cityName,
        productName: this._currentProductName,
        x: centerX,
        y: centerY,
      });
    } catch (error) {
      console.error("[DEBUG-自动选中] 显示价格浮窗时发生错误:", error);
      // 如果发生错误，重置浮窗标志位
      this._isPopupVisible = false;
    }
  }
}

customElements.define("vector-map", vectorMap);
