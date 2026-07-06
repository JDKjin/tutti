import { join } from "node:path";
import {
  app,
  dialog,
  Menu,
  nativeImage,
  Tray,
  type BrowserWindow
} from "electron";
import { createTranslator, type DesktopLocale } from "../../shared/i18n";
import type { DesktopLogger } from "../logging";

type WindowsWorkspaceWindowCloseAction = "tray" | "quit";

interface InstallWindowsWorkspaceWindowCloseChoiceOptions {
  getWorkspaceWindows(): BrowserWindow[];
  locale: DesktopLocale;
  logger: DesktopLogger;
}

const trayIconSizePx = 16;
let windowsWorkspaceTray: Tray | null = null;
let appQuitInProgress = false;
let appQuitBypassInstalled = false;
let closeChoicePromise: Promise<void> | null = null;

export function installWindowsWorkspaceWindowCloseChoice(
  workspaceWindow: BrowserWindow,
  options: InstallWindowsWorkspaceWindowCloseChoiceOptions
): void {
  if (process.platform === "darwin") {
    return;
  }

  installAppQuitCloseBypass();

  workspaceWindow.on("close", (event) => {
    if (appQuitInProgress || workspaceWindow.isDestroyed()) {
      return;
    }

    event.preventDefault();
    if (closeChoicePromise) {
      return;
    }

    closeChoicePromise = handleWindowsWorkspaceWindowCloseChoice(
      workspaceWindow,
      options
    ).finally(() => {
      closeChoicePromise = null;
    });
  });
}

function installAppQuitCloseBypass(): void {
  if (appQuitBypassInstalled) {
    return;
  }

  appQuitBypassInstalled = true;
  app.on("before-quit", () => {
    appQuitInProgress = true;
  });
}

async function handleWindowsWorkspaceWindowCloseChoice(
  workspaceWindow: BrowserWindow,
  options: InstallWindowsWorkspaceWindowCloseChoiceOptions
): Promise<void> {
  const action = await showWindowsWorkspaceWindowCloseChoice(
    workspaceWindow,
    options.locale
  );

  if (action === "quit") {
    options.logger.info("windows workspace close choice requested quit");
    appQuitInProgress = true;
    app.quit();
    return;
  }

  options.logger.info("windows workspace close choice minimized to tray");
  ensureWindowsWorkspaceTray(options);
  hideWorkspaceWindows(options.getWorkspaceWindows());
}

async function showWindowsWorkspaceWindowCloseChoice(
  workspaceWindow: BrowserWindow,
  locale: DesktopLocale
): Promise<WindowsWorkspaceWindowCloseAction> {
  const translator = createTranslator(locale);
  const result = await dialog.showMessageBox(workspaceWindow, {
    buttons: [
      translator.t("desktop.closeChoice.minimizeToTrayAction"),
      translator.t("desktop.closeChoice.quitAction")
    ],
    cancelId: 0,
    defaultId: 0,
    detail: translator.t("desktop.closeChoice.detail"),
    message: translator.t("desktop.closeChoice.message"),
    noLink: true,
    title: translator.t("desktop.closeChoice.title"),
    type: "question"
  });

  return result.response === 1 ? "quit" : "tray";
}

function ensureWindowsWorkspaceTray(
  options: InstallWindowsWorkspaceWindowCloseChoiceOptions
): void {
  const translator = createTranslator(options.locale);
  if (!windowsWorkspaceTray) {
    windowsWorkspaceTray = new Tray(createWindowsWorkspaceTrayIcon());
    windowsWorkspaceTray.on("click", () => showWorkspaceWindows(options));
    windowsWorkspaceTray.on("double-click", () =>
      showWorkspaceWindows(options)
    );
  }

  windowsWorkspaceTray.setToolTip(
    translator.t("desktop.closeChoice.trayTooltip")
  );
  windowsWorkspaceTray.setContextMenu(
    Menu.buildFromTemplate([
      {
        click: () => showWorkspaceWindows(options),
        label: translator.t("desktop.closeChoice.trayOpenAction")
      },
      { type: "separator" },
      {
        click: () => {
          appQuitInProgress = true;
          app.quit();
        },
        label: translator.t("desktop.closeChoice.trayQuitAction")
      }
    ])
  );
}

function hideWorkspaceWindows(workspaceWindows: BrowserWindow[]): void {
  for (const workspaceWindow of workspaceWindows) {
    if (!workspaceWindow.isDestroyed()) {
      workspaceWindow.hide();
    }
  }
}

function showWorkspaceWindows(
  options: InstallWindowsWorkspaceWindowCloseChoiceOptions
): void {
  const workspaceWindows = options
    .getWorkspaceWindows()
    .filter((workspaceWindow) => !workspaceWindow.isDestroyed());

  if (workspaceWindows.length === 0) {
    options.logger.warn("windows workspace tray open skipped without windows");
    return;
  }

  for (const workspaceWindow of workspaceWindows) {
    if (workspaceWindow.isMinimized()) {
      workspaceWindow.restore();
    }
    workspaceWindow.show();
  }

  workspaceWindows[0]?.focus();
}

function createWindowsWorkspaceTrayIcon(): Electron.NativeImage {
  for (const iconPath of resolveWindowsWorkspaceTrayIconPaths()) {
    const icon = nativeImage.createFromPath(iconPath);
    if (!icon.isEmpty()) {
      return icon.resize({
        height: trayIconSizePx,
        width: trayIconSizePx
      });
    }
  }

  return nativeImage.createEmpty();
}

function resolveWindowsWorkspaceTrayIconPaths(): string[] {
  const resourcesPath = (
    process as NodeJS.Process & {
      resourcesPath?: string;
    }
  ).resourcesPath;

  return [
    ...(resourcesPath ? [join(resourcesPath, "icon.png")] : []),
    join(app.getAppPath(), "build", "icon.png")
  ];
}
