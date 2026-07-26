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

  async function openSofistikEditor(text = "") {
    const editor = await atom.workspace.open();
    const editorElement = atom.views.getView(editor);
    editorElement.dataset.grammar = "source sofistik";
    editor.setText(text);
    return { editor, editorElement };
  }

  beforeEach(async () => {
    tempDirs = [];
    workspaceElement = atom.views.getView(atom.workspace);
    jasmine.attachToDOM(workspaceElement);
    const pack = await atom.packages.activatePackage("sofistik-tools");
    mainModule = pack.mainModule;
  });

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows can refuse to delete busy directories.
      }
    }
  });

  describe("command registration", () => {
    it("registers editor commands on sofistik grammar editors", async () => {
      const { editorElement } = await openSofistikEditor();
      const commands = atom.commands
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
      const commands = atom.commands
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
      const commands = atom.commands
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
      atom.commands.dispatch(editorElement, "sofistik-tools:program-all-toggle");
      expect(editor.getText()).toBe("-prog aqua\n+prog ase\ntext\n");
    });

    it("turns all programs on and off", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\n-prog ase\n");
      atom.commands.dispatch(editorElement, "sofistik-tools:program-all-on");
      expect(editor.getText()).toBe("+prog aqua\n+prog ase\n");
      atom.commands.dispatch(editorElement, "sofistik-tools:program-all-off");
      expect(editor.getText()).toBe("-prog aqua\n-prog ase\n");
    });

    it("toggles programs above and below the cursor", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\n\n+prog ase\n");
      editor.setCursorBufferPosition([1, 0]);
      atom.commands.dispatch(editorElement, "sofistik-tools:program-above-off");
      expect(editor.getText()).toBe("-prog aqua\n\n+prog ase\n");
      atom.commands.dispatch(editorElement, "sofistik-tools:program-below-off");
      expect(editor.getText()).toBe("-prog aqua\n\n-prog ase\n");
    });

    it("toggles the current program backwards from the cursor", async () => {
      const { editorElement, editor } = await openSofistikEditor("+prog aqua\nhead 1\n");
      editor.setCursorBufferPosition([1, 5]);
      atom.commands.dispatch(editorElement, "sofistik-tools:program-current-toggle");
      expect(editor.getText()).toBe("-prog aqua\nhead 1\n");
    });

    it("clears urs tags", async () => {
      const { editorElement, editor } = await openSofistikEditor(
        "+prog aqua urs:12.3\n-prog ase urs:4\n",
      );
      atom.commands.dispatch(editorElement, "sofistik-tools:clear-urs-tags");
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

  describe("installation path resolution", () => {
    it("resolves an existing SOFiSTiK environment", () => {
      const envPath = makeTempDir();
      const sofPath = path.join(envPath, "2026", "SOFiSTiK 2026");
      fs.mkdirSync(sofPath, { recursive: true });
      atom.config.set("sofistik-tools.envPath", envPath);
      expect(mainModule.getSofPath()).toBe(sofPath);
    });

    it("notifies when the environment is missing", () => {
      atom.config.set("sofistik-tools.envPath", path.join(os.tmpdir(), "no-such-sofistik"));
      const before = atom.notifications.getNotifications().length;
      expect(mainModule.getSofPath()).toBeUndefined();
      const notifications = atom.notifications.getNotifications();
      expect(notifications.length).toBe(before + 1);
      expect(notifications[notifications.length - 1].getType()).toBe("error");
    });
  });

  describe("tool launch guards", () => {
    let envPath;

    beforeEach(() => {
      envPath = makeTempDir();
      fs.mkdirSync(path.join(envPath, "2026", "SOFiSTiK 2026"), { recursive: true });
      atom.config.set("sofistik-tools.envPath", envPath);
    });

    it("warns instead of spawning when the target file does not exist", () => {
      const dir = makeTempDir();
      const before = atom.notifications.getNotifications().length;
      const result = mainModule.openAnimator(path.join(dir, "model.dat"));
      expect(result).toBeUndefined();
      const notifications = atom.notifications.getNotifications();
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
      spyOn(atom.workspace, "open");
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
      spyOn(atom.workspace, "open");
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
      spyOn(atom.workspace, "open").and.callFake((uri) => {
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
