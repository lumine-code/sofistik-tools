SOFiSTiK Tools composes environment discovery, keyword datasets and editor workflows through explicit operation contexts.

## Boundaries

`main.js` owns synchronous command and path-opener registration, service edges and package lifetime. It creates the runtime only when a feature needs it. Providing Code Lens publishes its lightweight provider without loading keyword datasets or list models. `path-openers.js` uses the context library's lightweight installation scan during activation and registers only executables actually present in each installed release.

`commands.js` keeps command metadata beside each registered handler. A dispatch captures its editor from the event target, falling back to the active editor, and snapshots its source path, text, cursor and tree selection. Surface adapters choose editor or tree actions once. Runtime operations retain resolved environment snapshots through asynchronous work.

| Module                  | Responsibility                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------- |
| `command-context.js`    | Capture immutable dispatch and editor contexts.                                                    |
| `environment.js`        | Resolve installation snapshots, verify individual executables and update adjacent definitions.     |
| `document-structure.js` | Recognize directives using grammar scopes and macro, prose and continuation boundaries.            |
| `calculations.js`       | Save and validate all selected sources before launching WPS or SPS.                                |
| `program-actions.js`    | Edit directive prefixes and URS tags using the shared document model.                              |
| `applications.js`       | Map native applications to outputs and launch GUI applications through Lumine's main process.      |
| `path-openers.js`       | Offer explicit installed-release application choices without changing automatic external handling. |
| `surface-actions.js`    | Adapt one application action to a captured editor or tree selection and collect missing outputs.   |
| `manual-navigation.js`  | Select module manuals, consult keyword contexts and open or reuse PDF viewers.                     |
| `installation-index.js` | Cache and coalesce installation scans and cancel obsolete work.                                    |
| `installation-list.js`  | Own the shared manual/example list lifetime and installation context.                              |
| `cleanup.js`            | Discover and mutate maintenance targets, returning changed, skipped, failed and cancelled results. |

## Library composition

`@lumine-code/sofistik-context` owns declaration normalization, installation discovery, executable capabilities, CDB interface naming and definition updates. Tools creates its resolver directly and supplies a dataset fallback explicitly.

`@lumine-code/sofistik-schema` owns release and language datasets. Manual destinations use `SofistikSchemaProvider.forRelease(environment.version, environment.language)`. The keyword provider receives the same resolved year and language as the installation lookup. It does not select a second project environment.

Each feature resolves only its effective file targets before its first asynchronous boundary. An unrelated tree selection cannot change an editor operation, and a background editor cannot change a tree operation. Source editing and maintenance require no environment validation. Installation capabilities are checked for the requested application before launching. Changing an adjacent definition while a save is pending changes a later operation, not the environment already chosen for that calculation.

## Ownership and teardown

An activation owns its command registrations, Code Lens provider, runtime, list hosts, indexing processes and maintenance dialogs. A consumed-service disposable removes only its own provider edge; an obsolete edge cannot clear a replacement provider. Indexing generations reject late results after invalidation or disposal. Rows include their own source paths instead of deriving a path from mutable list state.

Calculation guards cover both source identity and activation identity after saves and parser settlement. Deactivation cancels pending work before it launches or mutates files. Applications already launched remain independent native application sessions.

Versioned path openers retain the exact executable discovered for their release, recheck it before launching, and never qualify as default openers. They launch the selected file itself without loading the runtime or rewriting its adjacent definition. Launch failures reject the explicit action so Launcher can report them. The separate `open-external` service handler retains the environment resolver's normal file-context behavior. Opener registrations belong to one activation, and a stale callback cannot launch after deactivation.

## Validation

The package's Lumine specs exercise live grammar scopes, actual list hosts and the Code Lens frontend. They also cover save races, source and environment snapshots, provider replacement, cancellation, partial installations, German examples and cleanup selection. A shared CADINP corpus from `sofistik-schema/fixtures/cadinp-structure.json` checks program boundaries against the same fixtures used by the language server.
