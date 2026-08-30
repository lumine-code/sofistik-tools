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

  it("keeps its DOM, modal, and focus restoration in the owner's Document", () => {
    const surface = lumine.workspace.getWindowSurface(editor);
    const selected = jasmine.createSpy("selected");
    lumine.windowSurfaces.activate(surface);
    editorElement.focus();
    textView = new TextView("*.cdb", true, "icon-search", "Pattern");

    textView.attach(selected);

    expect(textView.element.ownerDocument).toBe(surface.document);
    expect(textView.miniEditor.element.ownerDocument).toBe(surface.document);
    expect(textView.panel.surface).toBe(surface);
    expect(textView.miniEditor.element.contains(surface.document.activeElement)).toBe(true);

    lumine.commands.dispatch(textView.element, "core:confirm");

    expect(selected).toHaveBeenCalledWith("*.cdb");
    expect(surface.document.activeElement).toBe(editorElement);
  });

  it("cleans up when its surface destroys the modal panel", () => {
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
