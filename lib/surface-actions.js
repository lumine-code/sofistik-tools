module.exports = {
  openFromContext(method, props) {
    if (this.context.surface === "tree") return this.openTreePaths(method, props);
    const filePath = this.context.filePath;
    if (!filePath) {
      if (this.context.editor)
        lumine.notifications.addWarning("Save this file before opening its SOFiSTiK output.");
      return;
    }
    if (method === "openTeddy")
      props = {
        ...props,
        parameters: [...(props?.parameters || []), String(this.context.position[0] + 1)],
      };
    return this[method](filePath, props);
  },

  getTreePaths() {
    if (this.context) return this.context.treePaths;
    return this.treeView?.selectedPaths();
  },

  openTreePaths(method, props) {
    const treePaths = this.getTreePaths();
    if (!treePaths?.length) {
      if (this.treeView)
        lumine.notifications.addWarning("Select a SOFiSTiK file in the tree view first.");
      return;
    }
    // Missing outputs are one failure of this selection, rather than a toast
    // for every source. Keep the collector local to this action so concurrent
    // launches and ordinary single-file commands retain their own feedback.
    const missingFiles = new Set();
    const openProps =
      treePaths.length > 1
        ? { ...props, onMissingFile: (filePath) => missingFiles.add(filePath) }
        : props;
    // Only this action's selection supplies environments. A background editor
    // cannot block it, and every selected identity is fixed before GUI launches.
    const targets = treePaths.map((filePath) => ({
      filePath,
      environment:
        method === "openProtocol" ? null : this.resolveEnvironment(props?.version, filePath),
    }));
    const results = targets.map(({ filePath, environment }) =>
      this[method](filePath, { ...openProps, environment }),
    );
    if (missingFiles.size) {
      const count = missingFiles.size;
      lumine.notifications.addWarning(
        `Cannot open ${count} missing SOFiSTiK ${count === 1 ? "file" : "files"}.`,
        { detail: [...missingFiles].join("\n") },
      );
    }
    return results;
  },

  showVersionFromContext() {
    const filePath =
      this.context.surface === "tree" ? this.context.treePaths[0] : this.context.filePath;
    if (!filePath) {
      if (this.context.editor || this.context.surface === "tree")
        lumine.notifications.addWarning("Select or save a SOFiSTiK file first.");
      return;
    }
    const environment = this.resolveEnvironment(null, filePath);
    lumine.notifications.addInfo(`SOFiSTiK version: ${environment.version || "unresolved"}`);
  },
};
