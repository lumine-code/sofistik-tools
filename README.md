# sofistik-tools

Commands and integrations for SOFiSTiK structural analysis workflows.

> **NOTE**: This package is not an official SOFiSTiK product and is not affiliated with or endorsed by SOFiSTiK AG.

## Features

- **Help system**: open PDF manuals in [pdf-view](https://github.com/lumine-code/pdf-view) with jump-to-command support for programs and include fragments.
- **Calculation**: run WPS/SPS directly from the editor.
- **Inline Run**: run an active PROG block in WPS from its Code Lens action, independently of the cursor position.
- **File handlers**: open CDB, PLB, GRA files with double-click.
- **Program control**: toggle programs on/off in `.dat` files.
- **Clean commands**: delete temporary files from tree-view.
- **Child files**: run multiple files with `@ child:filename.dat` directive.

## Installation

To install `sofistik-tools` search for it in the Install pane of the Lumine settings, or run the command `lumine --install lumine-code/sofistik-tools`.

Install [code-lens](https://github.com/lumine-code/code-lens) to display the Run links above active `+PROG` headers.

Click Run to save that file and calculate the selected block in WPS. The action uses the file's project environment and does not move the cursor. Editing the source refreshes its actions; a stale action refuses to launch a different block. Save an untitled file first. A matching SOFiSTiK installation is required.

## Commands

Commands available in `lumine-workspace`. Each uses the editor that dispatched it, falling back to the active editor, and declines with a notification when its grammar is not SOFiSTiK:

- `sofistik-tools:current-help`: open help for current module in PDF view (reuses pane),
- `sofistik-tools:separately-help`: open help for current module in new pane,
- `sofistik-tools:calculation-wps`: open WPS with current file,
- `sofistik-tools:calculation-wps-immediately`: run calculation in WPS,
- `sofistik-tools:calculation-wps-current`: run calculation of current program only,
- `sofistik-tools:calculation-sps`: run calculation in SPS,
- `sofistik-tools:open-report`: open `.plb` file in Report Viewer,
- `sofistik-tools:save-report-as-pdf`: export report to PDF,
- `sofistik-tools:save-pictures-as-pdf`: export pictures from report to PDF,
- `sofistik-tools:open-protocol`: open `.prt` protocol file in editor,
- `sofistik-tools:open-animator`: open `.cdb` in Animator,
- `sofistik-tools:open-animator-2018`: open `.cdb` in Animator 2018,
- `sofistik-tools:open-viewer`: open `.cdb` in Viewer (2024+) or FEA Viewer (2020-2023),
- `sofistik-tools:open-dbinfo`: open `.cdb` in Database Info,
- `sofistik-tools:open-ssd`: open `.sofistik` file in SSD,
- `sofistik-tools:open-wingraf`: open `.gra` file in WinGRAF,
- `sofistik-tools:open-result-viewer`: open `.results` file in Result Viewer,
- `sofistik-tools:open-teddy`: open file in Teddy,
- `sofistik-tools:open-teddy-single`: open file in Teddy (single instance),
- `sofistik-tools:open-teddy-1`: open file in Teddy slot 1,
- `sofistik-tools:open-teddy-2`: open file in Teddy slot 2,
- `sofistik-tools:open-teddy-3`: open file in Teddy slot 3,
- `sofistik-tools:open-teddy-4`: open file in Teddy slot 4,
- `sofistik-tools:open-sofiplus`: open `.dwg` file in SOFiPLUS,
- `sofistik-tools:export-cdb`: open CDB export dialog,
- `sofistik-tools:export-plb-to-docx`: convert `.plb` to `.docx` (2020+),
- `sofistik-tools:program-current-toggle`: toggle current program on/off,
- `sofistik-tools:program-all-toggle`: toggle all programs,
- `sofistik-tools:program-all-on`: turn ON all programs,
- `sofistik-tools:program-all-off`: turn OFF all programs,
- `sofistik-tools:program-above-toggle`: toggle programs above cursor,
- `sofistik-tools:program-above-on`: turn ON programs above cursor,
- `sofistik-tools:program-above-off`: turn OFF programs above cursor,
- `sofistik-tools:program-below-toggle`: toggle programs below cursor,
- `sofistik-tools:program-below-on`: turn ON programs below cursor,
- `sofistik-tools:program-below-off`: turn OFF programs below cursor,
- `sofistik-tools:clear-urs-tags`: remove all URS tags from programs,
- `sofistik-tools:check-version`: show the resolved SOFiSTiK version.

Commands available in `lumine-workspace`:

- `sofistik-tools:toggle-help`: open help selection list,
- `sofistik-tools:toggle-examples`: open examples selection list,
- `sofistik-tools:change-version`: change SOFiSTiK version,
- `sofistik-tools:ifc-export`: open IFC export dialog,
- `sofistik-tools:ifc-import`: open IFC import dialog,
- `sofistik-tools:open-cdbase`: open database description (CDBASE.CHM),
- `sofistik-tools:open-daten`: open `sofistik_daten.py` from the installation.

Actions shown for `.sofistik-tools.help-list`:

- `sofistik-tools:open-in`: open the selected manual in the editor,
- `sofistik-tools:open-ex`: open the selected manual in the system PDF viewer,
- `sofistik-tools:cache-help`: rebuild the help cache.

Actions shown for `.sofistik-tools.example-list`:

- `sofistik-tools:open-example`: open the selected example in the editor,
- `sofistik-tools:cache-examples`: rebuild the examples cache.

Cache actions keep their list open and rescan its selected installation.

Commands available in `lumine-workspace`, acting on the tree view selection:

- `sofistik-tools:open-animator`: open selected `.cdb` in Animator,
- `sofistik-tools:open-animator-2018`: open selected `.cdb` in Animator 2018,
- `sofistik-tools:open-report`: open selected `.plb` in Report Viewer,
- `sofistik-tools:save-report-as-pdf`: export selected report to PDF,
- `sofistik-tools:save-pictures-as-pdf`: export pictures from selected report,
- `sofistik-tools:open-protocol`: open selected `.prt` file,
- `sofistik-tools:open-viewer`: open selected `.cdb` in Viewer,
- `sofistik-tools:open-viewer-2025`: open selected `.cdb` in Viewer 2025,
- `sofistik-tools:open-dbinfo`: open selected `.cdb` in Database Info,
- `sofistik-tools:open-ssd`: open selected `.sofistik` in SSD,
- `sofistik-tools:open-wingraf`: open selected `.gra` in WinGRAF,
- `sofistik-tools:open-result-viewer`: open selected `.results` in Result Viewer,
- `sofistik-tools:open-teddy`: open selected file in Teddy,
- `sofistik-tools:open-teddy-single`: open in Teddy (single instance),
- `sofistik-tools:open-teddy-1`: open in Teddy slot 1,
- `sofistik-tools:open-teddy-2`: open in Teddy slot 2,
- `sofistik-tools:open-teddy-3`: open in Teddy slot 3,
- `sofistik-tools:open-teddy-4`: open in Teddy slot 4,
- `sofistik-tools:open-sofiplus`: open selected `.dwg` in SOFiPLUS,
- `sofistik-tools:export-cdb`: open CDB export for selected file,
- `sofistik-tools:check-version`: show the resolved SOFiSTiK version,
- `sofistik-tools:clean-1`: clean directory from files with extensions `.erg` `.prt` `.lst` `.urs` `.sdb` `.db-2` `.pl` `.$*` `.#*` `.grb` `.err` `.error_positions` `.dwl` `.dwl2` `.cfg`,
- `sofistik-tools:clean-2`: above + `.cdi` `.cde`,
- `sofistik-tools:clean-3`: above + `.cdb` `.sqlite`,
- `sofistik-tools:clean-4`: above + `.plb` `.bak` `_csm.dat` `_csmlf.dat`,
- `sofistik-tools:clean-glob`: use custom glob pattern,
- `sofistik-tools:wing-fix`: fix MSCA issues in `.gra` files,
- `sofistik-tools:wing-fix-recursively`: fix MSCA issues recursively.

Each `clean-n` command also has a `clean-n-recursively` variant that descends into subdirectories.

## Usage

Place `sofistik.def` beside a saved source to declare `SOF_VERSION`, `SOF_LANGUAGE` (`EN` or `DE`) and `SOF_EDITION` (`professional` or `educational`). Files in different directories resolve independently. Without an adjacent declared year, the newest installed release applies, then the newest bundled dataset for offline keyword data. Every application checks its own executable, so a CDB-only installation cannot start a calculation.

Calculations capture their editor and environments before saving. Parent and open child buffers save before the first launch; save hooks may update the source, and calculations use the saved files. A path change, unsaved edit or package deactivation while saving prevents the pending action. Manuals and examples keep the selected installation's paths even if another project takes focus.

See [Workflows](docs/1_Workflows.md) for child calculations, program boundaries, manual navigation and maintenance, and [Architecture](docs/2_Architecture.md) for module ownership and validation.

## Customization

The examples list can be restyled from your `styles.css`, e.g.:

```css
.example-list .tag {
  color: var(--accent-link-color);
}
```

## Services

- `code-lens.provider`: provided to code-lens to display Run actions above active PROG headers.
- `background-tips.provider`: provided to background-tips to explain calculation commands.
- `tree-view.selection`: consumed to read the selected paths for the tree-view commands (open, clean, wing-fix).
- `open-external`: consumed to register handlers that open SOFiSTiK file types in their native applications.
- `pdf-view`: consumed to open and reuse PDF manual viewers with named-destination navigation.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
