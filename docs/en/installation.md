# Manual installation of 0.10.2

[English overview](../../README.en.md) · [User guide](user-guide.md) · [German installation guide](../de/installation.md)

Version 0.10.2 is a **development release on GitHub**. Download the [installable TGZ](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz), its [checksum](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz.sha256) and, if needed, the [complete project ZIP](https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/ioBroker.energiemanagement-v0.10.2-projekt.zip) from the [release page](https://github.com/stephanflug/ioBroker.energiemanagement/releases/tag/v0.10.2). npm publication and official ioBroker listing are still pending. Downloading the package does not change a running installation.

## Requirements

- An existing ioBroker installation.
- Node.js **22 or newer** for 0.10.2, with an ioBroker-compatible LTS version.
- js-controller at least 6.0.11 and Admin at least 7.6.20, as declared by the adapter metadata.
- A running `web` instance, such as `web.0`, for the browser interface.
- Readable numeric data points for the measurements you want to use.

No particular meter or inverter brand and no external database are required. Older 0.10.1 package metadata allowed Node.js 20; check the Node version before moving another installation to 0.10.2.

## Package and project ZIP

The TGZ is a complete installable npm package. Do not unpack it before the normal package installation. The project ZIP contains the complete published source, documentation and tests for inspection and development.

Verify the TGZ in the folder containing it and its checksum file:

```bash
sha256sum -c iobroker.energiemanagement-0.10.2.tgz.sha256
```

Use the checksum belonging to this exact package. Personal configuration, real meter histories and credentials are not part of the distributed package.

## Linux over SSH

Copy the downloaded package from your computer to the ioBroker host:

```bash
scp iobroker.energiemanagement-0.10.2.tgz USER@IOBROKER-IP:/tmp/
```

Log in using your own host address and user. Run the ioBroker CLI using the installation's intended account, normally `iobroker`:

```bash
ssh USER@IOBROKER-IP
chmod 644 /tmp/iobroker.energiemanagement-0.10.2.tgz
sudo -u iobroker -H bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.2.tgz
iobroker list instances
```

Wait for the installation to finish. The CLI normally uploads the web files as part of installation.

**First installation only:** if no Energiemanagement instance exists, add and start one:

```bash
iobroker add energiemanagement
iobroker start energiemanagement.0
```

**Updating an existing instance:** do not run `add` again. Keep the existing instance and restart it if necessary:

```bash
iobroker restart energiemanagement.0
```

## Docker or Portainer

The package must be installed **inside the ioBroker container**. This example uses a container named `iobroker`; adapt it to your system:

```bash
chmod 644 iobroker.energiemanagement-0.10.2.tgz
docker cp iobroker.energiemanagement-0.10.2.tgz \
  iobroker:/tmp/iobroker.energiemanagement-0.10.2.tgz
docker exec -it --user iobroker iobroker bash
cd /opt/iobroker
iobroker url /tmp/iobroker.energiemanagement-0.10.2.tgz
iobroker list instances
```

Add an instance only if this is the first installation and no instance exists. Use the appropriate user for your container image.

In Portainer, copy the package into the container first, then open that ioBroker container's Console as the intended ioBroker user. Run the same `cd`, `url` and `list instances` commands there.

## ioBroker Admin using a URL

Admin's expert mode may offer **Install from custom URL**. If the ioBroker host can reach GitHub, use this release asset URL:

```text
https://github.com/stephanflug/ioBroker.energiemanagement/releases/download/v0.10.2/iobroker.energiemanagement-0.10.2.tgz
```

Use the TGZ asset rather than the repository URL. You can also download the file first and follow the SSH or container instructions above.

## Confirm the installation

In Admin, check that the Energiemanagement instance is running. Useful states below `energiemanagement.0` are:

| State | Expected result |
| --- | --- |
| `status.version` | `0.10.2` |
| `status.running` | `true` |
| `status.lastSample` | Changes during normal sampling |
| `status.lastError` | No current startup or measurement error |
| `config.hardwareMaster` | `false` on a new installation |
| `update.status_JSON` | Server-side version-check information |

`status.dataOk` can remain false until measurement sources are configured. Version information does not require physical outputs to be enabled.

## Open the application

Use the instance's open link or the Energiemanagement tile on your `web` instance, or adapt:

```text
http://IOBROKER-IP:8082/energiemanagement/index.html?instance=energiemanagement.0
```

Use your actual web port and HTTPS where configured. The existing web login applies. In Docker, the web port must be reachable from your browser. Another adapter instance can be selected with `?instance=energiemanagement.1`.

Reload the browser once after a deliberate package update. If the web files are missing, upload them again:

```bash
iobroker upload energiemanagement
iobroker restart energiemanagement.0
```

Routine version checks update only their own information and do not reload the page or discard form drafts.

## Update and restore

Create a full backup under **Einstellungen → Vollsicherung & Wiederherstellung** before deliberately updating an installation containing data. Install the new TGZ into the existing instance; uninstalling or deleting states is not part of the normal update.

The adapter's full backup includes its own settings, assignments, retained archives, comparison profiles, tank events and heating learning data. It does not contain the whole ioBroker installation or all contents of an external database. Restoring a backup leaves hardware and heating permissions off for review.

The German [update and backup guide](../de/updates-und-sicherung.md) has detailed restore and migration instructions. Continue with the [English user guide](user-guide.md) to assign measurement sources.
