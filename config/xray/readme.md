# Xray 节点安装

适用于使用 apt-get 和 systemd 的 Debian/Ubuntu，需 root 权限；默认固定安装 Xray **v26.11.9** 。两个脚本部署的 Xray 服务均以 **root** 身份运行。

| 脚本 | 节点与交互 |
| --- | --- |
| `xray-ss-install.sh` | SS2022，固定 `2022-blake3-aes-256-gcm`，TCP/UDP；输入端口，手填密钥或自动生成 32 字节随机密钥，使用 Base64 编码（44 个字符） |
| `xray-vlessenc-install.sh` | VLESS ENC，ML-KEM-768 认证、`native`、服务端 `600s` / 客户端 `0rtt`，RAW TCP + Vision；输入端口，自动生成 UUID 和密钥 |

两者均安装依赖、设置系统 DNS（1.1.1.1 / 8.8.8.8）、尝试启用 BBR、校验下载、预检配置、备份并替换核心与配置、启动服务、放行本机防火墙端口，最后输出 Mihomo 节点对象与分享链接。核心替换或启动失败时回滚。

云安全组需另行放行 SS 的 TCP/UDP 或 VLESS 的 TCP 端口。两个脚本共用同一套服务和路径，后安装者覆盖前者。



## 运行

```bash
# SS2022
bash <(curl -fsSL https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/config/xray/xray-ss-install.sh)

# VLESS ENC
bash <(curl -fsSL https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/config/xray/xray-vlessenc-install.sh)

# 手动指定版本（两个脚本均支持；以下以 SS 为例）
XRAY_VERSION=v26.11.9 bash <(curl -fsSL https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/config/xray/xray-ss-install.sh)
```

手动指定的版本需支持所选协议及配置。

SS2022 AES-256-GCM 的密钥必须是 32 字节随机值的标准 Base64 编码（44 个字符，以 `=` 结尾），不能直接填写普通口令。可用 `openssl rand -base64 32` 生成，或选择脚本自动生成。

## 手动更新核心

以 root 执行，自动获取最新正式版，仅替换核心并重启服务，保留现有配置、密钥和 GeoData。

```bash
bash <<'XRAY_UPDATE'
set -euo pipefail
case "$(uname -m)" in
  x86_64|amd64) arch=64 ;;
  aarch64|arm64) arch=arm64-v8a ;;
  armv7l|armv7*) arch=arm32-v7a ;;
  i386|i486|i586|i686) arch=32 ;;
  *) echo '不支持的架构'; exit 1 ;;
esac
version=$(curl -fsSL https://api.github.com/repos/XTLS/Xray-core/releases/latest | jq -er '.tag_name')
tmp=$(mktemp -d)
trap 'rm -rf -- "$tmp"' EXIT
base="https://github.com/XTLS/Xray-core/releases/download/$version/Xray-linux-$arch.zip"
curl -fL --retry 3 "$base" -o "$tmp/core.zip"
curl -fsSL --retry 3 "$base.dgst" -o "$tmp/core.dgst"
sha=$(awk -F '= ' '/256=/ {gsub(/\r/, "", $2); print tolower($2); exit}' "$tmp/core.dgst")
printf '%s  %s\n' "$sha" "$tmp/core.zip" | sha256sum -c -
unzip -q "$tmp/core.zip" xray -d "$tmp"
install -m 755 "$tmp/xray" /usr/local/bin/xray.new
mv -f /usr/local/bin/xray.new /usr/local/bin/xray
systemctl restart xray.service
xray version
XRAY_UPDATE
```

## 服务与目录

| 路径 / 单元 | 用途 |
| --- | --- |
| `/etc/systemd/system/xray.service` | Xray 主服务；以 root 运行，进程时区为 Asia/Shanghai |
| `/usr/local/bin/xray` | Xray 核心 |
| `/usr/local/etc/xray/config.json` | 节点配置与私钥，权限 0600，仅 root 可读写 |
| `/usr/local/share/xray/` | 安装发行包提供的 `geoip.dat`。重装时备份并移除已有的 `geosite.dat` |
| `/usr/local/lib/xray-backup/<时间戳>-<PID>/` | 重装前的核心、配置、服务与 GeoData 备份 |
| `/run/xray/` | 主服务运行目录 |
| `/run/lock/xray-maintenance.lock` | 两个节点安装脚本共用的安装互斥锁 |
| `/etc/systemd/resolved.conf.d/99-xray-dns.conf` | 使用 systemd-resolved 时的系统 DNS 设置 |
| `/etc/resolv.conf`、`/etc/resolv.conf.bak.*` | 系统 DNS 入口及替换前备份 |
| `/etc/modules-load.d/bbr.conf`、`/etc/sysctl.d/99-bbr.conf` | BBR 模块与内核参数（内核支持时启用） |

## 最终配置示例

以下 `config.json` 将 SS2022 与 VLESS ENC 合并在同一核心，分别监听 8388（TCP/UDP）和 8399（TCP）。下方 Mihomo 节点与之对应。示例服务器地址统一为 `203.0.113.10`，实际使用时替换为服务器 IP。

公开示例凭据不可用于生产。VLESS ENC 的配对参数由 SHA-256 校验通过的官方 Xray v26.11.9 执行 `xray vlessenc` 生成，选取 ML-KEM-768 区块；客户端需支持对应协议和 VLESS ENC。

### Xray config.json

```json
{
  "log": {
    "loglevel": "warning"
  },
  "dns": {
    "servers": [
      {
        "address": "1.1.1.1"
      },
      {
        "address": "8.8.8.8"
      }
    ],
    "enableParallelQuery": false
  },
  "inbounds": [
    {
      "tag": "ss-in",
      "listen": "::",
      "port": 8388,
      "protocol": "shadowsocks",
      "settings": {
        "method": "2022-blake3-aes-256-gcm",
        "password": "93eFYM5azdO3zD8OemJVhy55lKFb1InZWionDB9FWgg=",
        "network": "tcp,udp"
      }
    },
    {
      "tag": "vless-enc-in",
      "listen": "::",
      "port": 8399,
      "protocol": "vless",
      "settings": {
        "users": [
          {
            "id": "b7d34da0-8fb0-49a1-8506-64483e22d5cc",
            "flow": "xtls-rprx-vision"
          }
        ],
        "decryption": "mlkem768x25519plus.native.600s.yN3wZTsIgYjrp1SE5HdhoXSeU7iLiH-SkKPp015mLD0KH6ZxXmRkemYQHidtj_WMKalDPawe1X_23YPQ3bc05Q"
      },
      "streamSettings": {
        "network": "raw",
        "security": "none"
      }
    }
  ],
  "outbounds": [
    {
      "tag": "direct",
      "protocol": "freedom",
      "settings": {},
      "streamSettings": {
        "sockopt": {
          "domainStrategy": "UseIPv4v6"
        }
      }
    }
  ],
  "routing": {
    "domainStrategy": "AsIs",
    "rules": [
      {
        "network": "tcp,udp",
        "outboundTag": "direct"
      }
    ]
  }
}
```

### Mihomo 节点

两个脚本都使用「国旗 emoji + 空格 + ASN 机构名」作为 Mihomo 节点名和分享链接备注，例如 `🇺🇸 NTT`。机构名缺失时依次使用 `AS<编号>` 和 `VPS`。国家代码缺失或无效时使用白旗 `🏳️`。

下面的示例将两个协议放进同一份 Mihomo 配置，因此手动给节点名加上协议后缀以区分。

```yaml
proxies:
  - name: "🇺🇸 NTT (SS2022)"
    type: ss
    udp: true
    server: 203.0.113.10
    port: 8388
    cipher: 2022-blake3-aes-256-gcm
    password: "93eFYM5azdO3zD8OemJVhy55lKFb1InZWionDB9FWgg="

  - name: "🇺🇸 NTT (VLESS ENC)"
    type: vless
    udp: true
    server: 203.0.113.10
    port: 8399
    uuid: "b7d34da0-8fb0-49a1-8506-64483e22d5cc"
    flow: xtls-rprx-vision
    network: tcp
    encryption: "mlkem768x25519plus.native.0rtt.YplU7_VQFRo8ZMFzTnvP0UJF_KeGzOO2AviC0KKSeBysoKcuxOieT5bPwFWH3wCTVfBJTKBPU4HBb4B6htgv-OWo5_Vr8nN5TRJx7iohv1ioQPvGkskaD5E4dplo_1U5ouwMzlWsJ9ZStchF5BfGekc-KTqAA1U2MvcYLDZaI1a1MlMkUvBdhkt1dIouzJY-zAM9BxIVQEVib0DG04CLore0t7m3aiMc06clglw-atSSbEOKxTkM4JGGZaR9KbVH34xibOuYubjE9lqTeWOjW3akFnUJl9ZSz5wBmsEl_mA-drseROUPgEwJQbxa6UuF9PMQbhMKKaQJyWdjtBq2nuRC56aTqjhh-HXIq8GJpOym-AQ7JdN3aqFDALuc5JhS7biskeaefPa0QrOMbPuslEu0OvFeAFCc92eVi_MA5akyw9fPZmuHDtAzJjt3TBJ1h3GRpkVanTJP-HkutSGSVkKzrBvP7zyk9YfCp6gfu2leU5J4sdUtryazFCMdw0InkPIDzymCggk9oNPEW0mFK9od1Vl0tBR9UvpkbDAbEXOpHwtHcrsU7dIfI2dFCmcI3RM6YBxsyATLz_iXv2lyxRU1c8WV7QeMoFpgWzGpmnJ0Y5UxmeBVfcwfDQSZg_oVtqafqdLKcdxcoHBt2QquE3B-W5FD2lhevBg7yJZAVqdT95Cu1ze7XByaZxAsFUBuZEl4ubqFmjFJBtWRlbqnSRdWYeUaCJYmnptC1ksS3TQ8uIKDy6g1xlkzcmB61jhcK7xMT3NvHLMVivccz3gU5jh4tRE5d2Q4T9g112YP2KNAmoKq_nIbIdKYd_sm1XESryC3-aGtlns6y8liRHOHgfYVTsmD_dGFwFZBm6Bsc2A92TgNB8S-RtlD9FAhK_yI7GPI8vXKmpZguydfg3vLUCWBYNVtgnosfxIhyJBrnawyKcEoy9AlQWOMYvt0MjBn9GgGZvJ-fnMvxZGaSdAVpunI-zeiqJsK10ib9soRepoiG3I2vJAiL6w-yvK8kuG-UpA4y7QRL_AOsjY-8Xsonaiq9toij8sdVBarMKofXzaDqoQMbqKm6pRDWywixcAB-IgZpMltGFhmeFykO7AXJGl6UbbEjbDLbNe5GQbEn6mLr7SV5-s6D6KmSHQJ-LRc8_g7xeEdP8sNoZYkaMGcskkvj-qn8uqSMfazkmHCiMMzcDcz55yF8qpyTfsWyOw8Q6ZICjqbHQvQV8w2SBc2oMZJpdVz2MBqNWKf_qoSVnIsgsZcshJQY7oGpho6oscR-sZOEJK6JmQV6hcV4lpta0YAxuJHaRBfSAUO7Tl1VaGb32waAVxmWJc8rokyJRuTcKyB9VqfR6y5gxXEZAQi2Iurw6sHtzkfFia1ynDKWDEjOGmC1Aw_sjtWrRpdQ9SEEsWlmlCKZnsy1gQyeLW4CWS2rQU-NLesoIyL1LZjdcSc1ncGjtiPrQzOvkvCoGNB5sqPykCTwBlj0AlSCTAftTxI_0BDo0N1dox3fDWhGvOZCZcCbeKI-UCPyhEbVcehZSysbxFFFJVS6G60Rb0QUTBpTHUjDIH1EBnC6AAGIxU"
    packet-encoding: xudp
    tls: false
```

## Xray 常用命令

以下以 root 执行：

```bash
# 查看版本
xray version

# 检查配置（不启动服务）
TZ=Asia/Shanghai XRAY_LOCATION_ASSET=/usr/local/share/xray xray run -test -config /usr/local/etc/xray/config.json

# 查看运行状态
systemctl status xray.service --no-pager

# 启动 / 停止 / 重启（修改配置后需重启）
systemctl start xray.service
systemctl stop xray.service
systemctl restart xray.service

# 开启 / 关闭开机自启
systemctl enable xray.service
systemctl disable xray.service

# 查看最近 50 条日志 / 实时跟踪日志（Ctrl+C 退出）
journalctl -u xray.service -n 50 --no-pager
journalctl -u xray.service -f
```
