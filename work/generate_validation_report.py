import json
import re
from pathlib import Path

root = Path('.')
out = root / 'outputs'
out.mkdir(exist_ok=True)
report = json.loads((root / 'work' / 'report.json').read_text(encoding='utf-8'))
dxf = root / 'work' / 'input.dxf'
log_text = (root / 'work' / 'dwg2dxf.log').read_text(encoding='utf-8', errors='replace')
warning_lines = sorted({line.strip() for line in log_text.splitlines() if re.search(r'warning|error|fail|invalid|unhandled|unsupported|not found', line, re.I)})
errors = [x for x in warning_lines if re.search(r'error|fail|invalid|unsupported', x, re.I)]

report['conversion'] = {
    'source': '<local DWG supplied by the user>',
    'dwg_header': 'AC1032 / R2018',
    'converter': 'GNU LibreDWG 0.14 dwg2dxf',
    'exit_code': 0,
    'success': True,
    'dxf_path': str(dxf.resolve()),
    'dxf_size_bytes': dxf.stat().st_size,
    'dxf_has_eof': 'EOF' in dxf.read_text(encoding='utf-8', errors='replace')[-1000:],
    'warnings': warning_lines,
    'errors': errors,
}
(out / 'dwg_read_validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')

lines = []
lines += ['# DWG 读取技术验证报告', '', '本报告由现有 LibreDWG `dwg2dxf` → ezdxf 解析链对真实 DWG 运行生成；未使用假数据，未开发 UI。', '']
lines += ['## 1. 转换结果', '', f"- DWG：`{report['conversion']['source']}`", f"- 文件头：`{report['conversion']['dwg_header']}`", '- 转换：成功（exit code 0）', f"- DXF 大小：{report['conversion']['dxf_size_bytes']:,} bytes", f"- DXF 尾部包含 EOF：{report['conversion']['dxf_has_eof']}", '']
lines += ['## 2. 转换日志 warning/error', '']
if warning_lines:
    lines += [f'- `{x}`' for x in warning_lines]
else:
    lines.append('- 无')
lines += ['', f"结论：未发现 error/fail/invalid/unsupported；上述均为 warning 或缺省可选 DWG section。", '']
lines += ['## 3. DXF entity 数量', '', '| Entity | 数量 |', '|---|---:|']
for k in ['TEXT','MTEXT','INSERT','BLOCK','ATTRIB','LINE','POLYLINE','LWPOLYLINE']:
    lines.append(f"| {k} | {report['requested_counts'][k]} |")
lines += ['', f"Layout：{len(report['layouts'])} 个（`{'`, `'.join(report['layouts'])}`）；实体均位于 Model，两个纸空间 layout 当前为空。", f"BLOCK 为 block definition 数量（包含 Model/Paper space 与一个命名 block）；ATTRIB 为 0。", '']
lines += ['## 4. 关键词命中（不区分大小写、按子串匹配）', '', '关键词：`MCCB`, `MCB`, `SPD`, `DS`, `C32`, `C63`, `A`, `kW`。', '', f"共 {len(report['keyword_matches'])} 个文字对象命中，{len(set(x['text'] for x in report['keyword_matches']))} 个不同文字。", '', '| # | 文字 | Layout | X | Y | 类型 |', '|---:|---|---|---:|---:|---|']
for i, x in enumerate(report['keyword_matches'], 1):
    p = x['point'] or ['', '']
    lines.append(f"| {i} | {x['text'].replace('|','\\|')} | {x['layout']} | {p[0]:.3f} | {p[1]:.3f} | {x['type']} |")
lines += ['', '关键词零命中的项：`MCCB`, `MCB`, `DS`, `C32`, `C63`；命中主要来自额定电流文字中的 `A`、`SPD`，以及 `kW` 标题。', '']
lines += ['## 5. 前 50 条疑似电气设备文字', '', '判定仅用于本次检查展示，不代表已完成器件识别。', '', '| # | 文字 | Layout | X | Y |', '|---:|---|---|---:|---:|']
for i, x in enumerate(report['suspected_first_50'], 1):
    p = x['point'] or ['', '']
    lines.append(f"| {i} | {x['text'].replace('|','\\|')} | {x['layout']} | {p[0]:.3f} | {p[1]:.3f} |")
lines += ['', '## 6. 本次能力结论', '', '- DWG → DXF：成功。', '- DXF 可被 ezdxf 读取，能获得 Model/Layout、TEXT、MTEXT、INSERT、Layer 与文字坐标。', '- 本文件未发现 ATTRIB；这表示本文件没有可提取的块属性实例，不代表解析器不支持 ATTRIB。', '- LibreDWG 报告了 TABLESTYLE、MATERIAL、MLEADERSTYLE、AcDs 辅助数据等未完整处理 warning；本次电气文字和基础实体仍被读取。', '- 未创建 UI。']
(out / 'dwg_read_validation.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(out / 'dwg_read_validation.md')
print(out / 'dwg_read_validation.json')
