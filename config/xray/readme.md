# Xray 安装与管理

## 建立入站 Shadowsocks

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/config/xray/xray-ss-install.sh)
```

## 建立入站 VLESS Encryption

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/volcano242/volcano/refs/heads/main/config/xray/xray-vlessenc-install.sh)
```

## 配置目录

```bash
/usr/local/etc/xray/
```

## 重启 Xray

```bash
sudo systemctl restart xray
```