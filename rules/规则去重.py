import os
import yaml

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
    优先级: 1(+), 2(.), 3(*), 4(exact)
    """
    # 剥离可能自带的引号和空格，方便标准化比较
    clean_str = rule_str.strip().strip("'").strip('"')

    if clean_str.startswith('+.'):
        domain = clean_str[2:]
        return 1, domain.split('.')[::-1] if domain else [], clean_str
    elif clean_str.startswith('.'):
        domain = clean_str[1:]
        return 2, domain.split('.')[::-1] if domain else [], clean_str
    elif clean_str.startswith('*.'):
        domain = clean_str[2:]
        return 3, domain.split('.')[::-1] if domain else [], clean_str
    elif clean_str == '*':
        return 3, [], clean_str
    else:
        return 4, clean_str.split('.')[::-1] if clean_str else [], clean_str


def deduplicate_rules(rules):
    parsed_rules = []

    for rule in rules:
        if not isinstance(rule, str):
            continue

        priority_type, reverse_labels, clean_str = parse_rule(rule)
        parsed_rules.append((tuple(reverse_labels), priority_type, clean_str))

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
                reason_rule = active_types[4]  # 完全重复的普通规则

        # 2. 检查当前规则是否被某个上级域名泛解析覆盖
        if not is_subsumed:
            for i in range(len(labels)):
                prefix = labels[:i]

                if prefix in kept_rules:
                    active_types = kept_rules[prefix]

                    if 1 in active_types:
                        is_subsumed = True
                        reason_rule = active_types[1]
                        break
                    elif 2 in active_types:
                        is_subsumed = True
                        reason_rule = active_types[2]
                        break
                    elif 3 in active_types and priority_type == 4 and len(labels) == i + 1:
                        is_subsumed = True
                        reason_rule = active_types[3]
                        break

        if is_subsumed:
            if reason_rule == current_rule:
                removed_logs.append(
                    f"已移除: [{current_rule}] \n"
                    f"  -> 原因: 存在完全相同的重复规则。"
                )
            else:
                removed_logs.append(
                    f"已移除: [{current_rule}] \n"
                    f"  -> 原因: 存在匹配范围更广的规则 [{reason_rule}]。"
                )
        else:
            if labels not in kept_rules:
                kept_rules[labels] = {}

            kept_rules[labels][priority_type] = current_rule
            final_rules.append(current_rule)

    # 恢复原有的字母表排序
    final_rules.sort()

    return final_rules, removed_logs


def process_directory(directory_path):
    files_processed = 0

    for filename in os.listdir(directory_path):
        if not (filename.endswith(".yaml") or filename.endswith(".yml")):
            continue

        filepath = os.path.join(directory_path, filename)

        try:
            with open(filepath, 'r', encoding='utf-8') as file_obj:
                yaml_data = yaml.safe_load(file_obj)

            if not yaml_data or 'payload' not in yaml_data or not isinstance(yaml_data['payload'], list):
                continue

            original_count = len(yaml_data['payload'])
            deduplicated_rules, removed_logs = deduplicate_rules(yaml_data['payload'])
            new_count = len(deduplicated_rules)
            removed_count = original_count - new_count

            # 不再使用 QuotedString 包装规则，避免强制添加单引号
            yaml_data['payload'] = deduplicated_rules

            # 写出处理后的 YAML 文件
            with open(filepath, 'w', encoding='utf-8') as file_obj:
                yaml.dump(
                    yaml_data,
                    file_obj,
                    Dumper=IndentDumper,
                    allow_unicode=True,
                    default_flow_style=False,
                    sort_keys=False
                )

            # 只有存在被移除的规则时，才输出日志文件
            if removed_logs:
                log_filename = os.path.splitext(filename)[0] + ".txt"
                log_filepath = os.path.join(directory_path, log_filename)

                with open(log_filepath, 'w', encoding='utf-8') as log_obj:
                    log_obj.write(f"【{filename}】去重处理日志\n")
                    log_obj.write("=" * 40 + "\n")
                    log_obj.write(f"原始规则数量: {original_count}\n")
                    log_obj.write(f"去重后数量: {new_count}\n")
                    log_obj.write(f"共精简规则: {removed_count} 条\n")
                    log_obj.write("=" * 40 + "\n\n")
                    log_obj.write("\n\n".join(removed_logs))

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


if __name__ == "__main__":
    process_directory(".")