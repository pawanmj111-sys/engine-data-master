// Electron main process: serves the static build from disk via a custom
// "app://" protocol so the app runs fully offline with client-side routing.
const { app, BrowserWindow, protocol, net, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

const DEV_URL = process.env.ELECTRON_DEV_URL; // set by `npm run electron:dev`
const ROOT = path.join(__dirname, "..", "dist", "client");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

function resolveFile(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const target = path.normalize(path.join(ROOT, clean));
  if (target.startsWith(ROOT) && fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  // Unknown paths are app routes -> SPA shell
  const shell = path.join(ROOT, "_shell.html");
  return fs.existsSync(shell) ? shell : path.join(ROOT, "index.html");
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "EngineLab",
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  win.loadURL(DEV_URL || "app://local/");
}

app.whenReady().then(() => {
  protocol.handle("app", (req) => {
    const { pathname } = new URL(req.url);
    return net.fetch(pathToFileURL(resolveFile(pathname)).toString());
  });
  createWindow();
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
