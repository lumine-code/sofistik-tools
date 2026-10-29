# SOFiSTiK workflows

Use `ide-sofistik` for offline CADINP language intelligence and `language-sofistik` for syntax highlighting and folding. SOFiSTiK commands use the file and project environment that selected the action. The [package README](../README.md) lists the calculation, application and maintenance commands.

## Installation

Install the language grammar, the language-server client and its SOFiSTiK adapter:

```sh
lumine --install lumine-code/language-sofistik
lumine --install lumine-code/ide
lumine --install lumine-code/ide-sofistik~master
```

Add `autocomplete` for completion, `hover` for declaration previews, parameter positions, complete enum lists and signature help, `linter` for diagnostics, and `symbol`, `find-references` or `semantic-tokens` for navigation and contextual colors. The adapter includes its server, which runs with the editor's Node runtime. Static language intelligence works without a SOFiSTiK installation.

With `busy-signal` installed, the shared busy indicator shows server startup and common finite language requests after 400 ms, plus workspace indexing. Indexing runs in the background and clears its indicator when it finishes.

The components have separate responsibilities:

| Component           | Responsibility                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `language-sofistik` | Syntax highlighting, folding and Tree-sitter structure.                                    |
| `ide-sofistik`      | Connect the language server to the editor and present parsed code or calculation findings. |
| `sofistik-tools`    | Run calculations, open installed applications and manuals, and edit program activation.    |
| `graviss-sofistik`  | Read CDB models and project their geometry and results into Graviss.                       |

The shared libraries keep those workflows consistent: `sofistik-context` selects declarations and installations, `sofistik-schema` supplies exact release-specific CADINP data, and `sofistik-reader` isolates native CDB access. Dataset lookup does not select an installation. See the [language-server architecture](https://github.com/lumine-code/sofistik-language-server/blob/master/docs/architecture.md) for the source and analysis contracts.

## Project environment

Place `sofistik.def` alongside the source, view or database files it describes. The lightweight `sofistik-context` library resolves each file's release from that adjacent definition, then the newest installed release under `C:\Program Files\SOFiSTiK`. Language and manual consumers supply the newest bundled dataset as their offline fallback; native CDB access requires an installed interface. Workspace-root and ancestor definitions never apply to files in subdirectories, even when the adjacent definition is missing. Different directories in one editor project can use different releases, languages and editions. An explicitly selected release without a matching dataset is reported rather than replaced with another release.

For example, an adjacent definition can contain:

```text
SOF_VERSION = 2026
SOF_LANGUAGE = EN
SOF_EDITION = professional
```

Use `EN` or `DE` for the keyword language and `professional` or `educational` for the licensed edition. Language defaults to English and edition to professional when the adjacent definition does not specify them. These declarations are shared by the language server and the SOFiSTiK tool packages. Source-file headers are ignored when selecting the release, language and edition.

Change Version writes the chosen release beside the file that opened the picker. Auto removes only `SOF_VERSION`, retaining the other declarations, comments, encoding marker and newline convention. The picker includes installed releases, available datasets and the currently declared release, including a release that is not installed.

An explicitly selected release remains selected when its installation is absent. Executable commands verify the specific application they need; the presence of a CDB interface does not make WPS available. Offline manual keyword data can still use the newest bundled dataset when no installed or declared release supplies a year.

Each declared child calculation resolves its own adjacent definition.

## Include files

`language-sofistik` highlights `.include` files as CADINP. The [SOFiPLUS include filenames](https://docs.sofistik.com/2025/en/sofiplus/working_with_include_files/working_with_include_files.html) select an initial program context, so module records and parameters receive their normal highlighting without adding a `+PROG` header to the file:

| Filename                     | Program context |
| ---------------------------- | --------------- |
| `aqa.include`                | AQUA            |
| `msh.include`                | SOFIMSHC        |
| `lfd.include`                | SOFILOAD        |
| `dsn.include`                | DECREATOR       |
| `spt.include`, `tnd.include` | TENDON          |

Other `.include` filenames use the ordinary CADINP grammar; explicit `+PROG` or `$PROG` headers select their program context. SOFiPLUS exports English input, so its include files should use English keywords.

Include fragments without a program header still highlight variables, comments and `$$` continuation markers, including repeated numeric continuation lines. These markers do not select a module or assign command and parameter meanings to otherwise unscoped text.

See [Programs and manuals](#programs-and-manuals) for help navigation using the same include context.

## Programs and manuals

Program commands switch `+` and `-` prefixed PROG, SYS and APPLY directives while leaving comments, quoted text and macro definitions intact. The current, all, above and below variants use the same document boundaries as calculation and manual navigation.

Current Help uses the nearest PROG module and opens its manual at the top of the page containing the nearest recognized command. In a headerless SOFiSTiK include fragment, it uses the selected grammar's module and searches from the start of the buffer. The filename-to-module mapping is listed under [Include files](#include-files). An explicit PROG or `$PROG` header overrides that initial module; SYS and APPLY clear it, while END preserves it. Separate Help uses the same context in a separate viewer. Manual selection prefers the declared language, then an unsuffixed manual, then the other language. A search query such as `aqua:grp` selects a named destination. Open In and Open Help With's PDF viewer choice use the same page-top navigation. Open Help With also offers other registered openers with the ordinary named-destination fragment; its PDF service choice stays in the current window. Manual and example rows retain their own absolute paths, so switching projects cannot redirect an already selected row.

Reindex Manuals and Reindex Examples refresh the selected installation. Pending indexing stops when the package is deactivated. A later invocation can select a different installation without reusing the previous project's rows.

## Program outline

In `navigation-panel`, select a SOFiSTiK program in the outline and press Space to switch its header between `+PROG` and `-PROG`. The action keeps focus in the panel and works with program icons hidden. Space in the panel's search field remains text input.

## Calculation

Calculation WPS and Calculation SPS save the source before launching the calculation. An open child buffer is saved too. The selected editor, cursor position and environments stay attached to that action while saving. Changes to focus do not redirect it. Save hooks may update the source, including whitespace cleanup; the calculation reads the resulting file from disk. A path change, unsaved edit, failed save or package deactivation during saving prevents that action from launching.

Declare additional calculation files with one directive per line:

```text
@ child:children/model.dat
@ child:checks/model.dat
```

Paths are relative to the declaring file. Duplicate paths run once. Add `@ only-children` to calculate only the listed children; the declaring source still saves first. All open sources in the batch save before its first calculation starts. Each process runs with its source directory as the working directory.

Calculation WPS Current uses the nearest PROG, SYS or APPLY directive above the captured cursor, outside comments, strings, macro definitions and prose blocks. A CHAPTER heading does not change the selected calculation program. An inactive directive or multiple calculation directives on the same physical line must be corrected before running one.

Code Lens offers Run above complete active `+PROG` headers. It saves the clicked file and tracks the header's row through save hooks without moving the cursor. An action whose source changed before the click refuses to run; fetch a fresh action by allowing Code Lens to update. Changes made during saving are included in the calculation. A file declaring `@ only-children` cannot run an individual program.

Use **Inline Run Actions** in the **SOFiSTiK Tools** settings to enable or disable these links, with overrides per grammar. Disabling it removes the links immediately.

Inline Run is available on the `sofistik-tools#master` branch ahead of the next tagged release.

## Language intelligence

The server provides contextual records, parameters and values in completion, ordered record keys, declaration previews, compact parameter positions and complete enum lists on hover, parameter signatures, static diagnostics, document and project symbols, definitions and references. Each supported feature can be enabled or disabled per grammar in the adapter settings.

Document symbols form a PROG → command hierarchy with complete program and command ranges. Explicitly repeated commands remain separate; table rows and continuations belong to their preceding command. Click the TS or LS item after the SOFiSTiK grammar name to choose Tree-sitter or SOFiSTiK Language Server symbols. Enter keeps the choice for the file in the project session, and Alt+Enter saves it for the grammar. Auto detect prefers the server when it supports document symbols. The picker, outline and breadcrumbs use the same selected document source.

Parameter positions follow both named and positional values. In a WING record, `GRP NUMB 57 OFF SPRI` resolves to `NUMB /1`, `OPTI /2` and `ETYP /3`, just like `GRP NUMB 57 OPTI OFF ETYP SPRI`. Comma-separated alternatives stay in one slot: `BEAM` and `GLN` in `GRP NUMB 31+#grp YES BEAM,GLN` both resolve to `ETYP /3` and receive their own enum colors, hover and completion.

Variable statements such as `STO#value 1` and `LET #value 2` end the active table and retain their keyword highlighting. Later records no longer inherit that table's columns; a new explicit header starts another table. This also applies to `RCL`, `DEL`, `PRT` and `DBG` variable statements. Preprocessor directives such as `#INCLUDE` and `#UNDEF` can appear between table rows without ending the table.

`HEAD` (`KOPF` with German keywords), introductory text (`TXB` in English, `TXA` in German) and concluding text (`TXE`) take their remaining line as implicit text. Legacy introductory blocks (`TXBB` in English, `TXAB` in German) and concluding blocks (`TXEB`) extend through the lines before `TXEN`. Parentheses, commas, apostrophes, semicolons, `!` and `//` belong to the text, so `HEAD calc (part 2)` and `TXB calc (part 2)` produce no generator warning. Only an unquoted `$` starts a text comment; `$$` does not continue a text line. Genuine substitutions retain navigation and preprocessing diagnostics remain available.

The language grammar supplies ordinary syntax colors. Record separators (`;`) use the theme's ordinary text color. Semantic tokens add color only to unquoted enum values recognized in the current record, slot, release and language; quoted strings, comments, numbers, variables and unknown values keep their grammar colors. While the server refreshes, edits within an enum keep its last semantic color and adjust the range; adding a space or newline immediately beside it preserves the color without extending it to the inserted whitespace. A newline inside the enum retains color only before the break. The next server answer reclassifies the edited value. Quoted enum values still offer completion and parameter hover. Disabling semantic tokens leaves ordinary highlighting visible. The adapter does not format or rename source files or run calculations.

## Live linting

The SOFiSTiK language server expands CADINP preprocessor input in memory and runs static checks after a 100 ms pause in changes. Existing diagnostic markers remain visible until a complete current report replaces them, including all pending callers of shared include files. Opening or saving starts analysis immediately. A persistent worker keeps completion available, reuses unchanged program analysis and validates open include buffers ahead of disk copies. Navigation and preprocessing resolve relative include names beside the including source and use the same open-buffer precedence. It checks ordered `LET` and `STO` declarations and 123 verified ERR-derived rule families with exact release and EN/DE bindings. The audit covers all 61 distinct local catalogue resources across 2018, 2020 and 2022–2026; modules with only CDB-dependent or calculation-dependent conditions retain general language checks. The server does not evaluate runtime CADINP expressions or execute calculation programs.

Findings point to the offending variable, invalid literal value or record in the original source, including included files. A substituted value points to its complete `$(...)` use and links the definitions used during expansion. A reusable block points to the failing invocation and links the precise body location. Original program headers retain their suppression scope without appearing as boilerplate related links. Inactive `#IF` branches produce no program findings. Intermediate `END` input blocks remain inside their program; local declarations reset at a new `PROG`, while known `STO` exports remain available.

Native `IF` and `LOOP` checks use the expanded caller context to report orphan controls, incorrect nesting, missing conditions and unclosed blocks. Intermediate `END` preserves control scope, and bare `LOOP` keeps its documented default iteration limit. New module families check definite ASE dead-load/STEP values, CSA Takeda coefficients, SOFIMSHC boundary bedding and FEABENCH linearity, integration and moving-load position styles. Unknown values and imported runtime input do not become guessed defaults.

G310 reports repeated decimal points in numeric atoms such as `1.00.0`, `1..2` and `.1.2`, including atoms inside arithmetic and values produced by preprocessing. The server uses native parameter prefixes to separate numbers from names, paths and titles. Operators and valid generation/repetition markers are preserved; strings, comments and bracketed units are ignored, and incomplete exponent forms such as `1E+` remain accepted. Apply `! noqa: G310` locally or `NOQA = G310` in `sofistik.def` to suppress it.

G311 checks that exactly one inline generator in each logical record has a third increment argument; a lone generator must have one, and all other generators must have two arguments. `LC (1 11 1) TITL (101 111)` and `LC (1 11) TITL (101 111 1)` are valid, while `LC (1 11 1) TITL (101 111 1)` and `LC (1 11)` are not. G312 reports a recognized generator with at least two arguments missing its closing `)`, such as `LC (1 11) TITL (101 111`. Checks run after preprocessing without evaluating argument expressions, preserve precise original-source ranges, and accept local `! noqa: G311,G312` or adjacent `sofistik.def` declarations such as `NOQA = G311,G312`.

G313 reports a value list ending with a comma, such as `AREA QGRP 51, TYPE DTXY` or `LET#a 1,`, and selects the offending comma. Valid comma-separated lists and `$$` continuations remain accepted. A malformed list does not prevent later named parameters from being recognized, so `DTXY` retains its enum color, hover and completion. Use `! noqa: G313` locally or `NOQA = G313` in `sofistik.def` to suppress the finding.

Static findings use Ruff-style codes with a module prefix and three digits. `G` identifies general checks; for example, `G101` means a variable has no known preceding declaration, `G102` means a known array index has no preceding declaration, and `SL001` means a SOFILOAD loading record lacks an active load case. Module prefixes include `AQ` for AQUA, `AQB` for AQB, `SHA` for SOFIMSHA and `SHC` for SOFIMSHC. Missing source declarations do not prove that an existing CDB lacks the variable; unresolved input, implicit unit overrides and runtime-generated sources are handled conservatively.

Add `NOQA = G101,SL001` to the adjacent `sofistik.def` to suppress selected codes, or `NOQA = ALL` to suppress all static findings. Use `! noqa: G101` or `$ noqa: G101` on an original physical line of the offending record for a local suppression; bare `! noqa` suppresses all findings on that line. A pragma on a program header applies to its variable and module checks, and one on an invocation applies to that expansion. Preprocessing failures use the offending line, invocation or project selector. A module selector such as `SL` selects all its rules; `AQ` and `AQB` remain distinct. A partial numbered selector such as `G1` selects that numbered family. The [server's rule catalogue](https://github.com/lumine-code/sofistik-language-server/blob/master/docs/lint-rules.md) lists all codes and verified releases.

## Preprocessor preview

Run `ide-sofistik:open-parsed-code` or choose **Packages > IDE SOFiSTiK > Open Parsed Code** to open the current CADINP source after preprocessing in a new, unsaved editor. The command reuses the same analysis snapshot as static diagnostics, including adjacent `sofistik.def` declarations, nested macros, active `#IF` branches and included files. Unsaved changes in the source and open include buffers are included; an untitled source can also be expanded. The editor synchronizes the source first and refuses an expansion whose document changed while the request was pending.

The preview keeps CADINP syntax highlighting and can be edited or saved independently. If unresolved input, unsupported directives or expansion limits leave the result incomplete, the command opens the available text and reports that limitation. Runtime expressions and `APPLY` records remain unchanged for the calculation programs; `APPLY` alone does not trigger an incomplete-preprocessor warning. No SOFiSTiK programs are started.

## Existing calculation diagnostics

Run `ide-sofistik:read-calculation-diagnostics` on a saved, unchanged CADINP file to read its existing `.error_positions` file. The file contains one JSON object per line, with an error number, severity flag and source position. The server validates the imported records and combines them with its static findings in the linter.

This command reads an existing result; it never starts SOFiSTiK. Logs are not watched or imported automatically. Editing the source clears imported findings until the command is run again. Keep `sofistik-tools` if you also want the separate calculation and manual-opening workflows.

## FEM model views

Use `graviss` with `graviss-sofistik` to explore CDB geometry, displacement results, and beam internal forces. Reading a CDB requires the matching SOFiSTiK release to be installed. For a `.grv` view, the adapter selects release and edition from `sofistik.def` alongside that view file, even when its database is in another directory. Direct CDB calls use the definition alongside the database. Neither context inherits workspace-root or ancestor definitions.

The chosen interface remains fixed until the model session is reopened. The reader uses described layouts and known optional record tails; the viewer does not opt into assumed cross-release layouts. Required undecodable records and unsupported quantity units report an error instead of producing a guessed model. Closing the view closes its owned native session.

```sh
lumine --install lumine-code/graviss
lumine --install lumine-code/graviss-sofistik
```

Create `model.grv` beside the database and open it in the editor:

```json
{ "source": "model.cdb" }
```

The source path is relative to the `.grv` file. A document containing `{}` also discovers a same-basename `.cdb` beside it. Use Results to search load cases, choose exact or automatic amplification, and pause or seek the deformation; Filter offers model values and ordered Add/Subtract rules.

Choose Member results in Results, then a category and quantity from the CDB source's catalogue. The diagram engine accepts forces, moments, bimoments, local displacement and rotation components, bedding forces, stresses and discrete reactions with their own units. Graviss draws signed values in the member's local axes on the undeformed model, preserving discontinuities and unavailable intervals; discrete results remain separate ordinates. Choose automatic or manual diagram scale, local drawing plane, flipped side, fill, and labels; selecting a member lists its station values. Filters and construction-stage activity restrict both diagrams and extrema. Each graphic saves its quantity and settings, and image export includes diagrams and labels. Cases containing member results without nodal displacements are available too.

The toolbar's quick filter accepts expressions such as `G12-15;-Q1??1*`: add groups 12–15, then subtract shells matching the element-number pattern. `G12` selects group 12, `GB12` restricts it to beams, and `GQ12` restricts it to shells. `SG:DECK` selects the secondary group named DECK. `L1030` selects members generated along structural line 1030; `Q1030` instead names finite shell element 1030. The `?` help lists the codes available for the current model.

Press Enter to apply a quick-filter draft and Escape to cancel it. All whitespace is ignored, including inside quoted names; commas separate terms within a clause and semicolons separate ordered clauses. Invalid edits report an error and keep the last applied filter. An element must pass both the quick filter and the independent Filter panel rules. The × button clears only the quick filter; while it is active, the panel's reset reads Clear panel filter and leaves the toolbar expression active. See [Graviss usage](https://github.com/lumine-code/graviss#usage) for the complete syntax and [the CDB adapter](https://github.com/lumine-code/graviss-sofistik) for database setup.

## Maintenance

Clean operates on the selected folders. Levels progressively include result files, interface databases, CDB databases, then reports and backups. Recursively applies the same level below the selected folders. Custom Pattern captures the folders before opening its prompt, so changing tree selection while entering the pattern does not change the deletion target.

WinGRAF fixes apply only to selected `.gra` files or matching files in selected folders. Both maintenance operations report individual failures and stop further mutations when the package is deactivated. No matching files is a valid result.

## Migration

`autocomplete-sofistik`, `linter-sofistik` and `sofistik-environment` are archived and removed from the install catalogue. Uninstall those packages and use `ide-sofistik` with `ide`; keep `autocomplete` and `linter`, which provide the completion and diagnostics interfaces.

The new packages do not use the former `sofistik.environment` service or its settings. Move release, language and edition choices into `sofistik.def` alongside the files they describe; shared detection uses `C:\Program Files\SOFiSTiK` when installed programs are needed. See [Language servers](https://github.com/lumine-code/ide/blob/master/docs/language-servers.md) for the client and frontend setup, and [Package management](https://lumine-code.github.io/docs.html#packages-and-themes/managing-packages) for the other maintained packages.
