def parse_rule(rule):
    rule = rule.strip().strip("'").strip('"')
    if rule.startswith("+."):
        priority, domain = 1, rule[2:]
    elif rule.startswith("."):
        priority, domain = 2, rule[1:]
    elif rule.startswith("*."):
        priority, domain = 3, rule[2:]
    elif rule == "*":
        priority, domain = 3, ""
    else:
        priority, domain = 4, rule
    return priority, tuple(reversed(domain.split("."))) if domain else (), rule


def deduplicate_rules(rules):
    parsed_rules = []
    passthrough_items = []
    for rule in rules:
        if not isinstance(rule, str):
            passthrough_items.append(rule)
            continue
        if not rule.strip():
            continue
        priority, labels, value = parse_rule(rule)
        parsed_rules.append((labels, priority, value))
    parsed_rules.sort(key=lambda item: (item[0], item[1]))

    kept_rules = {}
    final_rules = []
    for labels, priority, rule in parsed_rules:
        active_types = kept_rules.get(labels, set())
        subsumed = (
            1 in active_types
            or (2 in active_types and priority in (2, 3))
            or (3 in active_types and priority == 3)
            or (4 in active_types and priority == 4)
        )
        if not subsumed:
            for depth in range(len(labels)):
                active_types = kept_rules.get(labels[:depth], set())
                if (
                    1 in active_types
                    or 2 in active_types
                    or (3 in active_types and priority == 4 and len(labels) == depth + 1)
                ):
                    subsumed = True
                    break
        if not subsumed:
            kept_rules.setdefault(labels, set()).add(priority)
            final_rules.append(rule)

    final_rules.sort()
    final_rules.extend(passthrough_items)
    return final_rules
