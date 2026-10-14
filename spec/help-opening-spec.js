const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

describe("SOFiSTiK manual opening actions", () => {
  let list, directory, item, active;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    const HelpList = require(path.join(pack.path, "lib", "help-list"));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-help-actions-"));
    item = {
      fileName: "aqua_1.pdf",
      filePath: path.join(directory, "aqua_1.pdf"),
      displayName: "AQUA",
      suffix: "",
    };
    fs.writeFileSync(item.filePath, "%PDF-1.7\n");
    active = true;
    list = new HelpList({ isActive: () => active });
    spyOn(list, "loadItems").and.resolveTo([item]);
    list.ensureSelectList();
    await list.selectListHost.show();
    await list.selectList.setQuery("aqua:grp 1");
  });

  afterEach(async () => {
    await list.destroy();
    await lumine.packages.deactivatePackage("sofistik-tools");
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
  });

  for (const pending of [false, true]) {
    it(`keeps the named destination with ${pending ? "pending" : "permanent"} default opening`, async () => {
      lumine.config.set("core.allowPendingPaneItems", pending);
      const open = spyOn(lumine.workspace, "open").and.resolveTo();

      await list.selectList.confirmSelection();

      expect(open).toHaveBeenCalledTimes(1);
      const [uri, options] = open.calls.mostRecent().args;
      expect(uri).toBe(`${pathToFileURL(item.filePath).href}#nameddest=GRP1`);
      expect(options.pane).toBe(list.openingPane);
      expect(options.pending).toBe(pending);
      expect(options.opener).toBeUndefined();
    });
  }

  it("hands the exact named destination and original pane to Open With", async () => {
    const pane = list.openingPane;
    pane.splitRight().activate();
    const dispatch = spyOn(lumine.commands, "dispatch").and.resolveTo(true);

    await list.performAction(item, "open-with", "grp 1");

    expect(dispatch).toHaveBeenCalledOnceWith(list.window.getElement(), "open-with:toggle", {
      path: item.filePath,
      pane,
      uriFragment: "nameddest=GRP1",
    });
  });

  it("forces a pending Text Editor preview even with pending tabs disabled", async () => {
    lumine.config.set("core.allowPendingPaneItems", false);
    const open = spyOn(lumine.workspace, "open").and.resolveTo();

    await list.selectList.runAction("sofistik-tools:open-help-pending");

    expect(open).toHaveBeenCalledTimes(1);
    const [uri, options] = open.calls.mostRecent().args;
    expect(uri).toBe(`${pathToFileURL(item.filePath).href}#nameddest=GRP1`);
    expect(options.pane).toBe(list.openingPane);
    expect(options.opener).toBe("text-editor");
    expect(options.pending).toBe(true);
    expect(options.forcePending).toBe(true);
  });

  for (const [command, modifiers] of [
    ["sofistik-tools:open-help-with", { altKey: true }],
    ["sofistik-tools:open-help-pending", { shiftKey: true }],
    ["sofistik-tools:open-ex", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-help-in-folder", { ctrlKey: true, shiftKey: true }],
  ]) {
    it(`dispatches only ${command} from its row gesture`, () => {
      const run = spyOn(list.selectList, "runAction").and.resolveTo();
      const row = list.selectList.getElement().querySelector("li");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(run).toHaveBeenCalledOnceWith(command);
    });
  }

  for (const [command, modifiers] of [
    ["sofistik-tools:open-help-with", { altKey: true }],
    ["sofistik-tools:open-help-pending", { shiftKey: true }],
    ["sofistik-tools:open-ex", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-help-in-folder", { ctrlKey: true, shiftKey: true }],
  ]) {
    it(`dispatches ${command} from its Enter keymap with the parsed query snapshot`, async () => {
      let finish;
      const dispatched = new Promise((resolve) => (finish = resolve));
      const action = spyOn(list, "performAction").and.callFake(() => finish());
      const target = list.selectList.getQueryEditor().getElement();
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      Object.defineProperty(event, "target", { value: target });

      lumine.keymaps.handleKeyboardEvent(event);
      await dispatched;

      expect(action).toHaveBeenCalledTimes(1);
      expect(action.calls.mostRecent().args[0]).toBe(item);
      expect(action.calls.mostRecent().args[3].parsedQuery.data.destination).toBe("grp 1");
      expect(
        lumine.keymaps.findKeyBindings({ target: lumine.workspace.getElement(), command }),
      ).toEqual([]);
    });
  }

  for (const [mode, opener] of [
    ["open-ex", "open-external"],
    ["reveal", "open-external:show"],
  ]) {
    it(`uses the registered ${opener} with the source path and destination`, async () => {
      const open = spyOn(lumine.workspace, "open").and.resolveTo();
      spyOn(lumine.workspace, "getAvailablePathOpeners").and.returnValue([{ id: opener }]);

      await list.performAction(item, mode, "grp 1");

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.pane).toBe(list.openingPane);
      expect(options.opener).toBe(opener);
      expect(options.uriFragment).toBe("nameddest=GRP1");
    });
  }

  it("does not open a manual from a retired package or aborted source action", async () => {
    const open = spyOn(lumine.workspace, "open").and.resolveTo();
    active = false;
    await list.performAction(item, "open-in", "grp 1");
    active = true;
    const controller = new AbortController();
    controller.abort();

    await expectAsync(
      list.performAction(item, "open-in", "grp 1", { signal: controller.signal }),
    ).toBeRejected();

    expect(open).not.toHaveBeenCalled();
  });
});
