SOFiSTiK commands use the file and project environment that selected the action.

## Project environment

Place `sofistik.def` beside a saved input file when it needs an explicit release, language or edition:

```text
SOF_VERSION = 2026
SOF_LANGUAGE = EN
SOF_EDITION = professional
```

Only that adjacent definition applies. Parent directories, workspace roots and source-file headers do not supply declarations. Each declared child calculation resolves its own adjacent definition. Supported language codes are `EN` and `DE`; editions are `professional` and `educational`. Without a declared release, the newest installed release is selected. English and professional are the defaults.

Change Version writes the chosen release beside the file that opened the picker. Auto removes only `SOF_VERSION`, retaining the other declarations, comments, encoding marker and newline convention. The picker includes installed releases, available datasets and the currently declared release, including a release that is not installed.

An explicitly selected release remains selected when its installation is absent. Executable commands verify the specific application they need; the presence of a CDB interface does not make WPS available. Offline manual keyword data can still use the newest bundled dataset when no installed or declared release supplies a year.

## Calculation

Calculation WPS and Calculation SPS save the source before launching the calculation. An open child buffer is saved too. The selected editor, source text, cursor position and environments stay attached to that action while saving. Changes to focus do not redirect it. A source edit, path change, failed save or package deactivation during saving prevents that action from launching.

Declare additional calculation files with one directive per line:

```text
@ child:children/model.dat
@ child:checks/model.dat
```

Paths are relative to the declaring file. Duplicate paths run once. Add `@ only-children` to calculate only the listed children; the declaring source still saves first. All open sources in the batch save before its first calculation starts. Each process runs with its source directory as the working directory.

Calculation WPS Current uses the nearest calculation directive above the captured cursor. PROG, SYS, APPLY and CHAPTER are recognized outside comments, strings, macro definitions and prose blocks. An inactive directive or multiple calculation directives on the same physical line must be corrected before running one.

Code Lens offers Run above complete active `+PROG` headers. It uses the clicked file and row without moving the cursor. An old action refuses to run after its source changes; fetch a fresh action by allowing Code Lens to update. A file declaring `@ only-children` cannot run an individual program.

## Programs and manuals

Program commands switch `+` and `-` prefixed PROG, SYS and APPLY directives while leaving comments, quoted text and macro definitions intact. The current, all, above and below variants use the same document boundaries as calculation and manual navigation.

Current Help uses the nearest PROG module and opens its manual at the nearest recognized command. Manual selection prefers the declared language, then an unsuffixed manual, then the other language. A search query such as `aqua:grp` selects a named destination. Manual and example rows retain their own absolute paths, so switching projects cannot redirect an already selected row.

Reindex Manuals and Reindex Examples refresh the selected installation. Pending indexing stops when the package is deactivated. A later invocation can select a different installation without reusing the previous project's rows.

## Maintenance

Clean operates on the selected folders. Levels progressively include result files, interface databases, CDB databases, then reports and backups. Recursively applies the same level below the selected folders. Custom Pattern captures the folders before opening its prompt, so changing tree selection while entering the pattern does not change the deletion target.

WinGRAF fixes apply only to selected `.gra` files or matching files in selected folders. Both maintenance operations report individual failures and stop further mutations when the package is deactivated. No matching files is a valid result.
