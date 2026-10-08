const path = require("path");
const fs = require("fs");
const os = require("os");
const { pathToFileURL } = require("url");

describe("sofistik-tools item actions", () => {
  let mainModule, helpList, sofDir;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    mainModule = pack.mainModule.ensureRuntime();
    helpList = mainModule.helpList;
    helpList.ensureSelectList();
  });

  afterEach(async () => {
    await lumine.packages.deactivatePackage("sofistik-tools");
    if (sofDir) {
      try {
        // Retries because Windows keeps a directory non-empty until the last handle on a
        // child closes, and `force` swallows only ENOENT.
        fs.rmSync(sofDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
      } catch {
        // Windows can refuse to delete busy directories.
      }
      sofDir = null;
    }
  });

  it("derives its actions from the command registrations and the keymap", async () => {
    const item = { fileName: "aqua_1.pdf", displayName: "AQUA", suffix: "" };
    helpList.items = [item];
    await helpList.selectListHost.show();
    helpList.selectList.setItems([item]);
    const actions = helpList.selectList.getAvailableActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    expect([...byCommand.keys()].sort()).toEqual([
      "sofistik-tools:cache-help",
      "sofistik-tools:open-ex",
      "sofistik-tools:open-in",
    ]);

    const openIn = byCommand.get("sofistik-tools:open-in");
    expect(openIn.name).toBe("Open In");
    expect(openIn.description).toBe(
      "Open the manual in the editor, at the destination after the colon.",
    );
    expect(openIn.primary).toBe(true);
    expect(openIn.context).toBe("item");

    const openEx = byCommand.get("sofistik-tools:open-ex");
    expect(openEx.description).toBe("Open the manual in the system PDF viewer.");
    expect(openEx.keystrokes).toEqual(["alt-f12"]);
    expect(openEx.context).toBe("item");

    const cacheHelp = byCommand.get("sofistik-tools:cache-help");
    expect(cacheHelp.description).toBe("Index the manuals again after installing another release.");
    expect(cacheHelp.keystrokes).toEqual(["f5"]);
    expect(cacheHelp.context).toBe("dialog");
    expect(cacheHelp.dispatch).toBe("local");

    // Chrome and global commands stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("select-list:actions")).toBe(false);
    expect(byCommand.has("sofistik-tools:toggle-help")).toBe(false);
  });

  it("keeps only the list action without a selected manual", () => {
    helpList.selectList.setItems([]);

    expect(helpList.selectList.getAvailableActions().map((action) => action.command)).toEqual([
      "sofistik-tools:cache-help",
    ]);
  });

  it("offers a local rebuild action even when the examples list is empty", async () => {
    const list = mainModule.exampleList;
    list.ensureSelectList();
    spyOn(mainModule, "getSofPath").and.returnValue(undefined);
    await list.selectListHost.show();
    list.selectList.setItems([]);

    const actions = list.selectList.getAvailableActions();
    expect(actions.map((action) => action.command)).toEqual(["sofistik-tools:cache-examples"]);
    expect(actions[0].description).toBe(
      "Index the examples again after installing another release.",
    );
    expect(actions[0].keystrokes).toEqual(["f5"]);
    expect(actions[0].context).toBe("dialog");
    expect(actions[0].dispatch).toBe("local");
  });

  for (const { property, command, files } of [
    {
      property: "helpList",
      command: "sofistik-tools:cache-help",
      files: ["aqua_1.pdf", "ase_1.pdf"],
    },
    {
      property: "exampleList",
      command: "sofistik-tools:cache-examples",
      files: [path.join("aqua.dat", "one.dat"), path.join("ase.dat", "two.dat")],
    },
  ]) {
    it(`rebuilds ${property} in place with its captured installation`, async () => {
      const list = mainModule[property];
      const operation = {
        resolveEnvironment: jasmine.createSpy("resolveEnvironment"),
        getSofPath: () => os.tmpdir(),
        getLanguage: () => "en",
      };
      const scan = spyOn(list.index, "scan").and.resolveTo([files[0]]);
      spyOn(mainModule, "operation").and.throwError("Unexpected new installation context");
      await list.toggle(operation);
      await list.selectList.setQuery("a");
      const selected = list.selectList.getSelectedItem();
      scan.and.resolveTo(files);

      await list.selectList.runAction(command);

      expect(scan).toHaveBeenCalledTimes(2);
      expect(list.items.map((item) => item.fileName).sort()).toEqual([...files].sort());
      expect(list.operation).toBe(operation);
      expect(list.selectListHost.isVisible()).toBe(true);
      expect(list.selectList.getQuery()).toBe("a");
      expect(list.selectList.getSelectedItem().fileName).toBe(selected.fileName);
    });

    it(`uses F5 only inside ${property}'s query editor`, async () => {
      const list = mainModule[property];
      const operation = {
        resolveEnvironment: () => {},
        getSofPath: () => os.tmpdir(),
        getLanguage: () => "en",
      };
      spyOn(list.index, "scan").and.resolveTo([files[0]]);
      await list.toggle(operation);
      const refresh = spyOn(list, "refresh").and.callThrough();
      const target = list.selectList.getQueryEditor().getElement();
      const event = new KeyboardEvent("keydown", {
        key: "F5",
        code: "F5",
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, "target", { value: target });

      lumine.keymaps.handleKeyboardEvent(event);

      await conditionPromise(() => !list.selectList.isActionPending(command));
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(list.selectListHost.isVisible()).toBe(true);
      expect(
        lumine.keymaps.findKeyBindings({
          target: lumine.workspace.getElement(),
          command,
        }),
      ).toEqual([]);
    });
  }

  it("passes the parsed destination snapshot to the primary action", async () => {
    sofDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-item-actions-"));
    const item = { fileName: "aqua_1.pdf", displayName: "AQUA", suffix: "" };
    item.filePath = path.join(sofDir, item.fileName);
    helpList.items = [item];
    await helpList.selectList.setItems([item]);
    await helpList.selectList.setQuery("aqua:grp 1");
    spyOn(lumine.workspace, "open").and.resolveTo();

    await helpList.selectList.runAction("sofistik-tools:open-in");

    const expectedURI = pathToFileURL(path.join(sofDir, "aqua_1.pdf"));
    expectedURI.hash = "nameddest=GRP1";
    expect(lumine.workspace.open).toHaveBeenCalledWith(expectedURI.href);
  });

  it("shows the actions as a flow step and runs one against the master list", async () => {
    // Showing the list scans the installation directory for PDF manuals.
    sofDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-item-actions-"));
    fs.writeFileSync(path.join(sofDir, "aqua_1.pdf"), "");
    spyOn(mainModule, "getSofPath").and.returnValue(sofDir);
    await helpList.update();
    helpList.selectListHost.show();

    await helpList.selectListHost.showActions();

    expect(lumine.workspace.getModalTrail()).toEqual(["SOFiSTiK Help", "Actions"]);

    const spy = spyOn(helpList, "performAction");
    const selected = helpList.selectList.getSelectedItem();
    lumine.workspace.popModal();
    await helpList.selectList.runAction("sofistik-tools:open-ex");

    expect(spy).toHaveBeenCalledWith(selected, "open-ex");
    expect(helpList.selectListHost.isVisible()).toBeFalsy();
  });
});
