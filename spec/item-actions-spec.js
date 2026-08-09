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
    const actions = helpList.selectList.itemActions();
    const byCommand = new Map(actions.map((action) => [action.command, action]));

    expect([...byCommand.keys()].sort()).toEqual([
      "sofistik-tools:open-ex",
      "sofistik-tools:open-in",
    ]);

    const openIn = byCommand.get("sofistik-tools:open-in");
    expect(openIn.name).toBe("Open In");
    expect(openIn.description).toBe(
      "Open the manual in the editor, at the destination given after a colon in the query",
    );
    // Enter is chrome: confirming the list is the same action, so the command
    // carries no binding of its own.
    expect(openIn.keystrokes).toEqual([]);

    const openEx = byCommand.get("sofistik-tools:open-ex");
    expect(openEx.description).toBe("Open the manual in the system PDF viewer");
    expect(openEx.keystrokes).toEqual(["alt-enter"]);

    // Chrome and global commands stay out.
    expect(byCommand.has("core:confirm")).toBe(false);
    expect(byCommand.has("select-list:actions")).toBe(false);
    expect(byCommand.has("sofistik-tools:toggle-help")).toBe(false);
  });

  it("shows the actions as a flow step and runs one against the master list", async () => {
    // Showing the list scans the installation directory for PDF manuals.
    sofDir = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-item-actions-"));
    fs.writeFileSync(path.join(sofDir, "aqua_1.pdf"), "");
    spyOn(mainModule, "getSofPath").and.returnValue(sofDir);
    helpList.selectList.show();

    await helpList.selectList.showItemActions();

    expect(helpList.selectList.itemActionsList.isVisible()).toBeTruthy();
    expect(lumine.workspace.getModalTrail()).toEqual(["SOFiSTiK Help", "Actions"]);
    // The actions list wears the package classes, so the package keymap
    // resolves action keystrokes inside it too.
    expect(helpList.selectList.itemActionsList.element.classList.contains("help-list")).toBe(true);

    const spy = spyOn(helpList, "performAction");
    const index = helpList.selectList.itemActionsList.items.findIndex(
      (item) => item.command === "sofistik-tools:open-ex",
    );
    helpList.selectList.itemActionsList.selectIndex(index);
    helpList.selectList.itemActionsList.confirmSelection();

    expect(spy).toHaveBeenCalledWith(null, "open-ex");
    expect(helpList.selectList.isVisible()).toBeTruthy();
    expect(helpList.selectList.itemActionsList.isVisible()).toBeFalsy();
  });
});
