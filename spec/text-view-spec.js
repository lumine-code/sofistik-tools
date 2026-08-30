const TextView = require("../lib/text-view");

describe("TextView window surfaces", () => {
  let detachedPane, editor, editorElement, textView, workspaceElement;

  beforeEach(async () => {
    lumine.initializeDetachedPaneSurfaces({ force: true });
    workspaceElement = lumine.workspace.getElement();
    jasmine.attachToDOM(workspaceElement);
    editor = await lumine.workspace.open();
    editorElement = editor.getElement();
    detachedPane = await lumine.workspace.detachPaneItem(editor, { show: false });
  });

  afterEach(async () => {
    textView?.close();
    if (detachedPane?.isAlive?.()) await lumine.workspace.attachDetachedPane(detachedPane);
    editor?.destroy();
    lumine.initializeDetachedPaneSurfaces();
  });

  it("presents its modal in primary while retaining the detached command context", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    const selected = jasmine.createSpy("selected");
    lumine.windowSurfaces.activate(surface);
    editorElement.focus();
    textView = new TextView("*.cdb", true, "icon-search", "Pattern");

    textView.attach(selected);

    expect(lumine.workspace.getActiveWindowSurface()).toBe(
      lumine.workspace.getPrimaryWindowSurface(),
    );
    expect(textView.element.ownerDocument).toBe(document);
    expect(textView.miniEditor.element.ownerDocument).toBe(document);
    expect(textView.panel.getContainer()).toBe(lumine.workspace.panelContainers.modal);
    expect(textView.miniEditor.element.contains(document.activeElement)).toBe(true);

    lumine.commands.dispatch(textView.element, "core:confirm");

    expect(selected).toHaveBeenCalledWith("*.cdb");
    expect(lumine.workspace.getActiveWindowSurface()).toBe(
      lumine.workspace.getPrimaryWindowSurface(),
    );
  });

  it("cleans up when its modal panel is destroyed", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    lumine.windowSurfaces.activate(surface);
    textView = new TextView("", false, false, "Pattern");
    textView.attach(() => {});

    textView.panel.destroy();

    expect(textView.closed).toBe(true);
    expect(textView.panel).toBeNull();
    expect(textView.miniEditor.isDestroyed()).toBe(true);
  });
});
