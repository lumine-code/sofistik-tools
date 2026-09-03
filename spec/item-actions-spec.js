const path = require("path");
const fs = require("fs");
const os = require("os");

describe("sofistik-tools item actions", () => {
  let mainModule, helpList, sofDir;

  beforeEach(async () => {
    jasmine.attachToDOM(lumine.views.getView(lumine.workspace));
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    mainModule = pack.mainModule;
    helpList = mainModule.helpList;
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

  it("derives its actions from the command registrations and the keymap", () => {
    const item = { fileName: "aqua_1.pdf", displayName: "AQUA", suffix: "" };
    helpList.items = [item];
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
    expect(cacheHelp.keystrokes).toEqual([]);
    expect(cacheHelp.context).toBe("dialog");

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

  it("passes the parsed destination snapshot to the primary action", async () => {
    sofDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-item-actions-"));
    const item = { fileName: "aqua_1.pdf", displayName: "AQUA", suffix: "" };
    helpList.sofPath = sofDir;
    helpList.items = [item];
    await helpList.selectList.setItems([item]);
    await helpList.selectList.setQuery("aqua:grp 1");
    spyOn(lumine.workspace, "open").and.resolveTo();

    await helpList.selectList.runAction("sofistik-tools:open-in");

    expect(lumine.workspace.open).toHaveBeenCalledWith(
      path.join(sofDir, "aqua_1.pdf") + "#nameddest=GRP1",
    );
  });

  it("shows the actions as a flow step and runs one against the master list", async () => {
    // Showing the list scans the installation directory for PDF manuals.
    sofDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-item-actions-"));
    fs.writeFileSync(path.join(sofDir, "aqua_1.pdf"), "");
    spyOn(mainModule, "getSofPath").and.returnValue(sofDir);
    await helpList.update();
    helpList.selectList.show();

    await helpList.selectList.showActions();

    expect(lumine.workspace.getModalTrail()).toEqual(["SOFiSTiK Help", "Actions"]);

    const spy = spyOn(helpList, "performAction");
    const selected = helpList.selectList.getSelectedItem();
    lumine.workspace.popModal();
    await helpList.selectList.runAction("sofistik-tools:open-ex");

    expect(spy).toHaveBeenCalledWith(selected, "open-ex");
    expect(helpList.selectList.isVisible()).toBeFalsy();
  });
});
