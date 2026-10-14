const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("SOFiSTiK example opening actions", () => {
  let list, directory, item, active, registrations;

  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    const pack = await lumine.packages.activatePackage("sofistik-tools");
    const ExampleList = require(path.join(pack.path, "lib", "example-list"));
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "sofistik-example-actions-"));
    item = {
      fileName: "example.dat",
      filePath: path.join(directory, "example.dat"),
      title: "example.dat",
      prog: "ASE",
      text: "example.dat ASE",
    };
    fs.writeFileSync(item.filePath, "+PROG ASE\nEND\n");
    active = true;
    registrations = [];
    list = new ExampleList({ isActive: () => active });
    spyOn(list, "loadItems").and.resolveTo([item]);
    list.ensureSelectList();
    await list.selectListHost.show();
  });

  afterEach(async () => {
    for (const registration of registrations) registration.dispose();
    await list.destroy();
    await lumine.packages.deactivatePackage("sofistik-tools");
    await lumine.workspace.discardEditorWindows();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  for (const pending of [false, true]) {
    it(`uses the configured ${pending ? "pending" : "permanent"} default opening`, async () => {
      lumine.config.set("core.allowPendingPaneItems", pending);
      const open = spyOn(lumine.workspace, "open").and.resolveTo();

      await list.selectList.confirmSelection();

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.pane).toBe(list.openingPane);
      expect(options.pending).toBe(pending);
      expect(options.opener).toBeUndefined();
      expect(list.selectListHost.isVisible()).toBe(false);
    });
  }

  it("uses a registered default opener", async () => {
    const viewer = jasmine.createSpy("example viewer").and.callFake(() => {
      const editor = lumine.workspace.buildTextEditor();
      editor.setText("Opened by the example viewer");
      return editor;
    });
    registrations.push(
      lumine.workspace.addPathOpener({
        id: "sofistik-example-viewer",
        label: "Example Viewer",
        pathKinds: ["file"],
        destinations: ["current"],
        canOpen: (uri) => uri === item.filePath,
        open: viewer,
      }),
    );

    await list.selectList.confirmSelection();

    expect(viewer).toHaveBeenCalledTimes(1);
    expect(list.openingPane.getActiveItem().getText()).toBe("Opened by the example viewer");
  });

  it("passes the selected path and captured pane to Open With", async () => {
    const dispatch = spyOn(lumine.commands, "dispatch").and.resolveTo(true);

    await list.performAction("open-with", { item });

    expect(dispatch).toHaveBeenCalledOnceWith(list.window.getElement(), "open-with:toggle", {
      path: item.filePath,
      pane: list.openingPane,
    });
  });

  it("retains the opening pane when another pane becomes active", async () => {
    const pane = list.openingPane;
    const other = pane.splitRight();
    other.activate();
    const open = spyOn(lumine.workspace, "open").and.resolveTo();

    await list.selectList.runAction("sofistik-tools:open-example");

    expect(open.calls.mostRecent().args[1].pane).toBe(pane);
    expect(open.calls.mostRecent().args[1].pending).toBe(
      lumine.config.get("core.allowPendingPaneItems"),
    );
  });

  for (const [command, modifiers] of [
    ["sofistik-tools:open-example-with", { altKey: true }],
    ["sofistik-tools:open-example-external", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-example-in-folder", { altKey: true, shiftKey: true }],
  ]) {
    it(`dispatches only ${command} from its row gesture`, async () => {
      const run = spyOn(list.selectList, "runAction").and.resolveTo();
      const row = list.selectList.getElement().querySelector("li");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(run).toHaveBeenCalledOnceWith(command);
    });
  }

  for (const [command, key, code, modifiers] of [
    ["sofistik-tools:open-example-with", "Enter", "Enter", { altKey: true }],
    ["sofistik-tools:open-example-external", "Enter", "Enter", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-example-in-folder", "Enter", "Enter", { altKey: true, shiftKey: true }],
  ]) {
    it(`dispatches ${command} from the query editor's keymap`, async () => {
      const action = spyOn(list, "performAction").and.resolveTo();
      const target = list.selectList.getQueryEditor().getElement();
      const event = new KeyboardEvent("keydown", {
        key,
        code,
        bubbles: true,
        cancelable: true,
        ...modifiers,
      });
      Object.defineProperty(event, "target", { value: target });

      lumine.keymaps.handleKeyboardEvent(event);
      await conditionPromise(() => action.calls.count() === 1);

      expect(action.calls.mostRecent().args[1].item).toBe(item);
      expect(
        lumine.keymaps.findKeyBindings({ target: lumine.workspace.getElement(), command }),
      ).toEqual([]);
    });
  }

  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true, shiftKey: true }]) {
    it(`selects another example without opening it on ${modifiers.ctrlKey ? "Ctrl-Shift" : "Shift"} click`, async () => {
      const other = { ...item, fileName: "other.dat", title: "other.dat", text: "other.dat ASE" };
      await list.selectList.setItems([item, other]);
      const run = spyOn(list.selectList, "runAction").and.resolveTo();
      const rows = list.selectList.getElement().querySelectorAll("li");

      rows[1].dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(list.selectList.getSelectedItem()).toBe(other);
      expect(run).not.toHaveBeenCalled();
      expect(list.selectListHost.isVisible()).toBe(true);
    });
  }

  for (const [mode, opener] of [
    ["external", "open-external"],
    ["reveal", "open-external:show"],
  ]) {
    it(`uses the registered ${opener} action when available`, async () => {
      const open = spyOn(lumine.workspace, "open").and.resolveTo();
      spyOn(lumine.workspace, "getAvailablePathOpeners").and.returnValue([{ id: opener }]);

      await list.performAction(mode, { item });

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.opener).toBe(opener);
      expect(options.pane).toBe(list.openingPane);
      expect(options.pathKind).toBe("file");
    });
  }

  it("keeps retired and aborted example actions from opening files", async () => {
    const open = spyOn(lumine.workspace, "open").and.resolveTo();
    active = false;
    await list.performAction("open", { item });
    active = true;
    const controller = new AbortController();
    controller.abort();

    await expectAsync(
      list.performAction("open", { item, signal: controller.signal }),
    ).toBeRejected();

    expect(open).not.toHaveBeenCalled();
  });
});
