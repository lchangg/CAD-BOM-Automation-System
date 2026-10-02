"""Single-cabinet spatial partition validation.

Input: work/report.json from the validated DWG/DXF text extraction stage.
No device classification, normalization, or quantity aggregation is performed.
"""
from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path('.')
OUT = ROOT / 'outputs'
OUT.mkdir(exist_ok=True)
data = json.loads((ROOT / 'work' / 'report.json').read_text(encoding='utf-8'))
texts = [x for x in data['all_texts'] if x.get('layout') == 'Model' and x.get('point')]

def title_reason(s: str) -> str | None:
    # Keep the candidate rule broad for human review, but exclude labels that
    # contain cabinet characters only as part of a PDU/load label or dimension.
    if '柜体尺寸' in s or 'PDU' in s or '机柜' in s:
        return None
    reasons = []
    if '系统图' in s:
        reasons.append('系统图')
    if '输入输出柜' in s:
        reasons.append('输入输出柜')
    if '列头柜' in s:
        reasons.append('列头柜')
    if re.search(r'柜$', s):
        reasons.append('末尾柜')
    if re.search(r'箱$', s):
        reasons.append('末尾箱')
    if re.search(r'\b(?:AP|AL)\d*\b', s, re.I):
        reasons.append('AP/AL')
    return '、'.join(dict.fromkeys(reasons)) or None

title_candidates = []
for x in texts:
    reason = title_reason(x['text'].strip())
    if reason:
        title_candidates.append({**x, '标题判定依据': reason})

title_keys = {(x['text'], tuple(x['point'])) for x in title_candidates}

def distance(a, b):
    return math.hypot(a['point'][0] - b['point'][0], a['point'][1] - b['point'][1])

groups = []
for t in title_candidates:
    groups.append({
        '柜名称': t['text'],
        '来源坐标': {'x': t['point'][0], 'y': t['point'][1], 'z': t['point'][2]},
        '来源图层': t.get('layer'),
        '来源对象类型': t.get('type'),
        '标题判定依据': t['标题判定依据'],
        '区域规则': '二维欧氏距离最近标题归属（Voronoi-like nearest-title partition）',
        '包含文字': [],
        '_title': t,
    })

for x in texts:
    # The title is reported separately and is not duplicated in its own list.
    if (x['text'], tuple(x['point'])) in title_keys:
        continue
    if not groups:
        continue
    g = min(groups, key=lambda item: distance(x, item['_title']))
    g['包含文字'].append({
        '文字': x['text'],
        '坐标': {'x': x['point'][0], 'y': x['point'][1], 'z': x['point'][2]},
        '图层': x.get('layer'),
        '来源对象类型': x.get('type'),
        '与标题距离': round(distance(x, g['_title']), 3),
    })

for g in groups:
    g['包含文字'].sort(key=lambda x: (x['坐标']['y'], x['坐标']['x']))
    pts = [g['来源坐标'], *[x['坐标'] for x in g['包含文字']]]
    g['区域估计范围'] = {
        'min_x': min(p['x'] for p in pts), 'max_x': max(p['x'] for p in pts),
        'min_y': min(p['y'] for p in pts), 'max_y': max(p['y'] for p in pts),
    }
    del g['_title']

result = {
    '项目': [{
        '项目名': 'sample-project',
        '输入文字对象数': len(texts),
        '标题候选数': len(groups),
        '空间分区说明': '每个非标题文字对象归入二维欧氏距离最近的标题；未进行设备分类、数量合并或 AI 推理。',
        '柜体': groups,
    }]
}
(OUT / 'single_cabinet_validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')

md = ['# 单柜空间分区验证', '', '输入为真实 DWG 解析后的文字 + 坐标 JSON。本阶段不做设备分类、不合并数量。', '', f"- 输入文字对象：{len(texts)}", f"- 柜体标题候选：{len(groups)}", '- 分区方法：二维欧氏距离最近标题归属（Voronoi-like nearest-title partition）', '']
for i, g in enumerate(groups, 1):
    p = g['来源坐标']
    r = g['区域估计范围']
    md += [f"## {i}. {g['柜名称']}", '', f"来源坐标：({p['x']:.3f}, {p['y']:.3f}, {p['z']:.3f})", f"标题判定依据：{g['标题判定依据']}", f"区域估计范围：X [{r['min_x']:.3f}, {r['max_x']:.3f}]，Y [{r['min_y']:.3f}, {r['max_y']:.3f}]", '', '包含文字：', '']
    for x in g['包含文字']:
        p = x['坐标']
        md.append(f"- {x['文字']}  （坐标：`({p['x']:.3f}, {p['y']:.3f}, {p['z']:.3f})`；图层：`{x['图层']}`；来源对象：`{x['来源对象类型']}`）")
    if not g['包含文字']:
        md.append('- （无）')
    md.append('')
(OUT / 'single_cabinet_validation.md').write_text('\n'.join(md) + '\n', encoding='utf-8')
print(OUT / 'single_cabinet_validation.json')
print(OUT / 'single_cabinet_validation.md')
