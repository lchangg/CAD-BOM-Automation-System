import json
d=json.load(open('work/report.json',encoding='utf-8'))
xs=sorted(d['all_texts'], key=lambda x:(x['point'][1],x['point'][0]))
for i,x in enumerate(xs,1):
    print(f"{i:3} {x['point'][0]:9.1f} {x['point'][1]:9.1f} {x['text']}")
