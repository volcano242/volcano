#!/usr/bin/env bash
set -Eeuo pipefail

XRAY_VERSION="${XRAY_VERSION:-v26.10.31}"
XRAY_BIN="/usr/local/bin/xray"
CONFIG="/usr/local/etc/xray/config.json"
ASSET_DIR="/usr/local/share/xray"
XRAY_SERVICE="/etc/systemd/system/xray.service"
BACKUP_ROOT="/usr/local/lib/xray-backup"
METHOD="2022-blake3-aes-128-gcm"
PORT=""
PASSWORD=""
UNLOCK_DNS=""
UNLOCK_DOMAINS_JSON='[]'
SYSTEM_DNS_PRIMARY="1.1.1.1"
SYSTEM_DNS_SECONDARY="8.8.8.8"
STAGE_DIR=""
STAGED_XRAY=""
STAGED_ASSET_DIR=""
STAGED_CONFIG=""
BACKUP_DIR=""

fail() {
    echo "错误：$*" >&2
    exit 1
}

warn() {
    echo "警告：$*" >&2
}

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

# SS2022 AES-128-GCM PSK must be a canonical Base64 encoding of 16 random bytes.
valid_ss2022_psk() {
    local value="$1" normalized
    [[ "$value" =~ ^[A-Za-z0-9+/]{22}==$ ]] || return 1
    normalized="$(printf '%s' "$value" | base64 --decode 2>/dev/null | base64 -w 0)" || return 1
    [[ "$normalized" == "$value" ]]
}

cleanup() {
    if [[ -n "$STAGE_DIR" && -d "$STAGE_DIR" ]]; then
        rm -rf "$STAGE_DIR"
    fi
}
trap cleanup EXIT

configure_system_dns() {
    echo
    echo "===== 配置 Linux 系统 DNS ====="

    if systemctl list-unit-files systemd-resolved.service --no-legend 2>/dev/null | grep '^systemd-resolved\.service' >/dev/null; then
        mkdir -p /etc/systemd/resolved.conf.d
        cat >/etc/systemd/resolved.conf.d/99-xray-dns.conf <<EOF_SYSTEMD_DNS
[Resolve]
DNS=${SYSTEM_DNS_PRIMARY} ${SYSTEM_DNS_SECONDARY}
FallbackDNS=
EOF_SYSTEMD_DNS

        if ! systemctl enable --now systemd-resolved.service; then
            warn "systemd-resolved 启动失败，继续安装 Xray。"
            return 0
        fi
        if ! systemctl restart systemd-resolved.service; then
            warn "systemd-resolved 重启失败，继续安装 Xray。"
            return 0
        fi

        if [[ ! -L /etc/resolv.conf ]] || [[ "$(readlink /etc/resolv.conf 2>/dev/null || true)" != "/run/systemd/resolve/stub-resolv.conf" ]]; then
            [[ ! -e /etc/resolv.conf ]] || cp -a --no-dereference /etc/resolv.conf "/etc/resolv.conf.bak.$(date +%Y%m%d-%H%M%S)"
            rm -f /etc/resolv.conf
            if ! ln -s /run/systemd/resolve/stub-resolv.conf /etc/resolv.conf; then
                warn "无法切换 /etc/resolv.conf 到 systemd-resolved stub，继续安装 Xray。"
            fi
        fi
    else
        if [[ -e /etc/resolv.conf && ! -L /etc/resolv.conf ]]; then
            cp -a /etc/resolv.conf "/etc/resolv.conf.bak.$(date +%Y%m%d-%H%M%S)"
        fi
        if rm -f /etc/resolv.conf && cat >/etc/resolv.conf <<EOF_RESOLV_CONF
nameserver ${SYSTEM_DNS_PRIMARY}
nameserver ${SYSTEM_DNS_SECONDARY}
EOF_RESOLV_CONF
        then
            :
        else
            warn "写入 /etc/resolv.conf 失败，继续安装 Xray。"
        fi
    fi

    echo "Linux 系统 DNS：${SYSTEM_DNS_PRIMARY}（首选），${SYSTEM_DNS_SECONDARY}（次选）"
}

enable_bbr_best_effort() {
    echo
    echo "===== 1. 尝试开启 BBR ====="

    printf '%s\n' tcp_bbr >/etc/modules-load.d/bbr.conf 2>/dev/null || warn "无法写入 BBR modules-load 配置。"
    modprobe tcp_bbr 2>/dev/null || true

    local available_cc
    available_cc="$(sysctl -n net.ipv4.tcp_available_congestion_control 2>/dev/null || true)"
    if ! grep -qw bbr <<<"$available_cc"; then
        warn "当前内核 $(uname -r) 不支持 BBR；节点安装仍将继续。"
        return 0
    fi

    cat >/etc/sysctl.d/99-bbr.conf <<'EOF_BBR' || true
net.core.default_qdisc = fq
net.ipv4.tcp_congestion_control = bbr
EOF_BBR

    if ! sysctl -w net.core.default_qdisc=fq >/dev/null 2>&1; then
        warn "无法设置 net.core.default_qdisc=fq；节点安装仍将继续。"
    fi
    if ! sysctl -w net.ipv4.tcp_congestion_control=bbr >/dev/null 2>&1; then
        warn "无法启用 BBR；节点安装仍将继续。"
        return 0
    fi

    echo "当前拥塞控制算法：$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unknown)"
    echo "当前默认队列算法：$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unknown)"
}

detect_xray_arch() {
    case "$(uname -m)" in
        x86_64|amd64) printf '%s' '64' ;;
        aarch64|arm64) printf '%s' 'arm64-v8a' ;;
        armv7l|armv7*) printf '%s' 'arm32-v7a' ;;
        i386|i486|i586|i686) printf '%s' '32' ;;
        *) fail "不支持的 CPU 架构：$(uname -m)" ;;
    esac
}

stage_xray_release() {
    local arch zip_name base checksum local_sum actual_version

    arch="$(detect_xray_arch)"
    zip_name="Xray-linux-${arch}.zip"
    base="https://github.com/XTLS/Xray-core/releases/download/${XRAY_VERSION}"
    STAGE_DIR="$(mktemp -d)"
    STAGED_ASSET_DIR="$STAGE_DIR/assets"
    mkdir -p "$STAGE_DIR/unpacked" "$STAGED_ASSET_DIR"

    echo
    echo "===== 3. 下载并校验 Xray ${XRAY_VERSION} ====="
    echo "架构：$(uname -m) -> ${zip_name}"

    curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 2 \
        -o "$STAGE_DIR/$zip_name" "$base/$zip_name" || fail "下载 Xray release 失败。"
    curl -fL --connect-timeout 15 --max-time 60 --retry 3 --retry-delay 2 \
        -o "$STAGE_DIR/$zip_name.dgst" "$base/$zip_name.dgst" || fail "下载 Xray .dgst 校验文件失败。"

    checksum="$(awk -F '= ' '/256=/ {gsub(/\r/, "", $2); print tolower($2); exit}' "$STAGE_DIR/$zip_name.dgst")"
    [[ "$checksum" =~ ^[0-9a-f]{64}$ ]] || fail "无法从官方 .dgst 中解析 SHA-256。"
    local_sum="$(sha256sum "$STAGE_DIR/$zip_name" | awk '{print tolower($1)}')"
    [[ "$local_sum" == "$checksum" ]] || fail "Xray SHA-256 校验失败。"
    echo "Xray SHA-256 校验通过。"

    unzip -q "$STAGE_DIR/$zip_name" -d "$STAGE_DIR/unpacked"
    STAGED_XRAY="$STAGE_DIR/unpacked/xray"
    [[ -f "$STAGED_XRAY" ]] || fail "Xray release 中未找到 xray 二进制。"
    chmod 755 "$STAGED_XRAY"

    actual_version="$("$STAGED_XRAY" version 2>/dev/null | awk 'NR==1 {print $2}')"
    [[ "$actual_version" == "${XRAY_VERSION#v}" ]] || fail "下载到的 Xray 版本异常：期望 ${XRAY_VERSION#v}，实际 ${actual_version:-unknown}。"

    if [[ -f "$STAGE_DIR/unpacked/geoip.dat" ]]; then
        cp -a "$STAGE_DIR/unpacked/geoip.dat" "$STAGED_ASSET_DIR/geoip.dat"
    fi
}

stage_metacubex_geosite() {
    local base
    base="https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest"

    echo "下载并校验 MetaCubeX geosite.dat ..."
    curl -fL --connect-timeout 15 --max-time 180 --retry 3 --retry-delay 3 \
        -o "$STAGED_ASSET_DIR/geosite.dat" "$base/geosite.dat" || fail "下载 geosite.dat 失败。"
    curl -fL --connect-timeout 15 --max-time 60 --retry 3 --retry-delay 3 \
        -o "$STAGED_ASSET_DIR/geosite.dat.sha256sum" "$base/geosite.dat.sha256sum" || fail "下载 geosite.dat.sha256sum 失败。"
    (
        cd "$STAGED_ASSET_DIR"
        sha256sum -c geosite.dat.sha256sum
    ) || fail "geosite.dat SHA-256 校验失败。"
}

build_staged_config() {
    STAGED_CONFIG="$STAGE_DIR/config.json"
    jq -n \
        --argjson port "$PORT" \
        --arg password "$PASSWORD" \
        --arg method "$METHOD" \
        --arg unlock_dns "$UNLOCK_DNS" \
        --argjson unlock_domains "$UNLOCK_DOMAINS_JSON" '
    {
      log: {loglevel: "warning"},
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
        ),
        enableParallelQuery: false
      },
      inbounds: [
        {
          tag: "ss-in",
          listen: "::",
          port: $port,
          protocol: "shadowsocks",
          settings: {
            method: $method,
            password: $password,
            network: "tcp,udp"
          }
        }
      ],
      outbounds: [
        {
          tag: "direct",
          protocol: "freedom",
          settings: {},
          streamSettings: {
            sockopt: {domainStrategy: "UseIPv4v6"}
          }
        }
      ],
      routing: {
        domainStrategy: "AsIs",
        rules: [
          {
            network: "tcp,udp",
            outboundTag: "direct"
          }
        ]
      }
    } + (
      if $unlock_dns == "" then {} else
        {
          geodata: {
            cron: "0 4 * * *",
            outbound: "direct",
            assets: [
              {
                url: "https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat",
                file: "geosite.dat"
              }
            ]
          }
        }
      end
    )
    ' >"$STAGED_CONFIG"
    jq empty "$STAGED_CONFIG"
}

write_staged_service() {
    cat >"$STAGE_DIR/xray.service" <<'EOF_SERVICE'
[Unit]
Description=Xray Service
Documentation=https://github.com/XTLS/Xray-core
After=network.target nss-lookup.target

[Service]
User=root
Group=root
Environment=TZ=Asia/Shanghai
Environment=XRAY_LOCATION_ASSET=/usr/local/share/xray
ExecStart=/usr/local/bin/xray run -config /usr/local/etc/xray/config.json
Restart=on-failure
RestartPreventExitStatus=23
LimitNPROC=10000
LimitNOFILE=1000000
RuntimeDirectory=xray
RuntimeDirectoryMode=0755

[Install]
WantedBy=multi-user.target
EOF_SERVICE
}

backup_current_installation() {
    local timestamp
    timestamp="$(date +%Y%m%d-%H%M%S)-$$"
    BACKUP_DIR="$BACKUP_ROOT/$timestamp"
    mkdir -p "$BACKUP_DIR"

    [[ -e "$XRAY_BIN" || -L "$XRAY_BIN" ]] && cp -a --no-dereference "$XRAY_BIN" "$BACKUP_DIR/xray"
    [[ -e "$CONFIG" ]] && cp -a "$CONFIG" "$BACKUP_DIR/config.json"
    [[ -e "$XRAY_SERVICE" ]] && cp -a "$XRAY_SERVICE" "$BACKUP_DIR/xray.service"
    [[ -e "$ASSET_DIR/geosite.dat" ]] && cp -a "$ASSET_DIR/geosite.dat" "$BACKUP_DIR/geosite.dat"
    [[ -e "$ASSET_DIR/geoip.dat" ]] && cp -a "$ASSET_DIR/geoip.dat" "$BACKUP_DIR/geoip.dat"
    return 0
}

restore_or_remove() {
    local backup="$1"
    local target="$2"
    if [[ -e "$backup" || -L "$backup" ]]; then
        rm -rf "$target"
        cp -a --no-dereference "$backup" "$target"
    else
        rm -rf "$target"
    fi
}

rollback_installation() {
    local was_active="$1"
    local was_enabled="$2"
    trap - ERR
    warn "新配置/核心启动失败，正在自动回滚。"

    systemctl stop xray.service 2>/dev/null || true
    restore_or_remove "$BACKUP_DIR/xray" "$XRAY_BIN"
    restore_or_remove "$BACKUP_DIR/config.json" "$CONFIG"
    restore_or_remove "$BACKUP_DIR/xray.service" "$XRAY_SERVICE"
    restore_or_remove "$BACKUP_DIR/geosite.dat" "$ASSET_DIR/geosite.dat"
    restore_or_remove "$BACKUP_DIR/geoip.dat" "$ASSET_DIR/geoip.dat"

    rm -f "${XRAY_BIN}.new" "${CONFIG}.new" "${XRAY_SERVICE}.new" \
        "$ASSET_DIR/geosite.dat.new" "$ASSET_DIR/geoip.dat.new"
    systemctl daemon-reload || true
    if [[ "$was_enabled" == "true" ]]; then
        systemctl enable xray.service >/dev/null 2>&1 || true
    else
        systemctl disable xray.service >/dev/null 2>&1 || true
    fi
    if [[ "$was_active" == "true" && -e "$XRAY_SERVICE" && -x "$XRAY_BIN" && -e "$CONFIG" ]]; then
        systemctl restart xray.service || true
    else
        systemctl stop xray.service 2>/dev/null || true
    fi
}

apply_transaction() {
    local was_active="false" was_enabled="false"
    if systemctl is-active --quiet xray.service 2>/dev/null; then
        was_active="true"
    fi

    if systemctl is-enabled --quiet xray.service 2>/dev/null; then
        was_enabled="true"
    fi

    mkdir -p "$(dirname "$XRAY_BIN")" "$(dirname "$CONFIG")" "$ASSET_DIR" "$(dirname "$XRAY_SERVICE")" "$BACKUP_ROOT"
    backup_current_installation
    trap 'trap - ERR; rollback_installation "$was_active" "$was_enabled"; fail "事务安装失败，已尝试回滚。"' ERR

    # Stop native geodata updates before replacing the core, config and assets.
    if [[ "$was_active" == "true" ]]; then
        systemctl stop xray.service
    fi

    install -m 0755 "$STAGED_XRAY" "${XRAY_BIN}.new"
    mv -f "${XRAY_BIN}.new" "$XRAY_BIN"

    if [[ -f "$STAGED_ASSET_DIR/geoip.dat" ]]; then
        install -m 0644 "$STAGED_ASSET_DIR/geoip.dat" "$ASSET_DIR/geoip.dat.new"
        mv -f "$ASSET_DIR/geoip.dat.new" "$ASSET_DIR/geoip.dat"
    fi
    if [[ -n "$UNLOCK_DNS" ]]; then
        install -m 0644 "$STAGED_ASSET_DIR/geosite.dat" "$ASSET_DIR/geosite.dat.new"
        mv -f "$ASSET_DIR/geosite.dat.new" "$ASSET_DIR/geosite.dat"
    else
        rm -f "$ASSET_DIR/geosite.dat"
    fi

    install -m 0600 "$STAGED_CONFIG" "${CONFIG}.new"
    mv -f "${CONFIG}.new" "$CONFIG"

    install -m 0644 "$STAGE_DIR/xray.service" "${XRAY_SERVICE}.new"
    mv -f "${XRAY_SERVICE}.new" "$XRAY_SERVICE"

    if ! XRAY_LOCATION_ASSET="$ASSET_DIR" "$XRAY_BIN" run -test -config "$CONFIG"; then
        rollback_installation "$was_active" "$was_enabled"
        fail "安装后的 Xray 配置校验失败，已回滚。"
    fi

    systemctl daemon-reload
    systemctl enable xray.service >/dev/null
    if ! systemctl restart xray.service; then
        rollback_installation "$was_active" "$was_enabled"
        fail "Xray 重启失败，已回滚。"
    fi
    sleep 1
    if ! systemctl is-active --quiet xray.service; then
        systemctl --no-pager --full status xray.service || true
        rollback_installation "$was_active" "$was_enabled"
        fail "Xray 启动后立即退出，已回滚。"
    fi

    trap - ERR
    echo "事务安装成功；旧版本备份：${BACKUP_DIR}"
}

[[ "$(id -u)" -eq 0 ]] || fail "请使用 root 用户运行此脚本。"
command -v apt-get >/dev/null 2>&1 || fail "此脚本仅适用于使用 apt-get 的 Debian/Ubuntu 系统。"
command -v systemctl >/dev/null 2>&1 || fail "系统没有使用 systemd。"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl ca-certificates openssl jq unzip kmod iproute2 tzdata util-linux

# Serialize installer runs for both node types.
exec 9>/run/lock/xray-maintenance.lock
flock -n 9 || fail "另一个 Xray 安装正在运行，请稍后重试。"

configure_system_dns
enable_bbr_best_effort

echo
echo "===== 2. 设置节点参数 ====="
while true; do
    read -r -p "请输入节点端口号（1-65535）：" PORT_INPUT || fail "未读取到端口号。"
    PORT_INPUT="$(trim "$PORT_INPUT")"
    if [[ "$PORT_INPUT" =~ ^[0-9]{1,5}$ ]]; then
        PORT_NUM=$((10#$PORT_INPUT))
        if (( PORT_NUM >= 1 && PORT_NUM <= 65535 )); then
            PORT_IN_USE="$(ss -H -lntup "sport = :${PORT_NUM}" 2>/dev/null || true)"
            if [[ -n "$PORT_IN_USE" ]] && grep -vi xray <<<"$PORT_IN_USE" >/dev/null; then
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

echo
while true; do
    echo "请选择 Shadowsocks 密码设置方式（加密方式固定为 ${METHOD}）："
    echo "  1) 人工输入密码"
    echo "  2) 系统自动生成强随机密码"
    read -r -p "请输入 1/2：" PASSWORD_CHOICE || fail "未读取到密码设置方式。"
    PASSWORD_CHOICE="$(trim "$PASSWORD_CHOICE")"
    case "$PASSWORD_CHOICE" in
        1)
            while true; do
                IFS= read -r -s -p "请输入 Shadowsocks 密码：" PASSWORD_FIRST || fail "未读取到密码。"
                echo
                if ! valid_ss2022_psk "$PASSWORD_FIRST"; then
                    echo "密码无效：SS2022 AES-128-GCM 要求 Base64 编码的 16 字节密钥（可用 openssl rand -base64 16 生成）。"
                    continue
                fi
                IFS= read -r -s -p "请再次输入密码确认：" PASSWORD_SECOND || fail "未读取到确认密码。"
                echo
                if [[ "$PASSWORD_FIRST" != "$PASSWORD_SECOND" ]]; then
                    echo "两次输入的密码不一致，请重新输入。"
                    continue
                fi
                PASSWORD="$PASSWORD_FIRST"
                unset PASSWORD_FIRST PASSWORD_SECOND
                break
            done
            break
            ;;
        2)
            PASSWORD="$(openssl rand -base64 16 2>/dev/null || true)"
            [[ -n "$PASSWORD" ]] || PASSWORD="$(head -c 16 /dev/urandom | base64 -w 0)"
            valid_ss2022_psk "$PASSWORD" || fail "无法生成合法的 SS2022 128 bit 随机密钥。"
            echo "已生成 SS2022 128 bit 随机密钥（Base64，24 个字符）。"
            break
            ;;
        *) echo "输入无效，请输入 1 或 2。" ;;
    esac
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
                    1) UNLOCK_DOMAINS_JSON='["geosite:category-ai-!cn"]'; break ;;
                    2) UNLOCK_DOMAINS_JSON='["geosite:netflix","geosite:disney","geosite:hbo","geosite:primevideo"]'; break ;;
                    3) UNLOCK_DOMAINS_JSON='["geosite:category-ai-!cn","geosite:netflix","geosite:disney","geosite:hbo","geosite:primevideo"]'; break ;;
                    *) echo "输入无效，请输入 1、2 或 3。" ;;
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
        *) echo "输入无效，请输入 0 或 1。" ;;
    esac
done

stage_xray_release
# Native geodata updates require an existing file for the initial DNS rules.
if [[ -n "$UNLOCK_DNS" ]]; then
    stage_metacubex_geosite
fi

echo
echo "===== 4. 生成并预检 Shadowsocks 配置 ====="
build_staged_config
write_staged_service
# Older cores can silently ignore unknown JSON fields; require geodata support.
if [[ -n "$UNLOCK_DNS" ]]; then
    "$STAGED_XRAY" run -dump -config "$STAGED_CONFIG" |
        jq -e '.geodata.assets[0].file == "geosite.dat"' >/dev/null ||
        fail "指定的 Xray 版本不支持 geodata 配置，请使用 v26.10.31 或兼容版本。"
fi
XRAY_LOCATION_ASSET="$STAGED_ASSET_DIR" "$STAGED_XRAY" run -test -config "$STAGED_CONFIG" || fail "新配置未通过新 Xray 的预检。"
echo "新核心 + 新配置预检通过。"

apply_transaction

echo
echo "===== 5. 放行 TCP 和 UDP ${PORT} 端口 ====="
if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep '^Status: active' >/dev/null; then
    ufw allow "${PORT}/tcp"
    ufw allow "${PORT}/udp"
fi
if command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --permanent --add-port="${PORT}/tcp"
    firewall-cmd --permanent --add-port="${PORT}/udp"
    firewall-cmd --reload
fi

echo
echo "===== 6. 获取服务器公网地址和 ASN 信息 ====="
PUBLIC_IPV4="$(curl -4fsS --connect-timeout 5 --max-time 10 https://api.ipify.org 2>/dev/null || true)"
[[ -n "$PUBLIC_IPV4" ]] || PUBLIC_IPV4="$(curl -4fsS -A 'xray-ss-install/2.0' --connect-timeout 5 --max-time 10 https://api-ipv4.ip.sb/ip 2>/dev/null || true)"
PUBLIC_IPV6="$(curl -6fsS --connect-timeout 5 --max-time 10 https://api64.ipify.org 2>/dev/null || true)"
[[ -n "$PUBLIC_IPV6" ]] || PUBLIC_IPV6="$(curl -6fsS -A 'xray-ss-install/2.0' --connect-timeout 5 --max-time 10 https://api-ipv6.ip.sb/ip 2>/dev/null || true)"

if [[ -n "$PUBLIC_IPV4" ]]; then
    SERVER="$PUBLIC_IPV4"
    URI_HOST="$PUBLIC_IPV4"
elif [[ -n "$PUBLIC_IPV6" ]]; then
    SERVER="$PUBLIC_IPV6"
    URI_HOST="[$PUBLIC_IPV6]"
else
    fail "无法获取服务器公网 IPv4/IPv6 地址，因此无法生成节点链接。"
fi

GEO_JSON="$(curl -fsS -A 'xray-ss-install/2.0' --connect-timeout 5 --max-time 10 "https://api.ip.sb/geoip/${SERVER}" 2>/dev/null || true)"
ASN_ORG="$(jq -r '.asn_organization // empty' <<<"$GEO_JSON" 2>/dev/null || true)"
ASN_NUMBER="$(jq -r '.asn // empty' <<<"$GEO_JSON" 2>/dev/null || true)"
COUNTRY_CODE="$(jq -r '.country_code // empty' <<<"$GEO_JSON" 2>/dev/null || true)"

if [[ -z "$ASN_ORG" || -z "$COUNTRY_CODE" ]]; then
    GEO_JSON_FALLBACK="$(curl -fsS -A 'xray-ss-install/2.0' --connect-timeout 5 --max-time 10 "https://ipwho.is/${SERVER}" 2>/dev/null || true)"
    [[ -n "$ASN_ORG" ]] || ASN_ORG="$(jq -r '.connection.org // .connection.isp // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
    [[ -n "$ASN_NUMBER" ]] || ASN_NUMBER="$(jq -r '.connection.asn // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
    [[ -n "$COUNTRY_CODE" ]] || COUNTRY_CODE="$(jq -r '.country_code // empty' <<<"$GEO_JSON_FALLBACK" 2>/dev/null || true)"
fi

ASN_ORG="$(trim "$ASN_ORG")"
ASN_ORG="$(printf '%s' "$ASN_ORG" | sed -E 's/^AS[0-9]+[[:space:]-]+//I')"
ASN_ORG="$(printf '%s' "$ASN_ORG" | sed -E 's/[[:space:],.-]*(LLC|L\.L\.C\.|INCORPORATED|INC\.?|LIMITED|LTD\.?|GMBH|SAS|S\.A\.|B\.V\.|CORPORATION|CORP\.?)$//I')"
ASN_NAME="$(printf '%s' "$ASN_ORG" | tr '[:space:]' '-' | sed -E 's/[^[:alnum:]_.-]+/-/g; s/-+/-/g; s/^-+//; s/-+$//')"
if [[ -z "$ASN_NAME" ]]; then
    [[ "$ASN_NUMBER" =~ ^[0-9]+$ ]] && ASN_NAME="AS${ASN_NUMBER}" || ASN_NAME="VPS"
fi
COUNTRY_CODE="$(printf '%s' "$COUNTRY_CODE" | tr '[:lower:]' '[:upper:]' | sed -E 's/[^A-Z]//g')"
[[ "$COUNTRY_CODE" =~ ^[A-Z]{2}$ ]] || COUNTRY_CODE="XX"
NODE_NAME="$(jq -nr --arg asn "$ASN_NAME" --arg code "$COUNTRY_CODE" '
    ($code | if . == "XX" then "🏳️" else explode | map(. + 127397) | implode end)
    + " " + $asn + " " + $code')"
SS_USERINFO="$(printf '%s' "${METHOD}:${PASSWORD}" | base64 -w 0 | tr '+/' '-_' | tr -d '=')"
SS_URI="ss://${SS_USERINFO}@${URI_HOST}:${PORT}#$(printf '%s' "$NODE_NAME" | jq -sRr @uri)"

echo
echo "================ 安装完成 ================"
echo "Xray 版本：$($XRAY_BIN version | awk 'NR==1 {print $2}')"
echo "BBR：$(sysctl -n net.ipv4.tcp_congestion_control 2>/dev/null || echo unavailable)"
echo "默认队列：$(sysctl -n net.core.default_qdisc 2>/dev/null || echo unavailable)"
echo "Shadowsocks：${METHOD}"
echo
echo "Xray 状态："
systemctl --no-pager --full status xray.service | head -n 15 || true
echo
echo "监听端口："
ss -lntup | grep -E "(^|:)${PORT}([[:space:]]|$)" || true
echo
if [[ -n "$UNLOCK_DNS" ]]; then
    echo "GeoSite：Xray 内置 geodata，每天北京时间 04:00 下载并热重载（MetaCubeX）。"
else
    echo "GeoSite：未启用 DNS 解锁，不下载、不更新。"
fi
echo
echo "Xray 默认路径：${XRAY_BIN}（配置：${CONFIG}，GeoData：${ASSET_DIR}）"
echo "旧版本备份：${BACKUP_DIR}"
echo "注意：云服务商安全组还必须同时放行 TCP ${PORT} 和 UDP ${PORT}。"
echo
echo "================ 节点信息 ================"
MIHOMO_JSON="$(jq -cn \
    --arg server "$SERVER" \
    --arg cipher "$METHOD" \
    --arg password "$PASSWORD" \
    --arg name "$NODE_NAME" \
    --argjson port "$PORT" \
    '{type:"ss",udp:true,server:$server,port:$port,cipher:$cipher,password:$password,name:$name}')"
printf '%s,\n' "$MIHOMO_JSON"
echo "$SS_URI"
