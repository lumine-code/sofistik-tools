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
    operation.environments = new Map();
    // Features resolve their effective targets before their first await. Source
    // editing and maintenance never need installation or definition validation.
    return operation;
  }

  getEditor() {
    return this.context ? this.context.editor : lumine.workspace.getActiveTextEditor();
  }

  ensureEnvironment() {
    const runtime = this.owner.runtime;
    runtime.environmentProvider ||= new SofistikContextResolver({
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

  dispose() {
    this.abortController.abort();
    this.helpList.destroy();
    this.exampleList.destroy();
    this.versionList.destroy();
    for (const dialog of this.dialogs) dialog.close();
    this.dialogs.clear();
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
