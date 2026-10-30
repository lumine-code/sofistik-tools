const { readDefinitionFile } = require("./definition-file");
const { SofistikContextResolver } = require("@lumine-code/sofistik-context");
const { getMetadata, SofistikSchemaProvider } = require("@lumine-code/sofistik-schema");
const { captureContext } = require("./command-context");
const HelpList = require("./help-list");
const ExampleList = require("./example-list");
const VersionList = require("./version-list");

class ToolsRuntime {
  constructor(owner) {
    this.owner = owner;
    this.activation = owner.disposables;
    this.abortController = new AbortController();
    this.environmentProvider = null;
    this.dataProvider = null;
    this.helpList = new HelpList(this);
    this.exampleList = new ExampleList(this);
    this.versionList = new VersionList(this);
    this.dialogs = new Set();
    this.windowLists = new Map();
  }

  isActive() {
    return (
      !this.abortController.signal.aborted &&
      !this.activation.disposed &&
      this.owner.disposables === this.activation
    );
  }

  operation(context = captureContext(undefined, this.owner.treeView)) {
    const operation = Object.create(this);
    operation.context = context;
    operation.isActive = () =>
      this.isActive() && (!context.sourceBound || context.isSourceCurrent());
    if (context.window && !context.window.isMain())
      Object.assign(operation, this.listsForWindow(context.window));
    operation.environments = new Map();
    // Features resolve their effective targets before their first await. Source
    // editing and maintenance never need installation or definition validation.
    return operation;
  }

  listsForWindow(window) {
    let record = this.windowLists.get(window);
    if (!record) {
      record = {
        helpList: new HelpList(this, window),
        exampleList: new ExampleList(this, window),
        versionList: new VersionList(this, window),
      };
      record.lease = window.onWillDestroy(() => {
        this.windowLists.delete(window);
        record.lease.dispose();
        record.helpList.destroy();
        record.exampleList.destroy();
        record.versionList.destroy();
      });
      this.windowLists.set(window, record);
    }
    return record;
  }

  getEditor() {
    return this.context ? this.context.editor : lumine.workspace.getActiveTextEditor();
  }

  ensureEnvironment() {
    const runtime = this.owner.runtime;
    runtime.environmentProvider ||= new SofistikContextResolver({
      readFile: readDefinitionFile,
      fallbackVersion: () => getMetadata().versions.at(-1),
    });
    return runtime.environmentProvider;
  }

  keywordContext(environment) {
    const runtime = this.owner.runtime;
    runtime.dataProvider ||= new SofistikSchemaProvider();
    return runtime.dataProvider.forRelease(environment.version, environment.language);
  }

  get treeView() {
    return this.owner.treeView;
  }

  set treeView(service) {
    this.owner.treeView = service;
  }

  get pdfViewService() {
    return this.owner.pdfViewService;
  }

  set pdfViewService(service) {
    this.owner.pdfViewService = service;
  }

  get launcherService() {
    return this.owner.launcherService;
  }

  dispose() {
    this.abortController.abort();
    const destroyed = [];
    for (const record of this.windowLists.values()) {
      record.lease.dispose();
      destroyed.push(
        record.helpList.destroy(),
        record.exampleList.destroy(),
        record.versionList.destroy(),
      );
    }
    this.windowLists.clear();
    destroyed.push(this.helpList.destroy(), this.exampleList.destroy(), this.versionList.destroy());
    for (const dialog of this.dialogs) destroyed.push(dialog.close());
    this.dialogs.clear();
    return Promise.all(destroyed);
  }
}

Object.assign(
  ToolsRuntime.prototype,
  require("./environment"),
  require("./calculations"),
  require("./applications"),
  require("./surface-actions"),
  require("./program-actions"),
  require("./cleanup"),
  require("./manual-navigation"),
  require("./paths"),
);

module.exports = ToolsRuntime;
