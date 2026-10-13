describe("SOFiSTiK pickers in editor windows", () => {
  beforeEach(async () => {
    jasmine.useRealClock();
    jasmine.attachToDOM(lumine.workspace.getElement());
    await lumine.packages.activatePackage("sofistik-tools");
  });
  afterEach(async () => {
    await lumine.packages.deactivatePackage("sofistik-tools");
    await lumine.workspace.discardEditorWindows();
  });
  it("keeps release choices and file targets in their captured windows", async () => {
    const workspace = lumine.workspace;
    await workspace.open();
    const extra = await workspace.openEditorWindow({ show: false });
    const second = workspace.buildTextEditor();
    extra.getEditorContainer().getActivePane().activateItem(second, { activatePane: true });
    const main = lumine.packages.getActivePackage("sofistik-tools").mainModule;
    const runtime = main.ensureRuntime();
    const local = runtime.versionList;
    const remote = runtime.listsForWindow(extra).versionList;
    const item = { version: "2026", filePath: "captured.def" };
    spyOn(local, "loadItems").and.returnValue([item]);
    spyOn(remote, "loadItems").and.returnValue([item]);
    await local.ensureSelectList().show();
    await remote.ensureSelectList().show();
    expect(local.selectListHost.isVisible()).toBe(true);
    expect(remote.selectList.getElement().ownerDocument).toBe(extra.getDocument());
    await local.selectList.setQuery("local");
    await remote.selectList.setQuery("remote");
    expect(local.selectList.getQuery()).toBe("local");
    expect(runtime.operation({ window: extra, editor: second }).versionList).toBe(remote);
    await workspace.attachWindow(extra);
    expect(runtime.windowLists.has(extra)).toBe(false);
  });
});
