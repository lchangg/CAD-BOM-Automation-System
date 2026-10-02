"""Stage 3: classify raw cabinet text into material candidates / descriptions / auxiliaries.

This consumes the stage-2 spatial partition JSON. It intentionally does not
merge quantities into a final BOM and does not use a price or inventory source.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path('.')
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)
input_path = OUT / 'single_cabinet_validation.json'
data = json.loads(input_path.read_text(encoding='utf-8'))

RATING_RE = re.compile(r'(?i)\b[1-4]\s*P\s*(?:[A-Z])?\s*\d+(?:\.\d+)?\s*A\b')
SPD_RE = re.compile(r'(?i)\b\d+(?:\.\d+)?\s*KA\s*SPD\b')
CABLE_RE = re.compile(r'(?i)(?:mm2|mm²|×|\*)')
CABLE_FAMILY_RE = re.compile(r'(?i)\b(?:Z[RC]-)?(?:VVR|YJV|YJV22)')
BREAKER_MODEL_RE = re.compile(
    r'(?i)\b(?:DZ\d+|C(?:6[03]|32|65|60)\w*|CM\d+\w*|NM\d+\w*|NXB\w*|NSX\w*|EZD\w*|S\d{2,4}\w*|iC\d+\w*)\b'
    r'|(?:施耐德|正泰|德力西|ABB|西门子)\s*[A-Z0-9-]+'
)
MULT_RE = re.compile(r'\*\s*(\d+)\s*$')

def point_obj(x: dict) -> dict:
    return {'x': x['坐标']['x'], 'y': x['坐标']['y'], 'z': x['坐标'].get('z', 0.0)}

def base_record(x: dict) -> dict:
    return {
        '原始文字': x['文字'],
        '坐标': point_obj(x),
        '图层': x.get('图层'),
        '来源对象类型': x.get('来源对象类型'),
    }

def material_candidate(x: dict, standard: str, rule: str, quantity: int = 1, spec: str | None = None) -> dict:
    r = base_record(x)
    r.update({
        '标准名称': standard,
        '类别': 'A-材料候选',
        '数量': quantity,
        '识别规则': rule,
    })
    if spec is not None:
        r['规格'] = spec
    return r

def classify(x: dict) -> tuple[str, dict]:
    raw = x['文字'].strip()

    # Explicit material patterns, in priority order.
    m = SPD_RE.search(raw)
    if m:
        spec = re.search(r'(?i)\d+(?:\.\d+)?\s*KA', m.group(0)).group(0).replace(' ', '')
        return 'A', material_candidate(x, 'SPD', 'xxKA SPD格式', 1, spec)

    m = RATING_RE.search(raw)
    if m:
        qty = int(MULT_RE.search(raw).group(1)) if MULT_RE.search(raw) else 1
        return 'A', material_candidate(x, '断路器', '极数(1P/2P/3P/4P)+电流(xxA)格式', qty, m.group(0).replace(' ', ' '))

    # Cable model: retain both explicit mm2 and common cable-family forms.
    if CABLE_FAMILY_RE.search(raw) and CABLE_RE.search(raw):
        return 'A', material_candidate(x, '电缆', '电缆型号 + mm2/×/*格式', 1, raw)
    if 'mm2' in raw.lower() or 'mm²' in raw.lower():
        return 'A', material_candidate(x, '电缆', '包含 mm2/mm²', 1, raw)

    m = BREAKER_MODEL_RE.search(raw)
    if m:
        qty = int(MULT_RE.search(raw).group(1)) if MULT_RE.search(raw) else 1
        return 'A', material_candidate(x, '断路器', '厂家/系列/型号模式', qty, m.group(0))

    # Clearly named installable devices are retained as candidates, without
    # claiming a final product model.
    named = [
        ('触摸屏', '触摸屏', '触摸屏关键词'),
        ('检修插座', '检修插座', '插座关键词'),
        ('充电桩', '充电桩开关', '充电桩关键词'),
        ('CE风机', '风机控制开关', '风机关键词'),
        ('精密空调', '空调开关', '精密空调关键词'),
    ]
    for token, standard, rule in named:
        if token in raw:
            mm = MULT_RE.search(raw)
            qty = int(mm.group(1)) if mm else 1
            return 'A', material_candidate(x, standard, rule, qty, raw)

    # Auxiliary information is not a material or functional description.
    if raw in {'N', 'PE'} or '柜体尺寸' in raw or '电缆利旧' in raw or '预留' in raw:
        r = base_record(x)
        r.update({'类别': 'C-辅助信息', '识别规则': '端子/尺寸/利旧/预留辅助信息'})
        return 'C', r

    r = base_record(x)
    r.update({'类别': 'B-说明文字', '识别规则': '未命中材料候选规则，保留为说明文字'})
    return 'B', r

projects = []
for project in data['项目']:
    cabinets = []
    for cabinet in project['柜体']:
        out_cab = {
            '柜名称': cabinet['柜名称'],
            '柜体来源坐标': cabinet['来源坐标'],
            '材料候选': [],
            '说明文字': [],
            '辅助信息': [],
        }
        for raw_text in cabinet['包含文字']:
            category, record = classify(raw_text)
            if category == 'A':
                out_cab['材料候选'].append(record)
            elif category == 'B':
                out_cab['说明文字'].append(record)
            else:
                out_cab['辅助信息'].append(record)
        cabinets.append(out_cab)
    projects.append({'项目名': project.get('项目名', '未命名项目'), '柜体': cabinets})

result = {
    '项目': projects,
    '阶段说明': '第三阶段设备候选识别；不合并数量、不连接价格库/库存库、不代表最终采购BOM。',
    '规则版本': 'stage3-rule-candidates-v1',
}
(OUT / 'device_candidate_validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

md = ['# 第三阶段：配电设备候选识别', '', '基于单柜空间分区结果。A 类只表示候选材料，不代表最终 BOM；数量没有跨文字对象合并。', '']
for project in projects:
    for cab in project['柜体']:
        p = cab['柜体来源坐标']
        md += [f"## {cab['柜名称']}", '', f"柜体来源坐标：({p['x']:.3f}, {p['y']:.3f}, {p.get('z', 0):.3f})", '', '### A. 材料候选', '', '| 原始文字 | 标准名称 | 规格 | 数量 | 坐标 | 识别规则 |', '|---|---|---|---:|---|---|']
        for x in cab['材料候选']:
            p = x['坐标']
            md.append(f"| {x['原始文字'].replace('|','\\|')} | {x['标准名称']} | {x.get('规格','')} | {x['数量']} | ({p['x']:.3f}, {p['y']:.3f}, {p['z']:.3f}) | {x['识别规则']} |")
        if not cab['材料候选']:
            md.append('| （无） |  |  |  |  |  |')
        md += ['', '### B. 说明文字', '']
        for x in cab['说明文字']:
            p = x['坐标']
            md.append(f"- {x['原始文字']}  （坐标：`({p['x']:.3f}, {p['y']:.3f}, {p['z']:.3f})`）")
        if not cab['说明文字']:
            md.append('- （无）')
        md += ['', '### C. 辅助信息', '']
        for x in cab['辅助信息']:
            p = x['坐标']
            md.append(f"- {x['原始文字']}  （坐标：`({p['x']:.3f}, {p['y']:.3f}, {p['z']:.3f})`）")
        if not cab['辅助信息']:
            md.append('- （无）')
        md.append('')
(OUT / 'device_candidate_validation.md').write_text('\n'.join(md) + '\n', encoding='utf-8')

print(OUT / 'device_candidate_validation.json')
print(OUT / 'device_candidate_validation.md')
