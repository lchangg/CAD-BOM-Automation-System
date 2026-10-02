# Development history

This history summarizes the stages represented by the source tree. It is intentionally descriptive; the open-source preparation did not change the CAD parsing or BOM algorithms.

## V1.0 — CAD to BOM

- DWG-to-DXF conversion
- CAD text/entity extraction
- Cabinet title and spatial partition validation
- Deterministic material candidate recognition
- BOM output with source text and coordinates

## V1.1 — Product data and quotation workflow

- Public brands, materials and products
- Enterprise suppliers and prices
- BOM brand/model selection
- Quotation calculation with labor, transport, other costs and margin
- Customer quotation PDF generation and history
- Spreadsheet master-data import with preview and validation

## V1.2 — Multi-enterprise foundations

- Organizations and organization members
- Server-side organization scoping and file isolation
- Platform-public product data versus enterprise-private procurement data
- Enterprise default replacement rules
- Supplier-provided Excel/CSV mapping, product confirmation, aliases and price history

## Open-source preparation

- Copied the production-tested project to an independent repository directory.
- Removed databases, customer/user data, production backups, generated artifacts and real CAD files from the copy.
- Replaced local paths and test credentials with generic configuration examples.
- Added repository documentation, MIT licensing for project-authored code, third-party notices and a sensitive-file audit script.
