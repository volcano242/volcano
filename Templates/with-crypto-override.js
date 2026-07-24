// with_crypto.yaml -> mihomo / Clash Verge Rev 扩展脚本
// 原模板：
// https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/Templates/with_crypto.yaml
//
// 设计说明：
// 1. 保留当前订阅中已有的 proxies 与 proxy-providers，不再写死 subscription_url。
// 2. 对内联节点启用 UDP，并过滤套餐/流量等提示节点。
// 3. 对 proxy-providers 合并 exclude-filter，使远程订阅中的提示节点同样被过滤。
// 4. 地区组通过 include-all + filter/exclude-filter 动态收集所有内联节点和代理集合节点。

const AD_FILTER =
  "(?i)剩余|重置|套餐|流量|到期|有效期|官网|官址|网址|过期|Expire|Expiry|Traffic|Usage|Quota|Reset|Balance|Info|Website|Telegram|通知|公告|说明|教程";

const REGION_FILTERS = {
  JP: "(?i)日本|JP|Japan|🇯🇵",
  TW: "(?i)台|新北|彰化|TW|Taiwan|🇹🇼",
  HK: "(?i)港|HK|Hong|Kong|Hong Kong|🇭🇰",
  US: "(?i)美|US|United States|America|🇺🇸"
};

const ALL_REGION_FILTER = Object.values(REGION_FILTERS).join("|");

const ICON_BASE =
  "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons";

const baseConfig = {
  "mixed-port": 7890,
  "allow-lan": false,
  mode: "rule",
  "log-level": "silent",
  ipv6: true,
  "unified-delay": true
};

const hostsConfig = {
  "dns.google": ["8.8.8.8", "8.8.4.4"]
};

const dnsConfig = {
  enable: true,
  ipv6: true,
  "prefer-h3": false,
  "use-hosts": true,
  "use-system-hosts": true,
  "respect-rules": true,
  "enhanced-mode": "fake-ip",
  "fake-ip-range": "198.18.0.1/16",
  "fake-ip-filter-mode": "blacklist",
  "fake-ip-filter": ["rule-set:fakeip-filter"],
  "default-nameserver": ["119.29.29.29", "223.5.5.5", "system"],
  "direct-nameserver": ["119.29.29.29", "223.5.5.5", "system"],
  "proxy-server-nameserver": [
    "https://doh.pub/dns-query",
    "https://dns.alidns.com/dns-query"
  ],
  nameserver: [
    "https://dns.google/dns-query#ecs=221.220.50.0/24&ecs-override=true"
  ]
};

const tunConfig = {
  enable: false,
  stack: "mixed",
  "auto-route": true,
  "auto-detect-interface": true,
  "strict-route": true,
  device: "TUN",
  "dns-hijack": ["any:53", "tcp://any:53"]
};

const ruleProviderCommon = {
  type: "http",
  format: "mrs",
  interval: 3600
};

const ruleProviders = {
  cryptocurrency: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-cryptocurrency.mrs",
    path: "./rule_providers/cryptocurrency.mrs"
  },
  banad: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/Filters/AWAvenue-Ads-Rule-Clash.mrs",
    path: "./rule_providers/banad.mrs"
  },
  proxy: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/proxy.mrs",
    path: "./rule_providers/proxy.mrs"
  },
  "direct-domain": {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/direct.mrs",
    path: "./rule_providers/direct-domain.mrs"
  },
  "direct-ip": {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/cn.mrs",
    path: "./rule_providers/direct-ip.mrs"
  },
  "telegram-ip": {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/telegram.mrs",
    path: "./rule_providers/telegram-ip.mrs"
  },
  ai: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/category-ai-!cn.mrs",
    path: "./rule_providers/ai.mrs"
  },
  steam: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/steam.mrs",
    path: "./rule_providers/steam.mrs"
  },
  "steam@cn": {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/steam@cn.mrs",
    path: "./rule_providers/steam@cn.mrs"
  },
  "private-domain": {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geosite/private.mrs",
    path: "./rule_providers/private-domain.mrs"
  },
  "private-ip": {
    ...ruleProviderCommon,
    behavior: "ipcidr",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/meta/geo/geoip/private.mrs",
    path: "./rule_providers/private-ip.mrs"
  },
  "fakeip-filter": {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/fakeip-filter.mrs",
    path: "./rule_providers/fakeip-filter.mrs"
  },
  scholar: {
    ...ruleProviderCommon,
    behavior: "domain",
    url: "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/rules-output/mrs/scholar.mrs",
    path: "./rule_providers/scholar.mrs"
  }
};

const rules = [
  "AND,((NETWORK,UDP),(DST-PORT,443)),REJECT",
  "RULE-SET,banad,REJECT",
  "RULE-SET,private-domain,DIRECT",
  "RULE-SET,private-ip,DIRECT,no-resolve",
  "RULE-SET,steam@cn,DIRECT",
  "RULE-SET,steam,Proxies",
  "RULE-SET,scholar,DIRECT",
  "RULE-SET,cryptocurrency,Crypto Currency",
  "RULE-SET,ai,AI Service",
  "RULE-SET,telegram-ip,Proxies,no-resolve",
  "RULE-SET,proxy,Proxies",
  "RULE-SET,direct-domain,DIRECT",
  "RULE-SET,direct-ip,DIRECT",
  "MATCH,Final"
];

function createProxyGroups() {
  return [
    {
      name: "Proxies",
      icon: `${ICON_BASE}/Google.png`,
      type: "select",
      proxies: ["JP", "TW", "HK", "US", "Other"]
    },
    {
      name: "AI Service",
      icon: `${ICON_BASE}/ChatGPT.png`,
      type: "select",
      proxies: ["JP", "US", "TW"]
    },
    {
      name: "Crypto Currency",
      icon: `${ICON_BASE}/Bybit.png`,
      type: "select",
      proxies: ["TW", "JP", "US"]
    },
    {
      name: "Final",
      icon: `${ICON_BASE}/Final.png`,
      type: "select",
      proxies: ["JP", "TW", "HK", "US", "Other", "DIRECT"]
    },
    {
      name: "JP",
      icon: `${ICON_BASE}/JP.png`,
      type: "select",
      "include-all": true,
      filter: REGION_FILTERS.JP
    },
    {
      name: "TW",
      icon: `${ICON_BASE}/CN.png`,
      type: "select",
      "include-all": true,
      filter: REGION_FILTERS.TW
    },
    {
      name: "HK",
      icon: `${ICON_BASE}/HK.png`,
      type: "select",
      "include-all": true,
      filter: REGION_FILTERS.HK
    },
    {
      name: "US",
      icon: `${ICON_BASE}/US.png`,
      type: "select",
      "include-all": true,
      filter: REGION_FILTERS.US
    },
    {
      name: "Other",
      icon: `${ICON_BASE}/Flclash.png`,
      type: "select",
      "include-all": true,
      "exclude-filter": ALL_REGION_FILTER
    }
  ];
}

function escapeForRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isAdNodeName(name) {
  // JS 不支持 Mihomo 规则中的内联 (?i)，因此在这里单独构造大小写不敏感正则。
  const keywords = AD_FILTER.replace(/^\(\?i\)/, "").split("|");
  const regex = new RegExp(keywords.map(escapeForRegExp).join("|"), "i");
  return regex.test(name);
}

function mergeExcludeFilter(existingFilter, appendedFilter) {
  if (!existingFilter) return appendedFilter;
  if (!appendedFilter) return existingFilter;
  return `(${existingFilter})|(${appendedFilter})`;
}

function processProxyProviders(providers) {
  const result = {};

  for (const [name, provider] of Object.entries(providers || {})) {
    if (!provider || typeof provider !== "object") {
      console.warn(`警告：忽略无效代理集合 [${name}]`);
      continue;
    }

    result[name] = {
      ...provider,
      "exclude-filter": mergeExcludeFilter(
        provider["exclude-filter"],
        AD_FILTER
      )
    };
  }

  return result;
}

function main(config) {
  if (!config || typeof config !== "object") {
    throw new Error("传入的配置不是有效对象");
  }

  const originalProxies = Array.isArray(config.proxies) ? config.proxies : [];
  const originalProviders =
    config["proxy-providers"] &&
    typeof config["proxy-providers"] === "object" &&
    !Array.isArray(config["proxy-providers"])
      ? config["proxy-providers"]
      : {};

  if (
    originalProxies.length === 0 &&
    Object.keys(originalProviders).length === 0
  ) {
    throw new Error("配置文件中未找到任何代理或代理集合");
  }

  const processedProxies = originalProxies
    .filter((proxy) => {
      if (!proxy || typeof proxy !== "object" || !proxy.name) {
        console.warn("警告：忽略无效或缺少名称的节点", proxy);
        return false;
      }

      if (isAdNodeName(proxy.name)) {
        console.log(`信息：过滤提示节点 [${proxy.name}]`);
        return false;
      }

      return true;
    })
    .map((proxy) => ({
      ...proxy,
      udp: true
    }));

  Object.assign(config, baseConfig);
  config.hosts = hostsConfig;
  config.dns = dnsConfig;
  config.tun = tunConfig;
  config.proxies = processedProxies;
  config["proxy-providers"] = processProxyProviders(originalProviders);
  config["proxy-groups"] = createProxyGroups();
  config["rule-providers"] = ruleProviders;
  config.rules = rules;

  console.log(
    `信息：保留 ${processedProxies.length} 个内联节点和 ${Object.keys(config["proxy-providers"]).length} 个代理集合`
  );

  return config;
}
