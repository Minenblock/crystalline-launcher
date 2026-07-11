const { app, BrowserWindow, ipcMain, dialog, Menu, Tray, nativeImage, safeStorage, shell, Notification } = require("electron");
const path = require("path");
const { autoUpdater } = require("electron-updater");

// ─── Auto-Updater Setup ─────────────────────────────────────────────────────
autoUpdater.autoDownload = false; // We ask the user before downloading
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.on("update-available", (info) => {
    console.log("[UPDATE] Update available:", info.version);
    if (mainWindow) mainWindow.webContents.send("update-available", info);
});
autoUpdater.on("update-not-available", () => {
    console.log("[UPDATE] No update available.");
});
autoUpdater.on("download-progress", (progress) => {
    if (mainWindow) mainWindow.webContents.send("update-download-progress", progress);
});
autoUpdater.on("update-downloaded", (info) => {
    console.log("[UPDATE] Update downloaded:", info.version);
    if (mainWindow) mainWindow.webContents.send("update-downloaded", info);
});
autoUpdater.on("error", (err) => {
    console.error("[UPDATE] Error:", err.message);
    if (mainWindow) mainWindow.webContents.send("update-error", err.message);
});

// Required for Windows Toast Notifications to work properly
app.name = "Crystalline";
app.setAppUserModelId("Crystalline");

const sharedPath = path.join(require("electron").app.getPath("userData"), "Crystalline_Shared");
const fs = require("fs").promises;
const { Client } = require("minecraft-launcher-core");
const { launch: xmclLaunch, MinecraftFolder, Version } = require("@xmcl/core");

// --- MQTT & Party Variables ---
const mqtt = require("mqtt");
const crypto = require("crypto");
let partyClient = null;
let partyState = {
    groupId: null,
    aesKey: null,
    members: [] // Array of { id: string, name: string }
};
const mqttBrokerUrl = "wss://broker.emqx.io:8084/mqtt"; // Public secure websocket broker

function encryptPayload(payloadObj, hexKey) {
    const key = Buffer.from(hexKey, "hex");
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(JSON.stringify(payloadObj), "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
}

function decryptPayload(encryptedStr, hexKey) {
    try {
        const parts = encryptedStr.split(":");
        if (parts.length !== 2) return null;
        const iv = Buffer.from(parts[0], "hex");
        const encryptedText = parts[1];
        const key = Buffer.from(hexKey, "hex");
        const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
        let decrypted = decipher.update(encryptedText, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
    } catch (e) {
        console.error("[MQTT] Decryption failed:", e);
        return null;
    }
}
// --------------------------------
async function writeEncryptedFile(filePath, dataObj) {
    const dataString = JSON.stringify(dataObj);
    if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(dataString);
        await fs.writeFile(filePath, buffer);
    } else await fs.writeFile(filePath, dataString, "utf8");
}
async function readEncryptedFile(filePath) {
    const buffer = await fs.readFile(filePath);
    if (safeStorage.isEncryptionAvailable()) try {
        const dataString = safeStorage.decryptString(buffer);
        return JSON.parse(dataString);
    } catch (e) {
        return JSON.parse(buffer.toString("utf8"));
    }
    else return JSON.parse(buffer.toString("utf8"));
}
const { Auth } = require("msmc");
const DiscordRPC = require("discord-rpc");
var mainWindow;
var tray = null;
var trayWindow = null;
var clientId = "1523332306096357487";
if (process.defaultApp) {
    if (process.argv.length >= 2) app.setAsDefaultProtocolClient("discord-1523332306096357487", process.execPath, [require("path").resolve(process.argv[1])]);
} else app.setAsDefaultProtocolClient("discord-1523332306096357487");
var rpc = new DiscordRPC.Client({ transport: "ipc" });
function resolveIcon() {
    const candidates = [
        // Prefer .ico on Windows for proper taskbar/window icon
        path.join(__dirname, "tray_icon.ico"),
        path.join(__dirname, "../electron/tray_icon.ico"),
        path.join(app.getAppPath ? app.getAppPath() : __dirname, "electron/tray_icon.ico"),
        path.join(__dirname, "tray_icon.png"),
        path.join(__dirname, "../electron/tray_icon.png"),
        path.join(app.getAppPath ? app.getAppPath() : __dirname, "electron/tray_icon.png")
    ];
    return candidates.find(p => require("fs").existsSync(p)) || null;
}
function resolveTrayPng() {
    // Tray always needs PNG on all platforms
    const candidates = [
        path.join(__dirname, "tray_icon.png"),
        path.join(__dirname, "../electron/tray_icon.png"),
        path.join(app.getAppPath ? app.getAppPath() : __dirname, "electron/tray_icon.png")
    ];
    return candidates.find(p => require("fs").existsSync(p)) || null;
}
function createWindow() {
    const resolvedIcon = resolveIcon();
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        icon: resolvedIcon ? nativeImage.createFromPath(resolvedIcon) : undefined,
        webPreferences: { preload: path.join(__dirname, "preload.js") },
        titleBarStyle: "hidden",
        titleBarOverlay: {
            color: "#0b0914",
            symbolColor: "#d946ef",
            height: 32
        }
    });
    if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    else mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));

    mainWindow.once("ready-to-show", () => {
        mainWindow.maximize();
        mainWindow.show();
    });

    // Watch the instances folder and notify renderer when it changes (e.g. restore from Recycle Bin)
    const instancesWatchPath = path.join(app.getPath("userData"), "Crystalline_Instances");
    require("fs").mkdirSync(instancesWatchPath, { recursive: true });
    let instancesChangeTimer = null;
    const instancesWatcher = require("fs").watch(instancesWatchPath, { recursive: false }, (eventType) => {
        // Debounce to avoid dozens of events for a single change
        clearTimeout(instancesChangeTimer);
        instancesChangeTimer = setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("instances-changed");
            }
        }, 500);
    });
    mainWindow.on("closed", () => instancesWatcher.close());


    // Block browser hotkeys: zoom in/out/reset, refresh, hard-refresh, devtools
    mainWindow.webContents.on("before-input-event", (event, input) => {
        const ctrl = input.control || input.meta;
        if (ctrl && (input.key === "=" || input.key === "+" || input.key === "-" || input.key === "_" || input.key === "0")) {
            event.preventDefault();
        }
        if (input.key === "F5") event.preventDefault();
        if (ctrl && input.key === "r") event.preventDefault();
        if (ctrl && input.shift && input.key === "r") event.preventDefault();
        if (ctrl && input.shift && input.key === "i") event.preventDefault();
        if (input.key === "F12") event.preventDefault();
    });

    // Prevent quitting if a task is active
    app.on("before-quit", (event) => {
        if (global.activeTasks > 0) {
            event.preventDefault();
            app.isQuitting = false; // Reset in case it was triggered by Tray 'Quit'
            if (mainWindow) {
                if (!mainWindow.isVisible()) mainWindow.show();
                mainWindow.webContents.send("show-quit-warning");
            }
        }
    });

    // Check settings for close behavior
    let hasShownTrayNotification = false;
    mainWindow.on("close", (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            let closeToTray = true;
            try {
                const settingsPath = path.join(app.getPath("userData"), "settings.json");
                const data = require("fs").readFileSync(settingsPath, "utf8");
                const settings = JSON.parse(data);
                if (settings.closeBehavior === "quit") {
                    closeToTray = false;
                }
            } catch (e) {
                // Ignore if settings don't exist
            }

            if (closeToTray) {
                mainWindow.hide();
                if (!hasShownTrayNotification && tray) {
                    tray.displayBalloon({
                        title: "Crystalline",
                        content: "The launcher is running in the background.",
                        iconType: "info"
                    });
                    hasShownTrayNotification = true;
                }
            } else {
                app.isQuitting = true;
                app.quit();
            }
        }
    });
}

if (!app.requestSingleInstanceLock()) {
    app.quit();
    process.exit(0);
}
function handleProtocolURL(args) {
    const urlArg = args.find((arg) => arg.startsWith("discord-1523332306096357487://"));
    if (urlArg) {
        console.log("[INVITE] Parsed protocol URL:", urlArg);
        const secret = urlArg.replace("discord-1523332306096357487://", "").split("/")[0];
        if (secret) {
            pendingJoinServer = secret;
            if (mainWindow) mainWindow.webContents.send("discord-activity-join", secret);
        }
    }
}
app.on("second-instance", (event, commandLine, workingDirectory) => {
    handleProtocolURL(commandLine);
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});
app.whenReady().then(() => {
    createWindow();
    handleProtocolURL(process.argv);
    // Check for updates 3 seconds after launch (only in production)
    if (app.isPackaged) {
        setTimeout(() => autoUpdater.checkForUpdates(), 3000);
    }
    app.on("activate", function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });

    // System Tray
    const trayPng = resolveTrayPng();
    const trayIcon = trayPng
        ? nativeImage.createFromPath(trayPng).resize({ width: 32, height: 32 })
        : nativeImage.createEmpty();
    tray = new Tray(trayIcon);
    tray.setToolTip("Crystalline Launcher");

    // Create custom tray menu window
    trayWindow = new BrowserWindow({
        width: 220,
        height: 220,
        show: false,
        frame: false,
        transparent: false,
        backgroundColor: '#0c0c10',
        resizable: false,
        skipTaskbar: true,
        alwaysOnTop: true,
        roundedCorners: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, "preload.js")
        }
    });
    const trayHtmlPath = (() => {
        const candidates = [
            path.join(__dirname, "tray.html"),                          // dev: electron/main.js -> electron/tray.html
            path.join(app.getAppPath(), "electron", "tray.html"),       // prod ASAR: app root -> electron/tray.html
            path.join(__dirname, "..", "electron", "tray.html"),        // fallback
        ];
        return candidates.find(p => require("fs").existsSync(p)) || candidates[1];
    })();
    trayWindow.loadFile(trayHtmlPath);

    trayWindow.on("blur", () => {
        trayWindow.hide();
    });

    function showTrayMenu() {
        if (trayWindow.isVisible()) {
            trayWindow.hide();
            return;
        }
        const trayBounds = tray.getBounds();
        const winBounds = trayWindow.getBounds();
        let x = Math.round(trayBounds.x + (trayBounds.width / 2) - (winBounds.width / 2));
        let y = Math.round(trayBounds.y - winBounds.height - 10);
        if (y < 0) y = trayBounds.y + trayBounds.height + 10;
        trayWindow.setPosition(x, y, false);
        trayWindow.show();
        trayWindow.focus();
    }

    async function getTrayClickAction() {
        try {
            const settingsPath = require("path").join(app.getPath("userData"), "settings.json");
            const data = require("fs").readFileSync(settingsPath, "utf8");
            return JSON.parse(data).trayClickAction || "launcher";
        } catch { return "launcher"; }
    }

    tray.on("right-click", () => {
        showTrayMenu();
    });

    tray.on("click", async () => {
        const action = await getTrayClickAction();
        if (action === "menu") {
            showTrayMenu();
        } else {
            if (mainWindow.isVisible()) mainWindow.focus();
            else mainWindow.show();
            if (trayWindow.isVisible()) trayWindow.hide();
        }
    });

    // When clicking the notification bubble, just show the launcher
    tray.on("balloon-click", () => {
        if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
        }
    });
    rpc.on("ready", () => {
        console.log("Discord RPC ready");
        if (mainWindow) mainWindow.webContents.send("discord-status", "Connected (Rich Presence Active)");
        rpc.setActivity({
            details: "In Launcher",
            state: "Preparing for an adventure",
            startTimestamp: /* @__PURE__ */ new Date(),
            largeImageKey: "icon_large",
            largeImageText: "Crystalline",
            instance: false
        });
        rpc.subscribe("ACTIVITY_JOIN", ({ secret }) => {
            console.log("[INVITE] Received ACTIVITY_JOIN, secret:", secret);
            pendingJoinServer = secret;
            if (mainWindow) mainWindow.webContents.send("discord-activity-join", secret);
        });
        // When a friend clicks "Join" in Discord, ask the host for approval
        rpc.subscribe("ACTIVITY_JOIN_REQUEST", (user) => {
            console.log("[INVITE] ACTIVITY_JOIN_REQUEST from:", user.username);
            if (mainWindow) mainWindow.webContents.send("discord-join-request", {
                id: user.id,
                username: user.username,
                discriminator: user.discriminator,
                avatar: user.avatar
            });
        });
    });
    rpc.login({ clientId }).catch((err) => {
        console.error("Discord RPC login failed:", err);
        if (mainWindow) mainWindow.webContents.send("discord-status", "Connection failed");
    });
});
app.on("window-all-closed", function () {
    if (process.platform !== "darwin") app.quit();
});
var authManager = new Auth("select_account");
var mcAccount = null;
var http = require("http");
// var { shell } = require("electron");
ipcMain.handle("discord-login", async () => {
    return new Promise((resolve) => {
        let resolved = false;
        const server = http.createServer((req, res) => {
            if (req.url.startsWith("/callback")) {
                // Step 1: Browser lands here after Discord redirect.
                // Token is in #hash fragment — JS reads it and redirects to /authorize?...
                // so Node.js can read it directly from req.url (no fragile POST body).
                res.writeHead(200, { "Content-Type": "text/html" });
                res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:50px;background:#080B10;color:#fff">
          <h2>Logging into Crystalline...</h2>
          <script>
            var hash = window.location.hash.substring(1);
            var query = window.location.search.substring(1);
            var params = hash.length > 0 ? hash : query;
            if (params.length > 0) {
              window.location.href = '/authorize?' + params;
            } else {
              window.location.href = '/authorize?_empty=1';
            }
          </script>
          </body></html>`);
            } else if (req.url.startsWith("/authorize")) {
                // Step 2: Read token directly from URL query string
                const rawQuery = req.url.split("?")[1] || "";
                const urlParams = new URLSearchParams(rawQuery);
                const accessToken = urlParams.get("access_token");
                const discordError = urlParams.get("error");
                const discordErrorDesc = urlParams.get("error_description");

                console.log("[DISCORD LOGIN] /authorize received. access_token present:", !!accessToken, "| error:", discordError, "| raw query snippet:", rawQuery.substring(0, 80));

                res.writeHead(200, { "Content-Type": "text/html" });
                if (accessToken) {
                    res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:50px;background:#080B10;color:#fff">
          <h2 style="color:#00edab">Login successful! You can close this tab.</h2>
          <script>setTimeout(function(){ window.close(); }, 1500);</script>
          </body></html>`);
                } else {
                    const msg = discordError ? `Discord Error: ${discordError} — ${discordErrorDesc || ""}` : "No token received.";
                    res.end(`<html><body style="font-family:sans-serif;text-align:center;padding-top:50px;background:#080B10;color:#fff">
          <h2 style="color:#FF4B4B">${msg}</h2>
          </body></html>`);
                }

                if (resolved) return;
                resolved = true;

                if (!accessToken) {
                    server.close();
                    const errMsg = discordError
                        ? `Discord verweigerte den Zugriff: ${discordError}. Stelle sicher, dass du im Browser auf "Authorize" klickst.`
                        : "No access token returned. Bitte versuche es erneut.";
                    resolve({ success: false, error: errMsg });
                    return;
                }

                (async () => {
                    try {
                        const userRes = await httpsGet("discord.com", "/api/v10/users/@me", { Authorization: `Bearer ${accessToken}` });
                        let friends = [];
                        try {
                            const friendsRes = await httpsGet("discord.com", "/api/v10/users/@me/relationships", { Authorization: `Bearer ${accessToken}` });
                            if (Array.isArray(friendsRes) && friendsRes.length > 0) friends = friendsRes;
                            else throw new Error("HTTP returned empty or blocked");
                        } catch (e) {
                            console.log("HTTP relationships blocked, trying IPC fallback...");
                            try {
                                await rpc.authenticate(accessToken);
                                const rpcFriends = await rpc.getRelationships();
                                if (Array.isArray(rpcFriends)) friends = rpcFriends;
                            } catch (rpcErr) {
                                console.log("IPC relationships failed:", rpcErr.message);
                            }
                        }
                        await writeEncryptedFile(path.join(app.getPath("userData"), "discord_auth.json"), { accessToken }).catch(() => { });
                        server.close();
                        resolve({ success: true, user: userRes, friends });
                    } catch (err) {
                        server.close();
                        resolve({ success: false, error: err.message });
                    }
                })();
            }
        });
        const PORT = 34321;
        server.on("error", (err) => {
            if (!resolved) {
                resolved = true;
                resolve({ success: false, error: "Could not start local server for OAuth callback on port 34321. Is it in use?" });
            }
        });
        server.listen(PORT, "127.0.0.1", () => {
            const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(`http://127.0.0.1:${PORT}/callback`)}&response_type=token&scope=identify%20relationships.read%20rpc`;
            shell.openExternal(authUrl);
        });
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                server.close();
                resolve({ success: false, error: "Discord login timed out after 2 minutes" });
            }
        }, 12e4);
    });
});


ipcMain.handle("msmc-login", async () => {
    try {
        const loginUrl = authManager.createLink();
        const REDIRECT = "https://login.live.com/oauth20_desktop.srf";
        return await new Promise((resolve) => {
            const loginWindow = new BrowserWindow({
                width: 500,
                height: 650,
                title: "Sign in with Microsoft",
                autoHideMenuBar: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true
                }
            });
            let resolved = false;
            const handleCode = async (rawUrl) => {
                if (resolved) return;
                if (!rawUrl || !rawUrl.includes(REDIRECT)) return;
                let code;
                try {
                    code = new URL(rawUrl).searchParams.get("code");
                } catch (e) {
                    return;
                }
                if (!code) return;
                resolved = true;
                try {
                    loginWindow.hide();
                } catch (e) { }
                try {
                    const mcAuth = await httpsPost("api.minecraftservices.com", "/authentication/login_with_xbox", { identityToken: await (await authManager.login(code)).xAuth("rp://api.minecraftservices.com/") });
                    if (!mcAuth.access_token) throw new Error("No access_token in login_with_xbox response");
                    const profile = await httpsGet("api.minecraftservices.com", "/minecraft/profile", { Authorization: `Bearer ${mcAuth.access_token}` });
                    if (!profile.name) throw new Error("No profile name returned: " + JSON.stringify(profile));
                    mcAccount = {
                        access_token: mcAuth.access_token,
                        client_token: require("crypto").randomUUID(),
                        uuid: profile.id,
                        name: profile.name,
                        user_properties: {}
                    };
                    await writeEncryptedFile(path.join(app.getPath("userData"), "auth.json"), mcAccount).catch(() => { });
                    try {
                        loginWindow.close();
                    } catch (e) { }
                    resolve({
                        success: true,
                        username: mcAccount.name
                    });
                } catch (err) {
                    try {
                        loginWindow.close();
                    } catch (e) { }
                    console.error("Auth error:", err);
                    resolve({
                        success: false,
                        error: err.message || "Auth failed"
                    });
                }
            };
            loginWindow.webContents.on("will-redirect", (event, newUrl) => {
                handleCode(newUrl);
            });
            loginWindow.webContents.on("will-navigate", (event, newUrl) => {
                handleCode(newUrl);
            });
            loginWindow.webContents.on("did-navigate", (event, newUrl) => {
                handleCode(newUrl);
            });
            loginWindow.webContents.on("did-finish-load", () => {
                handleCode(loginWindow.webContents.getURL());
            });
            loginWindow.webContents.session.webRequest.onBeforeRequest({ urls: [`${REDIRECT}*`] }, (details, callback) => {
                callback({ cancel: true });
                handleCode(details.url);
            });
            loginWindow.on("close", () => {
                if (!resolved) {
                    resolved = true;
                    resolve({
                        success: false,
                        error: "Login canceled by user"
                    });
                }
            });
            loginWindow.loadURL(loginUrl);
        });
    } catch (error) {
        console.error("Login window error:", error);
        return {
            success: false,
            error: error.message || "Login failed"
        };
    }
});

async function validateAndRefreshAccount(account) {
    if (!account || !account.access_token) return account;
    try {
        const profileRes = await httpsGet('api.minecraftservices.com', '/minecraft/profile', { Authorization: `Bearer ${account.access_token}` });
        if (profileRes && profileRes.id) {
            console.log("[AUTH] Token still valid for", profileRes.name);
            return account;
        }
    } catch (e) {
        console.log("[AUTH] Token validation failed, attempting refresh...");
    }

    // Refresh token logic
    try {
        const authManager = new Auth("login");
        if (!account.refresh_token) throw new Error("No refresh token found in account object");
        const xboxManager = await authManager.refresh(account.refresh_token);
        const token = await xboxManager.getMinecraft();

        const newAccount = {
            uuid: token.profile.id,
            name: token.profile.name,
            access_token: token.mclToken,
            refresh_token: xboxManager.msToken.refresh_token
        };

        await writeEncryptedFile(path.join(app.getPath('userData'), 'auth.json'), newAccount);
        console.log("[AUTH] Token refreshed successfully for", newAccount.name);
        return newAccount;
    } catch (e) {
        console.error("[AUTH] Refresh failed:", e.message);
        return null;
    }
}

ipcMain.handle("check-auth", async () => {
    try {
        const authPath = path.join(app.getPath("userData"), "auth.json");
        let account = await readEncryptedFile(authPath);
        if (account) {
            const refreshed = await validateAndRefreshAccount(account);
            if (refreshed && refreshed.name) {
                mcAccount = refreshed;
                return { success: true, username: refreshed.name };
            }
        }
        return { success: false };
    } catch (e) {
        return { success: false };
    }
});

ipcMain.handle("check-discord-auth", async () => {
    try {
        const { accessToken } = await readEncryptedFile(path.join(app.getPath("userData"), "discord_auth.json"));
        if (!accessToken) return { success: false };
        const withTimeout = (prom, ms) => Promise.race([prom, new Promise((_, rej) => setTimeout(() => rej(/* @__PURE__ */ new Error("timeout")), ms))]);
        let friendsRes = [];
        try {
            console.log("Trying getRelationships on existing auth...");
            friendsRes = await withTimeout(rpc.getRelationships(), 2e3);
        } catch (e0) {
            console.log("Needs auth:", e0.message);
            try {
                await withTimeout(rpc.authenticate(accessToken), 3e3);
                console.log("rpc.authenticate succeeded");
                friendsRes = await withTimeout(rpc.getRelationships(), 2e3);
            } catch (e) {
                console.log("rpc.authenticate failed:", e.message);
                try {
                    await withTimeout(rpc.login({
                        clientId,
                        accessToken,
                        scopes: ["rpc", "relationships.read"]
                    }), 5e3);
                    console.log("rpc.login succeeded");
                    friendsRes = await withTimeout(rpc.getRelationships(), 2e3);
                } catch (e2) {
                    console.log("rpc.login fallback failed:", e2.message);
                    return { success: false };
                }
            }
        }
        console.log("Fetching user...");
        const userRes = await httpsGet("discord.com", "/api/v10/users/@me", { Authorization: `Bearer ${accessToken}` });
        if (mainWindow) mainWindow.webContents.send("discord-status", "Connected (Rich Presence Active)");
        return {
            success: true,
            user: userRes,
            friends: Array.isArray(friendsRes) ? friendsRes : []
        };
    } catch (e) {
        console.error("Discord check auth failed:", e.message);
        return { success: false };
    }
});
ipcMain.handle("logout", async () => {
    mcAccount = null;
    try {
        const authPath = path.join(app.getPath("userData"), "auth.json");
        await fs.unlink(authPath);
    } catch (e) { }
    return { success: true };
});
ipcMain.handle("discord-logout", async () => {
    try {
        const authPath = path.join(app.getPath("userData"), "discord_auth.json");
        await fs.unlink(authPath);
    } catch (e) { }
    try {
        rpc.clearActivity();
    } catch (e) { }
    return { success: true };
});
function computeMurmur2(buffer, seed) {
    const m = 0x5bd1e995;
    const r = 24;
    let h = seed ^ buffer.length;
    let i = 0;
    while (buffer.length >= i + 4) {
        let k = buffer.readUInt32LE(i);
        k = Math.imul(k, m);
        k ^= k >>> r;
        k = Math.imul(k, m);
        h = Math.imul(h, m);
        h ^= k;
        i += 4;
    }
    switch (buffer.length - i) {
        case 3: h ^= buffer[i + 2] << 16;
        case 2: h ^= buffer[i + 1] << 8;
        case 1: h ^= buffer[i]; h = Math.imul(h, m);
    }
    h ^= h >>> 13;
    h = Math.imul(h, m);
    h ^= h >>> 15;
    return h >>> 0;
}

function getCurseForgeHash(buffer) {
    const cleanBuffer = Buffer.allocUnsafe(buffer.length);
    let offset = 0;
    for (let i = 0; i < buffer.length; i++) {
        const b = buffer[i];
        if (b !== 9 && b !== 10 && b !== 13 && b !== 32) {
            cleanBuffer[offset++] = b;
        }
    }
    return computeMurmur2(cleanBuffer.slice(0, offset), 1);
}

async function generateModpackExport(instanceId, version, loader, loaderVersion) {
    try {
        const modsPath = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId, "mods");
        if (!require("fs").existsSync(modsPath)) return null;
        const files = await fs.readdir(modsPath);
        const sha1Hashes = [];
        const murmurMap = new Map(); // murmur -> filename
        const sha1Map = new Map(); // sha1 -> filename


        for (const f of files) {
            if (f.endsWith(".jar")) {
                const buf = await fs.readFile(path.join(modsPath, f));
                const sha1 = crypto.createHash("sha1").update(buf).digest("hex");
                const murmur = getCurseForgeHash(buf);
                sha1Hashes.push(sha1);
                sha1Map.set(sha1, f);
                murmurMap.set(murmur, f);
            }
        }
        if (sha1Hashes.length === 0) return null;

        const fetch = require("node-fetch");

        // 1. Check Modrinth
        const res = await fetch("https://api.modrinth.com/v2/version_files", {
            method: "POST",
            body: JSON.stringify({ hashes: sha1Hashes, algorithm: "sha1" }),
            headers: { "Content-Type": "application/json" }
        });
        const data = await res.json();

        const urls = [];
        const resolvedFiles = new Set();

        for (const hash of Object.keys(data)) {
            const v = data[hash];
            if (v && v.files) {
                const primary = v.files.find(f => f.primary) || v.files[0];
                if (primary && primary.url) {
                    urls.push(primary.url);
                    resolvedFiles.add(sha1Map.get(hash));
                }
            }
        }

        // 2. Check missing files on CurseForge
        const missingMurmurs = [];
        for (const [murmur, filename] of murmurMap.entries()) {
            if (!resolvedFiles.has(filename)) {
                missingMurmurs.push(murmur);
            }
        }

        if (missingMurmurs.length > 0) {
            const cfApiKey = "$2a$10$pimcMzR6cxbjEFAdC7T/y.ch56z3ZK4pRpmaMFH/vDv.Xi6qeUTTG";
            const cfRes = await fetch("https://api.curseforge.com/v1/fingerprints", {
                method: "POST",
                body: JSON.stringify({ fingerprints: missingMurmurs }),
                headers: { "Content-Type": "application/json", "x-api-key": cfApiKey, "Accept": "application/json" }
            });
            const cfData = await cfRes.json();
            if (cfData && cfData.data && cfData.data.exactMatches) {
                for (const match of cfData.data.exactMatches) {
                    if (match.file && match.file.downloadUrl) {
                        urls.push(match.file.downloadUrl);
                        resolvedFiles.add(murmurMap.get(match.id));
                    }
                }
            }
        }

        // 3. Any files STILL missing?
        const missingMods = [];
        for (const f of files) {
            if (f.endsWith(".jar") && !resolvedFiles.has(f)) {
                missingMods.push(f);
            }
        }

        const payload = {
            version,
            loader,
            loaderVersion,
            mods: urls,
            missingMods
        };

        const bbRes = await fetch("https://bytebin.lucko.me/post", {
            method: "POST",
            body: JSON.stringify(payload),
            headers: { "Content-Type": "application/json" }
        });
        const bbData = await bbRes.json();
        return bbData.key;
    } catch (e) {
        console.error("Export generation failed:", e);
        return null;
    }
}

ipcMain.handle("download-modpack-urls", async (event, urls, instanceId) => {
    try {
        const targetFolder = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId, "mods");
        await fs.mkdir(targetFolder, { recursive: true });

        const fetch = require("node-fetch");
        let completed = 0;
        // Download concurrently with a limit of 5
        for (let i = 0; i < urls.length; i += 5) {
            const chunk = urls.slice(i, i + 5);
            await Promise.all(chunk.map(async (url) => {
                try {
                    const fileName = url.substring(url.lastIndexOf("/") + 1);
                    const targetFile = path.join(targetFolder, fileName);
                    const buf = await fetchBuffer(url, `Downloading ${fileName}`);
                    await fs.writeFile(targetFile, buf);
                } catch (e) {
                    console.error("Failed to download mod", url, e);
                }
                completed++;
                if (mainWindow) mainWindow.webContents.send("launch-status", `Downloading mods... ${completed}/${urls.length}`);
            }));
        }

        return { success: true };
    } catch (err) {
        console.error("[MODPACK DOWNLOAD ERROR]", err);
        return { success: false, error: err.message };
    } finally {
        global.activeTasks--;
    }
});


ipcMain.handle("update-discord-presence", async (event, { serverIp, version, loader, loaderVersion, instanceId, details, state, joinSecret, partyId, partySize, partyMax }) => {
    try {
        const activity = {
            details: details || "Playing Crystalline",
            state: state || (serverIp ? `On ${serverIp}` : `Version ${version || ""}`),
            startTimestamp: /* @__PURE__ */ new Date(),
            largeImageKey: "icon_large",
            largeImageText: "Crystalline",
            instance: !!serverIp
        };
        if (serverIp) {
            let modpackSegment = instanceId === "default" ? "official" : "";
            if (instanceId && instanceId !== "default") {
                const bbKey = await generateModpackExport(instanceId, version, loader, loaderVersion);
                if (bbKey) modpackSegment = "bb:" + bbKey;
            }
            // If they are in a party, we broadcast the instance start to the party!
            if (partyClient && partyState && partyState.groupId) {
                partyClient.publish(`crystalline/party/${partyState.groupId}`, encryptPayload({
                    type: "start_instance",
                    serverIp, version, loader, loaderVersion, modpackSegment
                }, partyState.aesKey));

                // Preserve party secret for discord presence instead of replacing it
                activity.joinSecret = `group:${partyState.groupId}:${partyState.aesKey}`;
                activity.partyId = partyState.groupId;
                activity.partySize = partyState.members.length || 1;
                activity.partyMax = 10;
            } else {
                activity.joinSecret = `${serverIp}|${version || ""}|${loader || ""}|${loaderVersion || ""}|${modpackSegment}`;
                activity.partyId = `crystalline-${serverIp.replace(/[^a-zA-Z0-9]/g, "-")}`;
                activity.partySize = 1;
                activity.partyMax = 20;
            }
        } else if (joinSecret && partyId) {
            // Party data passed directly (e.g. idle in party, waiting for friends)
            activity.joinSecret = joinSecret;
            activity.partyId = partyId;
            activity.partySize = partySize || 1;
            activity.partyMax = partyMax || 10;
        }

        rpc.setActivity(activity);
        return { success: true };
    } catch (err) {
        console.error("[PRESENCE] update-discord-presence failed:", err.message);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("send-discord-invite", async (event, userId) => {
    try {
        await rpc.sendJoinInvite({ id: userId });
        return { success: true };
    } catch (err) {
        // Discord RPC throws "Unknown Error" even when the invite popup actually works
        if (err.message === "Unknown Error" || err.code === 1000) {
            return { success: true };
        }
        // "No eligible activity" means the presence has no party+joinSecret set
        if (err.message && (err.message.includes("eligible activity") || err.message.includes("4006") || err.code === 4006)) {
            console.error("[INVITE] No party activity set – cannot send RPC invite", err.message);
            return {
                success: false,
                error: "Discord konnte keine Einladung senden, weil noch keine Spielaktivität mit Party-Infos gesetzt ist. Starte zuerst ein Spiel oder verbinde dich mit einem Server."
            };
        }
        console.error("[INVITE] sendJoinInvite failed:", err.message);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("approve-join-request", async (event, userId) => {
    try {
        await rpc.sendJoinRequest({ id: userId });
        return { success: true };
    } catch (err) {
        if (err.message === "Unknown Error" || err.code === 1000) return { success: true };
        console.error("[INVITE] approve-join-request failed:", err.message);
        return { success: false, error: err.message };
    }
});
ipcMain.handle("deny-join-request", async (event, userId) => {
    try {
        await rpc.closeJoinRequest({ id: userId });
        return { success: true };
    } catch (err) {
        if (err.message === "Unknown Error" || err.code === 1000) return { success: true };
        console.error("[INVITE] deny-join-request failed:", err.message);
        return { success: false, error: err.message };
    }
});
// ─── Auto-Updater IPC Handlers ──────────────────────────────────────────────
ipcMain.handle("start-download-update", async () => {
    try {
        await autoUpdater.downloadUpdate();
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
ipcMain.handle("quit-and-install-update", () => {
    autoUpdater.quitAndInstall();
});
new (require('https').Agent)({ keepAlive: false });
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const { net } = require("electron");
        const req = net.request(url);
        req.on("response", (res) => {
            let locHeader = res.headers["location"] || res.headers["Location"];
            if (Array.isArray(locHeader)) locHeader = locHeader[0];
            if (res.statusCode >= 300 && res.statusCode < 400 && locHeader) {
                let loc = locHeader;
                if (!loc.startsWith("http")) loc = new URL(loc, url).href;
                return resolve(fetchJson(loc));
            }
            let raw = "";
            res.on("data", (chunk) => raw += chunk);
            res.on("end", () => {
                if (res.statusCode >= 200 && res.statusCode < 300) try {
                    resolve(JSON.parse(raw));
                } catch (e) {
                    reject(e);
                }
                else reject(/* @__PURE__ */ new Error(`Status ${res.statusCode}: ${raw}`));
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}
function fetchBuffer(url, label = "Downloading") {
    return new Promise((resolve, reject) => {
        const { net } = require("electron");
        const req = net.request(url);
        req.on("response", (res) => {
            let locHeader = res.headers["location"] || res.headers["Location"];
            if (Array.isArray(locHeader)) locHeader = locHeader[0];
            if (res.statusCode >= 300 && res.statusCode < 400 && locHeader) {
                let loc = locHeader;
                if (!loc.startsWith("http")) loc = new URL(loc, url).href;
                return resolve(fetchBuffer(loc, label));
            }
            if (res.statusCode >= 200 && res.statusCode < 300) {
                let totalHeader = res.headers["content-length"] || res.headers["Content-Length"];
                if (Array.isArray(totalHeader)) totalHeader = totalHeader[0];
                const total = parseInt(totalHeader || "0", 10);
                let downloaded = 0;
                let lastReport = 0;
                const chunks = [];
                res.on("data", (chunk) => {
                    chunks.push(chunk);
                    downloaded += chunk.length;
                    const now = Date.now();
                    if (now - lastReport > 250 && typeof mainWindow !== "undefined" && mainWindow) {
                        const mb = (downloaded / 1024 / 1024).toFixed(1);
                        const totalMb = total ? (total / 1024 / 1024).toFixed(1) : "?";
                        mainWindow.webContents.send("launch-status", `${label} (${mb}MB / ${totalMb}MB)`);
                        lastReport = now;
                    }
                });
                res.on("end", () => {
                    const finalBuffer = Buffer.concat(chunks);
                    if (res.headers["content-type"] && res.headers["content-type"].includes("text/html") && url.includes("drive.google")) {
                        const html = finalBuffer.toString("utf8");
                        const actionMatch = html.match(/<form id="download-form" action="([^"]+)"/);
                        if (actionMatch) {
                            const formAction = actionMatch[1];
                            const uuidMatch = html.match(/name="uuid" value="([^"]+)"/);
                            const confirmMatch = html.match(/name="confirm" value="([^"]+)"/);
                            const idMatch = html.match(/name="id" value="([^"]+)"/);
                            if (uuidMatch && confirmMatch && idMatch) return resolve(fetchBuffer(`${formAction}?id=${idMatch[1]}&export=download&confirm=${confirmMatch[1]}&uuid=${uuidMatch[1]}`, label));
                        }
                    }
                    resolve(finalBuffer);
                });
                res.on("error", reject);
            } else reject(/* @__PURE__ */ new Error(`Status ${res.statusCode}`));
        });
        req.on("error", reject);
        req.end();
    });
}
async function ensureJava(javaVersion) {
    const javaDir = path.join(app.getPath("userData"), `java-${javaVersion}`);
    const findJava = async (dir) => {
        try {
            const files = await fs.readdir(dir, { withFileTypes: true });
            for (const f of files) if (f.isDirectory()) {
                const res = await findJava(path.join(dir, f.name));
                if (res) return res;
            } else if (f.name === "java.exe") return path.join(dir, f.name);
        } catch (e) { }
        return null;
    };
    let existing = await findJava(javaDir);
    if (existing) return existing;
    await fs.rm(javaDir, {
        recursive: true,
        force: true
    }).catch(() => { });
    mainWindow.webContents.send("launch-status", `Downloading Java ${javaVersion}...`);
    await fs.mkdir(javaDir, { recursive: true });
    const zipPath = path.join(javaDir, `java${javaVersion}.zip`);
    const buffer = await fetchBuffer(`https://api.adoptium.net/v3/binary/latest/${javaVersion}/ga/windows/x64/jre/hotspot/normal/eclipse`, `Downloading Java ${javaVersion}`);
    await fs.writeFile(zipPath, buffer);
    mainWindow.webContents.send("launch-status", `Extracting Java ${javaVersion} (This is fast now!)...`);
    const extractPromise = new Promise((resolve, reject) => {
        const { execFile } = require("child_process");
        execFile("tar", [
            "-xf",
            zipPath,
            "-C",
            javaDir
        ], (error) => {
            if (error) reject(error);
            else resolve();
        });
    });
    await Promise.race([extractPromise, new Promise((_, rej) => setTimeout(() => rej(/* @__PURE__ */ new Error("Extraction timed out after 5 minutes")), 3e5))]);
    await fs.unlink(zipPath).catch(() => { });
    existing = await findJava(javaDir);
    if (!existing) throw new Error("java.exe not found after extraction");
    return existing;
}
async function setupFabric(rootPath, mcVersion) {
    const versionsDir = path.join(sharedPath, "versions", `fabric-${mcVersion}`);
    await fs.mkdir(versionsDir, { recursive: true });
    const jsonPath = path.join(versionsDir, `fabric-${mcVersion}.json`);
    if (require("fs").existsSync(jsonPath)) return `fabric-${mcVersion}`;
    mainWindow.webContents.send("launch-status", "Fetching Fabric Loader...");
    const loaders = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
    if (!loaders || loaders.length === 0) throw new Error("No Fabric loader found for this version");
    const loaderVersion = loaders[0].loader.version;
    const profileJson = await fetchJson(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}/${loaderVersion}/profile/json`);
    profileJson.id = `fabric-${mcVersion}`;
    await fs.writeFile(jsonPath, JSON.stringify(profileJson, null, 2));
    return `fabric-${mcVersion}`;
}
async function setupForge(rootPath, mcVersion, loaderVersion, javaPath) {
    let version = loaderVersion;
    if (!version) {
        mainWindow.webContents.send("launch-status", "Fetching Forge version...");
        const data = await fetchJson(`https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`);
        if (!data || data.length === 0) throw new Error("No Forge found for this version");
        version = (data.find((v) => v.branch === "recommended") || data[0]).version;
    }
    const versionsDir = path.join(sharedPath, "versions");
    if (require("fs").existsSync(versionsDir)) {
        const dirs = await fs.readdir(versionsDir, { withFileTypes: true }).catch(() => []);
        for (const d of dirs) if (d.isDirectory() && d.name.toLowerCase().includes("forge") && d.name.includes(version)) {
            const jsonPath = path.join(versionsDir, d.name, `${d.name}.json`);
            if (require("fs").existsSync(jsonPath)) {
                console.log("[FORGE] Already installed:", d.name);
                return d.name;
            }
        }
    }
    const installerName = `forge-installer-${mcVersion}-${version}.jar`;
    const tempInstaller = path.join(require("os").tmpdir(), installerName);
    if (!require("fs").existsSync(tempInstaller)) {
        const urlWithSuffix = `https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/${mcVersion}-${version}-${mcVersion}/forge-${mcVersion}-${version}-${mcVersion}-installer.jar`;
        const urlWithoutSuffix = `https://bmclapi2.bangbang93.com/maven/net/minecraftforge/forge/${mcVersion}-${version}/forge-${mcVersion}-${version}-installer.jar`;
        mainWindow.webContents.send("launch-status", "Downloading Forge Installer...");
        let buffer;
        try {
            console.log("[FORGE] Trying installer URL:", urlWithoutSuffix);
            buffer = await fetchBuffer(urlWithoutSuffix, "Downloading Forge Installer");
        } catch (e1) {
            console.log("[FORGE] Falling back to suffix URL:", urlWithSuffix);
            buffer = await fetchBuffer(urlWithSuffix, "Downloading Forge Installer");
        }
        await fs.writeFile(tempInstaller, buffer);
    }
    if (parseInt(mcVersion.split(".")[1] || 0) <= 8) {
        console.log("[FORGE] Using legacy extraction for", mcVersion);
        return await setupLegacyForge(rootPath, mcVersion, version, tempInstaller);
    }
    const { spawn } = require("child_process");
    const profilesPath = path.join(sharedPath, "launcher_profiles.json");
    if (!require("fs").existsSync(profilesPath)) await require("fs").promises.writeFile(profilesPath, "{}");
    try {
        mainWindow.webContents.send("launch-status", "Installing Forge natively (this may take a few minutes)...");
        console.log("[FORGE] Running installer natively...");
        await new Promise((resolve, reject) => {
            const child = spawn(javaPath, [
                "-jar",
                tempInstaller,
                "--installClient",
                rootPath
            ]);
            let errorOutput = "";
            child.stderr.on("data", (d) => {
                errorOutput += d.toString();
            });
            let stdoutBuffer = "";
            child.stdout.on("data", (d) => {
                stdoutBuffer += d.toString();
                const lines = stdoutBuffer.split("\n");
                stdoutBuffer = lines.pop();
                for (const line of lines) if (line.includes("Downloading")) mainWindow.webContents.send("launch-status", line.trim());
            });
            child.on("close", (code) => {
                if (code === 0) resolve();
                else reject(/* @__PURE__ */ new Error("Installer exited with code " + code + ": " + errorOutput.substring(0, 500)));
            });
            child.on("error", reject);
        });
        const versionsDir = path.join(sharedPath, "versions");
        const dirs = await fs.readdir(versionsDir, { withFileTypes: true });
        let customVersionName = null;
        for (const d of dirs) if (d.isDirectory() && d.name.toLowerCase().includes("forge") && d.name.includes(version)) {
            customVersionName = d.name;
            break;
        }
        if (!customVersionName) throw new Error("Installer completed but could not find the installed Forge version folder.");
        return customVersionName;
    } catch (err) {
        console.error("[FORGE] Native install failed:", err);
        throw new Error("Forge installation failed: " + err.message);
    }
}
async function setupLegacyForge(rootPath, mcVersion, forgeVersion, installerPath) {
    try {
        const versionName = `${mcVersion}-Forge${forgeVersion}`;
        console.log("[FORGE-LEGACY] Generating legacy Forge JSON for:", versionName);
        const versionDir = path.join(sharedPath, "versions", versionName);
        require("fs").mkdirSync(versionDir, { recursive: true });
        const versionJson = {
            id: versionName,
            inheritsFrom: mcVersion,
            time: "2013-12-27T12:32:16.000Z",
            releaseTime: "2013-12-27T12:32:16.000Z",
            type: "release",
            minecraftArguments: "--username ${auth_player_name} --version ${version_name} --gameDir ${game_directory} --assetsDir ${assets_root} --assetIndex ${assets_index_name} --uuid ${auth_uuid} --accessToken ${auth_access_token} --userProperties ${user_properties} --userType ${user_type} --tweakClass cpw.mods.fml.common.launcher.FMLTweaker",
            mainClass: "net.minecraft.launchwrapper.Launch",
            libraries: [
                { name: `net.minecraftforge:forge:${mcVersion}-${forgeVersion}` },
                { name: "net.minecraft:launchwrapper:1.12" },
                { name: "org.ow2.asm:asm-all:5.0.3" },
                { name: "org.scala-lang:scala-library:2.11.1" },
                { name: "org.scala-lang:scala-compiler:2.11.1" },
                { name: "lzma:lzma:0.0.1" }
            ]
        };
        await fs.writeFile(path.join(versionDir, `${versionName}.json`), JSON.stringify(versionJson, null, 2));
        console.log("[FORGE-LEGACY] Wrote custom version.json");
        const universalUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${mcVersion}-${forgeVersion}/forge-${mcVersion}-${forgeVersion}-universal.jar`;
        const destJar = path.join(sharedPath, "libraries", "net", "minecraftforge", "forge", `${mcVersion}-${forgeVersion}`, `forge-${mcVersion}-${forgeVersion}.jar`);
        if (!require("fs").existsSync(destJar)) {
            console.log("[FORGE-LEGACY] Downloading Universal JAR from:", universalUrl);
            if (mainWindow) mainWindow.webContents.send("launch-status", "Downloading Legacy Forge...");
            const buf = await fetchBuffer(universalUrl, "Forge Universal JAR");
            require("fs").mkdirSync(path.dirname(destJar), { recursive: true });
            await fs.writeFile(destJar, buf);
            console.log("[FORGE-LEGACY] Downloaded universal JAR successfully.");
        } else console.log("[FORGE-LEGACY] Universal JAR already exists.");
        console.log("[FORGE-LEGACY] Install complete:", versionName);
        return versionName;
    } catch (err) {
        console.error("[FORGE-LEGACY] FATAL ERROR:", err);
        throw err;
    }
}
async function setupNeoForge(rootPath, mcVersion, loaderVersion, javaPath) {
    let version = loaderVersion;
    if (!version) {
        mainWindow.webContents.send("launch-status", "Fetching NeoForge version...");
        const data = await fetchJson(`https://bmclapi2.bangbang93.com/neoforge/list/${mcVersion}`);
        if (!data || data.length === 0) throw new Error("No NeoForge found for this version");
        version = data[data.length - 1].version;
    }
    const installerName = `neoforge-${version}-installer.jar`;
    const installerPath = path.join(sharedPath, installerName);
    const customVersionName = `neoforge-${version}`;
    const customVersionJson = path.join(sharedPath, "versions", customVersionName, `${customVersionName}.json`);
    if (!require("fs").existsSync(customVersionJson)) {
        if (!require("fs").existsSync(installerPath)) {
            const installerUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/${installerName}`;
            mainWindow.webContents.send("launch-status", "Downloading NeoForge Installer...");
            const buffer = await fetchBuffer(installerUrl, "Downloading NeoForge Installer");
            await fs.writeFile(installerPath, buffer);
        }
        const profilesPath = path.join(sharedPath, "launcher_profiles.json");
        if (!require("fs").existsSync(profilesPath)) await fs.writeFile(profilesPath, "{}");
        mainWindow.webContents.send("launch-status", "Installing NeoForge (this may take a few minutes!)...");
        const { spawn } = require("child_process");
        console.log("[LAUNCH] Running NeoForge installer natively...");
        try {
            await new Promise((resolve, reject) => {
                const child = spawn(javaPath, [
                    "-jar",
                    installerPath,
                    "--installClient",
                    sharedPath
                ]);
                let errorOutput = "";
                child.stderr.on("data", (d) => {
                    errorOutput += d.toString();
                });
                let stdoutBuffer = "";
                child.stdout.on("data", (d) => {
                    stdoutBuffer += d.toString();
                    const lines = stdoutBuffer.split("\n");
                    stdoutBuffer = lines.pop();
                    for (const line of lines) if (line.includes("Downloading")) mainWindow.webContents.send("launch-status", line.trim());
                });
                child.on("close", (code) => {
                    if (code === 0) resolve();
                    else reject(/* @__PURE__ */ new Error("Installer exited with code " + code + ": " + errorOutput.substring(0, 500)));
                });
                child.on("error", reject);
            });
        } catch (err) {
            console.error("[NEOFORGE] Native install failed:", err);
            throw new Error("NeoForge installation failed: " + err.message);
        }
    }
    return customVersionName;
}
async function launchXMCL({ rootPath, customVersionName, mcAccount, javaPath, ram, targetId, targetVersion }) {
    const { installDependenciesTask, InstallJarTask } = require("@xmcl/installer");
    const folder = MinecraftFolder.from(rootPath);
    const sharedFolder = MinecraftFolder.from(sharedPath);
    const resolvedVersion = await Version.parse(sharedFolder, customVersionName);
    const arch = require("os").arch();
    resolvedVersion.libraries = resolvedVersion.libraries.filter((lib) => {
        if (lib.name.includes("natives-")) {
            const isArm64 = lib.name.includes("arm64");
            const isX86 = lib.name.includes("x86") || lib.name.includes("x32");
            if (arch === "x64") {
                if (isArm64 || isX86) return false;
            } else if (arch === "arm64") {
                if (!isArm64) return false;
            } else if (arch === "ia32") {
                if (!isX86) return false;
            }
        }
        return true;
    });
    const fs5 = require("fs");
    const path0 = require("path");
    const resolvedVersionStr = customVersionName || targetVersion;
    const versionDir = path0.join(sharedPath, "versions", resolvedVersionStr);
    const vanillaJarPath = path0.join(sharedPath, "versions", targetVersion, targetVersion + ".jar");
    const installedFlagPath = path0.join(versionDir, "installed_version.txt");
    let isInstalled = false;
    if (fs5.existsSync(versionDir) && fs5.existsSync(vanillaJarPath) && fs5.existsSync(installedFlagPath)) {
        if (fs5.readFileSync(installedFlagPath, "utf-8").trim() === resolvedVersionStr) isInstalled = true;
    }
    if (isInstalled) {
        console.log(`[LAUNCH] Fast launch: Skipping dependency resolution for ${resolvedVersionStr} because it is fully installed.`);
        mainWindow.webContents.send("launch-status", "Fast Launch: Skipping file checks...");
    } else {
        console.log("[XMCL] Installing missing dependencies...");
        mainWindow.webContents.send("launch-status", "Verifying game files...");
        const indexesDir = path0.join(sharedPath, "assets", "indexes");
        if (!fs5.existsSync(indexesDir)) fs5.mkdirSync(indexesDir, { recursive: true });
        console.log(`[LAUNCH] Resolving dependencies for ${resolvedVersionStr}...`);
        let retries = 5;
        while (retries > 0) try {
            const task = installDependenciesTask(await Version.parse(MinecraftFolder.from(sharedPath), customVersionName), {
                side: "client",
                maxConcurrency: 16
            });
            console.log(`[DEBUG] Task instantiated, startAndWait...`);
            await task.startAndWait({
                onUpdate: (childTask, chunkSize) => {
                    if (childTask.total > 0) {
                        const percentage = Math.round(childTask.progress / childTask.total * 100);
                        const isDownloading = chunkSize > 0;
                        const label = isDownloading
                            ? `Downloading missing files... ${percentage}%`
                            : `Verifying files... ${percentage}%`;
                        mainWindow.webContents.send("launch-status", label);
                    } else mainWindow.webContents.send("launch-status", `Verifying files... (${childTask.progress} checked)`);
                },
                onFailed: (childTask, error) => {
                    console.log(`[XMCL TASK] Failed: ${childTask.name}`, error.message);
                }
            });
            console.log(`[DEBUG] task.startAndWait completed successfully`);
            await new InstallJarTask(await Version.parse(MinecraftFolder.from(sharedPath), targetVersion), sharedFolder, { side: "client" }).startAndWait();
            mainWindow.webContents.send("launch-status", "Building Launch Command...");
            console.log("[XMCL] Dependencies installed successfully.");
            if (!fs5.existsSync(versionDir)) fs5.mkdirSync(versionDir, { recursive: true });
            fs5.writeFileSync(installedFlagPath, resolvedVersionStr, "utf-8");
            break;
        } catch (e) {
            console.warn("[XMCL] Dependencies install warning/error:", e.message || e);
            retries--;
            if (retries === 0) console.warn("[XMCL] Out of retries, continuing anyway but the game might be missing files!");
            else {
                console.log("[XMCL] Retrying download...");
                mainWindow.webContents.send("launch-status", `Download failed, retrying... (${retries} left)`);
            }
        }
    }
    const launchOptions = {
        gameProfile: {
            id: mcAccount.uuid,
            name: mcAccount.name
        },
        accessToken: mcAccount.access_token,
        properties: {},
        gamePath: rootPath,
        resourcePath: sharedPath,
        version: resolvedVersionStr || targetVersion,
        javaPath,
        minMemory: 2048,
        maxMemory: parseInt(ram) || 4096,
        gameDirectory: rootPath,
        prechecks: [],
        ignoreInvalidMinecraftCertificates: true,
        ignorePatchDiscrepancies: true
    };
    const nativeRoot = sharedFolder.getNativesRoot(resolvedVersion.id);
    const { execFile } = require("child_process");
    if (!fs5.existsSync(nativeRoot)) fs5.mkdirSync(nativeRoot, { recursive: true });
    for (const lib of resolvedVersion.libraries) if (lib.name.includes("natives-")) {
        const libPath = sharedFolder.getLibraryByPath(lib.download.path);
        if (fs5.existsSync(libPath)) {
            console.log("[XMCL] Extracting native using tar:", libPath);
            try {
                await new Promise((resolve, reject) => {
                    execFile("tar", [
                        "-xf",
                        libPath,
                        "-C",
                        nativeRoot
                    ], (error) => {
                        if (error) reject(error);
                        else resolve();
                    });
                });
            } catch (e) {
                console.error("[XMCL] Extract error:", e);
            }
        }
    }
    if (typeof pendingJoinServer !== "undefined" && pendingJoinServer) {
        const [srvHost, srvPort] = pendingJoinServer.split(":");
        launchOptions.extraExecOption = launchOptions.extraExecOption || {};
        launchOptions.extraMCArgs = [
            "--server",
            srvHost,
            "--port",
            srvPort || "25565"
        ];
        console.log("[INVITE] Auto-connecting to server:", pendingJoinServer);
        pendingJoinServer = null;
    }
    console.log("[XMCL] Building launch command...");
    // const { launch: xmclLaunch } = (init_dist$5(), require_tslib$1.__toCommonJS(dist_exports$1));
    return await xmclLaunch(launchOptions);
}
var runningInstances = /* @__PURE__ */ new Set();
var pendingJoinServer = null;
global.activeTasks = 0;

/**
 * Applies options.txt overrides after game launch and watches for Minecraft
 * rewriting the file (which it does on every startup), re-applying our values.
 */
function applyOptionsOverride(userSettings, rootPath, proc) {
    if (!userSettings.override || !userSettings.mcOptions) return;
    const mc = userSettings.mcOptions;
    const mcFmt = {
        fov: mc.fov !== undefined ? ((mc.fov - 70) / 40).toFixed(5) : undefined,
        renderDistance: mc.renderDistance,
        maxFps: mc.maxFps,
        soundCategory_master: mc.masterVolume !== undefined ? (mc.masterVolume / 100).toFixed(1) : undefined,
        soundCategory_music: mc.volMusic !== undefined ? (mc.volMusic / 100).toFixed(1) : undefined,
        soundCategory_record: mc.volRecord !== undefined ? (mc.volRecord / 100).toFixed(1) : undefined,
        soundCategory_weather: mc.volWeather !== undefined ? (mc.volWeather / 100).toFixed(1) : undefined,
        soundCategory_block: mc.volBlock !== undefined ? (mc.volBlock / 100).toFixed(1) : undefined,
        soundCategory_hostile: mc.volHostile !== undefined ? (mc.volHostile / 100).toFixed(1) : undefined,
        soundCategory_neutral: mc.volNeutral !== undefined ? (mc.volNeutral / 100).toFixed(1) : undefined,
        soundCategory_player: mc.volPlayer !== undefined ? (mc.volPlayer / 100).toFixed(1) : undefined,
        soundCategory_ambient: mc.volAmbient !== undefined ? (mc.volAmbient / 100).toFixed(1) : undefined,
        soundCategory_voice: mc.volVoice !== undefined ? (mc.volVoice / 100).toFixed(1) : undefined
    };
    const targetOptions = require("path").join(rootPath, "options.txt");
    const doApply = async () => {
        try {
            let lines = [];
            let originalContent = "";
            if (require("fs").existsSync(targetOptions)) {
                originalContent = await require("fs").promises.readFile(targetOptions, "utf-8");
                lines = originalContent.split("\n");
            }
            let changed = false;
            for (const [key, val] of Object.entries(mcFmt)) {
                if (val === undefined) continue;
                let found = false;
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].startsWith(`${key}:`)) {
                        if (lines[i] !== `${key}:${val}`) {
                            lines[i] = `${key}:${val}`;
                            changed = true;
                        }
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    lines.push(`${key}:${val}`);
                    changed = true;
                }
            }
            const newContent = lines.join("\n");
            if (changed || originalContent !== newContent) {
                await require("fs").promises.writeFile(targetOptions, newContent);
                console.log("[LAUNCH] options.txt override applied.");
            }
        } catch (err) {
            console.error("[LAUNCH] Failed to override options.txt:", err);
        }
    };
    // Apply only once at launch to set the initial preferred options.
    doApply();

    // We don't watch the file anymore because the override is only meant
    // for setting up the instance initially or enforcing it once per start.
}

ipcMain.handle("launch-minecraft", async (event, targetId) => {
    global.activeTasks++;
    try {
        const configPath = path.join(app.getPath("userData"), "Crystalline_Instances", targetId, "config.json");
        const configData = JSON.parse(await fs.readFile(configPath, "utf8"));
        configData.lastPlayed = Date.now();
        await fs.writeFile(configPath, JSON.stringify(configData, null, 2));
    } catch (e) { }

    try {
        console.log("[DEBUG] launch-minecraft called for", targetId);
        let mcAccount = null;
        try {
            console.log("[DEBUG] awaiting auth readFile");
            mcAccount = await readEncryptedFile(path.join(app.getPath("userData"), "auth.json"));
            console.log("[DEBUG] auth readFile complete");
        } catch (e) {
            console.log("[DEBUG] Auth missing");
        }
        if (!mcAccount || !mcAccount.access_token) {
            console.log("[DEBUG] No auth, launching offline");
            mcAccount = {
                uuid: "00000000000000000000000000000000",
                name: "Player",
                access_token: "0"
            };
        }
        const instancesPath = path.join(app.getPath("userData"), "Crystalline_Instances");
        console.log("[DEBUG] Instances path:", instancesPath);
        if (!targetId) try {
            console.log("[DEBUG] awaiting readdir instances");
            const folders = await fs.readdir(instancesPath, { withFileTypes: true });
            console.log("[DEBUG] readdir instances complete");
            for (const f of folders) if (f.isDirectory()) {
                targetId = f.name;
                break;
            }
        } catch (e) {
            console.log("[LAUNCH] Error reading instances dir:", e.message);
        }
        let targetVersion = "1.21.1";
        let targetLoader = "neoforge";
        let targetLoaderVersion = null;
        if (targetId) try {
            console.log("[DEBUG] awaiting config readFile");
            const configData = await fs.readFile(path.join(instancesPath, targetId, "config.json"), "utf8");
            console.log("[DEBUG] config readFile complete");
            const config = JSON.parse(configData);
            if (config.version) targetVersion = config.version;
            if (config.loader) targetLoader = config.loader;
            if (config.loaderVersion) targetLoaderVersion = config.loaderVersion;
            console.log("[LAUNCH] Config:", targetVersion, targetLoader, targetLoaderVersion);
        } catch (e) {
            console.log("[LAUNCH] Could not read config for", targetId, "- using fallback");
        }
        else targetId = "Default";
        const rootPath = path.join(instancesPath, targetId);
        if (runningInstances.has(targetId)) return {
            success: false,
            error: `The instance "${targetId}" is already running!`
        };
        runningInstances.add(targetId);
        const settingsPath = path.join(app.getPath("userData"), "settings.json");
        let userSettings = {
            ram: "4G",
            javaPath: "",
            vanillaPath: "",
            skipVanillaPrompt: false
        };
        try {
            console.log("[DEBUG] awaiting settings readFile");
            const data = await fs.readFile(settingsPath, "utf8");
            console.log("[DEBUG] settings readFile complete");
            userSettings = {
                ...userSettings,
                ...JSON.parse(data)
            };
        } catch (e) {
            console.log("[LAUNCH] Settings read failed (using defaults)");
        }
        let javaPath = userSettings.javaPath && userSettings.javaPath.trim() !== "" ? userSettings.javaPath.trim() : null;
        if (!javaPath) {
            console.log("[DEBUG] Determining Java path...");
            let minor = 0;
            let major = 1;
            if (targetVersion.startsWith("1.")) minor = parseInt(targetVersion.split(".")[1] || 0);
            else {
                major = parseInt(targetVersion.split(".")[0] || 0);
                minor = parseInt(targetVersion.split(".")[1] || 0);
            }
            let requiredJava = 8;
            if (major === 1) {
                if (minor >= 17 && minor < 20) requiredJava = 17;
                else if (minor === 20) requiredJava = parseInt(targetVersion.split(".")[2] || 0) >= 5 ? 21 : 17;
                else if (minor >= 21 && minor <= 24) requiredJava = 21;
                else if (minor >= 25) requiredJava = 25;
            } else if (major >= 25) requiredJava = 25;
            else if (major >= 24) requiredJava = 21;
            console.log(`[LAUNCH] Ensuring Java ${requiredJava}...`);
            console.log("[DEBUG] awaiting ensureJava");
            javaPath = await ensureJava(requiredJava);
            console.log("[DEBUG] ensureJava complete, path:", javaPath);
        }
        const ramMb = parseInt((userSettings.ram || "4G").replace(/[Gg]/, "")) * 1024;
        const setRunningState = () => {
            if (mainWindow) mainWindow.webContents.send("launch-status", "Game is running...");
            try {
                rpc.setActivity({
                    details: "Playing Crystalline",
                    state: "Version " + targetVersion,
                    startTimestamp: /* @__PURE__ */ new Date(),
                    largeImageKey: "icon_large",
                    largeImageText: "Crystalline",
                    instance: true
                });
            } catch (e) { }
        };
        let lastErrorLog = "";
        const setClosedState = (code) => {
            runningInstances.delete(targetId);
            if (code === 0 || code === null || code === undefined) {
                if (mainWindow) mainWindow.webContents.send("launch-status", "Closed");
            } else {
                if (mainWindow) mainWindow.webContents.send("launch-status", `Crashed: Process exited with code ${code}\n\n${lastErrorLog}`);
            }
            try {
                rpc.setActivity({
                    details: "In Launcher",
                    state: "Preparing for an adventure",
                    startTimestamp: /* @__PURE__ */ new Date()
                });
            } catch (e) { }
        };
        const vanillaVersionDir = path.join(sharedPath, "versions", targetVersion);
        const vanillaJsonPath = path.join(vanillaVersionDir, `${targetVersion}.json`);
        if (!require("fs").existsSync(vanillaJsonPath)) {
            console.log(`[LAUNCH] Fetching vanilla version.json for ${targetVersion}...`);
            if (mainWindow) mainWindow.webContents.send("launch-status", "Fetching Vanilla manifest...");
            try {
                const versionMeta = (await (await fetch("https://launchermeta.mojang.com/mc/game/version_manifest.json")).json()).versions.find((v) => v.id === targetVersion);
                if (versionMeta && versionMeta.url) {
                    const vJson = await (await fetch(versionMeta.url)).text();
                    require("fs").mkdirSync(vanillaVersionDir, { recursive: true });
                    await require("fs").promises.writeFile(vanillaJsonPath, vJson);
                    console.log(`[LAUNCH] Successfully saved ${targetVersion}.json`);
                } else console.warn(`[LAUNCH] Could not find vanilla manifest entry for ${targetVersion}`);
            } catch (e) {
                console.error("[LAUNCH] Failed to fetch vanilla json:", e);
            }
        }
        if (targetLoader === "forge") {
            console.log("[LAUNCH] Setting up Forge...");
            console.log("[DEBUG] awaiting setupForge");
            if (targetVersion.startsWith("1.7.")) {
                const modsDir = require("path").join(instancesPath, targetId, "mods");
                await require("fs").promises.mkdir(modsDir, { recursive: true }).catch(() => { });
                const fixerPath = require("path").join(modsDir, "legacyjavafixer-1.0.jar");
                if (!require("fs").existsSync(fixerPath)) {
                    console.log("[LAUNCH] Downloading LegacyJavaFixer for 1.7.x compatibility...");
                    if (mainWindow) mainWindow.webContents.send("launch-status", "Downloading Java 8 Fixer...");
                    try {
                        const buf = await fetchBuffer("https://maven.minecraftforge.net/net/minecraftforge/lex/legacyjavafixer/1.0/legacyjavafixer-1.0.jar", "LegacyJavaFixer");
                        await require("fs").promises.writeFile(fixerPath, buf);
                    } catch (err) {
                        console.error("[LAUNCH] Failed to download LegacyJavaFixer:", err);
                    }
                }
            }
            if (userSettings.override && userSettings.mcOptions) try {
                const mc = userSettings.mcOptions;
                const mcFmt = {
                    fov: mc.fov !== undefined ? ((mc.fov - 70) / 40).toFixed(5) : undefined,
                    renderDistance: mc.renderDistance,
                    maxFps: mc.maxFps,
                    soundCategory_master: mc.masterVolume !== undefined ? (mc.masterVolume / 100).toFixed(1) : undefined,
                    soundCategory_music: mc.volMusic !== undefined ? (mc.volMusic / 100).toFixed(1) : undefined,
                    soundCategory_record: mc.volRecord !== undefined ? (mc.volRecord / 100).toFixed(1) : undefined,
                    soundCategory_weather: mc.volWeather !== undefined ? (mc.volWeather / 100).toFixed(1) : undefined,
                    soundCategory_block: mc.volBlock !== undefined ? (mc.volBlock / 100).toFixed(1) : undefined,
                    soundCategory_hostile: mc.volHostile !== undefined ? (mc.volHostile / 100).toFixed(1) : undefined,
                    soundCategory_neutral: mc.volNeutral !== undefined ? (mc.volNeutral / 100).toFixed(1) : undefined,
                    soundCategory_player: mc.volPlayer !== undefined ? (mc.volPlayer / 100).toFixed(1) : undefined,
                    soundCategory_ambient: mc.volAmbient !== undefined ? (mc.volAmbient / 100).toFixed(1) : undefined,
                    soundCategory_voice: mc.volVoice !== undefined ? (mc.volVoice / 100).toFixed(1) : undefined
                };
                const targetOptions = require("path").join(rootPath, "options.txt");
                let lines = [];
                if (require("fs").existsSync(targetOptions)) lines = (await require("fs").promises.readFile(targetOptions, "utf-8")).split("\n");
                for (const [key, val] of Object.entries(mcFmt)) {
                    if (val === undefined) continue;
                    let found = false;
                    for (let i = 0; i < lines.length; i++) if (lines[i].startsWith(`${key}:`)) {
                        lines[i] = `${key}:${val}`;
                        found = true;
                        break;
                    }
                    if (!found) lines.push(`${key}:${val}`);
                }
                await require("fs").promises.writeFile(targetOptions, lines.join("\n"));
            } catch (err) {
                console.error("[LAUNCH] Failed to override options.txt:", err);
            }
            const forgeVersionId = await setupForge(rootPath, targetVersion, targetLoaderVersion, javaPath);
            console.log("[DEBUG] setupForge complete, result:", forgeVersionId);
            console.log("[DEBUG] awaiting launchXMCL");
            const proc = await launchXMCL({
                rootPath,
                customVersionName: forgeVersionId,
                mcAccount,
                javaPath,
                ram: ramMb,
                targetId,
                targetVersion
            });
            console.log("[DEBUG] launchXMCL complete");
            proc.stdout.on("data", (d) => {
                const line = d.toString();
                console.log(`[XMCL] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            proc.stderr.on("data", (d) => {
                const line = d.toString();
                lastErrorLog += line;
                if (lastErrorLog.length > 3000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 3000);
                console.error(`[XMCL ERR] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            proc.on("close", setClosedState);
            proc.on("error", (err) => {
                runningInstances.delete(targetId);
                if (mainWindow) mainWindow.webContents.send("launch-status", `Launch Error: ${err.message}`);
            });
            runningInstances.add(targetId);
            setRunningState();
            return { success: true };
        }
        if (targetLoader === "neoforge") {
            console.log("[LAUNCH] Setting up NeoForge...");
            const customVersionName = await setupNeoForge(rootPath, targetVersion, targetLoaderVersion, javaPath);
            console.log("[DEBUG] setupNeoForge complete, result:", customVersionName);
            console.log("[DEBUG] awaiting launchXMCL");
            const proc = await launchXMCL({
                rootPath,
                customVersionName,
                mcAccount,
                javaPath,
                ram: ramMb,
                targetId,
                targetVersion
            });
            console.log("[DEBUG] launchXMCL complete");
            proc.stdout.on("data", (d) => {
                const line = d.toString();
                console.log(`[XMCL] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            proc.stderr.on("data", (d) => {
                const line = d.toString();
                lastErrorLog += line;
                if (lastErrorLog.length > 3000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 3000);
                console.error(`[XMCL ERR] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            applyOptionsOverride(userSettings, rootPath, proc);
            proc.on("close", setClosedState);
            proc.on("error", (err) => {
                runningInstances.delete(targetId);
                if (mainWindow) mainWindow.webContents.send("launch-status", `Launch Error: ${err.message}`);
            });
            runningInstances.add(targetId);
            setRunningState();
            return { success: true };
        }

        if (targetLoader === "fabric") {
            console.log("[LAUNCH] Setting up Fabric...");
            const customVersionName = await setupFabric(rootPath, targetVersion, targetLoaderVersion, javaPath);
            console.log("[DEBUG] setupFabric complete, result:", customVersionName);
            console.log("[DEBUG] awaiting launchXMCL");
            const proc = await launchXMCL({
                rootPath,
                customVersionName,
                mcAccount,
                javaPath,
                ram: ramMb,
                targetId,
                targetVersion
            });
            console.log("[DEBUG] launchXMCL complete");
            proc.stdout.on("data", (d) => {
                const line = d.toString();
                console.log(`[XMCL] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            proc.stderr.on("data", (d) => {
                const line = d.toString();
                lastErrorLog += line;
                if (lastErrorLog.length > 3000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 3000);
                console.error(`[XMCL ERR] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            applyOptionsOverride(userSettings, rootPath, proc);
            proc.on("close", setClosedState);
            proc.on("error", (err) => {
                runningInstances.delete(targetId);
                if (mainWindow) mainWindow.webContents.send("launch-status", `Launch Error: ${err.message}`);
            });
            runningInstances.add(targetId);
            setRunningState();
            return { success: true };
        }

        if (targetLoader === "vanilla") {
            console.log("[LAUNCH] Setting up Vanilla...");
            console.log("[DEBUG] awaiting launchXMCL");
            const proc = await launchXMCL({
                rootPath,
                customVersionName: targetVersion,
                mcAccount,
                javaPath,
                ram: ramMb,
                targetId,
                targetVersion
            });
            console.log("[DEBUG] launchXMCL complete");
            proc.stdout.on("data", (d) => {
                const line = d.toString();
                console.log(`[XMCL] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            proc.stderr.on("data", (d) => {
                const line = d.toString();
                lastErrorLog += line;
                if (lastErrorLog.length > 3000) lastErrorLog = lastErrorLog.substring(lastErrorLog.length - 3000);
                console.error(`[XMCL ERR] ${line.trim()}`);
                if (mainWindow) mainWindow.webContents.send("mc-log", line);
            });
            applyOptionsOverride(userSettings, rootPath, proc);
            proc.on("close", setClosedState);
            proc.on("error", (err) => {
                runningInstances.delete(targetId);
                if (mainWindow) mainWindow.webContents.send("launch-status", `Launch Error: ${err.message}`);
            });
            runningInstances.add(targetId);
            setRunningState();
            return { success: true };
        }

        if (userSettings.override && userSettings.mcOptions) try {
            const targetOptions = require("path").join(rootPath, "options.txt");
            let lines = [];
            if (require("fs").existsSync(targetOptions)) lines = (await require("fs").promises.readFile(targetOptions, "utf-8")).split("\n");
            for (const [key, val] of Object.entries(userSettings.mcOptions)) {
                let found = false;
                for (let i = 0; i < lines.length; i++) if (lines[i].startsWith(`${key}:`)) {
                    lines[i] = `${key}:${val}`;
                    found = true;
                    break;
                }
                if (!found) lines.push(`${key}:${val}`);
            }
            await require("fs").promises.writeFile(targetOptions, lines.join("\n"));
        } catch (err) {
            console.error("[LAUNCH] Failed to override options.txt:", err);
        }

        if (pendingJoinServer) {
            const [srvHost, srvPort] = pendingJoinServer.split(":");
            opts.customArgs = opts.customArgs || [];
            opts.customArgs.push("--server", srvHost, "--port", srvPort || "25565");
            console.log("[INVITE] MCLC auto-connecting to:", pendingJoinServer);
            pendingJoinServer = null;
        }
        console.log("[LAUNCH] Calling MCLC launcher.launch()...");
        mainWindow.webContents.send("launch-status", "Starting...");
        await launcher.launch(opts);
        
        // Clean up installer logs
        try {
            const fs = require("fs").promises;
            const logPaths = [rootPath, process.cwd()];
            for (const dir of logPaths) {
                const files = await fs.readdir(dir).catch(() => []);
                for (const file of files) {
                    if (file.toLowerCase().includes("installer.log") || file === "installer.log") {
                        await fs.rm(require("path").join(dir, file), { force: true }).catch(() => {});
                    }
                }
            }
        } catch(e) { console.error("[CLEANUP] Failed to clean installer logs", e); }

        setRunningState();
        console.log("[LAUNCH] Game launched successfully");
        return { success: true };
    } catch (err) {
        console.error("[LAUNCH] Error in launch-minecraft handler:", err);
        const msg = err && err.message ? err.message : String(err);
        if (mainWindow) mainWindow.webContents.send("launch-status", "Launch Failed: " + msg);
        return {
            success: false,
            error: msg
        };
    } finally {
        global.activeTasks--;
    }
});
ipcMain.handle("create-instance", async (event, options) => {
    const { name, version, loader } = options;
    const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", name);
    try {
        await fs.mkdir(instancePath, { recursive: true });
        const config = {
            name,
            version: version || "1.20.1",
            loader: loader || "vanilla",
            loaderVersion: options.loaderVersion || null,
            created: Date.now()
        };
        await fs.writeFile(path.join(instancePath, "config.json"), JSON.stringify(config, null, 2));
        await fs.mkdir(path.join(instancePath, "mods"), { recursive: true }).catch(() => { });
        await fs.mkdir(path.join(instancePath, "resourcepacks"), { recursive: true }).catch(() => { });
        await fs.mkdir(path.join(instancePath, "shaderpacks"), { recursive: true }).catch(() => { });
        await fs.mkdir(path.join(instancePath, "saves"), { recursive: true }).catch(() => { });
        return { success: true };
    } catch (err) {
        console.error("Instance creation error:", err);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("download-modrinth-file", async (event, url, instanceId, folderName, fileName) => {
    global.activeTasks++;
    try {
        const instancesPath = path.join(app.getPath("userData"), "Crystalline_Instances");
        const targetFolder = path.join(instancesPath, instanceId, folderName);
        await fs.mkdir(targetFolder, { recursive: true });
        const targetFile = path.join(targetFolder, fileName);
        const buffer = await fetchBuffer(url, `Downloading ${fileName}`);
        await fs.writeFile(targetFile, buffer);
        return { success: true };
    } catch (err) {
        console.error("[MODRINTH DOWNLOAD ERROR]", err);
        return {
            success: false,
            error: err.message
        };
    } finally {
        global.activeTasks--;
    }
});
ipcMain.handle("check-modpack-installed", async () => {
    try {
        const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", "default");
        const marker = path.join(instancePath, "modpack_installed.txt");
        await fs.access(marker);
        return true;
    } catch (err) {
        return false;
    }
});
ipcMain.handle("check-modpack-update", async () => {
    try {
        let remoteInfo;
        try {
            const localPath = path.join(app.getAppPath(), "modpack_info.json");
            const localData = await fs.readFile(localPath, "utf8");
            remoteInfo = JSON.parse(localData);
            console.log("Using LOCAL modpack_info.json for update check");
        } catch (e) {
            remoteInfo = await fetchJson("https://raw.githubusercontent.com/Minenblock/crystalline-launcher/main/modpack_info.json");
        }
        if (!remoteInfo || !remoteInfo.version || !remoteInfo.url) return {
            success: false,
            error: "Invalid remote info"
        };
        const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", "default");
        const versionPath = path.join(instancePath, "modpack_version.txt");
        let localVersion = null;
        try {
            localVersion = await fs.readFile(versionPath, "utf8");
            localVersion = localVersion.trim();
        } catch (e) { }
        let isInstalled = false;
        try {
            await fs.access(path.join(instancePath, "modpack_installed.txt"));
            isInstalled = true;
        } catch (e) { }
        return {
            success: true,
            isInstalled,
            localVersion,
            remoteVersion: remoteInfo.version,
            downloadUrl: remoteInfo.url,
            updateAvailable: isInstalled && localVersion !== remoteInfo.version
        };
    } catch (err) {
        console.error("Update check failed:", err);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("install-official-modpack", async (event, url, version) => {
    global.activeTasks++;
    try {
        const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", "default");
        await fs.mkdir(instancePath, { recursive: true });
        const zipPath = path.join(instancePath, "temp_modpack.zip");
        let finalUrl = url;
        if (finalUrl.includes("drive.google.com/file/d/")) {
            const match = finalUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
            if (match) finalUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
        }
        event.sender.send("launch-status", "Downloading Official Modpack...");
        const buffer = await fetchBuffer(finalUrl, "Downloading Modpack");
        await fs.writeFile(zipPath, buffer);
        const result = await processModpackZip(zipPath, "default", event.sender);
        if (!result.success) throw new Error("Failed to process modpack: " + result.error);
        await fs.rm(zipPath, { force: true });
        await fs.writeFile(path.join(instancePath, "modpack_installed.txt"), "installed");
        if (version) await fs.writeFile(path.join(instancePath, "modpack_version.txt"), version);
        const configPath = path.join(instancePath, "config.json");
        const config = {
            name: "Crystalline",
            version: "1.21.1",
            loader: "neoforge",
            loaderVersion: "21.1.230",
            created: Date.now()
        };
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        console.error("Error installing modpack:", err);
        return { success: false, error: err.message };
    } finally {
        global.activeTasks--;
    }
});

ipcMain.handle("force-quit", async () => {
    global.activeTasks = 0;
    app.isQuitting = true;
    app.quit();
});

ipcMain.handle("quit-app", async () => {
    app.isQuitting = true;
    app.quit();
});

ipcMain.handle("show-main-window", async () => {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
    }
    if (trayWindow) trayWindow.hide();
});

ipcMain.handle("show-settings", async () => {
    if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send("navigate-to", "settings");
    }
    if (trayWindow) trayWindow.hide();
});

ipcMain.handle("repair-instance", async (event, instanceId) => {
    try {
        const libsDir = path.join(sharedPath, "libraries");
        const versDir = path.join(sharedPath, "versions");

        await fs.rm(libsDir, { recursive: true, force: true }).catch(() => { });
        await fs.rm(versDir, { recursive: true, force: true }).catch(() => { });

        return { success: true };
    } catch (err) {
        console.error("Repair error:", err);
        return { success: false, error: err.message };
    }
});

ipcMain.handle("reset-instance-lock", async (event, instanceId) => {
    if (instanceId) runningInstances.delete(instanceId);
    else runningInstances.clear();
    return { success: true };
});

ipcMain.handle("get-instances", async () => {
    const instancesPath = path.join(app.getPath("userData"), "Crystalline_Instances");
    console.log(`[INSTANCES] Scanning path: ${instancesPath}`);
    try {
        const folders = await fs.readdir(instancesPath, { withFileTypes: true });
        const instances = [];
        for (const folder of folders) if (folder.isDirectory()) try {
            const configPath = path.join(instancesPath, folder.name, "config.json");
            const configData = await fs.readFile(configPath, "utf8");
            instances.push({
                id: folder.name,
                ...JSON.parse(configData)
            });
        } catch (e) {
            console.warn(`[INSTANCES] Missing or invalid config.json for ${folder.name}`);
            instances.push({
                id: folder.name,
                name: folder.name,
                version: "Unknown",
                loader: "vanilla"
            });
        }
        console.log(`[INSTANCES] Found instances:`, instances);
        return {
            success: true,
            instances
        };
    } catch (err) {
        console.error(`[INSTANCES] Failed to read instances:`, err.message);
        return {
            success: true,
            instances: []
        };
    }
});
ipcMain.handle("open-instance-folder", async (event, instanceId) => {
    const instancesPath = path.join(app.getPath("userData"), "Crystalline_Instances");
    const instancePath = path.join(instancesPath, instanceId);
    try {
        await shell.openPath(instancePath);
        return { success: true };
    } catch (e) {
        console.error("Could not open path:", e);
        return { success: false };
    }
});
ipcMain.handle("delete-instance", async (event, instanceId) => {
    const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId);
    try {
        await shell.trashItem(instancePath);
        return { success: true };
    } catch (e) {
        console.error("Could not move instance to trash:", e);
        return {
            success: false,
            error: e.message || String(e)
        };
    }
});
ipcMain.handle("get-instance-contents", async (event, instanceId) => {
    const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId);
    const contents = {
        worlds: [],
        mods: [],
        resourcepacks: [],
        shaderpacks: []
    };
    const safeReaddir = async (dir) => {
        try {
            return (await fs.readdir(path.join(instancePath, dir), { withFileTypes: true })).map((f) => f.name);
        } catch (e) {
            return [];
        }
    };
    contents.worlds = await safeReaddir("saves");
    contents.mods = await safeReaddir("mods");
    contents.resourcepacks = await safeReaddir("resourcepacks");
    contents.shaderpacks = await safeReaddir("shaderpacks");
    return contents;
});
ipcMain.handle("delete-instance-file", async (event, instanceId, folder, fileName) => {
    try {
        const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId);
        if (![
            "saves",
            "mods",
            "resourcepacks",
            "shaderpacks"
        ].includes(folder)) return {
            success: false,
            error: "Invalid folder"
        };
        const targetPath = path.join(instancePath, folder, fileName);
        if (!targetPath.startsWith(path.join(instancePath, folder))) return {
            success: false,
            error: "Invalid path"
        };
        await shell.trashItem(targetPath);
        return { success: true };
    } catch (err) {
        console.error("[LAUNCH] Error deleting file:", err);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("get-mc-versions", async () => {
    try {
        return {
            success: true,
            versions: (await httpsGet("launchermeta.mojang.com", "/mc/game/version_manifest.json")).versions
        };
    } catch (e) {
        return {
            success: false,
            error: e.message
        };
    }
});
ipcMain.handle("get-loader-versions", async (event, mcVersion, loader) => {
    try {
        if (loader === "neoforge") {
            const res = await fetch(`https://bmclapi2.bangbang93.com/neoforge/list/${mcVersion}`);
            if (!res.ok) throw new Error("API error");
            return {
                success: true,
                versions: (await res.json()).map((v) => v.version).reverse()
            };
        } else if (loader === "forge") {
            const res = await fetch(`https://bmclapi2.bangbang93.com/forge/minecraft/${mcVersion}`);
            if (!res.ok) throw new Error("API error");
            return {
                success: true,
                versions: (await res.json()).map((v) => v.version)
            };
        } else if (loader === "fabric") {
            const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${mcVersion}`);
            if (!res.ok) throw new Error("API error");
            return {
                success: true,
                versions: (await res.json()).map((v) => v.loader.version)
            };
        }
        return {
            success: true,
            versions: []
        };
    } catch (e) {
        console.error(`Failed to get loader versions for ${loader} ${mcVersion}:`, e);
        return {
            success: false,
            error: e.message
        };
    }
});
async function processModpackZip(zipPath, instanceName, sender) {
    const instancePath = path.join(app.getPath("userData"), "Crystalline_Instances", instanceName);
    const tempPath = path.join(app.getPath("temp"), `import_${Date.now()}`);
    try {
        sender.send("launch-status", "Preparing extraction...");
        await fs.mkdir(instancePath, { recursive: true });
        await fs.mkdir(tempPath, { recursive: true });
        sender.send("launch-status", "Extracting modpack archive...");
        await new Promise((resolve, reject) => {
            const { execFile } = require("child_process");
            execFile("tar", [
                "-xf",
                zipPath,
                "-C",
                tempPath
            ], (error) => {
                if (error) reject(error);
                else resolve();
            });
        });
        const files = await fs.readdir(tempPath);
        let mcVersion = "Unknown";
        let loader = "vanilla";
        let loaderVersion = "Unknown";

        let format = "unknown";
        if (files.includes("manifest.json")) format = "curseforge";
        else if (files.includes("modrinth.index.json")) format = "modrinth";
        else if (files.includes("mmc-pack.json") || files.includes("instance.cfg")) format = "prism";

        let isSuccess = false;
        let errorMessage = "Unknown modpack format";

        if (format === "curseforge") {
            mainWindow.webContents.send("launch-status", "Reading CurseForge manifest...");
            const manifestStr = await fs.readFile(path.join(tempPath, "manifest.json"), "utf8");
            const manifest = JSON.parse(manifestStr);

            if (manifest.minecraft) {
                mcVersion = manifest.minecraft.version || "Unknown";
                if (manifest.minecraft.modLoaders && manifest.minecraft.modLoaders.length > 0) {
                    const primary = manifest.minecraft.modLoaders.find(l => l.primary) || manifest.minecraft.modLoaders[0];
                    if (primary.id) {
                        const parts = primary.id.split("-");
                        loader = parts[0];
                        if (parts.length > 1) loaderVersion = parts.slice(1).join("-");
                    }
                }
            }

            const modsPath = path.join(instancePath, "mods");
            await fs.rm(modsPath, { recursive: true, force: true }).catch(() => { });
            await fs.mkdir(modsPath, { recursive: true });
            const apiKey = "$2a$10$pimcMzR6cxbjEFAdC7T/y.ch56z3ZK4pRpmaMFH/vDv.Xi6qeUTTG";
            let count = 0;
            const total = manifest.files.length;
            for (const file of manifest.files) {
                count++;
                mainWindow.webContents.send("launch-status", `Downloading mods (${count}/${total})...`);
                try {
                    const res = await myNodeFetch(`https://api.curseforge.com/v1/mods/${file.projectID}/files/${file.fileID}`, { headers: { "x-api-key": apiKey } });
                    if (res.ok) {
                        const data = await res.json();
                        let dlUrl = data.data.downloadUrl;
                        if (!dlUrl) {
                            console.log("No download URL for", file.projectID);
                            continue;
                        }
                        const buffer = await (await myNodeFetch(dlUrl)).arrayBuffer();
                        await fs.writeFile(path.join(modsPath, data.data.fileName), Buffer.from(buffer));
                    }
                } catch (e) {
                    console.error("Failed to download mod", file.projectID, e);
                }
            }
            if (files.includes(manifest.overrides)) {
                mainWindow.webContents.send("launch-status", "Copying modpack overrides...");
                await fs.cp(path.join(tempPath, manifest.overrides), instancePath, { recursive: true });
            }
            isSuccess = true;
        } else if (format === "modrinth") {
            mainWindow.webContents.send("launch-status", "Reading Modrinth index...");
            const indexStr = await fs.readFile(path.join(tempPath, "modrinth.index.json"), "utf8");
            const index = JSON.parse(indexStr);

            if (index.dependencies) {
                mcVersion = index.dependencies.minecraft || "Unknown";
                if (index.dependencies["fabric-loader"]) { loader = "fabric"; loaderVersion = index.dependencies["fabric-loader"]; }
                else if (index.dependencies.forge) { loader = "forge"; loaderVersion = index.dependencies.forge; }
                else if (index.dependencies.neoforge) { loader = "neoforge"; loaderVersion = index.dependencies.neoforge; }
                else if (index.dependencies["quilt-loader"]) { loader = "quilt"; loaderVersion = index.dependencies["quilt-loader"]; }
            }

            let count = 0;
            const total = index.files.length;
            for (const file of index.files) {
                count++;
                mainWindow.webContents.send("launch-status", `Downloading mods (${count}/${total})...`);
                try {
                    const dlUrl = file.downloads[0];
                    const destPath = path.join(instancePath, file.path);
                    await fs.mkdir(path.dirname(destPath), { recursive: true });
                    const modRes = await fetch(dlUrl);
                    if (modRes.ok) {
                        const buffer = await modRes.arrayBuffer();
                        await fs.writeFile(destPath, Buffer.from(buffer));
                    }
                } catch (e) {
                    console.error("Failed to download modrinth file", file.path, e);
                }
            }
            mainWindow.webContents.send("launch-status", "Copying client overrides...");
            for (const overrideDir of ["overrides", "client-overrides"]) if (files.includes(overrideDir)) await fs.cp(path.join(tempPath, overrideDir), instancePath, { recursive: true });
            isSuccess = true;
        } else if (format === "prism") {
            mainWindow.webContents.send("launch-status", "Extracting Prism Launcher pack...");

            if (files.includes("mmc-pack.json")) {
                try {
                    const mmcPackStr = await fs.readFile(path.join(tempPath, "mmc-pack.json"), "utf8");
                    const mmcPack = JSON.parse(mmcPackStr);
                    if (mmcPack.components) {
                        const mcComp = mmcPack.components.find(c => c.uid === "net.minecraft");
                        if (mcComp) mcVersion = mcComp.version;
                        const fabricComp = mmcPack.components.find(c => c.uid === "net.fabricmc.fabric-loader");
                        if (fabricComp) { loader = "fabric"; loaderVersion = fabricComp.version; }
                        const forgeComp = mmcPack.components.find(c => c.uid === "net.minecraftforge");
                        if (forgeComp) { loader = "forge"; loaderVersion = forgeComp.version; }
                        const neoComp = mmcPack.components.find(c => c.uid === "net.neoforged");
                        if (neoComp) { loader = "neoforge"; loaderVersion = neoComp.version; }
                        const quiltComp = mmcPack.components.find(c => c.uid === "org.quiltmc.quilt-loader");
                        if (quiltComp) { loader = "quilt"; loaderVersion = quiltComp.version; }
                    }
                } catch(e) {}
            }

            const prismDirs = ["minecraft", ".minecraft"];
            let foundDir = null;
            for (const dir of prismDirs) if (files.includes(dir)) {
                foundDir = dir;
                break;
            }
            if (foundDir) {
                await fs.cp(path.join(tempPath, foundDir), instancePath, { recursive: true });
                isSuccess = true;
            } else {
                errorMessage = "Could not find minecraft folder in Prism pack.";
            }
        } else if (format === "unknown") {
            let sourceDir = tempPath;
            if (files.includes("minecraft")) sourceDir = path.join(tempPath, "minecraft");
            else if (files.includes(".minecraft")) sourceDir = path.join(tempPath, ".minecraft");
            mainWindow.webContents.send("launch-status", "Installing raw modpack files...");
            await fs.rm(path.join(instancePath, "mods"), { recursive: true, force: true }).catch(() => { });
            await fs.cp(sourceDir, instancePath, { recursive: true });
            isSuccess = true;
        }

        if (isSuccess) {
            const config = {
                name: instanceName,
                version: mcVersion,
                loader: loader,
                loaderVersion: loaderVersion,
                created: Date.now()
            };
            await fs.writeFile(path.join(instancePath, "config.json"), JSON.stringify(config, null, 2));

            mainWindow.webContents.send("launch-status", "Installation complete!");
            return {
                success: true,
                path: instancePath
            };
        } else {
            return {
                success: false,
                error: errorMessage
            };
        }
    } catch (err) {
        console.error("Import error:", err);
        return {
            success: false,
            error: err.message
        };
    } finally {
        await fs.rm(tempPath, {
            recursive: true,
            force: true
        }).catch((e) => console.error(e));
    }
}
ipcMain.handle("import-modpack", async (event, zipPath, instanceName) => {
    return await processModpackZip(zipPath, instanceName, event.sender);
});
ipcMain.handle("get-settings", async () => {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    try {
        const data = await fs.readFile(settingsPath, "utf8");
        return JSON.parse(data);
    } catch (e) {
        return {
            ram: "4G",
            javaPath: ""
        };
    }
});
ipcMain.handle("save-settings", async (event, settings) => {
    const settingsPath = path.join(app.getPath("userData"), "settings.json");
    try {
        await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
        return { success: true };
    } catch (err) {
        console.error("Save settings error:", err);
        return {
            success: false,
            error: err.message
        };
    }
});
ipcMain.handle("select-vanilla-folder", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select Vanilla Minecraft Folder",
        properties: ["openDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
});
ipcMain.handle("get-default-vanilla-path", () => {
    return path.join(app.getPath("appData"), ".minecraft");
});
ipcMain.handle("select-skin-file", async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: "Select Minecraft Skin (PNG)",
        filters: [{
            name: "Images",
            extensions: ["png"]
        }],
        properties: ["openFile"]
    });
    if (result.canceled || result.filePaths.length === 0) return { success: false };
    const skinPath = result.filePaths[0];
    const skinsDir = path.join(app.getPath("userData"), "skins");
    await fs.mkdir(skinsDir, { recursive: true });
    const fileName = `skin_${Date.now()}.png`;
    const destPath = path.join(skinsDir, fileName);
    await fs.copyFile(skinPath, destPath);
    return {
        success: true,
        path: destPath,
        fileName,
        base64: "data:image/png;base64," + (await fs.readFile(destPath)).toString("base64")
    };
});
ipcMain.handle("load-skins", async () => {
    const skinsDir = path.join(app.getPath("userData"), "skins");
    await fs.mkdir(skinsDir, { recursive: true }).catch(() => { });
    try {
        const files = await fs.readdir(skinsDir);
        const pngs = [];
        for (const f of files) if (f.endsWith(".png")) {
            const p = path.join(skinsDir, f);
            const buffer = await fs.readFile(p);
            pngs.push({
                name: f,
                path: p,
                base64: "data:image/png;base64," + buffer.toString("base64")
            });
        }
        return {
            success: true,
            skins: pngs
        };
    } catch (e) {
        return {
            success: true,
            skins: []
        };
    }
});
ipcMain.handle("delete-skin", async (event, fileName) => {
    const skinPath = path.join(app.getPath("userData"), "skins", fileName);
    try {
        await shell.trashItem(skinPath);
        return { success: true };
    } catch (e) {
        return {
            success: false,
            error: e.message
        };
    }
});
ipcMain.handle("list-versions", async () => {
    try {
        const versionsDir = path.join(sharedPath, "versions");
        const instancesDir = path.join(app.getPath("userData"), "Crystalline_Instances");
        const fss = require("fs");
        if (!fss.existsSync(versionsDir)) return { success: true, versions: [] };
        const versionDirs = (await fs.readdir(versionsDir, { withFileTypes: true }))
            .filter(d => d.isDirectory()).map(d => d.name);
        // Find which instances use each version
        let instanceVersions = new Map();
        if (fss.existsSync(instancesDir)) {
            const instanceFolders = await fs.readdir(instancesDir, { withFileTypes: true }).catch(() => []);
            for (const folder of instanceFolders) {
                if (!folder.isDirectory()) continue;
                try {
                    const configRaw = await fs.readFile(path.join(instancesDir, folder.name, "config.json"), "utf8");
                    const config = JSON.parse(configRaw);
                    for (const v of versionDirs) {
                        if (v === config.version || v.includes(config.version)) {
                            if (!instanceVersions.has(v)) instanceVersions.set(v, []);
                            instanceVersions.get(v).push(config.name || folder.name);
                        }
                    }
                } catch { }
            }
        }
        // Calculate each version folder's size
        const getDirSize = async (dirPath) => {
            let size = 0;
            try {
                const entries = await fs.readdir(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(dirPath, entry.name);
                    if (entry.isDirectory()) size += await getDirSize(full);
                    else size += (await fs.stat(full)).size;
                }
            } catch { }
            return size;
        };
        const versions = [];
        for (const v of versionDirs) {
            const sizeBytes = await getDirSize(path.join(versionsDir, v));
            const usedBy = instanceVersions.get(v) || [];
            versions.push({ name: v, sizeBytes, usedBy });
        }
        versions.sort((a, b) => {
            if (a.usedBy.length > 0 && b.usedBy.length === 0) return -1;
            if (a.usedBy.length === 0 && b.usedBy.length > 0) return 1;
            return a.name.localeCompare(b.name);
        });
        return { success: true, versions };
    } catch (e) {
        return { success: false, error: e.message, versions: [] };
    }
});
ipcMain.handle("delete-version", async (event, versionName) => {
    try {
        const versionsDir = path.join(sharedPath, "versions");
        const versionPath = path.join(versionsDir, versionName);
        if (!versionPath.startsWith(versionsDir + path.sep)) return { success: false, error: "Invalid path" };
        await shell.trashItem(versionPath);
        // Clear installed flags for any instance that referenced this version
        const instancesDir = path.join(app.getPath("userData"), "Crystalline_Instances");
        const fss = require("fs");
        if (fss.existsSync(instancesDir)) {
            const instanceFolders = await fs.readdir(instancesDir, { withFileTypes: true }).catch(() => []);
            for (const folder of instanceFolders) {
                if (!folder.isDirectory()) continue;
                try {
                    const flagPath = path.join(instancesDir, folder.name, "installed_version.txt");
                    if (fss.existsSync(flagPath)) {
                        const flagVal = fss.readFileSync(flagPath, "utf8").trim();
                        if (flagVal === versionName || flagVal.includes(versionName)) {
                            await fs.unlink(flagPath).catch(() => { });
                        }
                    }
                } catch { }
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});
ipcMain.handle("apply-minecraft-skin", async (event, skinFilePath, variant = "classic") => {
    if (!mcAccount || !mcAccount.access_token) return {
        success: false,
        error: "Not authenticated with Microsoft. Please login first."
    };
    try {
        const fileBuffer = await fs.readFile(skinFilePath);
        const boundary = "----ElectronBoundary" + Date.now().toString(16);
        let postData = "";
        postData += `--${boundary}\r
`;
        postData += `Content-Disposition: form-data; name="variant"\r
\r
`;
        postData += `${variant}\r
`;
        postData += `--${boundary}\r
`;
        postData += `Content-Disposition: form-data; name="file"; filename="skin.png"\r
`;
        postData += `Content-Type: image/png\r
\r
`;
        const footer = `\r
--${boundary}--\r
`;
        const payload = Buffer.concat([
            Buffer.from(postData, "utf8"),
            fileBuffer,
            Buffer.from(footer, "utf8")
        ]);
        return new Promise((resolve) => {
            const { net } = require("electron");
            const req = net.request({
                url: "https://api.minecraftservices.com/minecraft/profile/skins",
                method: "POST"
            });
            req.setHeader("Authorization", `Bearer ${mcAccount.access_token}`);
            req.setHeader("Content-Type", `multipart/form-data; boundary=${boundary}`);
            req.on("response", (res) => {
                let raw = "";
                res.on("data", (chunk) => raw += chunk);
                res.on("end", () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (mcAccount && mcAccount.name) delete skinCache[mcAccount.name];
                        resolve({ success: true });
                    } else resolve({
                        success: false,
                        error: raw
                    });
                });
            });
            req.on("error", (err) => resolve({
                success: false,
                error: err.message
            }));
            req.write(payload);
            req.end();
        });
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
});
var skinCache = {};
ipcMain.handle("fetch-player-skin", async (event, username, forceRefresh = false) => {
    try {
        const now = Date.now();
        if (!forceRefresh && skinCache[username] && now - skinCache[username].time < 600 * 1e3 && require("fs").existsSync(skinCache[username].res.path)) return skinCache[username].res;
        const mojangData = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${username}`).catch(() => null);
        if (!mojangData || !mojangData.id) return {
            success: false,
            error: "Player not found."
        };
        const uuid = mojangData.id;
        const profileData = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`).catch(() => null);
        if (!profileData) return {
            success: false,
            error: "Failed to fetch profile textures."
        };
        const texturesProp = profileData.properties?.find((p) => p.name === "textures");
        if (!texturesProp) return {
            success: false,
            error: "Player has no textures."
        };
        const skinUrl = JSON.parse(Buffer.from(texturesProp.value, "base64").toString("utf8")).textures?.SKIN?.url;
        if (!skinUrl) return {
            success: false,
            error: "Player has no custom skin."
        };
        const skinBuffer = await fetchBuffer(skinUrl, "Downloading Skin");
        const skinsDir = path.join(app.getPath("userData"), "skins");
        await fs.mkdir(skinsDir, { recursive: true });
        const fileName = `${username}.png`;
        const destPath = path.join(skinsDir, fileName);
        await fs.writeFile(destPath, skinBuffer);
        const result = {
            success: true,
            path: destPath,
            fileName,
            base64: "data:image/png;base64," + skinBuffer.toString("base64")
        };
        skinCache[username] = {
            time: Date.now(),
            res: result
        };
        return result;
    } catch (err) {
        return {
            success: false,
            error: err.message
        };
    }
});
var modBridgeServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
    }
    const parseBody = () => new Promise((resolve) => {
        let body = "";
        req.on("data", (chunk) => body += chunk.toString());
        req.on("end", () => {
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve(null);
            }
        });
    });
    if (req.url === "/api/friends" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        if (!rpc) {
            res.writeHead(503);
            res.end(JSON.stringify({
                success: false,
                error: "Discord RPC not connected"
            }));
            return;
        }
        try {
            const withTimeout = (prom, ms) => Promise.race([prom, new Promise((_, rej) => setTimeout(() => rej(/* @__PURE__ */ new Error("timeout")), ms))]);
            const friends = await withTimeout(rpc.getRelationships(), 2e3);
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                friends: friends || []
            }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: e.message
            }));
        }
        return;
    }
    if (req.url === "/api/invite" && req.method === "POST") {
        res.setHeader("Content-Type", "application/json");
        const data = await parseBody();
        if (!data || !data.userId || !data.host || !data.port) {
            res.writeHead(400);
            res.end(JSON.stringify({
                success: false,
                error: "Missing userId, host, or port"
            }));
            return;
        }
        try {
            if (rpc) {
                // Ensure presence is updated so we have a valid joinSecret and partyId for the invite
                await rpc.setActivity({
                    state: "In Game",
                    details: "Playing Nextbots",
                    startTimestamp: Date.now(),
                    largeImageKey: "icon",
                    partyId: "nextbots-" + data.host,
                    partyMax: 10,
                    partySize: 1,
                    joinSecret: `${data.host}:${data.port}`
                });
                await rpc.sendJoinInvite({ id: data.userId });
            }
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            if (e.message === "Unknown Error" || e.code === 1000) {
                // Discord RPC throws this even when the invite popup works
                res.writeHead(200);
                res.end(JSON.stringify({ success: true }));
                return;
            }
            console.error("[API Bridge] Invite Error:", e);
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: e.message
            }));
        }
        return;
    }
    if (req.url === "/api/party" && req.method === "POST") {
        res.setHeader("Content-Type", "application/json");
        const data = await parseBody();
        if (!data || !data.host || !data.port) {
            res.writeHead(400);
            res.end(JSON.stringify({
                success: false,
                error: "Missing host or port"
            }));
            return;
        }
        let allowJoin = false;
        try {
            const settingsPath = require("path").join(app.getPath("userData"), "settings.json");
            if (require("fs").existsSync(settingsPath)) {
                const cfg = JSON.parse(require("fs").readFileSync(settingsPath, "utf8"));
                if (cfg.allowJoin !== void 0) allowJoin = cfg.allowJoin;
            }
        } catch (e) { }
        if (!allowJoin) {
            res.writeHead(200);
            res.end(JSON.stringify({
                success: true,
                ignored: true,
                reason: "allowJoin is disabled in settings"
            }));
            return;
        }
        try {
            if (rpc) await rpc.setActivity({
                state: "In Game",
                details: "Playing Nextbots",
                startTimestamp: Date.now(),
                largeImageKey: "icon",
                partyId: data.partyId || "party-" + Date.now(),
                partyMax: data.partyMax || 10,
                partySize: data.partySize || 1,
                joinSecret: `${data.host}:${data.port}`
            });
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: e.message
            }));
        }
        return;
    }
    if (req.url === "/api/presence" && req.method === "POST") {
        res.setHeader("Content-Type", "application/json");
        const data = await parseBody();
        if (!data) {
            res.writeHead(400);
            res.end(JSON.stringify({
                success: false,
                error: "Missing body"
            }));
            return;
        }
        try {
            if (rpc) {
                let activity = {
                    state: data.state || "In Game",
                    details: data.details || "Playing Nextbots",
                    largeImageKey: "icon"
                };
                if (data.startTimestamp > 0) activity.startTimestamp = data.startTimestamp;
                else if (data.endTimestamp > 0) activity.endTimestamp = data.endTimestamp;
                if (data.partyId) {
                    activity.partyId = data.partyId;
                    activity.partySize = data.partySize || 1;
                    activity.partyMax = data.partyMax || 10;
                }
                if (data.joinSecret) activity.joinSecret = data.joinSecret;
                await rpc.setActivity(activity);
            }
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({
                success: false,
                error: e.message
            }));
        }
        return;
    }
    if (req.url === "/api/presence/reset" && req.method === "POST") {
        res.setHeader("Content-Type", "application/json");
        try {
            if (rpc) {
                await rpc.setActivity({
                    details: "In Launcher",
                    state: "Preparing for an adventure",
                    startTimestamp: new Date(),
                    largeImageKey: "icon_large",
                    largeImageText: "Crystalline",
                    instance: false
                });
                console.log("[API Bridge] Discord presence reset to launcher default.");
            }
            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }
    res.writeHead(404);
    res.end();
});
modBridgeServer.on("error", (err) => console.error("[API Bridge] Server error:", err));
modBridgeServer.listen(34322, "127.0.0.1", () => {
    console.log("[API Bridge] Mod RPC bridge listening on 127.0.0.1:34322");
});

function httpsGet(hostname, pathStr, headers = {}) {
    return new Promise((resolve, reject) => {
        const req = require('https').request({
            hostname,
            port: 443,
            path: pathStr,
            method: 'GET',
            headers: { 'User-Agent': 'Mozilla/5.0', ...headers }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

function httpsPost(hostname, pathStr, bodyObj, headers = {}) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(bodyObj);
        const req = require('https').request({
            hostname,
            port: 443,
            path: pathStr,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length,
                'User-Agent': 'Mozilla/5.0',
                ...headers
            }
        }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch (e) { resolve(body); }
            });
        });
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// ==========================================
// CURSEFORGE API HANDLERS
// ==========================================
const CF_API_KEY = "$2a$10$pimcMzR6cxbjEFAdC7T/y.ch56z3ZK4pRpmaMFH/vDv.Xi6qeUTTG";

ipcMain.handle("get-curseforge-categories", async (event, classId) => {
    try {
        // classId: 6 = Mods, 12 = Resourcepacks
        const res = await fetch(`https://api.curseforge.com/v1/categories?gameId=432&classId=${classId}`, {
            headers: { "x-api-key": CF_API_KEY, "Accept": "application/json" }
        });
        return await res.json();
    } catch (e) {
        console.error("CF Categories error:", e);
        return { data: [] };
    }
});

ipcMain.handle("search-curseforge", async (event, query) => {
    try {
        // query contains things like gameVersion, classId, categoryId, searchFilter
        let url = `https://api.curseforge.com/v1/mods/search?gameId=432&sortField=2&sortOrder=desc&pageSize=20`;
        if (query.classId) url += `&classId=${query.classId}`;
        if (query.categoryId) url += `&categoryId=${query.categoryId}`;
        if (query.gameVersion) url += `&gameVersion=${encodeURIComponent(query.gameVersion)}`;
        if (query.searchFilter) url += `&searchFilter=${encodeURIComponent(query.searchFilter)}`;
        if (query.modLoaderType) url += `&modLoaderType=${query.modLoaderType}`; // 0=Any, 1=Forge, 4=Fabric, 6=NeoForge

        const res = await fetch(url, {
            headers: { "x-api-key": CF_API_KEY, "Accept": "application/json" }
        });
        const json = await res.json();
        if (json && json.data) {
            json.data = json.data.filter(mod => mod.allowModDistribution !== false);
        }
        return json;
    } catch (e) {
        console.error("CF Search error:", e);
        return { data: [] };
    }
});

ipcMain.handle("get-curseforge-files", async (event, modId, gameVersion, modLoaderType) => {
    try {
        let url = `https://api.curseforge.com/v1/mods/${modId}/files?gameVersion=${encodeURIComponent(gameVersion)}`;
        if (modLoaderType !== undefined && modLoaderType !== null) url += `&modLoaderType=${modLoaderType}`;
        const res = await fetch(url, {
            headers: { "x-api-key": CF_API_KEY, "Accept": "application/json" }
        });
        return await res.json();
    } catch (e) {
        console.error("CF Files error:", e);
        return { data: [] };
    }
});

ipcMain.handle("download-curseforge-file", async (event, url, instanceId, folderName, fileName) => {
    try {
        const targetDir = path.join(app.getPath("userData"), "Crystalline_Instances", instanceId, folderName);
        require("fs").mkdirSync(targetDir, { recursive: true });
        const targetFile = path.join(targetDir, fileName);
        if (require("fs").existsSync(targetFile)) return { success: true, message: "File already exists" };

        const buffer = await fetchBuffer(url, "Downloading CurseForge File");
        await fs.writeFile(targetFile, buffer);
        return { success: true };
    } catch (e) {
        console.error("CF Download error:", e);
        return { success: false, error: e.message };
    }
});

// ==========================================
// PARTY SYSTEM HANDLERS (MQTT)
// ==========================================

ipcMain.handle("create-party", async (event) => {
    if (partyClient) {
        partyClient.end();
        partyClient = null;
    }
    const groupId = "grp-" + crypto.randomUUID();
    const aesKey = crypto.randomBytes(32).toString("hex");
    partyState = { groupId, aesKey, members: [] };

    // Connect to MQTT
    partyClient = mqtt.connect(mqttBrokerUrl);
    partyClient.on("connect", () => {
        partyClient.subscribe(`crystalline/party/${groupId}`);
        console.log("[PARTY] Created party:", groupId);
    });

    partyClient.on("message", (topic, message) => {
        const payload = decryptPayload(message.toString("utf8"), partyState.aesKey);
        if (!payload) return; // Ignore unencrypted or invalid messages
        if (payload.type === "join") {
            const exists = partyState.members.find(m => m.id === payload.user.id);
            if (!exists) {
                partyState.members.push(payload.user);
                if (mainWindow) mainWindow.webContents.send("party-update", partyState);
                // Send current members back
                partyClient.publish(`crystalline/party/${groupId}`, encryptPayload({
                    type: "sync", members: partyState.members
                }, partyState.aesKey));
            }
        } else if (payload.type === "sync") {
            partyState.members = payload.members;
            if (mainWindow) mainWindow.webContents.send("party-update", partyState);
        } else if (payload.type === "start_instance") {
            // Someone in the party started an instance!
            if (mainWindow) mainWindow.webContents.send("party-start-instance", payload);
        } else if (payload.type === "chat") {
            if (mainWindow) mainWindow.webContents.send("party-chat-message", payload);
        }
    });

    return { groupId, aesKey };
});

ipcMain.handle("join-party", async (event, groupId, aesKey, user) => {
    if (partyClient) {
        partyClient.end();
    }
    partyState = { groupId, aesKey, members: [] };

    partyClient = mqtt.connect(mqttBrokerUrl);
    partyClient.on("connect", () => {
        partyClient.subscribe(`crystalline/party/${groupId}`);
        console.log("[PARTY] Joined party:", groupId);
        partyClient.publish(`crystalline/party/${groupId}`, encryptPayload({
            type: "join", user: user
        }, aesKey));
    });

    partyClient.on("message", (topic, message) => {
        const payload = decryptPayload(message.toString("utf8"), partyState.aesKey);
        if (!payload) return;
        if (payload.type === "sync") {
            partyState.members = payload.members;
            if (mainWindow) mainWindow.webContents.send("party-update", partyState);
        } else if (payload.type === "join") {
            const exists = partyState.members.find(m => m.id === payload.user.id);
            if (!exists) {
                partyState.members.push(payload.user);
                if (mainWindow) mainWindow.webContents.send("party-update", partyState);
            }
        } else if (payload.type === "start_instance") {
            if (mainWindow) mainWindow.webContents.send("party-start-instance", payload);
        } else if (payload.type === "chat") {
            if (mainWindow) mainWindow.webContents.send("party-chat-message", payload);
        }
    });
    return true;
});

ipcMain.handle("leave-party", async (event) => {
    if (partyClient) {
        partyClient.end();
        partyClient = null;
    }
    partyState = { groupId: null, aesKey: null, members: [] };
    return true;
});

ipcMain.handle("start-party-instance", async (event, payload) => {
    if (partyClient && partyState.groupId) {
        partyClient.publish(`crystalline/party/${partyState.groupId}`, encryptPayload({
            type: "start_instance",
            ...payload
        }, partyState.aesKey));
        return true;
    }
    return false;
});

ipcMain.handle("send-party-chat", async (event, message, user) => {
    if (partyClient && partyState.groupId) {
        partyClient.publish(`crystalline/party/${partyState.groupId}`, encryptPayload({
            type: "chat",
            message,
            user,
            timestamp: Date.now()
        }, partyState.aesKey));
        return true;
    }
    return false;
});
