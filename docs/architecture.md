# Architecture

## End-to-end pipeline

1. The web server receives an uploaded DWG and stores it below the current project's local data directory.
2. LibreDWG `dwg2dxf` converts the drawing to DXF.
3. The existing Python/ezdxf scripts read layouts, layers, text entities, block inserts, attributes and coordinates.
4. Cabinet-title candidates create spatial regions. Nearby text is assigned to a cabinet without changing the original text values.
5. Deterministic recognition rules mark material candidates such as poles/current ratings, SPD ratings, cable sections and model-like strings.
6. The BOM builder groups equivalent candidates while retaining original text, coordinates and recognition rules.
7. The Web layer provides review, public product lookup, enterprise supplier/price data, replacement recommendations, quotation calculation and PDF history.

## Code map

| Area | Current location | Responsibility |
|---|---|---|
| DWG conversion | External LibreDWG installed under local `work/libredwg/` and `work/webapp/server.mjs` | Invoke LibreDWG and manage per-project files; the converter is not distributed in this repository |
| CAD extraction | `work/report_current_parse.py`, `work/single_cabinet_validation.py` | Read DXF entities and spatial information |
| Candidate recognition | `work/classify_device_candidates.py` | Deterministic candidate rules |
| BOM generation | `work/build_dwg_bom.mjs`, `work/generate_bom.py` | Assemble cabinet/material output |
| Web server | `work/webapp/server.mjs` | HTTP routes, sessions, project orchestration |
| Master data | `work/webapp/modules/master-data.mjs` | Public materials/brands/products and private suppliers/prices |
| Tenant isolation | `work/webapp/modules/organization.mjs` | Organization membership and server-side scoping |
| Replacement rules | `work/webapp/modules/replacement-rules.mjs` | Enterprise-specific product recommendations |
| Supplier import | `work/webapp/modules/supplier-import.mjs` | Spreadsheet/CSV mapping, matching and price history |
| Quotations | `work/webapp/modules/quotation.mjs` | Material cost, fees, margin and quotation snapshots |
| PDF history | `work/webapp/modules/quotation-pdf.mjs` | PDF generation metadata and download history |

## Data boundaries

`brands`, `materials` and `products` are platform-public reference data. `suppliers`, `prices`, projects, quotations and import history are scoped to the organization resolved on the server from the authenticated session and membership. A browser-provided organization ID is not trusted for authorization.

The open-source copy intentionally has no SQLite database or project data. Starting the server creates fresh local state under ignored paths.

## Compatibility choice

The production-tested relative layout under `work/` is retained. Top-level `backend/`, `frontend/` and `cad-parser/` directories are documentation indexes rather than a forced code move. This keeps the validation scripts and server's existing relative paths intact while making the repository easier to navigate.
