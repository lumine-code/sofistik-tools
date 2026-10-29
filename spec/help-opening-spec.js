const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

describe("SOFiSTiK manual opening actions", () => {
  let list, directory, item, active, owner, open, chooseOpener;

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
    open = jasmine.createSpy("open PDF").and.resolveTo(null);
    chooseOpener = jasmine.createSpy("choose opener").and.resolveTo(null);
    owner = {
      isActive: () => active,
      pdfViewService: { open, openerId: "manual-pdf" },
      launcherService: { open: chooseOpener },
    };
    list = new HelpList(owner);
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
    it(`opens the destination's page with ${pending ? "pending" : "permanent"} PDF service opening`, async () => {
      lumine.config.set("core.allowPendingPaneItems", pending);
      const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();

      await list.selectList.confirmSelection();

      expect(open).toHaveBeenCalledTimes(1);
      const [filePath, options] = open.calls.mostRecent().args;
      expect(filePath).toBe(item.filePath);
      expect(options.dest).toBe("GRP1");
      expect(options.pane).toBe(list.openingPane);
      expect(options.pending).toBe(pending);
      expect(options.destinationMode).toBe("page");
      expect(options.activatePane).toBe(true);
      expect(workspaceOpen).not.toHaveBeenCalled();
    });
  }

  it("passes the cancellation signal and returns the viewer after opening finishes", async () => {
    const controller = new AbortController();
    const viewer = {};
    let finish;
    open.and.returnValue(new Promise((resolve) => (finish = resolve)));

    const opening = list.performAction(item, "open-in", "grp 1", {
      signal: controller.signal,
    });

    expect(open.calls.mostRecent().args[1].signal).toBe(controller.signal);
    finish(viewer);
    await expectAsync(opening).toBeResolvedTo(viewer);
  });

  it("reports the missing PDF service without activating a provider or using a generic opener", async () => {
    owner.pdfViewService = null;
    const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();
    const activate = spyOn(lumine.packages, "activatePackage");

    await expectAsync(list.performAction(item, "open-in", "grp 1")).toBeRejectedWithError(
      "The PDF view service is not available.",
    );

    expect(open).not.toHaveBeenCalled();
    expect(workspaceOpen).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
  });

  it("propagates asynchronous PDF service failures to the action task", async () => {
    const failure = new Error("Cannot open the manual.");
    open.and.rejectWith(failure);

    await expectAsync(list.performAction(item, "open-in", "grp 1")).toBeRejectedWith(failure);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("hands the named destination and original pane to the Launcher service", async () => {
    const pane = list.openingPane;
    pane.splitRight().activate();
    const dispatch = spyOn(lumine.commands, "dispatch");
    const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();

    await list.performAction(item, "choose-opener", "grp 1");

    expect(chooseOpener).toHaveBeenCalledTimes(1);
    const options = chooseOpener.calls.mostRecent().args[0];
    expect(options.path).toBe(item.filePath);
    expect(options.pane).toBe(pane);
    expect(options.uriFragment).toBe("nameddest=GRP1");
    expect(options.openerOverrides.length).toBe(1);
    expect(options.openerOverrides[0].id).toBe("manual-pdf");
    expect(options.openerOverrides[0].destinations).toEqual(["current"]);
    expect(typeof options.openerOverrides[0].open).toBe("function");
    expect(open).not.toHaveBeenCalled();
    expect(workspaceOpen).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  for (const pending of [false, true]) {
    it(`uses page navigation with the selected Launcher's ${pending ? "pending" : "permanent"} opening options`, async () => {
      const pane = list.openingPane;
      pane.splitRight().activate();
      const controller = new AbortController();
      const viewer = {};
      open.and.resolveTo(viewer);
      lumine.config.set("core.allowPendingPaneItems", !pending);
      await list.performAction(item, "choose-opener", "grp 1");
      const options = chooseOpener.calls.mostRecent().args[0];

      await expectAsync(
        options.openerOverrides[0].open(options.path, {
          pane: options.pane,
          pending,
          signal: controller.signal,
        }),
      ).toBeResolvedTo(viewer);

      expect(open).toHaveBeenCalledOnceWith(item.filePath, {
        dest: "GRP1",
        destinationMode: "page",
        pane,
        pending,
        signal: controller.signal,
        activatePane: true,
      });
    });
  }

  it("propagates a selected PDF service failure without a generic opener fallback", async () => {
    const failure = new Error("Cannot open the selected manual.");
    open.and.rejectWith(failure);
    const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();
    chooseOpener.and.callFake(({ path, pane, openerOverrides }) =>
      openerOverrides[0].open(path, { pane, pending: false }),
    );

    await expectAsync(list.performAction(item, "choose-opener", "grp 1")).toBeRejectedWith(failure);

    expect(open).toHaveBeenCalledTimes(1);
    expect(workspaceOpen).not.toHaveBeenCalled();
  });

  for (const state of ["removed", "replaced", "retired"]) {
    it(`does not use a captured PDF provider or generic opener after it is ${state}`, async () => {
      const replacement = jasmine.createSpy("replacement PDF").and.resolveTo({});
      const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();
      await list.performAction(item, "choose-opener", "grp 1");
      const options = chooseOpener.calls.mostRecent().args[0];
      if (state === "removed") owner.pdfViewService = null;
      if (state === "replaced")
        owner.pdfViewService = { open: replacement, openerId: "replacement-pdf" };
      if (state === "retired") active = false;

      await expectAsync(
        options.openerOverrides[0].open(item.filePath, { pane: options.pane, pending: false }),
      ).toBeResolvedTo(null);

      expect(open).not.toHaveBeenCalled();
      expect(replacement).not.toHaveBeenCalled();
      expect(workspaceOpen).not.toHaveBeenCalled();
    });
  }

  for (const [state, service] of [
    ["null", null],
    ["missing-open", { openerId: "manual-pdf" }],
    ["missing-id", { open: () => {} }],
    ["empty-id", { open: () => {}, openerId: " " }],
  ]) {
    it(`rejects a ${state} PDF service before choosing a help opener`, async () => {
      owner.pdfViewService = service;
      const activate = spyOn(lumine.packages, "activatePackage");
      const workspaceOpen = spyOn(lumine.workspace, "open").and.resolveTo();

      await expectAsync(list.performAction(item, "choose-opener", "grp 1")).toBeRejectedWithError(
        "The PDF view service is not available.",
      );

      expect(chooseOpener).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
      expect(activate).not.toHaveBeenCalled();
      expect(workspaceOpen).not.toHaveBeenCalled();
    });
  }

  it("reports a missing Launcher service without activating or dispatching to a package", async () => {
    owner.launcherService = null;
    const activate = spyOn(lumine.packages, "activatePackage");
    const dispatch = spyOn(lumine.commands, "dispatch");

    await expectAsync(list.performAction(item, "choose-opener", "grp 1")).toBeRejectedWithError(
      "The Launcher service is not available.",
    );

    expect(open).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  for (const [command, modifiers] of [
    ["sofistik-tools:open-help-with", { altKey: true }],
    ["sofistik-tools:open-ex", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-help-in-folder", { altKey: true, shiftKey: true }],
  ]) {
    it(`dispatches only ${command} from its row gesture`, () => {
      const run = spyOn(list.selectList, "runAction").and.resolveTo();
      const row = list.selectList.getElement().querySelector("li");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(run).toHaveBeenCalledTimes(1);
      expect(run.calls.mostRecent().args[0]).toBe(command);
    });
  }

  for (const [command, modifiers] of [
    ["sofistik-tools:open-help-with", { altKey: true }],
    ["sofistik-tools:open-ex", { ctrlKey: true, altKey: true }],
    ["sofistik-tools:show-help-in-folder", { altKey: true, shiftKey: true }],
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

  for (const modifiers of [{ shiftKey: true }, { ctrlKey: true, shiftKey: true }]) {
    it(`selects a manual without opening it on ${modifiers.ctrlKey ? "Ctrl-Shift" : "Shift"} click`, () => {
      const run = spyOn(list.selectList, "runAction").and.resolveTo();
      const row = list.selectList.getElement().querySelector("li");

      row.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...modifiers }));

      expect(list.selectList.getSelectedItem()).toBe(item);
      expect(run).not.toHaveBeenCalled();
      expect(list.selectListHost.isVisible()).toBe(true);
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
