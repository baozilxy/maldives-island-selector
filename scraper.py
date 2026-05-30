#!/usr/bin/env python3
"""
马尔代夫岛屿数据爬虫
每天由 GitHub Action 触发，更新 data.json 中的价格和评分
"""

import json
import os
import sys
from datetime import datetime

DATA_FILE = os.path.join(os.path.dirname(__file__), 'data.json')


def update_data():
    """主更新函数"""
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        islands = json.load(f)

    today = datetime.now().strftime('%Y-%m-%d')
    updated_count = 0

    for island in islands:
        try:
            # 尝试从各个来源更新数据
            updated = False

            # 此处为爬虫占位 — 根据实际可爬取的来源实现
            # 示例：从 Agoda/Booking/TripAdvisor 抓取价格
            # new_price = fetch_price_from_source(island['name'])
            # if new_price:
            #     island['价格区间']['最低'] = new_price['min']
            #     island['价格区间']['最高'] = new_price['max']
            #     island['数据来源'] = 'agoda.com'
            #     updated = True

            if updated:
                island['数据更新'] = today
                updated_count += 1

            print(f"  {'✅' if updated else '⏭️'} {island['name']}")

        except Exception as e:
            print(f"  ❌ {island['name']}: {e}")

    # 保存更新
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(islands, f, ensure_ascii=False, indent=2)

    print(f"\n更新完成：{updated_count}/{len(islands)} 个岛屿已更新")
    return updated_count > 0


def verify_data():
    """验证 data.json 的完整性"""
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        islands = json.load(f)

    required_fields = ['id', 'name', '星级', '评分', '价格区间', '摄影数据']
    errors = []

    for i, island in enumerate(islands):
        for field in required_fields:
            if field not in island:
                errors.append(f"岛屿 #{i} '{island.get('name', 'unknown')}' 缺少字段: {field}")

    if errors:
        print("数据验证失败:")
        for e in errors:
            print(f"  - {e}")
        return False

    print(f"数据验证通过：{len(islands)} 个岛屿")
    return True


if __name__ == '__main__':
    print(f"=== 马尔代夫数据更新 {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")
    success = update_data()
    verify_data()
    sys.exit(0 if success else 1)
