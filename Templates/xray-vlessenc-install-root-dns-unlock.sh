#!/usr/bin/env bash
set -Eeuo pipefail

XRAY_VERSION="v26.3.27"
XRAY_BIN="/usr/local/bin/xray"
CONFIG="/usr/local/etc/xray/config.json"
ASSET_DIR="/usr/local/share/xray"
GEOSITE_UPDATER="/usr/local/sbin/update-xray-geosite"
PORT=""
UUID=""
DECRYPTION=""
ENCRYPTION=""
UNLOCK_DNS=""
UNLOCK_DOMAINS_JSON='[]'

fail() {
    echo "错误：$*" >&2
    exit 1
}

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

[[ "$(id -u)" -eq 0 ]] || fail "请使用 root 用户运行此脚本。"
command -v apt-get >/dev/null 2>&1 || fail "此脚本仅适用于使用 apt-get 的 Debian/Ubuntu 系统。"
command -v systemctl >/dev/null 2>&1 || fail "系统没有使用 systemd。"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates jq kmod iproute2

echo
echo "===== 1. 自动开启 BBR ====="
printf '%s\n' tcp_bbr >/etc/modules-load.d/bbr.conf
modprobe tcp_bbr 2>/dev/null || true
AVAILABLE_CC="$(sysctl -n net.ipv4.tcp_available_congestion_control 2>/dev/null || true)"
grep -qw bbr <<<"$AVAILABLE_CC" || fail "当前内核不支持 BBR。当前内核：$(uname -r)"
cat >/etc/sysctl.d/99-bbr.conf <<'EOF_BBR'
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF_BBR
sysctl -w net.core.default_qdisc=fq >/dev/null
sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null
[[ "$(sysctl -n net.ipv4.tcp_congestion_control)" == "bbr" ]] || fail "BBR 设置未生效。"
echo "当前拥塞控制算法：$(sysctl -n net.ipv4.tcp_congestion_control)"
echo "当前默认队列算法：$(sysctl -n net.core.default_qdisc)"

echo
echo "===== 2. 设置节点参数 ====="
while true; do
    read -r -p "请输入节点端口号（1-65535）：" PORT_INPUT || fail "未读取到端口号。"
    PORT_INPUT="$(trim "$PORT_INPUT")"
    if [[ "$PORT_INPUT" =~ ^[0-9]{1,5}$ ]]; then
        PORT_NUM=$((10#$PORT_INPUT))
        if (( PORT_NUM >= 1 && PORT_NUM <= 65535 )); then
            PORT_IN_USE="$(ss -H -lntup "sport = :${PORT_NUM}" 2>/dev/null || true)"
            if [[ -n "$PORT_IN_USE" ]] && ! grep -qi xray <<<"$PORT_IN_USE"; then
                echo "端口 ${PORT_NUM} 已被其他程序占用，请换一个端口。"
                echo "$PORT_IN_USE"
                continue
            fi
            PORT="$PORT_NUM"
            break
        fi
    fi
    echo "输入无效，请输入 1-65535 之间的整数。"
done

while true; do
    read -r -p "是否需要 AI/流媒体 DNS 解锁？输入 0=不需要，1=需要：" DNS_CHOICE || fail "未读取到 DNS 选择。"
    DNS_CHOICE="$(trim "$DNS_CHOICE")"
    case "$DNS_CHOICE" in
        0)
            UNLOCK_DNS=""
            UNLOCK_DOMAINS_JSON='[]'
            break
            ;;
        1)
            while true; do
                echo "请选择 DNS 解锁类型："
                echo "  1) 仅 AI 解锁"
                echo "  2) 仅流媒体解锁"
                echo "  3) AI + 流媒体都解锁"
                read -r -p "请输入 1/2/3：" UNLOCK_CHOICE || fail "未读取到解锁类型。"
                UNLOCK_CHOICE="$(trim "$UNLOCK_CHOICE")"
                case "$UNLOCK_CHOICE" in
                    1)
                        UNLOCK_DOMAINS_JSON='["geosite:category-ai-!cn"]'
                        break
                        ;;
                    2)
                        UNLOCK_DOMAINS_JSON='["geosite:netflix","geosite:disney","geosite:hbo","geosite:primevideo"]'
                        break
                        ;;
                    3)
                        UNLOCK_DOMAINS_JSON='["geosite:category-ai-!cn","geosite:netflix","geosite:disney","geosite:hbo","geosite:primevideo"]'
                        break
                        ;;
                    *)
                        echo "输入无效，请输入 1、2 或 3。"
                        ;;
                esac
            done
            while true; do
                read -r -p "请输入解锁 DNS 地址（例如 66.42.97.127）：" UNLOCK_DNS_INPUT || fail "未读取到解锁 DNS 地址。"
                UNLOCK_DNS_INPUT="$(trim "$UNLOCK_DNS_INPUT")"
                if [[ -n "$UNLOCK_DNS_INPUT" && ! "$UNLOCK_DNS_INPUT" =~ [[:space:]] ]]; then
                    UNLOCK_DNS="$UNLOCK_DNS_INPUT"
                    break
                fi
                echo "DNS 地址不能为空，也不能包含空白字符。"
            done
            break
            ;;
        *)
            echo "输入无效，请输入 0 或 1。"
            ;;
    esac
done

echo
echo "===== 3. 安装 Xray ${XRAY_VERSION} ====="
mkdir -p "$(dirname "$CONFIG")" "$ASSET_DIR"
BACKUP_TIME="$(date +%Y%m%d-%H%M%S)"
if [[ -s "$CONFIG" ]]; then
    cp -a "$CONFIG" "${CONFIG}.bak.${BACKUP_TIME}"
fi

if [[ -L /usr/local/bin/xray ]] && [[ "$(readlink -f /usr/local/bin/xray 2>/dev/null || true)" == "/xray/xray" ]]; then
    systemctl stop xray.service 2>/dev/null || true
    rm -f /usr/local/bin/xray
fi

if [[ -f /etc/systemd/system/xray.service ]] && grep -qE '/xray/(xray|config\.json)' /etc/systemd/system/xray.service; then
    systemctl stop xray.service 2>/dev/null || true
    rm -f /etc/systemd/system/xray.service
    rm -rf /etc/systemd/system/xray.service.d
    rm -f /etc/systemd/system/xray@.service
    rm -rf /etc/systemd/system/xray@.service.d
    systemctl daemon-reload
fi

jq -n --argjson port "$PORT" '
{
  log: {loglevel: "warning"},
  inbounds: [
    {
      tag: "bootstrap-in",
      listen: "127.0.0.1",
      port: $port,
      protocol: "socks",
      settings: {auth: "noauth", udp: false}
    }
  ],
  outbounds: [
    {
      tag: "direct",
      protocol: "freedom",
      settings: {domainStrategy: "UseIPv4v6"}
    }
  ]
}
' >"$CONFIG"
chmod 644 "$CONFIG"

INSTALLER_TMP="$(mktemp)"
trap 'rm -f "$INSTALLER_TMP"' EXIT
curl -fsSL --connect-timeout 15 --max-time 120 --retry 3 --retry-delay 2 \
    -o "$INSTALLER_TMP" \
    https://github.com/XTLS/Xray-install/raw/main/install-release.sh || fail "下载 Xray 官方安装脚本失败。"
bash "$INSTALLER_TMP" install --version "$XRAY_VERSION" --force || fail "Xray 官方安装脚本执行失败。"
rm -f "$INSTALLER_TMP"
trap - EXIT
[[ -x "$XRAY_BIN" ]] || fail "安装后未找到 ${XRAY_BIN}。"

UUID="$("$XRAY_BIN" uuid 2>/dev/null | tr -d '\r\n[:space:]')"
[[ -n "$UUID" ]] || fail "无法生成 VLESS UUID。"
VLESSENC_OUTPUT="$("$XRAY_BIN" vlessenc 2>&1)" || fail "xray vlessenc 执行失败。"
MLKEM_BLOCK="$(printf '%s\n' "$VLESSENC_OUTPUT" | awk '
/Authentication:[[:space:]]*ML-KEM-768,[[:space:]]*Post-Quantum/ { found=1; next }
found && /Authentication:/ { exit }
found { print }
' || true)"
DECRYPTION="$(printf '%s\n' "$MLKEM_BLOCK" | sed -n 's/^[[:space:]]*"decryption"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)"
ENCRYPTION="$(printf '%s\n' "$MLKEM_BLOCK" | sed -n 's/^[[:space:]]*"encryption"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)"
[[ -n "$DECRYPTION" ]] || fail "无法提取 ML-KEM-768 decryption 参数。"
[[ -n "$ENCRYPTION" ]] || fail "无法提取 ML-KEM-768 encryption 参数。"
[[ "$DECRYPTION" == mlkem768x25519plus.native.* ]] || fail "生成的 decryption 参数格式异常。"
[[ "$ENCRYPTION" == mlkem768x25519plus.native.* ]] || fail "生成的 encryption 参数格式异常。"
echo "已生成 VLESS UUID 与 ML-KEM-768 VLESS Encryption 参数。"

echo
echo "===== 4. 写入 VLESS Encryption 与 DNS 配置 ====="
jq -n \
    --argjson port "$PORT" \
    --arg uuid "$UUID" \
    --arg decryption "$DECRYPTION" \
    --arg unlock_dns "$UNLOCK_DNS" \
    --argjson unlock_domains "$UNLOCK_DOMAINS_JSON" '
{
  log: {
    loglevel: "warning"
  },
  dns: {
    servers: (
      if $unlock_dns == "" then
        [
          {address: "1.1.1.1"},
          {address: "8.8.8.8"}
        ]
      else
        [
          {
            address: $unlock_dns,
            domains: $unlock_domains,
            skipFallback: true
          },
          {address: "1.1.1.1"},
          {address: "8.8.8.8"}
        ]
      end
    )
  },
  inbounds: [
    {
      tag: "vless-enc-in",
      listen: "::",
      port: $port,
      protocol: "vless",
      settings: {
        clients: [
          {
            id: $uuid,
            flow: "xtls-rprx-vision"
          }
        ],
        decryption: $decryption
      },
      streamSettings: {
        network: "raw",
        security: "none"
      }
    }
  ],
  outbounds: [
    {
      tag: "direct",
      protocol: "freedom",
      settings: {
        domainStrategy: "UseIPv4v6"
      }
    }
  ],
  routing: {
    domainStrategy: "AsIs",
    rules: [
      {
        type: "field",
        network: "tcp,udp",
        outboundTag: "direct"
      }
    ]
  }
}
' >"$CONFIG"
jq empty "$CONFIG"

XRAY_USER="$(systemctl show xray.service -p User --value 2>/dev/null || true)"
[[ -n "$XRAY_USER" ]] || XRAY_USER=nobody
XRAY_GROUP="$(id -gn "$XRAY_USER" 2>/dev/null || true)"
[[ -n "$XRAY_GROUP" ]] || fail "无法确定 Xray 服务用户 ${XRAY_USER} 的用户组。"
chown root:"$XRAY_GROUP" "$CONFIG"
chmod 640 "$CONFIG"

echo
echo "===== 5. 创建 geosite 自动更新脚本 ====="
cat >"$GEOSITE_UPDATER" <<'EOF_GEOSITE'
#!/usr/bin/env bash
set -Eeuo pipefail
TARGET=/usr/local/share/xray/geosite.dat
CONFIG=/usr/local/etc/xray/config.json
XRAY=/usr/local/bin/xray
BASE=https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 3 -o "$TMP/geosite.dat" "$BASE/geosite.dat"
curl -fL --connect-timeout 15 --max-time 60 --retry 3 --retry-delay 3 -o "$TMP/geosite.dat.sha256sum" "$BASE/geosite.dat.sha256sum"
(
    cd "$TMP"
    sha256sum -c geosite.dat.sha256sum
)
XRAY_LOCATION_ASSET="$TMP" "$XRAY" run -test -config "$CONFIG"
if [[ -f "$TARGET" ]] && cmp -s "$TMP/geosite.dat" "$TARGET"; then
    echo "geosite.dat 没有变化。"
    exit 0
fi
BACKUP="${TARGET}.backup"
rm -f "$BACKUP"
if [[ -f "$TARGET" ]]; then
    cp -a "$TARGET" "$BACKUP"
fi
install -m 0644 "$TMP/geosite.dat" "${TARGET}.new"
mv -f "${TARGET}.new" "$TARGET"
if systemctl is-active --quiet xray.service; then
    if ! systemctl restart xray.service; then
        echo "新 geosite 导致 Xray 重启失败，正在回滚。"
        if [[ -f "$BACKUP" ]]; then
            mv -f "$BACKUP" "$TARGET"
            systemctl restart xray.service
        fi
        exit 1
    fi
fi
rm -f "$BACKUP"
echo "geosite.dat 已更新。"
EOF_GEOSITE
chmod 755 "$GEOSITE_UPDATER"

cat >/etc/systemd/system/xray-geosite.service <<'EOF_SERVICE'
[Unit]
Description=Update Xray geosite.dat
Wants=network-online.target
After=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/update-xray-geosite
EOF_SERVICE

cat >/etc/systemd/system/xray-geosite.timer <<'EOF_TIMER'
[Unit]
Description=Update Xray geosite.dat every three hours

[Timer]
OnBootSec=2min
OnUnitActiveSec=3h
AccuracySec=1min
Persistent=true
Unit=xray-geosite.service

[Install]
WantedBy=timers.target
EOF_TIMER

systemctl daemon-reload
"$GEOSITE_UPDATER"

echo
echo "===== 6. 检查并启动 Xray ====="
XRAY_LOCATION_ASSET="$ASSET_DIR" "$XRAY_BIN" run -test -config "$CONFIG"
systemctl enable xray.service
systemctl restart xray.service
systemctl enable --now xray-geosite.timer
if ! systemctl is-active --quiet xray.service; then
    systemctl --no-pager --full status xray.service || true
    fail "Xray 启动失败。"
fi

echo
echo "===== 7. 放行 TCP ${PORT} 端口 ====="
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -q '^Status: active'; then
    ufw allow "${PORT}/tcp"
fi
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="${PORT}/tcp"
    firewall-cmd --reload
fi

echo
echo "===== 8. 获取服务器公网地址和 ASN 信息 ====="
PUBLIC_IPV4="$(curl -4fsS --connect-timeout 5 --max-time 10 https://api.ipify.org 2>/dev/null || true)"
if [[ -z "$PUBLIC_IPV4" ]]; then
    PUBLIC_IPV4="$(curl -4fsS -A 'xray-vless-install/1.0' --connect-timeout 5 --max-time 10 https://api-ipv4.ip.sb/ip 2>/dev/null || true)"
fi
PUBLIC_IPV6="$(curl -6fsS --connect-timeout 5 --max-time 10 https://api64.ipify.org 2>/dev/null || true)"
if [[ -z "$PUBLIC_IPV6" ]]; then
    PUBLIC_IPV6="$(curl -6fsS -A 'xray-vless-install/1.0' --connect-timeout 5 --max-time 10 https://api-ipv6.ip.sb/ip 2>/dev/null || true)"
fi
if [[ -n "$PUBLIC_IPV4" ]]; then
    SERVER="$PUBLIC_IPV4"
    URI_HOST="$PUBLIC_IPV4"
elif [[ -n "$PUBLIC_IPV6" ]]; then
    SERVER="$PUBLIC_IPV6"
    URI_HOST="[$PUBLIC_IPV6]"
else
    fail "无法获取服务器公网 IPv4/IPv6 地址，因此无法生成节点链接。"
fi

GEO_JSON="$(curl -fsS -A 'xray-vless-install/1.0' --connect-timeout 5 --max-time 10 "https://api.ip.sb/geoip/${SERVER}" 2>/dev/null || true)"
ASN_ORG="$(jq -r '.asn_organization // empty' <<<"$GEO_JSON" 2>/dev/null || true)"
ASN_NUMBER="$(jq -r '.asn // empty' <<<"$GEO_JSON" 2>/dev/null || true)"
COUNTRY_CODE="$(jq -r '.country_code // empty' <<<"$GEO_JSON" 2>/dev/null || true)"

if [[ -z "$ASN_ORG" || -z "$COUNTRY_CODE" ]]; then
    GEO_JSON_FALLBACK="$(curl -fsS -A 'xray-vless-install/1.0' --connect-timeout 5 --max-time 10 "https://ipwho.is/${SERVER}" 2>/dev/null || true)"
    if [[ -z "$ASN_ORG" ]]; then
        ASN_ORG="$(jq -r '.connection.org // .connection.isp // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
    fi
    if [[ -z "$ASN_NUMBER" ]]; then
        ASN_NUMBER="$(jq -r '.connection.asn // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
    fi
    if [[ -z "$COUNTRY_CODE" ]]; then
        COUNTRY_CODE="$(jq -r '.country_code // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
    fi
fi

ASN_ORG="$(trim "$ASN_ORG")"
ASN_ORG="$(printf '%s' "$ASN_ORG" | sed -E 's/^AS[0-9]+[[:space:]-]+//I')"
ASN_ORG="$(printf '%s' "$ASN_ORG" | sed -E 's/[[:space:],.-]*(LLC|L\.L\.C\.|INCORPORATED|INC\.?|LIMITED|LTD\.?|GMBH|SAS|S\.A\.|B\.V\.|CORPORATION|CORP\.?)$//I')"
ASN_NAME="$(printf '%s' "$ASN_ORG" | tr '[:space:]' '-' | sed -E 's/[^[:alnum:]_.-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$ASN_NAME" ]]; then
    if [[ "$ASN_NUMBER" =~ ^[0-9]+$ ]]; then
        ASN_NAME="AS${ASN_NUMBER}"
    else
        ASN_NAME="VPS"
    fi
fi
COUNTRY_CODE="$(printf '%s' "$COUNTRY_CODE" | tr '[:lower:]' '[:upper:]' | sed -E 's/[^A-Z]//g')"
[[ "$COUNTRY_CODE" =~ ^[A-Z]{2}$ ]] || COUNTRY_CODE="XX"
NODE_NAME="${ASN_NAME}-${COUNTRY_CODE}"
VLESS_URI="vless://${UUID}@${URI_HOST}:${PORT}?encryption=${ENCRYPTION}&flow=xtls-rprx-vision&type=tcp&security=none&packetEncoding=xudp#${NODE_NAME}"

echo
echo "================ 安装完成 ================"
echo "BBR："
sysctl net.ipv4.tcp_congestion_control
sysctl net.core.default_qdisc
echo
echo "Xray 状态："
systemctl --no-pager --full status xray.service | head -n 15 || true
echo
echo "监听端口："
ss -lntup | grep -E "(^|:)${PORT}([[:space:]]|$)" || true
echo
echo "geosite 定时器："
systemctl --no-pager list-timers xray-geosite.timer || true
echo
echo "Xray 默认路径：${XRAY_BIN}（配置：${CONFIG}，GeoData：${ASSET_DIR}）"
echo "注意：云服务商安全组还必须放行 TCP ${PORT}。"
echo
echo "================ 节点信息 ================"
MIHOMO_JSON="$(jq -cn \
    --arg server "$SERVER" \
    --arg uuid "$UUID" \
    --arg encryption "$ENCRYPTION" \
    --arg name "$NODE_NAME" \
    --argjson port "$PORT" \
    '{type:"vless",udp:true,server:$server,port:$port,uuid:$uuid,flow:"xtls-rprx-vision",network:"tcp",encryption:$encryption,"packet-encoding":"xudp",tls:false,name:$name}')"
printf '%s,\n' "$MIHOMO_JSON"
echo "$VLESS_URI"