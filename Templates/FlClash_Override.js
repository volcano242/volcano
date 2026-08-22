const LANDING_PROXIES = [
  // 每个对象按 Mihomo 对应协议的节点格式填写；添加节点时复制整个对象。
  // name 必须唯一；脚本会自动将所有落地节点的前置代理设为 Upstream。
{"type":"ss","udp":true,"server":"1.1.1.1","port":1000,"cipher":"aes-128-gcm","password":"example","name":"Example"},
];

const AD_FILTER =
  "(?i)剩余|重置|套餐|流量|到期|有效期|官网|官址|网址|过期|Expire|Expiry|Traffic|Usage|Quota|Reset|Balance|Info|Website|Telegram|通知|公告|说明|教程";

const ICON_BASE =
  "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons";

const BASE_CONFIG = {
  "mixed-port": 7890,
  "allow-lan": false,
  mode: "rule",
  "log-level": "silent",
  ipv6: false,
  "unified-delay": true,
};

const HOSTS_CONFIG = {
  "dns.google": ["8.8.8.8", "8.8.4.4"],
};

const DNS_CONFIG = {
  enable: true,
  ipv6: false,
  "prefer-h3": false,
  "use-hosts": true,
  "use-system-hosts": true,
  "respect-rules": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "fake-ip-filter-mode": "blacklist",
  "fake-ip-filter": ["rule-set:fakeip-filter"],

  "default-nameserver": [
    "119.29.29.29",
    "223.5.5.5",
    "system",
  ],

  "direct-nameserver": [
    "119.29.29.29",
    "223.5.5.5",
    "system",
  ],

  "proxy-server-nameserver": [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query",
  ],

  nameserver: [
    "https://dns.google/dns-query#ecs=221.220.50.0/24&ecs-override=true",
  ],
};

const TUN_CONFIG = {
  enable: false,
  stack: "mixed",
  "auto-route": true,
  "auto-detect-interface": true,
  "strict-route": true,
  device: "TUN",
  "dns-hijack": [
    "any:53",
    "tcp://any:53",
  ],
};

const RULE_PROVIDER_COMMON = {
  type: "http",
  format: "mrs",
  interval: 3600,
};

const RULE_PROVIDERS = {
  banad: {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/Filters/AWAvenue-Ads-Rule-Clash.mrs",
    path: "./rule_providers/banad.mrs",
  },

  proxy: {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/proxy.mrs",
    path: "./rule_providers/proxy.mrs",
  },

  "direct-domain": {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/direct-domain.mrs",
    path: "./rule_providers/direct-domain.mrs",
  },

  "direct-ip": {
    ...RULE_PROVIDER_COMMON,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs",
    path: "./rule_providers/direct-ip.mrs",
  },

  "telegram-ip": {
    ...RULE_PROVIDER_COMMON,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs",
    path: "./rule_providers/telegram-ip.mrs",
  },

  ai: {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ai-!cn.mrs",
    path: "./rule_providers/ai.mrs",
  },

  steam: {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/steam.mrs",
    path: "./rule_providers/steam.mrs",
  },

  "steam@cn": {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/steam@cn.mrs",
    path: "./rule_providers/steam@cn.mrs",
  },

  "private-domain": {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs",
    path: "./rule_providers/private-domain.mrs",
  },

  "private-ip": {
    ...RULE_PROVIDER_COMMON,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/private.mrs",
    path: "./rule_providers/private-ip.mrs",
  },

  "fakeip-filter": {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/fakeip-filter.mrs",
    path: "./rule_providers/fakeip-filter.mrs",
  },

  scholar: {
    ...RULE_PROVIDER_COMMON,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/scholar.mrs",
    path: "./rule_providers/scholar.mrs",
  },
};

const RULES = [
  "DOMAIN-SUFFIX,gh-proxy.org,DIRECT",
  "AND,((NETWORK,UDP),(DST-PORT,443)),REJECT",
  "RULE-SET,banad,REJECT",
  "RULE-SET,private-domain,DIRECT",
  "RULE-SET,private-ip,DIRECT,no-resolve",
  "RULE-SET,steam@cn,DIRECT",
  "RULE-SET,steam,Proxies",
  "RULE-SET,scholar,DIRECT",
  "RULE-SET,ai,AI Service",
  "RULE-SET,telegram-ip,Proxies,no-resolve",
  "RULE-SET,proxy,Proxies",
  "RULE-SET,direct-domain,DIRECT",
  "RULE-SET,direct-ip,DIRECT",
  "MATCH,Final",
];

function escapeForRegExp(text) {
  return String(text).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

function isAdNodeName(name) {
  const keywords = AD_FILTER
    .replace(/^\(\?i\)/, "")
    .split("|");

  const regex = new RegExp(
    keywords
      .map(escapeForRegExp)
      .join("|"),
    "i",
  );

  return regex.test(String(name));
}

function mergeExcludeFilter(
  existingFilter,
  appendedFilter,
) {
  if (!existingFilter) {
    return appendedFilter;
  }

  if (!appendedFilter) {
    return existingFilter;
  }

  return `(${existingFilter})|(${appendedFilter})`;
}

function uniqueStrings(values) {
  return [
    ...new Set(
      values.filter(
        (value) =>
          typeof value === "string" &&
          value.length > 0,
      ),
    ),
  ];
}

function processInlineProxies(
  proxies,
  landingNames,
) {
  const landingNameSet = new Set(landingNames);
  const names = new Set();
  const result = [];

  for (
    const proxy of Array.isArray(proxies)
      ? proxies
      : []
  ) {
    if (
      !proxy ||
      typeof proxy !== "object" ||
      Array.isArray(proxy) ||
      !proxy.name
    ) {
      console.warn(
        "警告：忽略无效或缺少 name 的内联节点",
        proxy,
      );
      continue;
    }

    if (landingNameSet.has(proxy.name)) {
      continue;
    }

    if (isAdNodeName(proxy.name)) {
      console.log(
        `信息：过滤提示节点 [${proxy.name}]`,
      );
      continue;
    }

    if (names.has(proxy.name)) {
      console.warn(
        `警告：忽略重名内联节点 [${proxy.name}]`,
      );
      continue;
    }

    names.add(proxy.name);

    const normalized = {
      ...proxy,
      "skip-cert-verify": false,
    };

    // 防止订阅中的节点自己携带链式代理配置，
    // 否则可能产生嵌套链路或代理循环。
    delete normalized["dialer-proxy"];
    delete normalized["dialer_proxy"];
    delete normalized["skip_cert_verify"];

    result.push(normalized);
  }

  return result;
}

function processProxyProviders(providers) {
  const result = {};

  if (
    !providers ||
    typeof providers !== "object" ||
    Array.isArray(providers)
  ) {
    return result;
  }

  for (
    const [name, provider] of Object.entries(
      providers,
    )
  ) {
    if (
      !provider ||
      typeof provider !== "object" ||
      Array.isArray(provider)
    ) {
      console.warn(
        `警告：忽略无效代理集合 [${name}]`,
      );
      continue;
    }

    const existingOverride =
      provider.override &&
      typeof provider.override === "object" &&
      !Array.isArray(provider.override)
        ? provider.override
        : {};

    result[name] = {
      ...provider,

      // 下载代理集合时直连，避免代理集合依赖自己。
      proxy: "DIRECT",

      "exclude-filter": mergeExcludeFilter(
        provider["exclude-filter"],
        AD_FILTER,
      ),

      override: {
        ...existingOverride,
        "skip-cert-verify": false,
      },
    };
  }

  return result;
}

function createProxyGroups(
  upstreamProxyNames,
  providerNames,
  landingNames,
) {
  const upstreamGroup = {
    name: "Upstream",
    icon: `${ICON_BASE}/Meta.png`,
    type: "select",
  };

  if (upstreamProxyNames.length > 0) {
    upstreamGroup.proxies = upstreamProxyNames;
  }

  if (providerNames.length > 0) {
    upstreamGroup.use = providerNames;
  }

  return [
    {
      name: "Proxies",
      icon: `${ICON_BASE}/Google.png`,
      type: "select",
      proxies: [...landingNames],
    },

    {
      name: "AI Service",
      icon: `${ICON_BASE}/ChatGPT.png`,
      type: "select",
      proxies: [...landingNames],
    },

    {
      name: "Final",
      icon: `${ICON_BASE}/Final.png`,
      type: "select",
      proxies: [
        ...landingNames,
        "DIRECT",
      ],
    },

    upstreamGroup,
  ];
}

function validateGeneratedConfig(
  config,
  upstreamProxyNames,
  providerNames,
  landingNames,
) {
  const upstreamNameSet = new Set(
    upstreamProxyNames,
  );

  const circularName = landingNames.find(
    (name) => upstreamNameSet.has(name),
  );

  if (circularName) {
    throw new Error(
      `落地节点 [${circularName}] 被错误加入Upstream列表，会形成代理循环`,
    );
  }

  if (
    upstreamProxyNames.length === 0 &&
    providerNames.length === 0
  ) {
    throw new Error(
      "配置文件中未找到任何可作为Upstream的节点或代理集合",
    );
  }

  const groupMap = new Map(
    (config["proxy-groups"] || []).map(
      (group) => [group && group.name, group],
    ),
  );

  const requiredGroups = [
    "Upstream",
    "Proxies",
    "AI Service",
    "Final",
  ];

  for (const required of requiredGroups) {
    if (!groupMap.has(required)) {
      throw new Error(
        `生成结果缺少策略组 [${required}]`,
      );
    }
  }

  for (
    const groupName of [
      "Proxies",
      "AI Service",
      "Final",
    ]
  ) {
    const group = groupMap.get(groupName);

    for (const landingName of landingNames) {
      if (
        !Array.isArray(group.proxies) ||
        !group.proxies.includes(landingName)
      ) {
        throw new Error(
          `策略组 [${groupName}] 缺少落地节点 [${landingName}]`,
        );
      }
    }
  }

  for (const landingName of landingNames) {
    const landingProxy = (
      config.proxies || []
    ).find(
      (proxy) =>
        proxy &&
        proxy.name === landingName,
    );

    if (!landingProxy) {
      throw new Error(
        `生成结果缺少落地节点 [${landingName}]`,
      );
    }

    if (
      landingProxy["dialer-proxy"] !==
      "Upstream"
    ) {
      throw new Error(
        `落地节点 [${landingName}] 未使用 Upstream`,
      );
    }
  }
}

function main(config) {
  if (
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  ) {
    throw new Error(
      "传入的配置不是有效的 Clash/Mihomo 配置对象",
    );
  }

  const landingProxies =
    LANDING_PROXIES.map(
      (proxy) => ({
        ...proxy,
        "dialer-proxy": "Upstream",
      }),
    );

  const landingNames =
    landingProxies.map(
      (proxy) => proxy.name,
    );

  const upstreamProxies =
    processInlineProxies(
      config.proxies,
      landingNames,
    );

  const upstreamProviders =
    processProxyProviders(
      config["proxy-providers"],
    );

  const upstreamProxyNames =
    uniqueStrings(
      upstreamProxies.map(
        (proxy) => proxy.name,
      ),
    );

  const providerNames =
    uniqueStrings(
      Object.keys(upstreamProviders),
    );

  if (
    upstreamProxyNames.length === 0 &&
    providerNames.length === 0
  ) {
    throw new Error(
      "配置中既没有有效 proxies，也没有有效 proxy-providers",
    );
  }

  Object.assign(
    config,
    BASE_CONFIG,
  );

  config.hosts = HOSTS_CONFIG;
  config.dns = DNS_CONFIG;
  config.tun = TUN_CONFIG;

  config.proxies = [
    ...upstreamProxies,
    ...landingProxies,
  ];

  config["proxy-providers"] =
    upstreamProviders;

  config["proxy-groups"] =
    createProxyGroups(
      upstreamProxyNames,
      providerNames,
      landingNames,
    );

  config["rule-providers"] =
    RULE_PROVIDERS;

  config.rules = RULES;

  validateGeneratedConfig(
    config,
    upstreamProxyNames,
    providerNames,
    landingNames,
  );

  console.log(
    [
      "信息：链式代理配置生成完成",
      `内联Upstream节点：${upstreamProxyNames.length} 个`,
      `代理集合：${providerNames.length} 个`,
      `落地节点：${landingNames.join("、")}`,
    ].join("；"),
  );

  return config;
}