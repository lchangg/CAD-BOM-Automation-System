# Open-source preparation report

## Scope

This report covers the independent `CAD-BOM-Automation-System` copy. The production project was copied first; cleanup and documentation changes were made only in this copy. No production database, customer file or algorithm was edited.

## 1. Sensitive content removed

The copy no longer contains:

- SQLite/database files (`*.sqlite`, `*.db`), including the production BOM database.
- `work/webapp/data/`, including user records, projects, organizations, DWG uploads, BOM history, quotation history and the generated import template.
- `work/webapp/test-runs/` and all `work/production-backups/` snapshots.
- Real `.dwg` and `.dxf` inputs, including the source drawing and intermediate DXF/log files.
- Generated validation JSON, BOM previews, SVG renderings, logs and other customer-derived output artifacts.
- Copied Python virtualenv, Node dependency caches and the accidentally-followed runtime junction; dependencies are not committed.
- The development fallback credentials and machine-specific input path from the copied server/docs/validation script.

The final copy contains no files with `.sqlite`, `.db`, `.dwg`, `.dxf`, `.env` or `.log` extensions. The repository audit script is [scripts/check-sensitive-files.ps1](scripts/check-sensitive-files.ps1).

## 2. Core modules retained

- DWG-to-DXF invocation and LibreDWG integration remain in the runtime code; LibreDWG binaries are installed separately by the operator and are not included in the copy.
- Existing `ezdxf` extraction, layout/text/entity coordinate handling and cabinet spatial validation scripts.
- Existing deterministic candidate/material recognition and BOM assembly scripts.
- Existing Node.js Web server, public frontend and SQLite schema modules.
- Existing public product data, enterprise procurement data, replacement rules, supplier import, quotation and PDF history code paths.

The cleanup did not rewrite the CAD parser, cabinet partition rules, material recognition rules, quotation formula or PDF generation logic. The only runtime source adjustment was removing unsafe development credential fallbacks; credentials now come from the ignored `.env` file.

## 3. Current directory structure

```text
CAD-BOM-Automation-System/
├── README.md
├── LICENSE
├── .gitignore
├── THIRD_PARTY_NOTICES.md
├── OPEN_SOURCE_PREPARATION_REPORT.md
├── docs/
│   ├── architecture.md
│   ├── development-history.md
│   └── screenshots/README.md
├── backend/README.md
├── frontend/public/README.md
├── cad-parser/{dwg_to_dxf,parser}/README.md
├── examples/{sample_bom.json,sample_dxf/README.md}
├── scripts/{setup-local-data.ps1,check-sensitive-files.ps1}
└── work/
    ├── webapp/
    ├── libredwg/                # local ignored LibreDWG install directory
    └── parser/BOM validation scripts
```

The tested `work/` layout was deliberately retained instead of moving runtime files and risking relative-path regressions. The top-level index directories explain where each current module lives.

## 4. Validation performed

- The copy was created as a sibling directory before any cleanup.
- Sensitive-file audit passes with no findings.
- No forbidden local path or old test credential remains in source/docs.
- Synthetic BOM example is clearly labeled and contains no customer data.
- JavaScript module syntax, Python AST parsing and PowerShell script syntax checks pass.
- Core parser/BOM/module SHA-256 comparisons against the source copy show no differences.
- Original production directory was not used as a cleanup target.

## 5. Can it be uploaded to GitHub?

Yes, as an open-source code/documentation repository after the manual checks below. The copy is intentionally not presented as a drop-in commercial deployment image: local runtime dependencies and configuration must be supplied by the person running it.

Two release checks remain important:

1. The first audit found an internal spreadsheet adapter. The current follow-up replaces it with public `exceljs` and adds `package.json`/`package-lock.json`; see `FIRST_BLOCKERS_FIX_REPORT.md` for the implementation and verification details.
2. LibreDWG is an external GPLv3-or-later dependency. Its Windows binaries are intentionally removed from this copy; installation and source/notice obligations are documented in [docs/third-party-tools.md](docs/third-party-tools.md) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## 6. Remaining manual checks before publishing

- Run `scripts/check-sensitive-files.ps1` immediately before `git add`.
- Inspect `git status --ignored` and verify that databases, runtime `data/`, outputs, dependencies and local `.env` are ignored.
- Create a clean virtualenv at `work/.venv`, install the documented Python packages, and run the parser with an authorized synthetic/test drawing.
- Validate Excel import/export on a clean machine.
- Review all third-party licenses for the externally installed LibreDWG build and its runtime libraries before redistribution.
- Add screenshots only after generating them from synthetic or explicitly authorized data.
- Perform a fresh-login smoke test using credentials created from `.env`; never commit that `.env` file.

## 7. Rollback

The original production project remains separate and is not modified by this preparation. To abandon the open-source copy, remove only the new sibling directory after confirming it contains no work that needs to be retained. Production data and runtime behavior remain in the original project.
