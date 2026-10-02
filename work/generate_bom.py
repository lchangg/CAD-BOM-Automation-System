"""Deterministic CAD-text -> electrical BOM prototype.

This is intentionally rule-based and explainable. It does not call an AI model.
Input is the JSON emitted by the validated DWG/DXF extraction stage.
"""
from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path('.')
INPUT = ROOT / 'work' / 'report.json'
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)

data = json.loads(INPUT.read_text(encoding='utf-8'))
texts = [x for x in data['all_texts'] if x.get('point') and x.get('layout') == 'Model']

TITLE_RE = re.compile(r'(系统图|配电系统图|输入输出柜|列头柜|柜$|箱$|\b(?:AP|AL)\d*\b)', re.I)
DEVICE_RATING_RE = re.compile(r'(?P<poles>[1-4]\s*P)\s*(?P<curve>[A-Z])?\s*(?P<amps>\d+(?:\.\d+)?)\s*A\b', re.I)
CABLE_RE = re.compile(r'(?i)\b(?:Z[RC]-)?(?:VVR|YJV|YJV22)[^\s]*\d+\s*(?:mm2|mm²)|\b(?:Z[RC]-)?YJV22[^\s]+')
MULT_RE = re.compile(r'\*\s*(\d+)\s*$')

def is_title(x: dict) -> bool:
    s = x['text'].strip()
    if '柜体尺寸' in s or 'PDU' in s or '机柜' in s:
        return False
    if '系统图' in s or '输入输出柜' in s or '列头柜' in s:
        return True
    return bool(TITLE_RE.search(s)) and ('柜' in s or '箱' in s or re.search(r'\b(?:AP|AL)\d*\b', s, re.I))

titles = [x for x in texts if is_title(x)]

def clean_spec(s: str) -> str:
    return re.sub(r'\s+', ' ', s.strip())

def device_from_text(x: dict) -> dict | None:
    raw = x['text'].strip()
    if not raw or raw in {'N', 'PE'}:
        return None
    if raw in {t['text'].strip() for t in titles}:
        return None
    if '柜体尺寸' in raw or '利旧' in raw or '预留' in raw:
        return None
    if raw in {'UPS', 'UPS输出', 'UPS市电输入', 'UPS主机输出', 'UPS主机市电输入', '市电电源2'}:
        return None
    if re.match(r'^机柜\d+\s+PDU', raw, re.I):
        return None

    m = DEVICE_RATING_RE.search(raw)
    if m:
        amps = float(m.group('amps'))
        poles = re.sub(r'\s+', '', m.group('poles')).upper()
        curve = (m.group('curve') or '').upper()
        standard = 'MCCB' if amps >= 100 else 'MCB'
        spec = f"{poles} {curve + '' if curve else ''}{m.group('amps')}A"
        return {'原始文字': raw, '标准名称': standard, '规格': spec, '数量': 1, '坐标': x['point'], '来源类型': x['type'], '识别规则': '额定电流/极数规则'}

    if re.search(r'SPD', raw, re.I):
        km = re.search(r'(?i)(\d+(?:\.\d+)?)\s*KA', raw)
        spec = f"{km.group(1)}KA" if km else clean_spec(raw)
        return {'原始文字': raw, '标准名称': 'SPD', '规格': spec, '数量': 1, '坐标': x['point'], '来源类型': x['type'], '识别规则': 'SPD关键词'}

    if CABLE_RE.search(raw) or re.search(r'(?i)\b(?:VVR|YJV|YJV22)\b', raw):
        return {'原始文字': raw, '标准名称': '电力电缆', '规格': clean_spec(raw), '数量': 1, '坐标': x['point'], '来源类型': x['type'], '识别规则': '电缆型号关键词'}

    m = re.search(r'(?i)(\d+)\s*寸\s*触摸屏', raw)
    if m:
        return {'原始文字': raw, '标准名称': '触摸屏', '规格': f"{m.group(1)}寸", '数量': 1, '坐标': x['point'], '来源类型': x['type'], '识别规则': '触摸屏尺寸规则'}

    m = MULT_RE.search(raw)
    if m and re.search(r'(开关|插座|风机|空调|充电桩)', raw):
        qty = int(m.group(1))
        base = MULT_RE.sub('', raw).strip()
        if '插座' in base:
            standard = '插座'
        elif '风机' in base:
            standard = '风机控制开关'
        elif '空调' in base:
            standard = '空调开关'
        elif '充电桩' in base:
            standard = '充电桩开关'
        else:
            standard = '开关'
        return {'原始文字': raw, '标准名称': standard, '规格': base, '数量': qty, '坐标': x['point'], '来源类型': x['type'], '识别规则': '文字数量后缀规则'}

    # Single named equipment likely to be a material, but avoid functional labels.
    if re.fullmatch(r'(?i)(?:AP|AL)\d*', raw):
        return {'原始文字': raw, '标准名称': '配电箱', '规格': raw.upper(), '数量': 1, '坐标': x['point'], '来源类型': x['type'], '识别规则': 'AP/AL柜号规则'}
    return None

def distance(a: dict, b: dict) -> float:
    ax, ay = a['point'][:2]
    bx, by = b['point'][:2]
    # CAD units are isotropic; retain Euclidean distance so the rule is easy to audit.
    return math.hypot(ax - bx, ay - by)

devices = []
unrecognized = []
for x in texts:
    d = device_from_text(x)
    if d:
        d['_source'] = x
        devices.append(d)
    elif not is_title(x) and any(k in x['text'] for k in ('开关', '插座', '电缆', 'SPD', 'PDU', 'UPS', '触摸屏', 'VVR', 'YJV', 'A')):
        unrecognized.append({'原始文字': x['text'], '坐标': x['point'], '原因': '未匹配到可计量设备规则'})

groups = []
for title in titles:
    groups.append({'柜体': title['text'], '标题坐标': title['point'], 'layout': title['layout'], '设备': [], '_title': title})

for d in devices:
    if not groups:
        continue
    group = min(groups, key=lambda g: distance(d['_source'], g['_title']))
    group['设备'].append(d)

for group in groups:
    merged = {}
    for d in group['设备']:
        key = (d['标准名称'], d['规格'])
        if key not in merged:
            merged[key] = {k: d[k] for k in ('原始文字', '标准名称', '规格', '数量', '坐标')}
            merged[key]['来源文字'] = [d['原始文字']]
            merged[key]['来源坐标'] = [d['坐标']]
        else:
            merged[key]['数量'] += d['数量']
            merged[key]['来源文字'].append(d['原始文字'])
            merged[key]['来源坐标'].append(d['坐标'])
            # Keep one representative coordinate in the requested singular field.
    group['设备'] = list(merged.values())
    del group['_title']

result = {
    '项目': [{
        '项目名': 'sample-project',
        '输入文字对象数': len(texts),
        '柜体识别数': len(groups),
        '识别说明': '基于文字关键词、规格正则和标题最近邻空间关系；未使用AI。',
        '柜体': groups,
        '未识别疑似设备文字': unrecognized,
    }]
}

(OUT / 'dwg_bom.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

md = ['# DWG → 配电设备 BOM（规则验证）', '', '本结果来自真实 DWG 的已验证文字/坐标 JSON；当前为可解释的规则识别，不是 AI 识别。', '', f'- 输入文字对象：{len(texts)}', f'- 识别柜体标题：{len(groups)}', f'- 已识别设备记录（合并前）：{len(devices)}', '']
for group in groups:
    md += [f"## {group['柜体']}", '', f"标题坐标：({group['标题坐标'][0]:.3f}, {group['标题坐标'][1]:.3f})", '', '| 原始文字 | 标准名称 | 规格 | 数量 | 代表坐标 | 来源坐标数 |', '|---|---|---|---:|---|---:|']
    for d in group['设备']:
        p = d['坐标']
        md.append(f"| {d['原始文字'].replace('|','\\|')} | {d['标准名称']} | {d['规格']} | {d['数量']} | ({p[0]:.3f}, {p[1]:.3f}) | {len(d['来源坐标'])} |")
    if not group['设备']:
        md.append('| （未识别到可计量设备） |  |  |  |  |  |')
    md.append('')
md += ['## 未识别/未计量文字', '', '以下文字被识别为可能相关但没有进入 BOM 计量项，保留供人工复核：', '', '| 原始文字 | 坐标 | 原因 |', '|---|---|---|']
for x in unrecognized:
    p = x['坐标']
    md.append(f"| {x['原始文字'].replace('|','\\|')} | ({p[0]:.3f}, {p[1]:.3f}) | {x['原因']} |")
(OUT / 'dwg_bom.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

print(OUT / 'dwg_bom.json')
print(OUT / 'dwg_bom.md')
