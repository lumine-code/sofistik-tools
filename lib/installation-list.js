const InstallationIndex = require("./installation-index");

module.exports = class InstallationList {
  constructor(owner, pattern) {
    this.owner = owner;
    this.pattern = pattern;
    this.operation = null;
    this.items = null;
    this.selectListHost = null;
    this.selectList = null;
    this.index = new InstallationIndex(() => owner.isActive());
  }

  toggle(operation) {
    operation.resolveEnvironment();
    this.operation = operation;
    return this.ensureSelectList().toggle();
  }

  invalidate() {
    this.items = null;
    this.index.invalidate();
  }

  refresh(operation = this.operation || this.owner.operation()) {
    operation.resolveEnvironment();
    this.operation = operation;
    this.invalidate();
    return this.selectListHost?.isVisible() ? this.selectList.reload() : this.update();
  }

  destroy() {
    this.index.dispose();
    const destruction = this.selectListHost?.destroy();
    this.selectListHost = null;
    this.selectList = null;
    this.operation = null;
    return destruction;
  }

  async update() {
    const items = await this.loadItems();
    if (items && this.selectList && this.owner.isActive()) return this.selectList.setItems(items);
    return items;
  }

  async loadItems() {
    if (!this.owner.isActive()) return;
    const operation = this.operation || this.owner.operation();
    const sofPath = operation.getSofPath();
    if (!sofPath) return;
    const lang = operation.getLanguage();
    try {
      const items = await this.index.read(
        sofPath,
        lang,
        this.pattern,
        (files, directory, language) => this.buildItems(files, directory, language),
      );
      if (!this.owner.isActive() || !items) return;
      this.sofPath = sofPath;
      this.lang = lang;
      this.items = items;
      return items;
    } catch (error) {
      if (this.owner.isActive())
        lumine.notifications.addWarning("Cannot index the SOFiSTiK installation.", {
          detail: error.message,
        });
    }
  }
};
