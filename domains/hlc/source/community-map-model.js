export const SCENE_GEOGRAPHY = Object.freeze({
  center: Object.freeze({ latitude: 31.6450428, longitude: 104.4166911 }),
  coordinateSystem: "WGS84",
  sourceLabel: "OpenStreetMap · node 5222769424",
  calibratedAt: "2026-08-01",
  anchors: Object.freeze([
    Object.freeze({
      id: "west-hills",
      name: "西河片区",
      description: "山地与低密院落",
      coordinate: Object.freeze({ longitude: 104.399464, latitude: 31.65075 }),
    }),
    Object.freeze({
      id: "anchang-river",
      name: "安昌河水系",
      description: "南北水道与西南汇流",
      coordinate: Object.freeze({ longitude: 104.412808, latitude: 31.636975 }),
    }),
    Object.freeze({
      id: "anzhou-road",
      name: "安州大道西段",
      description: "东西向桥路",
      coordinate: Object.freeze({ longitude: 104.417256, latitude: 31.645525 }),
    }),
    Object.freeze({
      id: "yongchang-streets",
      name: "永昌镇街巷",
      description: "社区服务与日常生活",
      coordinate: Object.freeze({ longitude: 104.429488, latitude: 31.654075 }),
    }),
    Object.freeze({
      id: "anchang-park",
      name: "安昌人民公园方向",
      description: "东南公共绿地",
      coordinate: Object.freeze({ longitude: 104.43338, latitude: 31.62985 }),
    }),
  ]),
});

const place = (definition) =>
  Object.freeze({
    ...definition,
    coordinate: Object.freeze({
      ...definition.coordinate,
      precision: "conceptual-content-anchor",
    }),
    focusPosition: Object.freeze({ ...definition.focusPosition }),
    artTarget: Object.freeze({
      polygon: Object.freeze(
        definition.artTarget.polygon.map((point) => Object.freeze([...point])),
      ),
      labelPosition: Object.freeze({ ...definition.artTarget.labelPosition }),
    }),
    services: Object.freeze(definition.services.map((service) =>
      Object.freeze({
        ...service,
        legacyPath: Object.freeze([...service.legacyPath]),
        presentation: service.presentation
          ? Object.freeze({ ...service.presentation })
          : null,
      })
    )),
  });

export const SCENE_PLACES = Object.freeze([
  place({
    id: "service-center",
    name: "社区服务中心",
    kicker: "办事 · 咨询 · 社区动态",
    summary: "从这里认识社区架构、工作人员和最近发生的社区故事。",
    coordinate: { longitude: 104.423372, latitude: 31.650275 },
    focusPosition: { x: 0.5, y: 0.18 },
    artTarget: {
      polygon: [
        [0.277, 0.049],
        [0.468, 0.073],
        [0.506, 0.125],
        [0.503, 0.273],
        [0.482, 0.323],
        [0.4, 0.335],
        [0.345, 0.307],
        [0.291, 0.283],
        [0.269, 0.139],
      ],
      labelPosition: { x: 0.392, y: 0.19 },
    },
    accent: "#d65f49",
    services: [
      {
        id: "community-intro",
        name: "走进社区",
        description: "社区架构与工作人员",
        presentation: {
          eyebrow: "COMMUNITY ARCHIVE · 社区档案",
          contentTitle: "组织与社区介绍",
          lead:
            "从组织架构、服务团队和社区文字记录中，认识这里如何回应日常生活。",
          note: "人物信息只保留姓名与文字介绍，不直接展示现实照片。",
          emptyTitle: "社区介绍正在整理中",
        },
        legacyPath: ["article_entrance", "intro_entrance"],
        pageSelector: "intro-page",
      },
      {
        id: "community-news",
        name: "社区动态",
        description: "最近发布的社区文章",
        presentation: {
          eyebrow: "COMMUNITY NOTES · 街巷新事",
          contentTitle: "最近的社区动态",
          lead: "沿时间查看社区最近的通知、活动和共同完成的小事。",
          note: "动态列表延续现有 CMS 数据，图像内容不进入前台样板。",
          emptyTitle: "社区故事正在整理中",
        },
        legacyPath: ["article_entrance", "trend_entrance"],
        pageSelector: "list-page",
      },
      {
        id: "community-example",
        name: "社区示范",
        description: "圣灯社区治理实践",
        presentation: {
          eyebrow: "COMMUNITY PRACTICE · 治理实践",
          contentTitle: "可以复用的治理实践",
          lead: "把抽象制度还原为居民能够看见、理解和参与的社区行动。",
          note: "案例页只呈现文字与抽象艺术化内容，不发布现场照片或视频。",
          emptyTitle: "治理实践正在整理中",
        },
        legacyPath: ["article_entrance", "example_entrance"],
        pageSelector: "example-page",
      },
    ],
  }),
  place({
    id: "public-square",
    name: "民意广场",
    kicker: "留言 · 回应 · 共同商议",
    summary: "把关心的事情写下来，也看看邻里和社区给出的回应。",
    coordinate: { longitude: 104.420592, latitude: 31.6422 },
    focusPosition: { x: 0.51, y: 0.47 },
    artTarget: {
      polygon: [
        [0.389, 0.378],
        [0.422, 0.342],
        [0.55, 0.39],
        [0.569, 0.516],
        [0.558, 0.587],
        [0.502, 0.626],
        [0.412, 0.588],
        [0.376, 0.52],
      ],
      labelPosition: { x: 0.474, y: 0.49 },
    },
    accent: "#cf6f83",
    services: [
      {
        id: "community-voice",
        name: "群众发言吧",
        description: "留言、回应与共同商议",
        presentation: {
          eyebrow: "CIVIC VOICES · 邻里共议",
          contentTitle: "把关心的事情说出来",
          lead: "把生活里的问题、建议和期待写下来，让邻里与社区一起回应。",
          note: "留言与回复以文字为主，不直接附带现实照片或现场视频。",
          emptyTitle: "等你写下第一条邻里意见",
        },
        legacyPath: ["chat_entrance"],
        pageSelector: "chat-page",
      },
    ],
  }),
  place({
    id: "learning-room",
    name: "初心学堂",
    kicker: "学习 · 会议 · 居民自治",
    summary: "直播、专题会议、学习吧和社区自管委在这里相遇。",
    coordinate: { longitude: 104.41114, latitude: 31.64885 },
    focusPosition: { x: 0.22, y: 0.3 },
    artTarget: {
      polygon: [
        [0.245, 0.38],
        [0.328, 0.354],
        [0.352, 0.38],
        [0.351, 0.489],
        [0.336, 0.528],
        [0.262, 0.524],
        [0.243, 0.485],
      ],
      labelPosition: { x: 0.299, y: 0.44 },
    },
    accent: "#c87a4a",
    services: [
      {
        id: "secretary-live",
        name: "书记直播间",
        description: "扫码进入社区直播",
        presentation: {
          eyebrow: "COMMUNITY LIVE · 同屏相见",
          contentTitle: "书记直播间",
          lead: "从社区议题到现场答疑，在约定的时间里与居民同屏交流。",
          note: "二维码只承担服务入口，不展示直播现场照片或写实影像预览。",
          emptyTitle: "直播入口正在准备中",
        },
        legacyPath: ["more_entrance", "original_entrance", "live_entrance"],
        pageSelector: "live-page",
      },
      {
        id: "community-meeting",
        name: "专题会议",
        description: "查看社区会议内容",
        presentation: {
          eyebrow: "ASSEMBLY NOTES · 专题议事",
          contentTitle: "社区会议与议题",
          lead: "沿会议记录了解正在讨论的事情、形成的共识和后续行动。",
          note: "会议列表沿用现有 CMS 数据，只呈现文字与抽象艺术化内容。",
          emptyTitle: "新的会议记录正在整理中",
        },
        legacyPath: ["more_entrance", "original_entrance", "meeting_entrance"],
        pageSelector: "meeting-page",
      },
      {
        id: "community-study",
        name: "陈云珍学吧",
        description: "学习资料与社区课堂",
        presentation: {
          eyebrow: "LEARNING COMMONS · 社区课堂",
          contentTitle: "一起学习的社区课堂",
          lead: "把学习资料、居民课堂和经验分享放进可以反复回看的社区书页。",
          note: "学习内容以文字和抽象图形呈现，不直接使用课堂实景照片。",
          emptyTitle: "新的学习内容正在准备中",
        },
        legacyPath: ["more_entrance", "original_entrance", "study_entrance"],
        pageSelector: "study-page",
      },
      {
        id: "community-council",
        name: "社区自管委",
        description: "居民自治组织与参与",
        presentation: {
          eyebrow: "RESIDENT COUNCIL · 居民自治",
          contentTitle: "社区自管委与参与方式",
          lead: "认识居民自治组织，也找到可以加入议事和共同维护社区的方式。",
          note: "组织信息保留名称与文字说明，不展示现实人物照片。",
          emptyTitle: "自治组织信息正在整理中",
        },
        legacyPath: [
          "more_entrance",
          "original_entrance",
          "autogulation_entrance",
        ],
        pageSelector: "autogulation-page",
      },
    ],
  }),
  place({
    id: "tool-house",
    name: "共享工具屋",
    kicker: "借用 · 互助 · 温情服务",
    summary: "查看社区共享工具，用一件顺手的小事帮助自己和邻居。",
    coordinate: { longitude: 104.431156, latitude: 31.641725 },
    focusPosition: { x: 0.79, y: 0.58 },
    artTarget: {
      polygon: [
        [0.724, 0.441],
        [0.888, 0.469],
        [0.918, 0.537],
        [0.915, 0.663],
        [0.892, 0.708],
        [0.762, 0.693],
        [0.726, 0.629],
        [0.713, 0.515],
      ],
      labelPosition: { x: 0.82, y: 0.565 },
    },
    accent: "#ca784e",
    services: [
      {
        id: "borrow-tools",
        name: "借用共享工具",
        description: "登记需要借用的社区工具",
        presentation: {
          eyebrow: "SHARED TOOLS · 共享清单",
          contentTitle: "借一件顺手的工具",
          lead:
            "选择需要的工具并留下联系方式，让闲置物品在邻里之间继续发挥作用。",
          note: "借用表单直接连接既有服务流程，不展示工具实物照片。",
          emptyTitle: "共享工具清单正在补充中",
        },
        legacyPath: ["more_entrance", "public_entrance", "toolhouse_entrance"],
        pageSelector: "toolhouse-page",
      },
      {
        id: "join-governance",
        name: "全民参与",
        description: "加入社区共治行动",
        presentation: {
          eyebrow: "COMMON ACTION · 全民参与",
          contentTitle: "从身边加入社区共治",
          lead: "从一次讨论、一段街巷或一件小事开始，找到参与社区行动的入口。",
          note: "行动介绍只使用文字与抽象艺术表达，不发布现场照片。",
          emptyTitle: "新的共治行动正在筹备中",
        },
        legacyPath: [
          "more_entrance",
          "public_entrance",
          "participation_entrance",
        ],
        pageSelector: "participation-page",
      },
      {
        id: "volunteer-points",
        name: "吉米屋",
        description: "志愿积分与兑换",
        presentation: {
          eyebrow: "VOLUNTEER EXCHANGE · 志愿积分",
          contentTitle: "志愿行动与积分兑换",
          lead: "查看志愿服务记录、积分和兑换入口，让每次付出都有清晰回响。",
          note: "积分与奖品信息以文字化清单呈现，不直接展示现实商品照片。",
          emptyTitle: "积分与兑换信息正在更新中",
        },
        legacyPath: ["more_entrance", "public_entrance", "jimi_entrance"],
        pageSelector: "jimi-page",
      },
    ],
  }),
  place({
    id: "tea-courtyard",
    name: "红茶小院",
    kicker: "围坐 · 倾听 · 邻里关怀",
    summary: "一杯热茶的时间，让社区故事被听见，让彼此更靠近。",
    coordinate: { longitude: 104.422816, latitude: 31.6346 },
    focusPosition: { x: 0.52, y: 0.79 },
    artTarget: {
      polygon: [
        [0.507, 0.505],
        [0.622, 0.527],
        [0.669, 0.593],
        [0.659, 0.716],
        [0.624, 0.781],
        [0.545, 0.779],
        [0.513, 0.713],
        [0.484, 0.641],
      ],
      labelPosition: { x: 0.58, y: 0.64 },
    },
    accent: "#b85c43",
    services: [
      {
        id: "tea-story",
        name: "一杯红茶的故事",
        description: "倾听、关怀与邻里相聚",
        presentation: {
          eyebrow: "TEA & STORIES · 茶叙邻里",
          contentTitle: "一杯红茶里的社区故事",
          lead: "在一杯茶的时间里听见彼此，把关怀、陪伴和邻里故事慢慢留下来。",
          note: "故事页只保留文字和抽象艺术化内容，不展示现实活动照片。",
          emptyTitle: "新的茶叙故事正在慢慢写下",
        },
        legacyPath: ["more_entrance", "support_entrance"],
        pageSelector: "support-page",
      },
    ],
  }),
  place({
    id: "skills-workshop",
    name: "技能工坊",
    kicker: "培训 · 手作 · 成长报名",
    summary: "在真实的动手实践中学习技能，为生活增添一份信心。",
    coordinate: { longitude: 104.434492, latitude: 31.646 },
    focusPosition: { x: 0.78, y: 0.28 },
    artTarget: {
      polygon: [
        [0.652, 0.14],
        [0.76, 0.149],
        [0.806, 0.205],
        [0.815, 0.34],
        [0.794, 0.378],
        [0.688, 0.38],
        [0.651, 0.335],
        [0.638, 0.223],
      ],
      labelPosition: { x: 0.73, y: 0.265 },
    },
    accent: "#b7894f",
    services: [
      {
        id: "skill-training",
        name: "技能培育与报名",
        description: "了解课程并提交报名信息",
        presentation: {
          eyebrow: "MAKING & GROWTH · 技能成长",
          contentTitle: "社区技能课程与报名",
          lead: "了解社区课程并留下报名信息，在真实动手中积累一份生活技能。",
          note: "课程说明以文字呈现，不直接展示课堂、学员或作品实景照片。",
          emptyTitle: "新的技能课程正在准备中",
        },
        legacyPath: ["more_entrance", "confidence_entrance"],
        pageSelector: "confidence-page",
      },
    ],
  }),
  place({
    id: "riverside-volunteers",
    name: "河畔志愿点",
    kicker: "巡河 · 绿地 · 全民参与",
    summary: "沿着水岸加入社区行动，从身边的一段路、一片绿开始。",
    coordinate: { longitude: 104.41392, latitude: 31.639825 },
    focusPosition: { x: 0.18, y: 0.66 },
    artTarget: {
      polygon: [
        [0.326, 0.691],
        [0.404, 0.677],
        [0.446, 0.714],
        [0.458, 0.831],
        [0.426, 0.868],
        [0.344, 0.848],
        [0.311, 0.777],
      ],
      labelPosition: { x: 0.385, y: 0.77 },
    },
    accent: "#548b68",
    services: [
      {
        id: "riverside-action",
        name: "加入社区治理",
        description: "巡河、绿地与公共行动",
        presentation: {
          eyebrow: "RIVERSIDE ACTION · 河岸共治",
          contentTitle: "一起守护河岸与公共绿地",
          lead: "从巡河、清洁和绿地维护开始，共同照看每天都会经过的公共空间。",
          note: "行动内容以文字和抽象河岸图景呈现，不发布现场照片。",
          emptyTitle: "下一次河岸行动正在筹备中",
        },
        legacyPath: [
          "more_entrance",
          "public_entrance",
          "participation_entrance",
        ],
        pageSelector: "participation-page",
      },
      {
        id: "riverside-volunteer",
        name: "志愿积分",
        description: "查看志愿行动与积分",
        presentation: {
          eyebrow: "RIVERSIDE HOURS · 志愿记录",
          contentTitle: "河畔行动与志愿积分",
          lead:
            "沿着行动记录查看参与时数与积分，让每一段河岸守护都被认真记下。",
          note: "志愿记录与兑换信息不直接展示现实人物或商品照片。",
          emptyTitle: "河畔志愿记录正在更新中",
        },
        legacyPath: ["more_entrance", "public_entrance", "jimi_entrance"],
        pageSelector: "jimi-page",
      },
    ],
  }),
]);

export function getScenePlace(placeId) {
  return SCENE_PLACES.find(({ id }) => id === placeId) ?? null;
}

export function getSceneService(placeId, serviceId) {
  return getScenePlace(placeId)?.services.find(({ id }) => id === serviceId) ??
    null;
}

export function createSceneContentViewModel(placeId, serviceId) {
  const place = getScenePlace(placeId);
  const service = getSceneService(placeId, serviceId);
  if (!place || !service) return null;
  const sequence = String(
    place.services.findIndex(({ id }) => id === service.id) + 1,
  ).padStart(2, "0");

  return Object.freeze({
    placeId: place.id,
    placeName: place.name,
    placeKicker: place.kicker,
    artId: place.id,
    accent: place.accent,
    serviceId: service.id,
    serviceName: service.name,
    serviceDescription: service.description,
    sequence,
    eyebrow: service.presentation?.eyebrow ?? "COMMUNITY SERVICE · 社区服务",
    lead: service.presentation?.lead ?? service.description,
    contentTitle: service.presentation?.contentTitle ?? service.description,
    note: service.presentation?.note ?? "本页使用抽象艺术化内容呈现。",
    emptyTitle: service.presentation?.emptyTitle ?? "内容正在整理中",
    mediaPolicy: "abstract-only",
    navigation: Object.freeze(
      place.services.map((item, index) =>
        Object.freeze({
          id: item.id,
          name: item.name,
          sequence: String(index + 1).padStart(2, "0"),
          active: item.id === service.id,
        })
      ),
    ),
  });
}

export function createSceneRouteHash(placeId, serviceId = null) {
  const place = getScenePlace(placeId);
  if (!place) return "";
  const params = new URLSearchParams({ place: place.id });
  if (serviceId && getSceneService(place.id, serviceId)) {
    params.set("service", serviceId);
  }
  return `#${params.toString()}`;
}

export function parseSceneRouteHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const place = getScenePlace(params.get("place"));
  if (!place) return null;
  const requestedServiceId = params.get("service");
  const service = requestedServiceId
    ? getSceneService(place.id, requestedServiceId)
    : null;
  return Object.freeze({
    placeId: place.id,
    serviceId: service?.id ?? null,
  });
}
