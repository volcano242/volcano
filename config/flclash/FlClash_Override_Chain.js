const LANDING_PROXIES = [
{"type":"ss","udp":true,"server":"1.1.1.1","port":1000,"cipher":"aes-128-gcm","password":"example","name":"Example"},
];

const AD_FILTER = "(?i)剩余|重置|套餐|流量|到期|有效期|官网|官址|网址|过期|Expire|Expiry|Traffic|Usage|Quota|Reset|Balance|Info|Website|Telegram|通知|公告|说明|教程";

const REPO_BASE =
  "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano";
const ICON_BASE = `${REPO_BASE}/main/Icons`;
const RULE_BASE = `${REPO_BASE}/rules-output/mrs`;

const BASE_CONFIG = {
  "mixed-port": 7890,
  "allow-lan": false,
  "mode": "rule",
  "log-level": "silent",
  "ipv6": true,
  "unified-delay": true
};


const DNS_CONFIG = {
  "enable": true,
  "ipv6": true,
  "prefer-h3": false,
  "use-hosts": true,
  "use-system-hosts": true,
  "respect-rules": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "fake-ip-filter-mode": "blacklist",
  "fake-ip-filter": [
    "rule-set:fakeip-filter"
  ],
  "default-nameserver": [
    "114.114.114.114",
    "system"
  ],
  "direct-nameserver": [
    "https://doh.360.cn/dns-query"
  ],
  "proxy-server-nameserver": [
    "https://doh.pub/dns-query"
  ],
  "nameserver": [
    "https://dns12.quad9.net/dns-query#ecs=61.148.157.0/24&ecs-override=true"
  ],
  "nameserver-policy": {
    "rule-set:fakeip-filter": [
      "system"
    ]
  }
};

const RULE_PROVIDER_COMMON = {
  type: "http",
  format: "mrs",
  interval: 3600,
};

const RULE_PROVIDERS = {
  "banad": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/banad.mrs",
    "path": "./rule_providers/banad.mrs",
    "interval": 3600
  },
  "proxy": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/proxy.mrs",
    "path": "./rule_providers/proxy.mrs",
    "interval": 3600
  },
  "direct-domain": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/direct-domain.mrs",
    "path": "./rule_providers/direct-domain.mrs",
    "interval": 3600
  },
  "direct-ip": {
    "type": "http",
    "behavior": "ipcidr",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/direct-ip.mrs",
    "path": "./rule_providers/direct-ip.mrs",
    "interval": 3600
  },
  "telegram-ip": {
    "type": "http",
    "behavior": "ipcidr",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/telegram-ip.mrs",
    "path": "./rule_providers/telegram-ip.mrs",
    "interval": 3600
  },
  "ai": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/ai.mrs",
    "path": "./rule_providers/ai.mrs",
    "interval": 3600
  },
  "steam": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/steam.mrs",
    "path": "./rule_providers/steam.mrs",
    "interval": 3600
  },
  "steam@cn": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/steam@cn.mrs",
    "path": "./rule_providers/steam@cn.mrs",
    "interval": 3600
  },
  "private-domain": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/private-domain.mrs",
    "path": "./rule_providers/private-domain.mrs",
    "interval": 3600
  },
  "private-ip": {
    "type": "http",
    "behavior": "ipcidr",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/private-ip.mrs",
    "path": "./rule_providers/private-ip.mrs",
    "interval": 3600
  },
  "fakeip-filter": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/fakeip-filter.mrs",
    "path": "./rule_providers/fakeip-filter.mrs",
    "interval": 3600
  },
  "scholar": {
    "type": "http",
    "behavior": "domain",
    "format": "mrs",
    "url": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/scholar.mrs",
    "path": "./rule_providers/scholar.mrs",
    "interval": 3600
  }
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
  "MATCH,Final"
];


const TUN_CONFIG = {
  "enable": false,
  "stack": "mixed",
  "auto-route": true,
  "auto-detect-interface": true,
  "strict-route": true,
  "device": "TUN",
  "dns-hijack": [
    "any:53",
    "tcp://any:53"
  ]
};

const POLICY_GROUPS = [
  {
    "name": "Proxies",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/Google.png",
    "type": "select",
    "proxies": [
      "JP",
      "SG",
      "HK",
      "US",
      "Other"
    ]
  },
  {
    "name": "AI Service",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/ChatGPT.png",
    "type": "select",
    "proxies": [
      "JP",
      "US",
      "SG"
    ]
  },
  {
    "name": "Final",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/Final.png",
    "type": "select",
    "proxies": [
      "JP",
      "SG",
      "HK",
      "US",
      "Other",
      "DIRECT"
    ]
  }
];

const RESERVED_NAMES = [
  "Proxies", "AI Service", "Final", "Upstream",
  "DIRECT", "REJECT", "REJECT-DROP", "PASS", "COMPATIBLE", "GLOBAL",
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesFilter(name, filter) {
  return new RegExp(filter.replace(/^\(\?i\)/, ""), "i").test(name);
}

function normalizeProxy(proxy) {
  const result = { ...proxy, "skip-cert-verify": false };
  delete result["dialer-proxy"];
  delete result.dialer_proxy;
  delete result.skip_cert_verify;
  return result;
}

function processInlineProxies(proxies, forbiddenNames = []) {
  const names = new Set([...RESERVED_NAMES, ...forbiddenNames]);
  const seen = new Set();
  const result = [];

  for (const proxy of Array.isArray(proxies) ? proxies : []) {
    if (!isObject(proxy) || typeof proxy.name !== "string" || !proxy.name.trim()) {
      console.warn("忽略无效或缺少 name 的节点");
      continue;
    }
    if (matchesFilter(proxy.name, AD_FILTER)) continue;
    if (seen.has(proxy.name)) {
      console.warn("忽略重名节点：" + proxy.name);
      continue;
    }
    seen.add(proxy.name);
    if (names.has(proxy.name)) {
      throw new Error("节点名称与策略组或落地节点重名，请修改名称：" + proxy.name);
    }
    result.push(normalizeProxy(proxy));
  }
  return result;
}

function processProxyProviders(providers, forbiddenNames = []) {
  const result = {};
  if (!isObject(providers)) return result;

  for (const [name, provider] of Object.entries(providers)) {
    if (!isObject(provider)) throw new Error("无效的代理集合：" + name);
    const type = provider.type ||
      (Array.isArray(provider.payload) ? "inline" : provider.url ? "http" : "file");
    if (!["http", "file", "inline"].includes(type)) {
      throw new Error("不支持的代理集合类型：" + name + " / " + type);
    }
    if (type === "http" && (typeof provider.url !== "string" || !provider.url.trim())) {
      throw new Error("HTTP 代理集合缺少 url：" + name);
    }
    if (type === "file" && (typeof provider.path !== "string" || !provider.path.trim())) {
      throw new Error("文件代理集合缺少 path：" + name);
    }
    if (type === "inline" && !Array.isArray(provider.payload)) {
      throw new Error("内联代理集合缺少 payload：" + name);
    }

    const override = isObject(provider.override) ? { ...provider.override } : {};
    delete override.dialer_proxy;
    delete override.skip_cert_verify;
    override["dialer-proxy"] = "DIRECT";
    override["skip-cert-verify"] = false;
    const normalized = {
      ...clone(provider),
      type,
      interval: 3600,
      "health-check": {
        enable: true,
        interval: 600,
        url: "http://www.apple.com/library/test/success.html",
        lazy: false,
      },
      proxy: "DIRECT",
      "exclude-filter": provider["exclude-filter"]
        ? provider["exclude-filter"] + "|" + AD_FILTER
        : AD_FILTER,
      override,
    };
    if (type === "http") {
      normalized.path = provider.path ||
        "./proxy_providers/" + encodeURIComponent(name) + ".yaml";
      normalized.header = {
        ...(isObject(provider.header) ? provider.header : {}),
        "User-Agent": ["Clash-Verge/v2.5.2"],
      };
    }
    if (type === "inline") {
      normalized.payload = processInlineProxies(provider.payload, forbiddenNames);
    }
    result[name] = normalized;
  }
  return result;
}

function createLandingGroups(landingNames) {
  return ["Proxies", "AI Service", "Final"].map((name) => {
    const template = POLICY_GROUPS.find((group) => group.name === name);
    if (!template) throw new Error(`basic.yaml 缺少策略组 [${name}]`);
    return {
      ...clone(template),
      proxies: name === "Final"
        ? [...landingNames, "DIRECT"]
        : [...landingNames],
    };
  });
}

function applyBasicConfig(config) {
  Object.assign(config, clone(BASE_CONFIG));
  config.dns = clone(DNS_CONFIG);
  config.tun = clone(TUN_CONFIG);
  config["rule-providers"] = clone(RULE_PROVIDERS);
  config.rules = [...RULES];
}

function checkConfig(config, proxies, providers) {
  if (!isObject(config)) {
    throw new Error("传入的配置不是有效的 Clash/Mihomo 配置对象");
  }
  if (proxies.length === 0 && Object.keys(providers).length === 0) {
    throw new Error("配置中既没有有效 proxies，也没有有效 proxy-providers");
  }
}

function main(config) {
  if (!isObject(config)) throw new Error("传入的配置不是有效的 Clash/Mihomo 配置对象");
  if (!Array.isArray(LANDING_PROXIES) || LANDING_PROXIES.length === 0) {
    throw new Error("请在 LANDING_PROXIES 中填写至少一个落地节点");
  }

  const names = new Set(RESERVED_NAMES);
  const landingProxies = LANDING_PROXIES.map((proxy) => {
    if (!isObject(proxy) || typeof proxy.name !== "string" || !proxy.name.trim() ||
        !proxy.type || !proxy.server || !proxy.port) {
      throw new Error("落地节点必须填写 name、type、server 和 port");
    }
    if (names.has(proxy.name)) throw new Error("落地节点名称重复或与策略组重名：" + proxy.name);
    names.add(proxy.name);
    return { ...normalizeProxy(proxy), "dialer-proxy": "Upstream" };
  });
  const landingNames = landingProxies.map((proxy) => proxy.name);
  const upstreamProxies = processInlineProxies(config.proxies, landingNames);
  const upstreamProviders = processProxyProviders(config["proxy-providers"], landingNames);
  checkConfig(config, upstreamProxies, upstreamProviders);
  const providerNames = Object.keys(upstreamProviders);
  const upstreamGroup = {
    name: "Upstream",
    icon: `${ICON_BASE}/Meta.png`,
    type: "select",
  };
  if (upstreamProxies.length > 0) {
    upstreamGroup.proxies = upstreamProxies.map((proxy) => proxy.name);
  }
  if (providerNames.length > 0) upstreamGroup.use = providerNames;

  applyBasicConfig(config);
  config.proxies = [...upstreamProxies, ...landingProxies];
  config["proxy-providers"] = upstreamProviders;
  config["proxy-groups"] = [
    ...createLandingGroups(landingNames),
    upstreamGroup,
  ];
  console.log("链式覆写完成：全部订阅节点 → Upstream → 多个可选落地节点");
  return config;
}
