import json
from collections import Counter, defaultdict
from pathlib import Path
import ezdxf

DXF = Path('work/input.dxf')
doc = ezdxf.readfile(DXF)

layout_entities = []
by_layout = {}
for layout in doc.layouts:
    ents = list(layout)
    by_layout[layout.name] = Counter(e.dxftype() for e in ents)
    layout_entities.extend((layout.name, e) for e in ents)

all_counter = Counter(e.dxftype() for _, e in layout_entities)
block_entities = []
for block in doc.blocks:
    for e in block:
        block_entities.append((block.name, e))
block_counter = Counter(e.dxftype() for _, e in block_entities)

def text_of(e):
    if e.dxftype() == 'TEXT':
        return str(e.dxf.get('text', ''))
    if e.dxftype() == 'MTEXT':
        return e.plain_text()
    return ''

def point_of(e):
    for key in ('insert', 'alignment_point'):
        if e.dxf.hasattr(key):
            p = e.dxf.get(key)
            return [float(p[0]), float(p[1]), float(p[2]) if len(p) > 2 else 0.0]
    return None

texts = []
for layout_name, e in layout_entities:
    if e.dxftype() in ('TEXT', 'MTEXT'):
        texts.append({'text': text_of(e), 'layout': layout_name, 'layer': e.dxf.get('layer', ''), 'point': point_of(e), 'type': e.dxftype()})

keywords = ['MCCB', 'MCB', 'SPD', 'DS', 'C32', 'C63', 'A', 'kW']
matches = [x for x in texts if any(k.lower() in x['text'].lower() for k in keywords)]

equipment_terms = ['MCCB', 'MCB', 'SPD', 'DS', 'C32', 'C63', 'kW', 'KW', 'UPS', 'PDU', 'A', 'V', 'mm', '电', '开关', '断路器', '配电', '照明', '插座', '风机', '空调', '水泵']
suspected = [x for x in texts if any(k.lower() in x['text'].lower() for k in equipment_terms)]

print(json.dumps({
    'layouts': [x.name for x in doc.layouts],
    'layout_entity_counts': {k: dict(v) for k, v in by_layout.items()},
    'layout_entity_total': dict(all_counter),
    'block_definition_count': len(doc.blocks),
    'block_definition_entity_counts': dict(block_counter),
    'requested_counts': {
        'TEXT': all_counter['TEXT'], 'MTEXT': all_counter['MTEXT'], 'INSERT': all_counter['INSERT'],
        'BLOCK': len(doc.blocks), 'ATTRIB': all_counter['ATTRIB'] + block_counter['ATTRIB'],
        'LINE': all_counter['LINE'], 'POLYLINE': all_counter['POLYLINE'], 'LWPOLYLINE': all_counter['LWPOLYLINE'],
    },
    'keyword_matches': matches,
    'all_texts': texts,
    'all_text_count': len(texts),
    'suspected_count': len(suspected),
    'suspected_first_50': suspected[:50],
}, ensure_ascii=False, indent=2))
