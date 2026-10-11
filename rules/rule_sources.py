"""Parse, merge and subtract text rule sources without writing deduplication logs."""

import bisect
import ipaddress
import json
import re
from collections import deque
from urllib.parse import urlsplit

import yaml

from rule_deduplicator import deduplicate_rules


NAME_PATTERN = re.compile(r"^[A-Za-z0-9._@-]+$")
DOMAIN_PATTERN = re.compile(r"^[a-z0-9_*\u0080-\uffff-]+(?:\.[a-z0-9_*\u0080-\uffff-]+)*$")


def load_entries(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if not isinstance(data, list) or not data:
        raise ValueError("input.json must be a non-empty JSON array")
    entries = []
    names = set()
    for index, item in enumerate(data, 1):
        if not isinstance(item, dict):
            raise ValueError(f"entry {index} must be an object")
        required = {"name", "behavior", "url_add"}
        if not required <= set(item) or set(item) - required - {"url_delete"}:
            raise ValueError(
                f"entry {index} requires name, behavior and url_add; "
                "only url_delete is optional (legacy url is not supported)"
            )
        name, behavior = item["name"], item["behavior"]
        if not isinstance(name, str) or not isinstance(behavior, str):
            raise ValueError(f"entry {index} name and behavior must be strings")
        name, behavior = name.strip(), behavior.strip().lower()
        if not NAME_PATTERN.fullmatch(name) or name in {".", ".."}:
            raise ValueError(f"entry {index} has an invalid name: {name}")
        if name in names:
            raise ValueError(f"duplicate output name: {name}")
        if behavior not in {"domain", "ipcidr"}:
            raise ValueError(f"entry {index} behavior must be domain or ipcidr")
        entry = {"name": name, "behavior": behavior}
        for field in ("url_add", "url_delete"):
            urls = item.get(field, [])
            if not isinstance(urls, list) or (field == "url_add" and not urls):
                raise ValueError(f"entry {index} {field} must be a {'non-empty ' if field == 'url_add' else ''}array")
            cleaned = []
            for url in urls:
                if not isinstance(url, str):
                    raise ValueError(f"entry {index} {field} URLs must be strings")
                url = url.strip()
                parsed = urlsplit(url)
                if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                    raise ValueError(f"entry {index} {field} has an invalid URL")
                if any(ord(char) < 32 or ord(char) == 127 for char in url):
                    raise ValueError(f"entry {index} {field} URL contains control characters")
                cleaned.append(url)
            entry[field] = list(dict.fromkeys(cleaned))
        names.add(name)
        entries.append(entry)
    return entries


def normalize_domain(value):
    value = value.strip().lower().rstrip(".")
    prefix = ""
    if value.startswith("+."):
        prefix, value = "+.", value[2:]
    elif value.startswith("."):
        prefix, value = ".", value[1:]
    if not value or not DOMAIN_PATTERN.fullmatch(value) or (prefix and "*" in value):
        raise ValueError(f"invalid domain rule: {prefix}{value}")
    return prefix + value


def parse_source(text, behavior, source="source"):
    """Use content, not file extensions. Policies/options are discarded."""
    text = text.lstrip("\ufeff")
    try:
        data = yaml.safe_load(text)
    except yaml.YAMLError:
        # Plain TXT/LIST is not required to be valid YAML.
        data = None
        if re.search(r"^\s*payload\s*:", text, re.MULTILINE):
            raise ValueError(f"{source}: malformed payload YAML")
    if isinstance(data, dict):
        if not isinstance(data.get("payload"), list):
            raise ValueError(f"{source}: YAML must contain a payload list")
        items = data["payload"]
    elif isinstance(data, list):
        items = data
    else:
        items = text.splitlines()
    rules = []
    for item in items:
        if not isinstance(item, str):
            raise ValueError(f"{source}: rule entries must be strings")
        value = item.strip()
        if not value or value.startswith(("#", "//", ";")):
            continue
        if value.startswith("- "):
            value = value[2:].strip()
        value = re.split(r"\s+#", value, maxsplit=1)[0].strip().strip("'\"").strip()
        if not value:
            continue
        if "," in value:
            fields = [field.strip().strip("'\"") for field in value.split(",")]
            rule_type = fields[0].upper()
            supported = {"DOMAIN", "DOMAIN-SUFFIX"} if behavior == "domain" else {"IP-CIDR", "IP-CIDR6"}
            if rule_type not in supported:
                continue
            value = fields[1]
            if rule_type == "DOMAIN-SUFFIX":
                value = "+." + value
        try:
            if behavior == "domain":
                rules.append(normalize_domain(value))
            else:
                rules.append(str(ipaddress.ip_network(value, strict=False)))
        except ValueError as error:
            raise ValueError(f"{source}: {error}") from error
    return rules


def _domain_forms(rule):
    """Glob tokens: None repeats non-dot characters, True repeats any characters."""
    suffix = rule.startswith(("+.", "."))
    base = rule[2:] if rule.startswith("+.") else rule[1:] if suffix else rule
    tokens = tuple(None if char == "*" else char for char in base)
    if not suffix:
        return (tokens,)
    # A subdomain prefix has at least one non-dot character, then any text and a dot.
    subdomains = (False, True, ".") + tokens
    return (tokens, subdomains) if rule.startswith("+.") else (subdomains,)


def _forms_overlap(left, right):
    """Intersection of two glob NFAs; avoids enumerating possible domains."""
    # Track dot placement so empty wildcard labels do not invent invalid domains.
    pending = deque([(0, 0, True)])
    seen = set()
    while pending:
        i, j, after_dot = pending.popleft()
        if (i, j, after_dot) in seen:
            continue
        seen.add((i, j, after_dot))
        if i == len(left) and j == len(right) and not after_dot:
            return True
        a = left[i] if i < len(left) else ""
        b = right[j] if j < len(right) else ""
        repeat_a, repeat_b = a is None or a is True, b is None or b is True
        if repeat_a:
            pending.append((i + 1, j, after_dot))
        if repeat_b:
            pending.append((i, j + 1, after_dot))
        if a != "" and b != "":
            # False is one required non-dot character; None is zero or more.
            wildcard_a = a is None or isinstance(a, bool)
            wildcard_b = b is None or isinstance(b, bool)
            compatible_non_dot = (
                (wildcard_a and wildcard_b)
                or (wildcard_a and b != ".")
                or (wildcard_b and a != ".")
                or (a == b and a != ".")
            )
            next_i, next_j = i if repeat_a else i + 1, j if repeat_b else j + 1
            if compatible_non_dot:
                pending.append((next_i, next_j, False))
            if not after_dot and (a is True or a == ".") and (b is True or b == "."):
                pending.append((next_i, next_j, True))
    return False


def domains_overlap(left, right):
    if "*" not in left and "*" not in right:
        left_suffix, right_suffix = left.startswith(("+.", ".")), right.startswith(("+.", "."))
        a, b = left.removeprefix("+.").removeprefix("."), right.removeprefix("+.").removeprefix(".")
        if a == b:
            return (left_suffix and right_suffix) or (left != "." + a and right != "." + b)
        if a.endswith("." + b):
            return right_suffix
        if b.endswith("." + a):
            return left_suffix
        return False
    return any(_forms_overlap(a, b) for a in _domain_forms(left) for b in _domain_forms(right))


def _fixed_labels(rule):
    base = rule.removeprefix("+.").removeprefix(".")
    labels = []
    for label in reversed(base.split(".")):
        if "*" in label:
            break
        labels.append(label)
    return labels


class DomainExclusions:
    """Reverse-label index limits overlap comparisons to possible suffix matches."""

    def __init__(self, rules):
        self.root = {"rules": [], "children": {}}
        for rule in dict.fromkeys(rules):
            node = self.root
            for label in _fixed_labels(rule):
                node = node["children"].setdefault(label, {"rules": [], "children": {}})
            node["rules"].append(rule)

    def matches(self, rule):
        node = self.root
        for label in _fixed_labels(rule):
            if any(domains_overlap(rule, candidate) for candidate in node["rules"]):
                return True
            node = node["children"].get(label)
            if node is None:
                return False
        pending = [node]
        while pending:
            node = pending.pop()
            if any(domains_overlap(rule, candidate) for candidate in node["rules"]):
                return True
            if rule.startswith(("+.", ".")) or "*" in rule:
                pending.extend(node["children"].values())
        return False


def _networks(rules, version):
    return [network for rule in rules if (network := ipaddress.ip_network(rule, strict=False)).version == version]


def merge_rules(additions, deletions, behavior):
    if behavior == "domain":
        deduplicated = deduplicate_rules(additions)
        exclusions = DomainExclusions(deletions)
        result = [rule for rule in deduplicated if not exclusions.matches(rule)]
    else:
        deduplicated, result = [], []
        for version in (4, 6):
            networks = sorted(set(_networks(additions, version)), key=lambda network: (int(network.network_address), network.prefixlen))
            kept = []
            for network in networks:
                if not kept or not network.subnet_of(kept[-1]):
                    kept.append(network)
            excluded = list(ipaddress.collapse_addresses(_networks(deletions, version)))
            starts = [int(network.network_address) for network in excluded]
            ends = [int(network.broadcast_address) for network in excluded]
            for network in kept:
                deduplicated.append(str(network))
                position = bisect.bisect_right(starts, int(network.broadcast_address)) - 1
                if position < 0 or ends[position] < int(network.network_address):
                    result.append(str(network))
    return result, len(additions) - len(deduplicated), len(deduplicated) - len(result)
