#!/usr/bin/env python3
"""
马尔代夫岛屿数据爬虫
每天由 GitHub Action 触发，自动更新 data.json 中的价格和评分

数据来源：
  - Booking.com: 通过搜索酒店名称获取价格区间
  - Agoda: 通过搜索酒店名称获取最低价格
  - 备用方案：搜索失败时保留上次数据

用法：
  python scraper.py              # 正常更新
  python scraper.py --dry-run    # 试运行，不保存结果
  python scraper.py --source=all # 使用所有可用来源（默认）
"""

import json
import os
import sys
import time
import re
import random
import logging
from datetime import datetime
from urllib.parse import quote

try:
    import requests
except ImportError:
    requests = None
    print("⚠️  requests 未安装，使用内置 urllib 降级模式")
    import urllib.request
    import urllib.error

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None
    print("⚠️  beautifulsoup4 未安装，HTML 解析将受限")

# ============================================================
# 配置
# ============================================================

DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.json")
REQUEST_TIMEOUT = 20  # 秒
REQUEST_DELAY_MIN = 2.0  # 请求间最小延迟（秒）
REQUEST_DELAY_MAX = 4.0  # 请求间最大延迟（秒）
MAX_RETRIES = 2

# 请求头，模拟真实浏览器
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("scraper")


# ============================================================
# 公共工具函数
# ============================================================

def fetch_url(url, headers=None, retries=MAX_RETRIES):
    """带重试和延迟的 HTTP GET 请求"""
    all_headers = {**HEADERS, **(headers or {})}
    for attempt in range(1, retries + 2):
        try:
            if requests:
                resp = requests.get(url, headers=all_headers, timeout=REQUEST_TIMEOUT)
                resp.raise_for_status()
                resp.encoding = "utf-8"
                return resp.text
            else:
                req = urllib.request.Request(url, headers=all_headers)
                with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
                    return resp.read().decode("utf-8", errors="replace")
        except Exception as e:
            log.warning(f"  请求失败 (尝试 {attempt}/{retries+1}): {e}")
            if attempt <= retries:
                delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX) * attempt
                log.info(f"  等待 {delay:.1f}s 后重试...")
                time.sleep(delay)
            else:
                return None


def random_delay():
    """请求间随机延迟，降低被 ban 风险"""
    delay = random.uniform(REQUEST_DELAY_MIN, REQUEST_DELAY_MAX)
    time.sleep(delay)


def extract_number(text):
    """从文本中提取数字"""
    nums = re.findall(r"[\d,]+(?:\.\d+)?", text.replace(",", ""))
    return [float(n) for n in nums if n]


# ============================================================
# 价格提取 - 各来源实现
# ============================================================

def search_booking(island_name_en):
    """
    从 Booking.com 搜索酒店，提取价格区间
    返回: {"min": float, "max": float} 或 None
    """
    try:
        query = quote(f"{island_name_en} Maldives resort")
        url = f"https://www.booking.com/searchresults.html?ss={query}&order=price"
        html = fetch_url(url)
        if not html:
            return None

        prices = []
        if BeautifulSoup:
            soup = BeautifulSoup(html, "html.parser")
            # 尝试多种选择器匹配价格元素
            price_patterns = [
                soup.find_all("span", attrs={"data-price": re.compile(r"\d+")}),
                soup.find_all("span", class_=re.compile(r"prco-")),
                soup.find_all("div", class_=re.compile(r"prco-")),
                soup.find_all("span", class_=re.compile(r"price", re.I)),
            ]
            for pattern in price_patterns:
                for el in (pattern or []):
                    txt = el.get_text(strip=True)
                    nums = extract_number(txt)
                    if nums:
                        prices.extend(nums)
                if prices:
                    break

        # 备用：正则匹配价格
        if not prices:
            price_patterns = re.findall(r"[€$¥US]?\s*([\d,]+(?:\.\d{2})?)\s*[€$¥]", html)
            for p in price_patterns:
                try:
                    prices.append(float(p.replace(",", "")))
                except ValueError:
                    pass

        if prices:
            valid = [p for p in prices if 500 <= p <= 100000]
            if valid:
                return {"min": min(valid), "max": max(valid)}

        log.info(f"  Booking: 未找到有效价格")
        return None

    except Exception as e:
        log.warning(f"  Booking 搜索异常: {e}")
        return None


def search_agoda(island_name_en):
    """
    从 Agoda 搜索酒店，提取最低价格
    返回: {"min": float, "max": float} 或 None
    """
    try:
        query = quote(f"{island_name_en} Maldives")
        url = f"https://www.agoda.com/search?selectedproperty=&city=0&keyword={query}&languageCode=zh-cn"
        html = fetch_url(url, headers={"Accept-Language": "zh-CN,zh;q=0.9"})
        if not html:
            return None

        prices = []
        if BeautifulSoup:
            soup = BeautifulSoup(html, "html.parser")
            # Agoda 价格通常在特定 class 中
            for cls_pattern in ["price", "totalPrice", "finalPrice", "amount"]:
                elements = soup.find_all(class_=re.compile(cls_pattern, re.I))
                for el in elements:
                    txt = el.get_text(strip=True)
                    nums = extract_number(txt)
                    prices.extend(nums)
                if prices:
                    break

        if not prices:
            price_patterns = re.findall(r"[€$¥]?\s*([\d,]+(?:\.\d{2})?)\s*(?:/晚|/night|per night)", html, re.I)
            for p in price_patterns:
                try:
                    prices.append(float(p.replace(",", "")))
                except ValueError:
                    pass

        if prices:
            valid = [p for p in prices if 500 <= p <= 100000]
            if valid:
                return {"min": min(valid), "max": max(valid)}

        return None

    except Exception as e:
        log.warning(f"  Agoda 搜索异常: {e}")
        return None


def search_tripadvisor(island_name_en):
    """
    从 Tripadvisor 获取评分（价格数据较难获取）
    返回: {"评分": float} 或 None
    """
    try:
        query = quote(f"{island_name_en} Maldives")
        url = f"https://www.tripadvisor.com/Search?q={query}&searchSessionId=1"
        html = fetch_url(url)
        if not html:
            return None

        score = None
        # 提取评分
        rating_match = re.search(r'"ratingValue"[:\s]+([\d.]+)', html)
        if rating_match:
            score = float(rating_match.group(1))

        return {"评分": score} if score else None

    except Exception as e:
        log.warning(f"  Tripadvisor 搜索异常: {e}")
        return None


def search_google_hotels(island_name_en):
    """
    从 Google Hotels 获取价格信息
    返回: {"min": float, "max": float} 或 None
    """
    try:
        query = quote(f"{island_name_en} Maldives resort price per night")
        url = f"https://www.google.com/travel/search?q={query}"
        html = fetch_url(url)
        if not html:
            return None

        prices = []
        # Google Travel 价格通常以 ¥ 或 $ 开头
        price_patterns = re.findall(r"[¥￥$€]\s*([\d,]+(?:\.\d{2})?)", html)
        for p in price_patterns:
            try:
                prices.append(float(p.replace(",", "")))
            except ValueError:
                pass

        if prices:
            valid = [p for p in prices if 500 <= p <= 100000]
            if valid:
                return {"min": min(valid), "max": max(valid)}
        return None

    except Exception as e:
        log.warning(f"  Google Hotels 搜索异常: {e}")
        return None


# ============================================================
# 来源注册表
# ============================================================

SOURCES = [
    # (名称, 函数, 数据字段映射, 权重)
    ("Booking.com", search_booking, {"价格区间": True}, 3),
    ("Agoda", search_agoda, {"价格区间": True}, 2),
    ("Google Hotels", search_google_hotels, {"价格区间": True}, 1),
    ("Tripadvisor", search_tripadvisor, {"评分": True}, 1),
]

SOURCE_NAMES = {s[0] for s in SOURCES}


# ============================================================
# 主逻辑
# ============================================================

def extract_english_name(name):
    """从 '中文名 English Name' 格式中提取英文名"""
    parts = name.split(" ", 1)
    return parts[1].strip() if len(parts) > 1 else name


def merge_price_data(existing_prices, new_prices):
    """
    合并新旧价格数据。
    新数据加权平均保留趋势，避免单次异常波动。
    权重: 新数据 0.3, 旧数据 0.7
    """
    if new_prices is None:
        return existing_prices

    merged = dict(existing_prices or {"最低": 0, "最高": 0})
    w_new = 0.3

    if "min" in new_prices and new_prices["min"]:
        merged["最低"] = round(
            existing_prices.get("最低", new_prices["min"]) * (1 - w_new)
            + new_prices["min"] * w_new
        )
    if "max" in new_prices and new_prices["max"]:
        merged["最高"] = round(
            existing_prices.get("最高", new_prices["max"]) * (1 - w_new)
            + new_prices["max"] * w_new
        )

    return merged


def update_island(island, enabled_sources, dry_run=False):
    """尝试从各来源更新单个岛屿的数据"""
    name_en = extract_english_name(island["name"])
    today = datetime.now().strftime("%Y-%m-%d")
    updated = False
    source_used = []
    new_price = None
    new_score = None

    log.info(f"  🔍 {island['name']} ({name_en})")

    for src_name, src_func, fields, _ in SOURCES:
        if enabled_sources and src_name not in enabled_sources:
            continue
        if src_name not in SOURCE_NAMES:
            continue

        random_delay()
        log.info(f"    → {src_name}...")
        result = src_func(name_en)

        if result:
            source_used.append(src_name)
            if "价格区间" in fields:
                if "min" in result and "max" in result:
                    if new_price is None:
                        new_price = result
                    else:
                        # 多个来源取交集
                        new_price["min"] = min(new_price["min"], result["min"])
                        new_price["max"] = max(new_price["max"], result["max"])
            if "评分" in fields:
                if "评分" in result:
                    new_score = result["评分"]
        else:
            log.info(f"    → {src_name}: ⏭️ 无数据")

    if new_price:
        merged = merge_price_data(island["价格区间"], new_price)
        island["价格区间"] = merged
        updated = True
        log.info(f"  ✅ 价格更新: ¥{merged['最低']} - ¥{merged['最高']}/晚")

    if new_score:
        old_score = island.get("评分", 0)
        island["评分"] = round(old_score * 0.7 + new_score * 0.3, 1)
        updated = True
        log.info(f"  ✅ 评分更新: {old_score} → {island['评分']}")

    if updated:
        island["数据来源"] = " + ".join(source_used) if source_used else "上次缓存"
        island["数据更新"] = today

    return updated


def load_data():
    """加载 data.json"""
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)


def save_data(data):
    """保存 data.json"""
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def run(enabled_sources=None, dry_run=False):
    """主运行函数"""
    log.info(f"📂 加载数据: {DATA_FILE}")
    islands = load_data()
    log.info(f"📊 共 {len(islands)} 个岛屿")

    updated_count = 0
    for i, island in enumerate(islands):
        log.info(f"[{i+1}/{len(islands)}] {'='*40}")
        try:
            if update_island(island, enabled_sources, dry_run):
                updated_count += 1
        except Exception as e:
            log.error(f"❌ {island['name']} 更新失败: {e}")
            import traceback
            traceback.print_exc()

    if dry_run:
        log.info(f"\n🧪 试运行完成，未保存更改")
        log.info(f"   预计更新: {updated_count}/{len(islands)} 个岛屿")
    else:
        save_data(islands)
        log.info(f"\n💾 数据已保存: {DATA_FILE}")
        log.info(f"   已更新: {updated_count}/{len(islands)} 个岛屿")

    return updated_count


def verify():
    """验证 data.json 完整性"""
    islands = load_data()
    required = ["id", "name", "星级", "评分", "价格区间", "摄影数据"]
    errors = []

    for i, island in enumerate(islands):
        for field in required:
            if field not in island:
                errors.append(f"#{i} '{island.get('name', '?')}' 缺少: {field}")
        # 检查价格格式
        price = island.get("价格区间", {})
        if isinstance(price, dict):
            if not price.get("最低") or not price.get("最高"):
                errors.append(f"#{i} '{island.get('name', '?')}' 价格数据不完整")
        # 检查摄影数据
        photo = island.get("摄影数据", {})
        for pf in ["纬度", "光污染等级"]:
            if pf not in photo:
                errors.append(f"#{i} '{island.get('name', '?')}' 摄影数据缺少: {pf}")

    if errors:
        log.error("❌ 数据验证失败:")
        for e in errors:
            log.error(f"  - {e}")
        return False

    log.info(f"✅ 数据验证通过: {len(islands)} 个岛屿，字段完整")
    return True


# ============================================================
# 命令行入口
# ============================================================

if __name__ == "__main__":
    print(f"\n{'='*50}")
    print(f"  🏝️  马尔代夫数据更新")
    print(f"  📅 {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*50}\n")

    args = set(sys.argv[1:])
    dry_run = "--dry-run" in args or "-n" in args
    enabled = None

    for arg in args:
        if arg.startswith("--source="):
            src = arg.split("=", 1)[1]
            enabled = [s.strip() for s in src.split(",") if s.strip()]
            log.info(f"🔧 限定数据来源: {enabled}")

    if dry_run:
        log.info("🧪 试运行模式（不保存结果）\n")

    updated = run(enabled_sources=enabled, dry_run=dry_run)
    verify()

    print(f"\n{'='*50}")
    if dry_run:
        print(f"  🧪 试运行结束 (可更新: {updated})")
    else:
        print(f"  {'✅' if updated > 0 else '⏭️'} 更新完成 ({updated} 个岛屿)")
    print(f"{'='*50}\n")

    sys.exit(0 if updated >= 0 else 1)
