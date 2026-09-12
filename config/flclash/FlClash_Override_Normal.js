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

const REGION_GROUPS = [
  {
    "name": "JP",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/JP.png",
    "type": "select",
    "filter": "(?i)日本|JP|Japan|🇯🇵"
  },
  {
    "name": "SG",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/SG.png",
    "type": "select",
    "filter": "(?i)新加坡|狮城|SG|Singapore|🇸🇬"
  },
  {
    "name": "HK",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/HK.png",
    "type": "select",
    "filter": "(?i)港|HK|Hong|Kong|🇭🇰"
  },
  {
    "name": "US",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/US.png",
    "type": "select",
    "filter": "(?i)美|US|United States|🇺🇸"
  },
  {
    "name": "Other",
    "icon": "https://gh-proxy.org/https://raw.githubusercontent.com/volcano242/volcano/main/Icons/Flclash.png",
    "type": "select",
    "filter": "(?i)^(?!.*(港|HK|Hong|Kong|🇭🇰|新加坡|狮城|SG|Singapore|🇸🇬|日本|JP|Japan|🇯🇵|美|US|United States|🇺🇸)).*"
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function forceCertificateVerification(config) {
  if (Array.isArray(config.proxies)) {
    config.proxies = config.proxies.map((proxy) =>
      isObject(proxy)
        ? { ...proxy, "skip-cert-verify": false }
        : proxy,
    );
  }

  if (!isObject(config["proxy-providers"])) return;

  for (const provider of Object.values(config["proxy-providers"])) {
    if (!isObject(provider)) continue;

    provider.override = {
      ...(isObject(provider.override) ? provider.override : {}),
      "skip-cert-verify": false,
    };

    if (Array.isArray(provider.payload)) {
      provider.payload = provider.payload.map((proxy) =>
        isObject(proxy)
          ? { ...proxy, "skip-cert-verify": false }
          : proxy,
      );
    }
  }
}

function main(config) {
  if (!isObject(config)) {
    throw new Error("传入的配置不是有效的 Clash/Mihomo 配置对象");
  }

  const inlineCount = Array.isArray(config.proxies) ? config.proxies.length : 0;
  const providerCount = isObject(config["proxy-providers"])
    ? Object.keys(config["proxy-providers"]).length
    : 0;
  if (inlineCount === 0 && providerCount === 0) {
    throw new Error("配置中既没有 proxies，也没有 proxy-providers");
  }

  forceCertificateVerification(config);
  Object.assign(config, clone(BASE_CONFIG));
  config.dns = clone(DNS_CONFIG);
  config.tun = clone(TUN_CONFIG);
  config["proxy-groups"] = [
    ...clone(POLICY_GROUPS),
    ...REGION_GROUPS.map((group) => ({
      ...clone(group),
      type: "select",
      "include-all": true,
      "exclude-filter": AD_FILTER,
      "empty-fallback": "REJECT",
    })),
  ];
  config["rule-providers"] = clone(RULE_PROVIDERS);
  config.rules = [...RULES];

  console.log("普通覆写完成：节点与代理集合保持原样，仅强制证书验证");
  return config;
}
