import argparse
import ipaddress
import json
import re
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import yaml

from rule_sources import load_entries, merge_rules, parse_source


def domain_to_sing_box(pattern):
    pattern = pattern.strip().rstrip(".")
    if not pattern:
        raise ValueError("empty domain rule")
    if pattern.startswith("+."):
        suffix = pattern[2:]
        if not suffix or "*" in suffix or "+" in suffix:
            raise ValueError(f"unsupported domain rule: {pattern}")
        return "domain_suffix", suffix
    if pattern.startswith("."):
        suffix = pattern[1:]
        if not suffix or "*" in suffix or "+" in suffix:
            raise ValueError(f"unsupported domain rule: {pattern}")
        return "domain_regex", rf"^(?:[^.]+\.)+{re.escape(suffix)}$"
    if "*" in pattern:
        if "+" in pattern:
            raise ValueError(f"unsupported domain rule: {pattern}")
        labels = pattern.split(".")
        regex_labels = []
        for label in labels:
            if label == "*":
                regex_labels.append(r"[^.]+")
            elif "*" in label:
                regex_labels.append(re.escape(label).replace(r"\*", r"[^.]*"))
            else:
                regex_labels.append(re.escape(label))
        return "domain_regex", "^" + r"\.".join(regex_labels) + "$"
    if "+" in pattern:
        raise ValueError(f"unsupported domain rule: {pattern}")
    return "domain", pattern

def domain_to_list(pattern):
    pattern = pattern.strip().rstrip(".")
    if not pattern or "," in pattern:
        raise ValueError(f"invalid domain rule: {pattern}")
    if pattern.startswith("+."):
        suffix = pattern[2:]
        if not suffix or "*" in suffix or "+" in suffix:
            raise ValueError(f"unsupported domain rule: {pattern}")
        return f"DOMAIN-SUFFIX,{suffix}"
    if pattern.startswith("."):
        suffix = pattern[1:]
        if not suffix or "*" in suffix or "+" in suffix:
            raise ValueError(f"unsupported domain rule: {pattern}")
        return f"DOMAIN-WILDCARD,*.{suffix}"
    if "*" in pattern:
        if "+" in pattern:
            raise ValueError(f"unsupported domain rule: {pattern}")
        return f"DOMAIN-WILDCARD,{pattern}"
    if "+" in pattern:
        raise ValueError(f"unsupported domain rule: {pattern}")
    return f"DOMAIN,{pattern}"

def create_outputs(payload, behavior, source_path, list_path):
    if behavior == "domain":
        groups = {"domain": [], "domain_suffix": [], "domain_regex": []}
        list_rules = []
        for rule in payload:
            field, value = domain_to_sing_box(rule)
            groups[field].append(value)
            list_rules.append(domain_to_list(rule))
        rules = []
        for field in ("domain", "domain_suffix", "domain_regex"):
            values = list(dict.fromkeys(groups[field]))
            if values:
                rules.append({field: values})
    else:
        cidrs = []
        list_rules = []
        for rule in payload:
            network = ipaddress.ip_network(rule, strict=False)
            cidr = str(network)
            cidrs.append(cidr)
            rule_type = "IP-CIDR" if network.version == 4 else "IP-CIDR6"
            list_rules.append(f"{rule_type},{cidr}")
        rules = [{"ip_cidr": list(dict.fromkeys(cidrs))}]
    source_path.write_text(
        json.dumps(
            {"version": 3, "rules": rules},
            ensure_ascii=False,
            indent=2
        ) + "\n",
        encoding="utf-8"
    )
    list_path.write_text(
        "\n".join(dict.fromkeys(list_rules)) + "\n",
        encoding="utf-8"
    )

def run(command):
    subprocess.run(command, check=True)

def build(config_path, mihomo, sing_box, output_root, source_root):
    entries = load_entries(config_path)
    for directory in ("yaml", "mrs", "srs", "list"):
        path = output_root / directory
        if path.exists():
            for child in path.iterdir():
                if child.is_file() or child.is_symlink():
                    child.unlink()
        else:
            path.mkdir(parents=True)
    source_root.mkdir(parents=True, exist_ok=True)
    for child in source_root.iterdir():
        if child.is_file() or child.is_symlink():
            child.unlink()
    for entry in entries:
        name = entry["name"]
        behavior = entry["behavior"]
        yaml_path = output_root / "yaml" / f"{name}.yaml"
        mrs_path = output_root / "mrs" / f"{name}.mrs"
        srs_path = output_root / "srs" / f"{name}.srs"
        list_path = output_root / "list" / f"{name}.list"
        source_path = source_root / f"{name}.json"
        sources = {"url_add": [], "url_delete": []}
        with TemporaryDirectory(prefix="rule-sources-") as temporary:
            for field in ("url_add", "url_delete"):
                for index, url in enumerate(entry[field]):
                    download_path = Path(temporary) / f"{field}-{index}.txt"
                    print(f"Downloading {field}: {url} -> {name}", flush=True)
                    run([
                        "curl", "--fail", "--location", "--retry", "3",
                        "--retry-all-errors", "--connect-timeout", "20",
                        "--output", str(download_path), url
                    ])
                    sources[field].extend(parse_source(
                        download_path.read_text(encoding="utf-8-sig"), behavior, url
                    ))
        payload, dedup_count, delete_count = merge_rules(
            sources["url_add"], sources["url_delete"], behavior
        )
        print(
            f"{name}: added={len(sources['url_add'])}, "
            f"deduplicated={dedup_count}, deleted={delete_count}, final={len(payload)}",
            flush=True
        )
        yaml_path.write_text(
            yaml.safe_dump({"payload": payload}, allow_unicode=True, sort_keys=False),
            encoding="utf-8"
        )
        run([
            str(mihomo),
            "convert-ruleset",
            behavior,
            "yaml",
            str(yaml_path),
            str(mrs_path)
        ])
        create_outputs(payload, behavior, source_path, list_path)
        run([
            str(sing_box),
            "rule-set",
            "compile",
            "--output",
            str(srs_path),
            str(source_path)
        ])
        for path in (yaml_path, mrs_path, srs_path, list_path):
            if not path.is_file() or path.stat().st_size == 0:
                raise ValueError(f"empty output: {path}")
    print(f"Converted {len(entries)} rule files.")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config", type=Path)
    parser.add_argument("mihomo", type=Path)
    parser.add_argument("sing_box", type=Path)
    parser.add_argument("output_root", type=Path)
    parser.add_argument("source_root", type=Path)
    args = parser.parse_args()
    build(
        args.config,
        args.mihomo,
        args.sing_box,
        args.output_root,
        args.source_root
    )

if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
