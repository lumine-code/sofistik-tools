const path = require("path");
const fs = require("fs");
const os = require("os");

describe("sofistik-tools", () => {
  let workspaceElement, mainModule, tempDirs;

  function makeTempDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-tools-spec-"));
    tempDirs.push(dir);
    return dir;
  }

  function waitFor(condition, timeout = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (condition()) {
          resolve();
        } else if (Date.now() - start > timeout) {
          reject(new Error("Timed out waiting for condition"));
        } else {
          setImmediate(check);
        }
      };
      check();
    });
  }

  // This package owns the environment now, so the only thing to stand in for
  // is language-sofistik's keyword service, whose whole role here is naming
  // the release. The provider itself is the real one.
  function useEnvironment(root, version = "2026") {
    lumine.config.set("sofistik-tools.envPath", root);
    mainModule.keywordsProvider = {
      withContext: (editor, filePath, requested) => ({
        getVersion: () => (requested && requested !== "Auto" ? String(requested) : version),
      }),
    };
  }

  // A stand-in grammar rather than language-sofistik: the scope name is the
  // whole contract between the two packages, and the commands read it from the
  // editor now rather than from the element's data-grammar attribute.
  function registerSofistikGrammar() {
    if (lumine.grammars.grammarForScopeName("source.sofistik")) return;
    lumine.grammars.addGrammar(
      lumine.grammars.createGrammar("sofistik.json", {
        name: "SOFiSTiK",
        scopeName: "source.sofistik",
        fileTypes: ["dat"],
        patterns: [],
      }),
    );
  }

  async function openSofistikEditor(text = "") {
    registerSofistikGrammar();
    const editor = await lumine.workspace.open("model.dat");
    const editorElement = lumine.views.getView(editor);
    editor.setText(text);
    return { editor, editorElement };
  }

  beforeEach(async () => {
    tempDirs = [];
    workspaceElement = lumine.views.getView(lumine.workspace);
    jasmine.attachToDOM(workspaceElement);
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    mainModule = pack.mainModule;
  });

  afterEach(() => {
    // The package is activated once and cached, so a stand-in keyword provider
    // and a configured root outlive the spec that set them unless cleared.
    mainModule.keywordsProvider = null;
    lumine.config.unset("sofistik-tools.envPath");
    for (const dir of tempDirs) {
      try {
        // Retries because Windows keeps a directory non-empty until the last handle on a
        // child closes, and `force` swallows only ENOENT.
        fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can refuse to delete busy directories.
      }
    }
  });

  describe("command registration", () => {
    it("registers editor commands on sofistik grammar editors", async () => {
      const { editorElement } = await openSofistikEditor();
      const commands = lumine.commands
        .findCommands({ target: editorElement })
        .map((command) => command.name);
      for (const name of [
        "sofistik-tools:current-help",
        "sofistik-tools:calculation-wps",
        "sofistik-tools:program-all-toggle",
        "sofistik-tools:clear-urs-tags",
        "sofistik-tools:open-animator",
        "sofistik-tools:open-wingraf",
        "sofistik-tools:check-version",
      ]) {
        expect(commands).toContain(name);
      }
    });

    it("registers workspace commands", () => {
      const commands = lumine.commands
        .findCommands({ target: workspaceElement })
        .map((command) => command.name);
      for (const name of [
        "sofistik-tools:ifc-export",
        "sofistik-tools:ifc-import",
        "sofistik-tools:open-cdbase.chm",
        "sofistik-tools:open-sof-daten",
        "sofistik-tools:toggle-help",
        "sofistik-tools:toggle-examples",
        "sofistik-tools:change-version",
      ]) {
        expect(commands).toContain(name);
      }
    });

    it("registers tree-view commands", () => {
      const treeElement = document.createElement("div");
      treeElement.classList.add("tree-view");
      workspaceElement.appendChild(treeElement);
      const commands = lumine.commands
        .findCommands({ target: treeElement })
        .map((command) => command.name);
      for (const name of [
        "sofistik-tools:clean-glob",
        "sofistik-tools:clean-1",
        "sofistik-tools:clean-4-recursively",
        "sofistik-tools:wing-fix",
        "sofistik-tools:open-teddy",
      ]) {
        expect(commands).toContain(name);
      }
      treeElement.remove();
    });
  });

  describe("program toggling", () => {
    it("toggles all programs", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\n-prog ase\ntext\n");
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-all-toggle");
      expect(editor.getText()).toBe("-prog aqua\n+prog ase\ntext\n");
    });

    it("turns all programs on and off", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\n-prog ase\n");
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-all-on");
      expect(editor.getText()).toBe("+prog aqua\n+prog ase\n");
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-all-off");
      expect(editor.getText()).toBe("-prog aqua\n-prog ase\n");
    });

    it("toggles programs above and below the cursor", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\n\n+prog ase\n");
      editor.setCursorBufferPosition([1, 0]);
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-above-off");
      expect(editor.getText()).toBe("-prog aqua\n\n+prog ase\n");
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-below-off");
      expect(editor.getText()).toBe("-prog aqua\n\n-prog ase\n");
    });

    it("toggles the current program backwards from the cursor", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\nhead 1\n");
      editor.setCursorBufferPosition([1, 5]);
      lumine.commands.dispatch(editorElement, "sofistik-tools:program-current-toggle");
      expect(editor.getText()).toBe("-prog aqua\nhead 1\n");
    });

    it("clears urs tags", async () => {
      const { editorElement, editor } = await openSofistikEditor(
        "+prog aqua urs:12.3\n-prog ase urs:4\n",
      );
      lumine.commands.dispatch(editorElement, "sofistik-tools:clear-urs-tags");
      expect(editor.getText()).toBe("+prog aqua\n-prog ase\n");
    });
  });

  describe("version resolution", () => {
    it("defaults to 2026 without a keywords provider", () => {
      expect(mainModule.getVersion(null, null, null)).toBe("2026");
    });

    it("prefers an explicitly requested version", () => {
      expect(mainModule.getVersion("2018", null, null)).toBe("2018");
    });

    it("asks the sofistik.keywords provider for the version", () => {
      const contexts = [];
      const disposable = mainModule.consumeSofistikKeywords({
        provider: {
          withContext(editor, filePath) {
            contexts.push({ editor, filePath });
            return { getVersion: () => "2024" };
          },
        },
      });
      expect(mainModule.getVersion(null, "C:\\proj\\file.dat", null)).toBe("2024");
      expect(contexts[0].filePath).toBe("C:\\proj\\file.dat");
      disposable.dispose();
      expect(mainModule.keywordsProvider).toBe(null);
    });
  });

  describe("environment service", () => {
    it("provides one sofistik.environment service", () => {
      const service = mainModule.provideSofistikEnvironment();
      expect(service.name).toBe("sofistik-environment");
      expect(service.version).toBe("1.0.0");
      expect(typeof service.provider.resolve).toBe("function");
      // The same provider the commands here use, so a consumer can never
      // resolve an installation differently from this package.
      expect(mainModule.provideSofistikEnvironment().provider).toBe(service.provider);
      expect(service.provider).toBe(mainModule.environment());
    });

    it("owns the installation folder setting", () => {
      const root = makeTempDir();
      useEnvironment(root);
      expect(mainModule.environment().getRoot()).toBe(root);
      expect(lumine.config.get("sofistik-tools.envPath")).toBe(root);
    });

    it("reports an unconfigured installation folder without inventing a path", () => {
      useEnvironment("   ");
      const resolved = mainModule.environment().resolve();
      expect(resolved.root).toBe("");
      expect(resolved.installPath).toBe("");
      // Reported rather than thrown, so each consumer reacts in its own voice.
      expect(resolved.installed).toBe(false);
    });

    it("resolves the release a consumer asks for over the detected one", () => {
      const root = makeTempDir();
      useEnvironment(root, "2026");
      expect(mainModule.environment().resolve().version).toBe("2026");

      const resolved = mainModule.environment().resolve({ version: "2022" });
      expect(resolved.version).toBe("2022");
      expect(resolved.installPath).toBe(path.join(root, "2022", "SOFiSTiK 2022"));
    });

    it("falls back to detection when the caller says Auto", () => {
      useEnvironment(makeTempDir(), "2025");
      expect(mainModule.environment().resolve({ version: "Auto" }).version).toBe("2025");
    });

    it("still names a release the caller chose when no keyword service is here", () => {
      lumine.config.set("sofistik-tools.envPath", makeTempDir());
      mainModule.keywordsProvider = null;
      expect(mainModule.environment().resolve({ version: "2020" }).version).toBe("2020");
    });
  });

  describe("installation path resolution", () => {
    it("resolves an existing SOFiSTiK environment", () => {
      const envPath = makeTempDir();
      const sofPath = path.join(envPath, "2026", "SOFiSTiK 2026");
      fs.mkdirSync(sofPath, { recursive: true });
      useEnvironment(envPath);
      expect(mainModule.getSofPath()).toBe(sofPath);
    });

    it("notifies when the environment is missing", () => {
      useEnvironment(path.join(os.tmpdir(), "no-such-sofistik"));
      const before = lumine.notifications.getNotifications().length;
      expect(mainModule.getSofPath()).toBeUndefined();
      const notifications = lumine.notifications.getNotifications();
      expect(notifications.length).toBe(before + 1);
      expect(notifications[notifications.length - 1].getType()).toBe("error");
    });
  });

  describe("tool launch guards", () => {
    let envPath;

    beforeEach(() => {
      envPath = makeTempDir();
      fs.mkdirSync(path.join(envPath, "2026", "SOFiSTiK 2026"), { recursive: true });
      useEnvironment(envPath);
    });

    it("warns instead of spawning when the target file does not exist", () => {
      const dir = makeTempDir();
      const before = lumine.notifications.getNotifications().length;
      const result = mainModule.openAnimator(path.join(dir, "model.dat"));
      expect(result).toBeUndefined();
      const notifications = lumine.notifications.getNotifications();
      expect(notifications.length).toBe(before + 1);
      expect(notifications[notifications.length - 1].getType()).toBe("warning");
    });

    it("changes the file extension per tool", () => {
      expect(mainModule.changeExtension("C:\\proj\\model.dat", ".cdb")).toBe("C:\\proj\\model.cdb");
      expect(mainModule.changeExtension("/proj/model.dat", ".plb")).toBe("/proj/model.plb");
      expect(mainModule.changeExtension("/proj.v2/model", ".gra")).toBe("/proj.v2/model.gra");
      expect(mainModule.changeExtension("/proj/model.dat", null)).toBe("/proj/model.dat");
    });
  });

  describe("ripgrep file discovery", () => {
    it("finds top-level files only for slash-free patterns", async () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "a.gra"), "x");
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "b.gra"), "x");
      const files = await require("../lib/ripgrep").findFiles(dir, "*.gra");
      expect(files).toEqual(["a.gra"]);
    });

    it("finds files recursively with **/ patterns and skips .git", async () => {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "a.gra"), "x");
      fs.mkdirSync(path.join(dir, "sub"));
      fs.writeFileSync(path.join(dir, "sub", "b.gra"), "x");
      fs.writeFileSync(path.join(dir, "sub", "c.txt"), "x");
      fs.mkdirSync(path.join(dir, ".git"));
      fs.writeFileSync(path.join(dir, ".git", "d.gra"), "x");
      const files = await require("../lib/ripgrep").findFiles(dir, "**/*.gra");
      expect(files.sort()).toEqual(["a.gra", path.join("sub", "b.gra")]);
    });

    it("matches the clean filter patterns including wildcard extensions", async () => {
      const dir = makeTempDir();
      for (const name of ["x.erg", "x.prt", "x.$1", "x.#a", "x.cdb", "keep.dat"]) {
        fs.writeFileSync(path.join(dir, name), "x");
      }
      const filter = mainModule.parseFilter("11");
      const files = await require("../lib/ripgrep").findFiles(dir, filter);
      expect(files.sort()).toEqual(["x.#a", "x.$1", "x.erg", "x.prt"]);
    });

    it("keeps a path containing a newline in one piece", async () => {
      const dir = makeTempDir();
      // A newline is a legal character in a filename on POSIX, and splitting
      // ripgrep's output on one would turn this into two paths that do not
      // exist. Windows forbids it outright, so there is nothing to test there.
      if (process.platform === "win32") return;
      fs.writeFileSync(path.join(dir, "a\nb.gra"), "x");
      const files = await require("../lib/ripgrep").findFiles(dir, "*.gra");
      expect(files).toEqual(["a\nb.gra"]);
    });
  });

  describe("manual list", () => {
    let helpList;

    // The manuals SOFiSTiK actually ships: `_0` German, `_1` English, some
    // with no suffix at all, and some — `tunars`, `thermal_analysis` — that
    // exist in German only, in every installed version.
    function makeInstallation() {
      const dir = makeTempDir();
      for (const name of [
        "aqua_0.pdf",
        "aqua_1.pdf",
        "star2_0.pdf",
        "star2_1.pdf",
        "beam.pdf",
        "tunars_0.pdf",
        "thermal_analysis_0.pdf",
        "cdbase.chm",
      ]) {
        fs.writeFileSync(path.join(dir, name), "x");
      }
      // Manuals are the ones sitting in the installation root; the examples
      // below it are a different list.
      fs.mkdirSync(path.join(dir, "ase.dat"));
      fs.writeFileSync(path.join(dir, "ase.dat", "nested_1.pdf"), "x");
      spyOn(mainModule, "getSofPath").and.returnValue(dir);
      return dir;
    }

    beforeEach(() => {
      helpList = mainModule.helpList;
    });

    it("lists the manuals in the installation root, one row per manual", async () => {
      makeInstallation();
      lumine.config.set("language-sofistik.language", "English");

      await helpList.update();

      expect(helpList.items.map((item) => item.displayName)).toEqual([
        "AQUA",
        "BEAM",
        "STAR2",
        "THERMAL_ANALYSIS",
        "TUNARS",
      ]);
      // The English variant where there is a choice, and the German one where
      // it is the only manual published rather than no row at all.
      const byName = new Map(helpList.items.map((item) => [item.displayName, item.fileName]));
      expect(byName.get("AQUA")).toBe("aqua_1.pdf");
      expect(byName.get("STAR2")).toBe("star2_1.pdf");
      expect(byName.get("BEAM")).toBe("beam.pdf");
      expect(byName.get("TUNARS")).toBe("tunars_0.pdf");
      expect(byName.get("THERMAL_ANALYSIS")).toBe("thermal_analysis_0.pdf");
    });

    it("follows the configured language", async () => {
      makeInstallation();
      lumine.config.set("language-sofistik.language", "German");

      await helpList.update();

      const byName = new Map(helpList.items.map((item) => [item.displayName, item.fileName]));
      expect(byName.get("AQUA")).toBe("aqua_0.pdf");
      expect(byName.get("STAR2")).toBe("star2_0.pdf");
      expect(byName.get("BEAM")).toBe("beam.pdf");
    });

    it("recrawls when the language changes and reuses the crawl otherwise", async () => {
      makeInstallation();
      lumine.config.set("language-sofistik.language", "English");
      await helpList.update();
      const first = helpList.items;

      await helpList.update();
      expect(helpList.items).toBe(first);

      lumine.config.set("language-sofistik.language", "German");
      await helpList.update();
      expect(helpList.items).not.toBe(first);
      expect(helpList.items.find((item) => item.displayName === "AQUA").fileName).toBe(
        "aqua_0.pdf",
      );
    });

    it("crawls nothing when the installation is missing", async () => {
      // `getSofPath` reports the missing installation and returns nothing.
      // Crawling anyway would spawn ripgrep with no `cwd` — the editor's own
      // working directory — and list whatever happened to be there.
      spyOn(mainModule, "getSofPath").and.returnValue(undefined);

      await helpList.update();

      expect(helpList.items).toBe(null);
    });
  });

  describe("example list", () => {
    it("crawls nothing when the installation is missing", async () => {
      spyOn(mainModule, "getSofPath").and.returnValue(undefined);

      await mainModule.exampleList.update();

      expect(mainModule.exampleList.items).toBe(null);
    });

    it("lists the examples under each program directory for the configured language", async () => {
      const dir = makeTempDir();
      for (const relative of [
        ["ase.dat", "english", "ase1_beam.dat"],
        ["ase.dat", "deutsch", "ase1_stab.dat"],
        ["aqua.dat", "quer.dat"],
      ]) {
        fs.mkdirSync(path.join(dir, ...relative.slice(0, -1)), { recursive: true });
        fs.writeFileSync(path.join(dir, ...relative), "x");
      }
      spyOn(mainModule, "getSofPath").and.returnValue(dir);
      lumine.config.set("language-sofistik.language", "English");

      await mainModule.exampleList.update();

      // The language directory is dropped from the title; a program that ships
      // no language split keeps its path as it is.
      expect(mainModule.exampleList.items.map((item) => [item.prog, item.title])).toEqual([
        ["ase", "ase1_beam.dat"],
        ["aqua", "quer.dat"],
      ]);
    });
  });

  describe("clean commands", () => {
    it("expands numeric filters to glob patterns", () => {
      const base = mainModule.parseFilter("11");
      expect(base.startsWith("*{.erg,")).toBe(true);
      expect(mainModule.parseFilter("21")).toBe("**/" + base);
      expect(mainModule.parseFilter("13")).toContain(".cdb");
      expect(mainModule.parseFilter("14")).toContain("_csm.dat");
      expect(mainModule.parseFilter("custom/*.tmp")).toBe("custom/*.tmp");
    });

    it("deletes matching files from the selected folders", async () => {
      const dir = makeTempDir();
      for (const name of ["x.erg", "x.prt", "keep.dat", "keep.cdb"]) {
        fs.writeFileSync(path.join(dir, name), "x");
      }
      mainModule.cleanByPaths([dir], "11");
      await waitFor(
        () => !fs.existsSync(path.join(dir, "x.erg")) && !fs.existsSync(path.join(dir, "x.prt")),
      );
      expect(fs.readdirSync(dir).sort()).toEqual(["keep.cdb", "keep.dat"]);
    });
  });

  describe("wing fix", () => {
    it("rewrites MSCA statements in .gra files", async () => {
      const dir = makeTempDir();
      const file = path.join(dir, "plot.gra");
      fs.writeFileSync(file, "HEAD test MSCA YES\nAND more\n DB something\n");
      mainModule.wingFix([dir], "*.gra");
      await waitFor(() => fs.readFileSync(file, "utf8").includes("MSCA NO"));
      const content = fs.readFileSync(file, "utf8");
      expect(content).toContain("HEAD test\n");
      expect(content).toContain("AND more MSCA NO\n");
      expect(content).toContain("$ DB something\n");
    });
  });

  describe("current help", () => {
    // Resolve the manual and the destination without opening anything. The
    // file name is asserted exactly: every program manual is lowercase on
    // disk, and matching it must not depend on the filesystem's case-folding.
    function captureViewer() {
      const calls = [];
      spyOn(mainModule, "getViewer").and.callFake((filePath, dest, reuse) =>
        calls.push({ fileName: path.basename(filePath), dest, reuse }),
      );
      return calls;
    }

    function installManuals(...names) {
      const dir = makeTempDir();
      for (const name of names) {
        fs.writeFileSync(path.join(dir, name), "x");
      }
      spyOn(mainModule, "getSofPath").and.returnValue(dir);
      return dir;
    }

    async function openBelowProg(prog) {
      const { editor } = await openSofistikEditor(`+prog ${prog}\nhead one\n`);
      editor.setCursorBufferPosition([1, 4]);
      return editor;
    }

    it("prefers the configured language over the other one", async () => {
      installManuals("aqua_0.pdf", "aqua_1.pdf");
      const calls = captureViewer();
      await openBelowProg("AQUA");

      lumine.config.set("language-sofistik.language", "English");
      mainModule.currentHelp(1);
      expect(calls.pop().fileName).toBe("aqua_1.pdf");

      lumine.config.set("language-sofistik.language", "German");
      mainModule.currentHelp(1);
      expect(calls.pop().fileName).toBe("aqua_0.pdf");
    });

    it("prefers an unsuffixed manual over the wrong language", async () => {
      installManuals("beam.pdf", "beam_0.pdf");
      const calls = captureViewer();
      await openBelowProg("BEAM");
      lumine.config.set("language-sofistik.language", "English");

      mainModule.currentHelp(1);

      expect(calls.pop().fileName).toBe("beam.pdf");
    });

    it("falls back to the other language when a manual ships in one only", async () => {
      // `tunars_0.pdf` has no English counterpart in any installed version, and
      // a German manual for the program is a better answer than none.
      installManuals("tunars_0.pdf");
      const calls = captureViewer();
      await openBelowProg("TUNARS");
      lumine.config.set("language-sofistik.language", "English");

      mainModule.currentHelp(1);

      expect(calls.pop().fileName).toBe("tunars_0.pdf");
    });

    it("resolves a manual when the language setting is absent", async () => {
      installManuals("aqua_1.pdf");
      const calls = captureViewer();
      await openBelowProg("AQUA");
      lumine.config.unset("language-sofistik.language");

      mainModule.currentHelp(1);

      expect(calls.pop().fileName).toBe("aqua_1.pdf");
    });

    it("names the program when no manual exists for it", async () => {
      installManuals("aqua_1.pdf");
      captureViewer();
      await openBelowProg("DBINFO");
      const before = lumine.notifications.getNotifications().length;

      mainModule.currentHelp(1);

      const notifications = lumine.notifications.getNotifications();
      expect(notifications.length).toBe(before + 1);
      expect(notifications[notifications.length - 1].getType()).toBe("warning");
      expect(notifications[notifications.length - 1].getMessage()).toContain("DBINFO");
    });

    it("says why it refused when the cursor is above every PROG block", async () => {
      installManuals("aqua_1.pdf");
      const calls = captureViewer();
      const { editor } = await openSofistikEditor("head one\n+prog aqua\n");
      editor.setCursorBufferPosition([0, 0]);
      const before = lumine.notifications.getNotifications().length;

      mainModule.currentHelp(1);

      // The command is in the application menu, which has no enabled state:
      // doing nothing silently leaves the user with no way to tell why.
      expect(calls.length).toBe(0);
      const notifications = lumine.notifications.getNotifications();
      expect(notifications.length).toBe(before + 1);
      expect(notifications[notifications.length - 1].getType()).toBe("warning");
    });
  });

  describe("help destinations", () => {
    afterEach(() => {
      mainModule.pdfViewService = null;
      mainModule.keywordsProvider = null;
    });

    // The keyword data keys its modules the way the input file writes them —
    // `WING`, not the `wingraf.pdf` its manual is named after.
    function provideKeywords(keywords) {
      mainModule.consumeSofistikKeywords({
        provider: { withContext: () => ({ getKeywords: () => keywords }) },
      });
    }

    async function installManualAndEditor(text, cursor) {
      const dir = makeTempDir();
      fs.writeFileSync(path.join(dir, "aqua_1.pdf"), "x");
      spyOn(mainModule, "getSofPath").and.returnValue(dir);
      lumine.config.set("language-sofistik.language", "English");
      provideKeywords({ AQUA: { NORM: {}, MAT: {} } });
      const { editor } = await openSofistikEditor(text);
      editor.setCursorBufferPosition(cursor);
      return dir;
    }

    it("opens the manual at the command nearest above the cursor", async () => {
      await installManualAndEditor("+prog aqua\n  norm en\n  mat 1\n", [2, 6]);
      const calls = [];
      mainModule.consumePdfView({
        getViewerByTag: () => null,
        open: (filePath, options) => calls.push(options),
        scrollToDestination: () => {},
        setFile: () => {},
      });

      mainModule.currentHelp(1);

      expect(calls.length).toBe(1);
      expect(calls[0].dest).toBe("MAT");
    });

    it("keeps the destination when the pdf-view service is not here yet", async () => {
      const dir = await installManualAndEditor("+prog aqua\n  mat 1\n", [1, 6]);
      // Spy only once the editor is open — opening it goes through the very
      // method being stubbed.
      const opened = [];
      spyOn(lumine.workspace, "open").and.callFake((uri) => {
        opened.push(uri);
        return Promise.resolve();
      });

      // pdf-view's own opener matches a `.pdf` URI with a hash on it, so the
      // destination has to survive the trip through the workspace rather than
      // being dropped for the service being absent.
      mainModule.currentHelp(1);

      expect(opened.length).toBe(1);
      expect(opened[0]).toBe(path.join(dir, "aqua_1.pdf") + "#nameddest=MAT");
    });
  });

  describe("pdf-view service integration", () => {
    afterEach(() => {
      mainModule.pdfViewService = null;
    });

    it("opens a new tagged viewer through the pdf-view service", () => {
      const calls = [];
      mainModule.consumePdfView({
        getViewerByTag: () => null,
        open: (filePath, options) => calls.push({ filePath, options }),
        scrollToDestination: () => {},
        setFile: () => {},
      });
      mainModule.getViewer("C:\\docs\\aqua.pdf", "LC", true);
      expect(calls.length).toBe(1);
      expect(calls[0].filePath).toBe("C:\\docs\\aqua.pdf");
      expect(calls[0].options.dest).toBe("LC");
      expect(calls[0].options.tag).toBe("SOFiSTiK");
      expect(calls[0].options.split).toBe("right");
    });

    it("scrolls an existing viewer showing the same file", () => {
      const scrolls = [];
      const viewer = {
        getPath: () => "C:\\docs\\aqua.pdf",
        getURI: () => "C:\\docs\\aqua.pdf",
      };
      mainModule.consumePdfView({
        getViewerByTag: (tag) => (tag === "SOFiSTiK" ? viewer : null),
        open: () => {},
        scrollToDestination: (target, dest) => scrolls.push({ target, dest }),
        setFile: () => {},
      });
      spyOn(lumine.workspace, "open");
      mainModule.getViewer("C:\\docs\\aqua.pdf", "LC", true);
      expect(scrolls).toEqual([{ target: viewer, dest: "LC" }]);
    });

    it("swaps the file of an existing viewer showing another manual", () => {
      const swaps = [];
      const viewer = {
        getPath: () => "C:\\docs\\ase.pdf",
        getURI: () => "C:\\docs\\ase.pdf",
      };
      mainModule.consumePdfView({
        getViewerByTag: () => viewer,
        open: () => {},
        scrollToDestination: () => {},
        setFile: (target, filePath, dest, tag) => swaps.push({ target, filePath, dest, tag }),
      });
      spyOn(lumine.workspace, "open");
      mainModule.getViewer("C:\\docs\\aqua.pdf", "LC", true);
      expect(swaps).toEqual([
        { target: viewer, filePath: "C:\\docs\\aqua.pdf", dest: "LC", tag: "SOFiSTiK" },
      ]);
    });

    it("uses distinct tags for separate viewers", () => {
      const calls = [];
      mainModule.consumePdfView({
        getViewerByTag: () => null,
        open: (filePath, options) => calls.push(options),
        scrollToDestination: () => {},
        setFile: () => {},
      });
      mainModule.getViewer("C:\\docs\\aqua.pdf", null, false);
      mainModule.getViewer("C:\\docs\\aqua.pdf", null, false);
      expect(calls.length).toBe(2);
      expect(calls[0].tag).not.toBe("SOFiSTiK");
      expect(calls[0].tag.length).toBe(9);
      expect(calls[0].tag).not.toBe(calls[1].tag);
    });

    it("falls back to a plain workspace open without the service", () => {
      const opened = [];
      spyOn(lumine.workspace, "open").and.callFake((uri) => {
        opened.push(uri);
        return Promise.resolve();
      });
      mainModule.getViewer("C:\\docs\\aqua.pdf", "LC", true);
      expect(opened).toEqual(["C:\\docs\\aqua.pdf#nameddest=LC"]);
    });
  });

  describe("open-external service integration", () => {
    it("registers a handler that dispatches SOFiSTiK file types", () => {
      let handler = null;
      const disposable = mainModule.consumeOpenExternal({
        registerHandler(options) {
          handler = options;
          return { dispose() {} };
        },
      });
      expect(handler.priority).toBe(10);

      spyOn(mainModule, "openTeddy");
      spyOn(mainModule, "openWinGRAF");
      spyOn(mainModule, "openAnimator");
      handler.openExternal("C:\\proj\\model.dat");
      expect(mainModule.openTeddy).toHaveBeenCalledWith("C:\\proj\\model.dat");
      handler.openExternal("C:\\proj\\plot.gra");
      expect(mainModule.openWinGRAF).toHaveBeenCalledWith("C:\\proj\\plot.gra");
      handler.openExternal("C:\\proj\\model.cdb");
      expect(mainModule.openAnimator).toHaveBeenCalledWith("C:\\proj\\model.cdb");
      expect(handler.openExternal("C:\\proj\\other.xyz")).toBeUndefined();

      disposable.dispose();
    });
  });

  describe("tree-view service integration", () => {
    it("uses the selected paths for tree commands", () => {
      const disposable = mainModule.consumeTreeViewSelection({
        selectedPaths: () => ["C:\\proj\\a.dat", "C:\\proj\\b.dat"],
      });
      spyOn(mainModule, "openTeddy");
      mainModule.treeOpenTeddy({ parameters: ["-0"] });
      expect(mainModule.openTeddy).toHaveBeenCalledTimes(2);
      disposable.dispose();
      expect(mainModule.treeView).toBe(null);
      expect(mainModule.treeOpenTeddy()).toBeUndefined();
    });
  });
});
