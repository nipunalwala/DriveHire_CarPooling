"""Offline consistency checks for the documentation-only planning baseline."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / 'docs'
MODEL = json.loads((DOCS / 'planning-model.json').read_text(encoding='utf-8'))
CONTRACT = json.loads((DOCS / 'api/openapi.json').read_text(encoding='utf-8'))
SCREENS = json.loads((DOCS / 'planning/screens.json').read_text(encoding='utf-8'))
errors: list[str] = []

def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

for i, name in enumerate(MODEL['specifications']):
    check((DOCS / 'specification' / f'{i:02d}-{name}.md').is_file(), f'missing specification {i:02d}-{name}')
for i, name in enumerate(MODEL['phases']):
    check((DOCS / 'implementation-prompts' / f'{i:02d}-{name}.md').is_file(), f'missing phase {i:02d}-{name}')

check(CONTRACT.get('openapi') == '3.0.3', 'OpenAPI version missing/wrong')
schema_names = set(CONTRACT.get('components', {}).get('schemas', {}))
opmap = {}
for path, methods in CONTRACT['paths'].items():
    check(path.startswith('/api/v1/'), f'route prefix: {path}')
    for method, spec in methods.items():
        op = spec.get('operationId')
        check(op not in opmap, f'duplicate operationId: {op}')
        opmap[op] = (path, method, spec)
        pnames = set(re.findall(r'\{([^}]+)\}', path))
        declared = {p['name'] for p in spec.get('parameters', []) if p['in'] == 'path' and p.get('required')}
        check(pnames == declared, f'path params mismatch: {method} {path}')
        check(any(c in spec['responses'] for c in ('200', '201', '202')), f'no success: {op}')
        check('401' in spec['responses'] and '403' in spec['responses'] and '409' in spec['responses'], f'missing common errors: {op}')

for text_path in [DOCS / 'api/openapi.json']:
    data = text_path.read_text(encoding='utf-8')
    for name in re.findall(r'"\$ref"\s*:\s*"#/components/schemas/([^"]+)"', data):
        check(name in schema_names, f'bad schema ref: {name}')

catalog_ops = {a['op'] for a in MODEL['apis']}
check(catalog_ops == set(opmap), f'catalog/OpenAPI operation mismatch: catalog-only={sorted(catalog_ops-set(opmap))}, API-only={sorted(set(opmap)-catalog_ops)}')
screen_names = {s['key'] for s in SCREENS}
check(len(screen_names) == len(SCREENS), 'duplicate screen key')
db_entities = set(re.findall(r'^### `([^`]+)`', (DOCS / 'specification/07-database-design.md').read_text(encoding='utf-8'), re.M))
for screen in SCREENS:
    for op in screen['ops']:
        check(op in opmap, f"screen {screen['key']} unknown API {op}")

reqs = MODEL['requirements']
req_ids = {r['id'] for r in reqs}
check(len(req_ids) == len(reqs), 'duplicate FR ID')
check(len(reqs) >= 25, 'major FR coverage unexpectedly low')
for req in reqs:
    for field in ('title','actor','pre','trigger','flow','alt','errors','post','accept','phase','ops','entities','screens','test'):
        check(bool(req.get(field)), f"{req['id']} missing {field}")
    for phase in req['phase'].split(','):
        check(phase.isdigit() and 1 <= int(phase) <= 24, f"{req['id']} invalid phase {phase}")
    for op in req['ops']:
        check(op in opmap, f"{req['id']} unknown API {op}")
    for entity in req['entities'].split(','):
        check(entity in db_entities or entity == 'database', f"{req['id']} unknown entity {entity}")
    for surface in req['screens'].split(','):
        check(surface in screen_names or surface == 'operations-runbook', f"{req['id']} unknown screen {surface}")
    check(req['id'] in (DOCS / 'specification/19-requirements-traceability.md').read_text(encoding='utf-8'), f"{req['id']} absent traceability")
    check(req['test'] in (DOCS / 'specification/18-acceptance-criteria.md').read_text(encoding='utf-8'), f"{req['id']} absent acceptance")

for i in range(1, 25):
    name = MODEL['phases'][i]
    body = (DOCS / 'implementation-prompts' / f'{i:02d}-{name}.md').read_text(encoding='utf-8')
    for heading in 'ABCDEFGHIJKLMNOP':
        check(re.search(r'^## '+heading+r'\. ', body, re.M) is not None, f'phase {i:02d} missing section {heading}')
    check('red' in body.lower() and 'green' in body.lower(), f'phase {i:02d} missing TDD gate')
master = (DOCS / 'implementation-prompts/00-MASTER-EXECUTION-GUIDE.md').read_text(encoding='utf-8')
for heading in 'ABCDEFGHIJKLMNOP':
    check(re.search(r'^## '+heading+r'\. ', master, re.M) is not None, f'master missing section {heading}')
for req in reqs:
    check(req['id'] in master and req['test'] in master, f"master missing {req['id']} trace")

for md in [ROOT / 'README.md', ROOT / 'AGENTS.md', ROOT / 'PRODUCT.md', *DOCS.rglob('*.md')]:
    body = md.read_text(encoding='utf-8')
    for raw in re.findall(r'(?<!!)\[[^\]]+\]\(([^)]+)\)', body):
        dest = raw.strip('<>').split('#')[0]
        if not dest or re.match(r'^[a-zA-Z][a-zA-Z0-9+.-]*:', dest):
            continue
        target = (md.parent / unquote(dest)).resolve()
        check(target.is_file() and target.is_relative_to(ROOT), f'broken link {md.relative_to(ROOT)} -> {raw}')
    check(not re.search(r'^\s*(?:TBD|TODO|FIXME)\s*:', body, re.I | re.M), f'placeholder in {md.relative_to(ROOT)}')

for artifact in ('README.md','AGENTS.md','PRODUCT.md','.gitignore','docs/design/image-assets.md','docs/planning/roadmap.md','docs/planning/review.md','docs/planning/workspace-assessment.md'):
    check((ROOT / artifact).is_file(), f'missing artifact {artifact}')

if errors:
    print(f'FAIL: {len(errors)} planning issue(s)')
    for error in errors:
        print('-', error)
    sys.exit(1)
print(f"PASS: 21 specifications, 25 phase guides, {len(reqs)} FRs, {len(opmap)} API operations, {len(SCREENS)} screens; links, refs and trace IDs resolved")
