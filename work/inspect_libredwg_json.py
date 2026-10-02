import json
from collections import Counter

with open('work/input.libredwg.json', encoding='utf-8') as f:
    d = json.load(f)

def walk(x, path=()):
    if isinstance(x, dict):
        for k, v in x.items():
            if k in {'entities', 'objects'} and isinstance(v, list):
                print(path + (k,), 'len=', len(v), 'types=', Counter(item.get('entity', item.get('object')) for item in v if isinstance(item, dict)))
            walk(v, path + (k,))
    elif isinstance(x, list):
        for i, v in enumerate(x):
            walk(v, path + (str(i),))

walk(d)

def find_entities(x):
    if isinstance(x, dict):
        if 'entity' in x and str(x.get('entity')).upper() in {'TEXT', 'MTEXT', 'INSERT', 'ATTRIB'}:
            print('\nENTITY', x.get('entity'), json.dumps(x, ensure_ascii=False)[:1800])
        for v in x.values(): find_entities(v)
    elif isinstance(x, list):
        for v in x: find_entities(v)

find_entities(d)
