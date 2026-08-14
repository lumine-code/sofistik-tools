# sofistik.environment

Resolves which SOFiSTiK release applies to a file and where that release is installed.

|             |                                                                   |
| ----------- | ----------------------------------------------------------------- |
| Version     | `1.0.0`                                                           |
| Provided by | `provideSofistikEnvironment()` returning the service wrapper      |
| Consumed by | `consumeSofistikEnvironment(service)`                             |
| Owner       | [`sofistik-tools`](https://github.com/lumine-code/sofistik-tools) |

The installation folder is a single setting, `sofistik-tools.envPath`, and every SOFiSTiK package
reads it through this service rather than reaching into another package's configuration. It lives
here because this is the package that launches the installed programs.

The release is resolved through [`sofistik.keywords`](https://github.com/lumine-code/language-sofistik),
so tooling and autocomplete can never disagree about which version is in play — unless the caller
already knows, in which case it says so and detection is skipped.

## Registration

In your `package.json`:

```json
{
  "consumedServices": {
    "sofistik.environment": {
      "versions": { "^1.0.0": "consumeSofistikEnvironment" }
    }
  }
}
```

## Contract

```ts
type SofistikEnvironment = {
  name: "sofistik-environment";
  version: string;
  provider: EnvironmentProvider;
};

type EnvironmentContext = {
  editor?: TextEditor;
  filePath?: string;
  version?: string;
};

type EnvironmentProvider = {
  getRoot(): string;
  getVersion(context?: EnvironmentContext): string;
  resolve(context?: EnvironmentContext): ResolvedEnvironment;
};

type ResolvedEnvironment = {
  version: string;
  root: string;
  installPath: string;
  installed: boolean;
};
```

Every field of the context is optional:

| Field      | Description                                                                  |
| ---------- | ---------------------------------------------------------------------------- |
| `editor`   | Detect the release from the file's own `@ SOFiSTiK YYYY` header.             |
| `filePath` | Detect the release from a neighbouring `sofistik.def`.                       |
| `version`  | The release the caller has already chosen. Wins over anything the file says. |

What `resolve` returns:

| Field         | Description                                                                          |
| ------------- | ------------------------------------------------------------------------------------ |
| `version`     | The four-digit release year for this call.                                           |
| `root`        | The configured installation folder holding the version directories. `""` when unset. |
| `installPath` | `<root>/<version>/SOFiSTiK <version>`. `""` when `root` is unset.                    |
| `installed`   | Whether `installPath` exists on disk.                                                |

## Minimal example

```js
const { Disposable } = require("lumine");

module.exports = {
  consumeSofistikEnvironment(service) {
    this.environment = service.provider;
    return new Disposable(() => {
      this.environment = null;
    });
  },

  run(editor) {
    const { installPath, installed, version } = this.environment.resolve({ editor });
    if (!installed) {
      lumine.notifications.addError(`SOFiSTiK ${version} is not installed`);
      return;
    }
    return spawnTool(installPath);
  },
};
```

## Behavior

`resolve` never throws for a missing installation and never invents a path: an unconfigured or
absent installation is reported through `root`, `installPath`, and `installed`. That is deliberate
— consumers differ in how they react, and each should say so in its own voice. A tool package
raises a notification; a viewer package refuses to open the model.

`version` is what the caller wants to run against, not a hint. Passing one skips detection
entirely, so a file whose header reads `@ SOFiSTiK 2026` still resolves to the 2024 installation
when the caller asked for 2024. `"Auto"` is how both the setting and the version picker spell
"work it out from the file", so it is not a choice and falls back to detection.

Without the `sofistik.keywords` service there is nothing to detect with, and only a release the
caller named is available.

## Teardown

Dispose the `Disposable` returned from `consumeSofistikEnvironment` when your package deactivates.
The provider is a singleton owned by `sofistik-tools` and outlives any one consumer.

## Versioning

`1.0.0` is provided and `^1.0.0` is consumed. Adding fields to `ResolvedEnvironment` or to the
context is additive. Changing the meaning of `root` or `installPath`, or making `resolve` throw
where it previously reported, requires a new service name.
