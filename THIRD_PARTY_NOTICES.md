# Third-party notices

## LibreDWG

LibreDWG is an external command-line dependency used by the DWG-to-DXF validation flow. LibreDWG is distributed under the GNU General Public License version 3 or any later version. Its binaries, DLLs, headers and compiled libraries are intentionally not included in this repository. See [docs/third-party-tools.md](docs/third-party-tools.md) for installation instructions.

The MIT license in the repository root applies only to the project code and documentation authored for this repository. It does not relicense LibreDWG or any other third-party component. Anyone redistributing a LibreDWG build must review its GPL obligations and the notices/licenses of bundled runtime libraries such as libiconv and PCRE2.

## Python and Node.js dependencies

The Python runtime dependencies are pinned in `requirements.txt`: `ezdxf`, `reportlab` and `pypdf`. Verify the license text for the exact versions installed in your environment before redistribution. The public spreadsheet dependency is `exceljs`, distributed under the MIT License and pinned through `work/webapp/package-lock.json`. Install dependencies from their respective upstream projects and follow their licenses. No customer data or private package cache is included in this repository.
