import os
import yaml
from collections import Counter

# ==========================================
# YAML 自定义格式化控制模块
# ==========================================

class IndentDumper(yaml.SafeDumper):
    """自定义 Dumper，强制为列表序列增加两格缩进"""
    def increase_indent(self, flow=False, indentless=False):
        return super(IndentDumper, self).increase_indent(flow, False)


# ==========================================
# 核心去重与处理模块
# ==========================================

def parse_rule(rule_str):
    """
    解析规则，返回 (优先级, 逆序域名标签, 清洗后的原始规则)
    优先级: 1(+.), 2(.), 3(*.), 4(exact)
    """
    clean_str = rule_str.strip().strip("'").strip('"')

    if clean_str.startswith('+.'):
        domain = clean_str[2:]
        return 1, domain.split('.')[::-1] if domain else [], clean_str
    if clean_str.startswith('.'):
        domain = clean_str[1:]
        return 2, domain.split('.')[::-1] if domain else [], clean_str
    if clean_str.startswith('*.'):
        domain = clean_str[2:]
        return 3, domain.split('.')[::-1] if domain else [], clean_str
    if clean_str == '*':
        return 3, [], clean_str

    return 4, clean_str.split('.')[::-1] if clean_str else [], clean_str


def deduplicate_rules(rules):
    """
    返回:
        final_rules: 去重后的 payload
        removed_logs: 每一条真正删除的规则对应一条日志
        warning_logs: 未参与去重但被保留的异常项日志
        stats: 统计信息
    """
    parsed_rules = []
    passthrough_items = []
    warning_logs = []
    stats = Counter()

    for index, rule in enumerate(rules, start=1):
        stats['original'] += 1

        # 修复点：不要静默丢弃非字符串项。
        # 原脚本这里直接 continue，导致这些项被计入 removed_count，
        # 但没有任何 removed_logs 明细。
        if not isinstance(rule, str):
            stats['non_string_kept'] += 1
            passthrough_items.append(rule)
            warning_logs.append(
                f"未去重但已保留: 第 {index} 项 [{repr(rule)}] "
                f"-> 原因: payload 项不是字符串，类型为 {type(rule).__name__}。"
            )
            continue

        clean_rule = rule.strip()
        if not clean_rule:
            stats['blank_removed'] += 1
            warning_logs.append(
                f"已移除: 第 {index} 项为空字符串/空白字符串。"
            )
            continue

        priority_type, reverse_labels, clean_str = parse_rule(rule)
        parsed_rules.append((tuple(reverse_labels), priority_type, clean_str))
        stats['string_input'] += 1

    # 根据域名层级及优先级进行字典升序排列，确保范围广的规则先被处理
    parsed_rules.sort(key=lambda x: (x[0], x[1]))

    # 数据结构：{ 逆序域名标签元组: { 优先级类型: 原始规则字符串 } }
    kept_rules = {}
    final_rules = []
    removed_logs = []

    for labels, priority_type, current_rule in parsed_rules:
        is_subsumed = False
        reason_rule = ""

        # 1. 检查是否存在同名且范围更广的规则
        if labels in kept_rules:
            active_types = kept_rules[labels]

            if 1 in active_types:
                is_subsumed = True
                reason_rule = active_types[1]
            elif 2 in active_types and priority_type in (2, 3):
                is_subsumed = True
                reason_rule = active_types[2]
            elif 3 in active_types and priority_type == 3:
                is_subsumed = True
                reason_rule = active_types[3]
            elif 4 in active_types and priority_type == 4:
                is_subsumed = True
                reason_rule = active_types[4]

        # 2. 检查当前规则是否被某个上级域名泛解析覆盖
        if not is_subsumed:
            for i in range(len(labels)):
                prefix = labels[:i]

                if prefix not in kept_rules:
                    continue

                active_types = kept_rules[prefix]

                if 1 in active_types:
                    is_subsumed = True
                    reason_rule = active_types[1]
                    break
                if 2 in active_types:
                    is_subsumed = True
                    reason_rule = active_types[2]
                    break
                if 3 in active_types and priority_type == 4 and len(labels) == i + 1:
                    is_subsumed = True
                    reason_rule = active_types[3]
                    break

        if is_subsumed:
            if reason_rule == current_rule:
                removed_logs.append(
                    f"已移除: [{current_rule}]\n"
                    f"  -> 原因: 存在完全相同的重复规则。"
                )
            else:
                removed_logs.append(
                    f"已移除: [{current_rule}]\n"
                    f"  -> 原因: 存在匹配范围更广的规则 [{reason_rule}]。"
                )
        else:
            kept_rules.setdefault(labels, {})[priority_type] = current_rule
            final_rules.append(current_rule)

    # 恢复原有的字母表排序；非字符串异常项不参与排序，原样保留在末尾，避免静默数据丢失。
    final_rules.sort()
    final_rules.extend(passthrough_items)

    stats['kept'] = len(final_rules)
    stats['removed_by_dedup'] = len(removed_logs)
    stats['removed_total'] = len(removed_logs) + stats['blank_removed']

    return final_rules, removed_logs, warning_logs, stats


def process_directory(directory_path):
    files_processed = 0

    for filename in os.listdir(directory_path):
        if not (filename.endswith('.yaml') or filename.endswith('.yml')):
            continue

        filepath = os.path.join(directory_path, filename)

        try:
            with open(filepath, 'r', encoding='utf-8') as file_obj:
                yaml_data = yaml.safe_load(file_obj)

            if not yaml_data or 'payload' not in yaml_data or not isinstance(yaml_data['payload'], list):
                continue

            original_count = len(yaml_data['payload'])
            deduplicated_rules, removed_logs, warning_logs, stats = deduplicate_rules(yaml_data['payload'])
            new_count = len(deduplicated_rules)

            # 修复点：删除数量以“实际删除日志”为准，而不是 original_count - new_count。
            # 因为非字符串项现在被保留，空白项也会单独计入。
            removed_count = stats['removed_total']

            yaml_data['payload'] = deduplicated_rules

            with open(filepath, 'w', encoding='utf-8') as file_obj:
                yaml.dump(
                    yaml_data,
                    file_obj,
                    Dumper=IndentDumper,
                    allow_unicode=True,
                    default_flow_style=False,
                    sort_keys=False
                )

            if removed_count > 0 or warning_logs:
                log_filename = os.path.splitext(filename)[0] + '.txt'
                log_filepath = os.path.join(directory_path, log_filename)

                with open(log_filepath, 'w', encoding='utf-8') as log_obj:
                    log_obj.write(f"【{filename}】去重处理日志\n")
                    log_obj.write('=' * 40 + '\n')
                    log_obj.write(f"原始 payload 项数: {original_count}\n")
                    log_obj.write(f"字符串规则项数: {stats['string_input']}\n")
                    log_obj.write(f"非字符串保留项数: {stats['non_string_kept']}\n")
                    log_obj.write(f"去重后 payload 项数: {new_count}\n")
                    log_obj.write(f"共精简规则: {removed_count} 条\n")
                    log_obj.write(f"其中去重移除: {stats['removed_by_dedup']} 条\n")
                    log_obj.write(f"其中空白移除: {stats['blank_removed']} 条\n")
                    log_obj.write(f"删除明细条数: {len(removed_logs) + stats['blank_removed']} 条\n")
                    log_obj.write('=' * 40 + '\n\n')

                    if warning_logs:
                        log_obj.write('【警告 / 保留项】\n')
                        log_obj.write('\n\n'.join(warning_logs))
                        log_obj.write('\n\n')

                    if removed_logs:
                        log_obj.write('【删除明细】\n')
                        log_obj.write('\n\n'.join(removed_logs))

                print(
                    f"处理成功: '{filename}' | 减少 {removed_count} 条规则，"
                    f"详情已输出至 '{log_filename}'"
                )
            else:
                print(f"处理成功: '{filename}' | 未去除规则，不输出日志")

            files_processed += 1

        except Exception as error:
            print(f"处理文件 '{filename}' 时发生错误: {str(error)}")

    print(f"\n全部处理完成，共操作了 {files_processed} 个规则文件。")


if __name__ == '__main__':
    process_directory('.')
