const fs = require("node:fs");
const path = require("node:path");
const { CompositeDisposable } = require("lumine");
const { SofistikContextResolver } = require("@lumine-code/sofistik-context");

const APPLICATIONS = [
  { id: "animator", label: "Animator", executable: "animator.exe", extensions: [".cdb"] },
  {
    id: "viewer",
    label: (version) => (Number(version) >= 2024 ? "Viewer" : "FEA Viewer"),
    executable: (version) =>
      Number(version) >= 2024 ? "viewer.exe" : Number(version) >= 2020 ? "fea_viewer.exe" : null,
    extensions: [".cdb"],
  },
  { id: "dbinfo", label: "DBInfo", executable: "dbinfo_ng.exe", extensions: [".cdb"] },
  { id: "teddy", label: "Teddy", executable: "ted.exe", extensions: [".dat", ".gra"] },
  { id: "wingraf", label: "WinGRAF", executable: "wingraf.exe", extensions: [".gra"] },
  { id: "report", label: "Report Viewer", executable: "ursula.exe", extensions: [".plb"] },
  { id: "ssd", label: "SSD", executable: "ssd.exe", extensions: [".sofistik"] },
  {
    id: "result-viewer",
    label: "ResultViewer",
    executable: "resultviewer.exe",
    extensions: [".results"],
  },
  {
    id: "sofiplus",
    label: "SOFiPLUS",
    executable: "sofiplus_launcher.exe",
    extensions: [".dwg"],
    accepts: (filePath) => {
      const parsed = path.parse(filePath);
      return fs.existsSync(path.join(parsed.dir, `${parsed.name}.dat`));
    },
  },
];

class VersionedPathOpeners {
  constructor(owner, { resolver = new SofistikContextResolver() } = {}) {
    this.owner = owner;
    this.activation = owner.disposables;
    this.registrations = new CompositeDisposable();
    this.disposed = false;
    this.activation.add(this);
    try {
      for (const version of resolver.getInstalledVersions()) {
        const environment = resolver.resolve({ version, readDefinition: false });
        if (!environment.installed) continue;
        for (const application of APPLICATIONS) {
          const executable =
            typeof application.executable === "function"
              ? application.executable(version)
              : application.executable;
          if (!executable) continue;
          const command = resolver.applicationPath(environment, executable);
          if (!command) continue;
          const label =
            typeof application.label === "function"
              ? application.label(version)
              : application.label;
          this.registrations.add(
            lumine.workspace.addPathOpener({
              id: `sofistik-tools:${application.id}-${version}`,
              label: `${label} ${version}`,
              pathKinds: ["file"],
              destinations: ["current"],
              isDefaultEligible: () => false,
              canOpen: (filePath) => this.canOpen(application, command, filePath),
              open: (filePath) => this.open(application, command, filePath),
            }),
          );
        }
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  isActive() {
    return (
      !this.disposed && !this.activation.disposed && this.owner.disposables === this.activation
    );
  }

  canOpen(application, command, filePath) {
    return (
      this.isActive() &&
      typeof filePath === "string" &&
      path.isAbsolute(filePath) &&
      application.extensions.includes(path.extname(filePath).toLowerCase()) &&
      (!application.accepts || application.accepts(filePath)) &&
      fs.existsSync(command)
    );
  }

  async open(application, command, filePath) {
    if (!this.isActive()) return "";
    if (!this.canOpen(application, command, filePath)) {
      throw new Error("The selected SOFiSTiK application is no longer available.");
    }
    if (!fs.existsSync(filePath)) {
      throw new Error("The selected SOFiSTiK file is no longer available.");
    }
    await lumine.shell.openApplication(command, [filePath], { cwd: path.dirname(filePath) });
    return "";
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.activation.remove(this);
    this.registrations.dispose();
  }
}

module.exports = VersionedPathOpeners;
