from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

try:
    import yaml
except ImportError:
    print("错误：缺少 PyYAML，请执行：py -3 -m pip install PyYAML", file=sys.stderr)
    raise SystemExit(1)

SCRIPT_DIR = Path(__file__).resolve().parent
BASIC_FILE = SCRIPT_DIR / "basic.yaml"
FLCLASH_DIR = SCRIPT_DIR.parent / "flclash"
CHAIN_SCRIPT = FLCLASH_DIR / "FlClash_Override_Chain.js"
NORMAL_SCRIPT = FLCLASH_DIR / "FlClash_Override_Normal.js"
EXCLUDED_ROOT_KEYS = {
    "proxies",
    "proxy-providers",
    "proxy-groups",
    "rule-providers",
    "rules",
    "dns",
    "tun",
}
REQUIRED_GROUPS = ("Proxies", "AI Service", "Final")


def load_basic(path: Path) -> dict:
    try:
        value = yaml.safe_load(path.read_text(encoding="utf-8-sig"))
    except Exception as exc:
        raise ValueError(f"无法解析 {path.name}：{exc}") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} 顶层必须是 YAML 对象")

    for key in ("dns", "tun", "proxy-groups", "rule-providers", "rules"):
        if key not in value:
            raise ValueError(f"{path.name} 缺少必需字段：{key}")
    if not isinstance(value["dns"], dict) or not isinstance(value["tun"], dict):
        raise ValueError("dns 和 tun 必须是对象")
    if not isinstance(value["proxy-groups"], list):
        raise ValueError("proxy-groups 必须是数组")
    if not isinstance(value["rule-providers"], dict):
        raise ValueError("rule-providers 必须是对象")
    if not isinstance(value["rules"], list) or not all(isinstance(x, str) for x in value["rules"]):
        raise ValueError("rules 必须是字符串数组")
    return value


def build_values(basic: dict) -> tuple[dict, dict]:
    groups = basic["proxy-groups"]
    group_map = {
        group.get("name"): group
        for group in groups
        if isinstance(group, dict) and isinstance(group.get("name"), str)
    }
    for name in REQUIRED_GROUPS:
        if name not in group_map:
            raise ValueError(f"basic.yaml 缺少策略组：{name}")

    policy_groups = [
        dict(group)
        for group in groups
        if isinstance(group, dict) and "filter" not in group
    ]
    region_groups = []
    for group in groups:
        if not isinstance(group, dict) or "filter" not in group:
            continue
        normalized = dict(group)
        normalized.pop("use", None)
        normalized.pop("proxies", None)
        normalized.pop("include-all", None)
        normalized.pop("include-all-proxies", None)
        normalized.pop("include-all-providers", None)
        region_groups.append(normalized)
    if not region_groups:
        raise ValueError("basic.yaml 至少需要一个带 filter 的地区策略组")

    provider_configs = basic.get("proxy-providers")
    ad_filter = ""
    if isinstance(provider_configs, dict):
        for provider in provider_configs.values():
            if isinstance(provider, dict) and isinstance(provider.get("exclude-filter"), str):
                ad_filter = provider["exclude-filter"]
                break

    base_config = {
        key: value
        for key, value in basic.items()
        if key not in EXCLUDED_ROOT_KEYS
    }
    common = {
        "AD_FILTER": ad_filter,
        "BASE_CONFIG": base_config,
        "DNS_CONFIG": basic["dns"],
        "TUN_CONFIG": basic["tun"],
        "POLICY_GROUPS": policy_groups,
        "RULE_PROVIDERS": basic["rule-providers"],
        "RULES": [",".join(part.strip() for part in rule.split(",")) for rule in basic["rules"]],
    }
    normal = dict(common)
    normal["REGION_GROUPS"] = region_groups
    return common, normal


def js_value(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def replace_constant(source: str, name: str, value: object) -> str:
    pattern = re.compile(rf"(?m)^const\s+{re.escape(name)}\s*=\s*")
    matches = list(pattern.finditer(source))
    if len(matches) != 1:
        raise ValueError(f"脚本中的 const {name} 应恰好出现一次，实际为 {len(matches)} 次")

    match = matches[0]
    index = match.end()
    quote = None
    escaped = False
    round_depth = square_depth = curly_depth = 0

    while index < len(source):
        char = source[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            index += 1
            continue

        if char in ('"', "'", "`"):
            quote = char
        elif char == "(":
            round_depth += 1
        elif char == ")":
            round_depth -= 1
        elif char == "[":
            square_depth += 1
        elif char == "]":
            square_depth -= 1
        elif char == "{":
            curly_depth += 1
        elif char == "}":
            curly_depth -= 1
        elif char == ";" and round_depth == square_depth == curly_depth == 0:
            replacement = f"const {name} = {js_value(value)};"
            return source[: match.start()] + replacement + source[index + 1 :]
        index += 1

    raise ValueError(f"找不到 const {name} 的结束分号")


def render_script(path: Path, values: dict) -> tuple[str, str]:
    original = path.read_text(encoding="utf-8-sig")
    rendered = original
    for name, value in values.items():
        rendered = replace_constant(rendered, name, value)
    return original, rendered


def validate_javascript(path: Path, content: str) -> None:
    node = shutil.which("node")
    if not node:
        return
    temp_name = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            newline="\n",
            suffix=".js",
            delete=False,
            dir=path.parent,
        ) as handle:
            handle.write(content)
            temp_name = handle.name
        result = subprocess.run(
            [node, "--check", temp_name],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode != 0:
            detail = result.stderr.strip() or result.stdout.strip()
            raise ValueError(f"{path.name} 生成后语法检查失败：\n{detail}")
    finally:
        if temp_name:
            Path(temp_name).unlink(missing_ok=True)


def write_atomically(path: Path, content: str) -> None:
    fd, temp_name = tempfile.mkstemp(prefix=path.name + ".", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        shutil.copystat(path, temp_name)
        os.replace(temp_name, path)
    except Exception:
        Path(temp_name).unlink(missing_ok=True)
        raise


def sync(source: Path) -> list[str]:
    basic = load_basic(source)
    chain_values, normal_values = build_values(basic)
    plans = [
        (CHAIN_SCRIPT, chain_values),
        (NORMAL_SCRIPT, normal_values),
    ]

    rendered = []
    for path, values in plans:
        if not path.is_file():
            raise FileNotFoundError(f"找不到覆写脚本：{path}")
        original, content = render_script(path, values)
        validate_javascript(path, content)
        rendered.append((path, original, content))

    changed = [(path, original, content) for path, original, content in rendered if original != content]
    if not changed:
        return []

    for path, original, _ in changed:
        backup = path.with_name(path.name + ".bak.auto")
        shutil.copy2(path, backup)

    written = []
    try:
        for path, _, content in changed:
            write_atomically(path, content)
            written.append(path)
    except Exception:
        for path, original, _ in changed:
            if path in written:
                write_atomically(path, original)
        raise
    return [path.name for path, _, _ in changed]


def main() -> int:
    try:
        changed = sync(BASIC_FILE)
    except Exception as exc:
        print(f"同步失败：{exc}", file=sys.stderr)
        return 1

    if changed:
        print(f"已同步：{'、'.join(changed)}")
    else:
        print("配置无变化")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
