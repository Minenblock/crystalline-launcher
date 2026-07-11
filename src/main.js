import './style.css';
import { SkinViewer, IdleAnimation } from 'skinview3d';

window.addEventListener('error', (e) => {
  Swal.fire({ title: 'Frontend Error', text: e.message, icon: 'error' });
});
window.addEventListener('unhandledrejection', (e) => {
  Swal.fire({ title: 'Frontend Promise Error', text: e.reason?.message || e.reason, icon: 'error' });
});

// ─── Element refs ─────────────────────────────────────────────────────────
const loginBtn = document.getElementById('login-btn');
const playBtn = document.getElementById('play-btn');
const playLabel = document.getElementById('play-label');
const launchStatus = document.getElementById('launch-status-text');
const usernameDisplay = document.getElementById('username-display');
const userAvatar = document.getElementById('user-avatar');
const discordStatus = document.getElementById('discord-status');
const discordDot = document.getElementById('discord-status-dot');
const statDiscord = document.getElementById('stat-discord');
const navDashboard = document.getElementById('nav-dashboard');
const navInstances = document.getElementById('nav-instances');
const navSettings = document.getElementById('nav-settings');
const navFriends = document.getElementById('nav-friends');
const navSkins = document.getElementById('nav-skins');
const navStorage = document.getElementById('nav-storage');
const viewDashboard = document.getElementById('view-dashboard');
const viewInstances = document.getElementById('view-instances');
const viewSettings = document.getElementById('view-settings');
const viewFriends = document.getElementById('view-friends');
const viewSkins = document.getElementById('view-skins');
const viewStorage = document.getElementById('view-storage');
const viewInstanceDetails = document.getElementById('view-instance-details');
const btnBackInstances = document.getElementById('btn-back-instances');
const detailTitle = document.getElementById('detail-title');
const detailSubtitle = document.getElementById('detail-subtitle');
const detailPlayBtn = document.getElementById('detail-play-btn');
const detailPlayLabel = document.getElementById('detail-play-label');
const detailFolderBtn = document.getElementById('detail-folder-btn');
const detailDeleteBtn = document.getElementById('detail-delete-btn');
const detailStatus = document.getElementById('detail-status');
const instanceLogs = document.getElementById('instance-logs');


const listWorlds = document.getElementById('list-worlds');
const listMods = document.getElementById('list-mods');
const listResourcepacks = document.getElementById('list-resourcepacks');
const listShaderpacks = document.getElementById('list-shaderpacks');

const ramInput = document.getElementById('setting-ram');
const javaInput = document.getElementById('setting-java');
const allowJoinToggle = document.getElementById('setting-allow-join');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const newInstanceBtn = document.getElementById('new-instance-btn');
const dropZone = document.getElementById('drop-zone');

let currentInstanceId = null;

// ─── Navigation ─────────────────────────────────────────────────
function switchTab(activeNav, activeView) {
  [navDashboard, navInstances, navSettings, navFriends, navSkins, navStorage].forEach(n => { if (n) n.classList.remove('active'); });
  [viewDashboard, viewInstances, viewSettings, viewFriends, viewSkins, viewInstanceDetails, viewStorage].forEach(v => {
    if (v) { v.classList.remove('active'); v.style.display = 'none'; }
  });
  if (activeNav) activeNav.classList.add('active');
  if (activeView) {
    activeView.style.display = 'block';
    requestAnimationFrame(() => activeView.classList.add('active'));
  }
}

navDashboard.addEventListener('click', (e) => { e.preventDefault(); switchTab(navDashboard, viewDashboard); });
navInstances.addEventListener('click', (e) => { e.preventDefault(); switchTab(navInstances, viewInstances); });
navSettings.addEventListener('click', (e) => { e.preventDefault(); switchTab(navSettings, viewSettings); });
if (navFriends) navFriends.addEventListener('click', (e) => { e.preventDefault(); switchTab(navFriends, viewFriends); });
if (navSkins) navSkins.addEventListener('click', (e) => {
  e.preventDefault();
  switchTab(navSkins, viewSkins);
  if (!window.skinViewerInitialized) initSkinViewer();
});
if (navStorage) navStorage.addEventListener('click', (e) => { e.preventDefault(); switchTab(navStorage, viewStorage); loadStorageVersions(); });
if (btnBackInstances) {
  btnBackInstances.addEventListener('click', () => { switchTab(navInstances, viewInstances); currentInstanceId = null; });
}

if (window.electronAPI && window.electronAPI.onNavigateTo) {
  window.electronAPI.onNavigateTo((tab) => {
    if (tab === 'settings') switchTab(navSettings, viewSettings);
  });
}

// ─── Login & Auth & Updates ───────────────────────────────────────
let isLoggedIn = false;
let isUpdateAvailable = false;

async function updateAuthUI(success, username) {
  if (success) {
    isLoggedIn = true;
    usernameDisplay.innerText = username;
    userAvatar.innerText = username.charAt(0).toUpperCase();
    loginBtn.innerText = '✕'; // Logout icon
    loginBtn.title = "Logout";
    loginBtn.style.background = 'rgba(255, 50, 50, 0.15)';
    loginBtn.style.color = 'var(--error)';
    loginBtn.style.borderColor = 'rgba(255, 50, 50, 0.3)';
    playBtn.disabled = false;
    playLabel.innerText = isUpdateAvailable ? 'Update Modpack' : 'Play';
  } else {
    isLoggedIn = false;
    usernameDisplay.innerText = 'Not logged in';
    userAvatar.innerText = '?';
    loginBtn.innerText = '→'; // Login icon
    loginBtn.title = "Sign in with Microsoft";
    loginBtn.style.background = '';
    loginBtn.style.color = '';
    loginBtn.style.borderColor = '';
    playBtn.disabled = true;
    playLabel.innerText = 'Login to Play';
  }
  loginBtn.disabled = false;
}

// Check auth on startup
window.electronAPI.checkAuth().then(res => {
  if (res.success) updateAuthUI(true, res.username);
});

// Check modpack update on startup
window.electronAPI.checkModpackUpdate().then(res => {
  if (res.success && res.updateAvailable) {
    isUpdateAvailable = true;
    if (isLoggedIn) playLabel.innerText = 'Update Modpack';
    launchStatus.innerText = 'Update available: v' + res.remoteVersion;
    launchStatus.style.color = 'var(--accent)';
  }
});

loginBtn.addEventListener('click', async () => {
  loginBtn.innerText = '...';
  loginBtn.disabled = true;

  if (isLoggedIn) {
    // Logout
    await window.electronAPI.logout();
    updateAuthUI(false);
  } else {
    // Login
    const result = await window.electronAPI.login().catch(e => ({ success: false, error: e.message }));
    if (result.success) {
      updateAuthUI(true, result.username);
    } else {
      updateAuthUI(false);
      if (result.error !== 'Login canceled by user') {
        Swal.fire({ title: 'Login Error', text: result.error, icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
      }
    }
  }
});

// ─── Play ───────────────────────────────────────────────────────
let isLaunching = false;
let launchingInstanceId = null;

let runningInstanceId = null;

async function launchGame(instanceId = null) {
  if (isLaunching) return;

  const targetId = instanceId || currentInstanceId || 'default';
  const smallBtn = targetId ? document.querySelector(`.btn-play-sm[data-id="${targetId}"]`) : null;

  isLaunching = true;
  launchingInstanceId = targetId;
  if (window.updateMyStatus) window.updateMyStatus();

  if (instanceLogs) {
    instanceLogs.innerHTML = '';
  }

  // Globally disable all play buttons
  document.querySelectorAll('.btn-play, .btn-play-sm').forEach(btn => {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  });

  if (targetId === 'default') {
    playLabel.innerText = 'Starting...';
    launchStatus.innerText = 'Preparing to launch...';
    const dbProg = document.getElementById('dashboard-download-progress');
    if (dbProg) {
      dbProg.style.display = 'none';
      document.getElementById('dashboard-progress-pct').innerText = '0%';
      document.getElementById('dashboard-progress-fill').style.width = '0%';
    }
  }
  if (smallBtn) {
    smallBtn.innerText = '...';
  }

  if (targetId && currentInstanceId === targetId) {
    if (detailPlayLabel) detailPlayLabel.innerText = 'Starting...';
    if (detailStatus) detailStatus.innerText = 'Preparing to launch...';
  }

  try {
    // Check if we need to auto-install or update the official modpack for the default instance
    if (targetId === 'default') {
      const updateInfo = await window.electronAPI.checkModpackUpdate();
      if (updateInfo.success && (!updateInfo.isInstalled || updateInfo.updateAvailable)) {
        launchStatus.style.color = 'var(--text-dim)'; // reset color
        launchStatus.innerText = updateInfo.updateAvailable ? 'Updating Modpack...' : 'Initializing Download...';
        playLabel.innerText = 'Downloading...';
        if (detailPlayLabel) detailPlayLabel.innerText = 'Downloading...';

        const zipUrl = updateInfo.downloadUrl || 'https://drive.google.com/file/d/18JV60arqsUZ9A5pW0jszkNa9UFdcb5qE/view?usp=sharing';

        const installRes = await window.electronAPI.installOfficialModpack(zipUrl, updateInfo.remoteVersion);
        if (!installRes.success) {
          throw new Error('Failed to install/update official modpack: ' + installRes.error);
        }
        isUpdateAvailable = false;

        // Refresh the UI so the new instance is visible!
        await loadInstances();
      }
    }

    const launchResult = await window.electronAPI.launch(targetId);
    isLaunching = false;
    launchingInstanceId = null;
    if (window.updateMyStatus) window.updateMyStatus();

    if (launchResult && launchResult.success === false) {
      launchStatus.style.color = 'var(--text-destructive)';
      launchStatus.innerText = 'Launch Failed: ' + launchResult.error;

      document.querySelectorAll('.btn-play, .btn-play-sm').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      });
      return;
    }

    // Keep play buttons disabled until the game closes
    if (targetId === 'default') {
      playLabel.innerText = 'Running';
      launchStatus.innerText = 'Game is running';
      const dbProg = document.getElementById('dashboard-download-progress');
      if (dbProg) dbProg.style.display = 'none';
    }

    if (smallBtn) {
      smallBtn.innerText = '▶';
    }

    if (targetId && currentInstanceId === targetId) {
      if (detailPlayLabel) detailPlayLabel.innerText = 'Running';
      if (detailStatus) detailStatus.innerText = 'Game is running';
    }
  } catch (err) {
    console.error('Launch error:', err);
    isLaunching = false;
    launchingInstanceId = null;
    if (window.updateMyStatus) window.updateMyStatus();

    // Globally re-enable all play buttons
    document.querySelectorAll('.btn-play, .btn-play-sm').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });

    if (targetId === 'default') {
      playLabel.innerText = 'Play';
      launchStatus.innerText = '';
      const dbProg = document.getElementById('dashboard-download-progress');
      if (dbProg) dbProg.style.display = 'none';
    }

    if (smallBtn) {
      smallBtn.innerText = '▶';
    }

    if (targetId && currentInstanceId === targetId) {
      if (detailPlayLabel) detailPlayLabel.innerText = 'Play';
      if (detailStatus) detailStatus.innerText = 'Error: ' + err.message;
    }
  }
}

playBtn.addEventListener('click', () => launchGame('default'));
if (detailPlayBtn) {
  detailPlayBtn.addEventListener('click', () => launchGame(currentInstanceId));
}
if (detailFolderBtn) {
  detailFolderBtn.addEventListener('click', () => {
    if (currentInstanceId) window.electronAPI.openInstanceFolder(currentInstanceId);
  });
}
if (detailDeleteBtn) {
  detailDeleteBtn.addEventListener('click', async () => {
    if (!currentInstanceId) return;
    const { isConfirmed } = await Swal.fire({
      title: 'Delete Instance?',
      text: "This will move the instance and all its saves to your Recycle Bin. You can restore it from there if you change your mind.",
      icon: 'warning',
      showCancelButton: true,
      background: 'var(--surface-hover)',
      color: 'var(--text)',
      confirmButtonColor: '#ff5555',
      cancelButtonColor: 'rgba(255,255,255,0.1)',
      confirmButtonText: 'Move to Trash'
    });

    if (isConfirmed) {
      const res = await window.electronAPI.deleteInstance(currentInstanceId);
      if (res.success) {
        currentInstanceId = null;
        switchTab(navInstances, viewInstances);
        loadInstances();
      } else {
        Swal.fire({ title: 'Error', text: res.error, icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
      }
    }
  });
}

// Track current server the player is connected to (parsed from Minecraft logs)
let currentServerIp = null;
let isPlayingNextbots = false;

// ─── Log Streaming ──────────────────────────────────────────────
const MAX_LOG_LINES = 150;
let logQueue = [];
let logFlushTimer = null;

window.electronAPI.onMcLog((data) => {
  logQueue.push(data);
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(() => {
      if (!instanceLogs) { logQueue = []; logFlushTimer = null; return; }

      // Append all queued lines at once
      const frag = document.createDocumentFragment();
      for (const line of logQueue) {
        const div = document.createElement('div');
        div.innerText = line;
        frag.appendChild(div);
      }
      instanceLogs.appendChild(frag);
      logQueue = [];
      logFlushTimer = null;

      // Trim to MAX_LOG_LINES (ring buffer – oldest lines go first)
      while (instanceLogs.childNodes.length > MAX_LOG_LINES) {
        instanceLogs.removeChild(instanceLogs.firstChild);
      }

      instanceLogs.scrollTop = instanceLogs.scrollHeight;
    }, 100); // flush every 100ms
  }

  // Parse server connection from Minecraft log output
  // e.g. "Connecting to play.example.com, 25565"
  const joinMatch = data.match(/Connecting to ([\w\-.]+(?:\.[a-z]{2,})+|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}),?\s*(\d+)?/i);
  if (joinMatch) {
    const ip = joinMatch[1];
    const port = joinMatch[2] && joinMatch[2] !== '25565' ? `:${joinMatch[2]}` : '';
    currentServerIp = ip + port;

  }
  // Detect disconnect
  if (data.includes('Disconnecting') || data.includes('disconnect.genericReason')) {
    isPlayingNextbots = false;
    currentServerIp = null;
    if (window.updateMyStatus) window.updateMyStatus();

  }
});

// ─── Discord status ─────────────────────────────────────────────
window.electronAPI.onDiscordStatus((status) => {
  const connected = !status.toLowerCase().includes('fail') && !status.toLowerCase().includes('error');
  discordDot.className = 'status-dot ' + (connected ? 'online' : 'offline');
  discordStatus.innerText = connected ? 'Discord connected' : 'Discord offline';
  statDiscord.innerText = connected ? 'Online' : 'Offline';
});

if (window.electronAPI.onDiscordBridgeUpdate) {
  window.electronAPI.onDiscordBridgeUpdate((serverIp) => {
    currentServerIp = serverIp;
    isPlayingNextbots = !!serverIp;
    if (window.updateMyStatus) window.updateMyStatus();
    window.electronAPI.checkDiscordAuth().then(res => {
      if (res.success) updateDiscordUI(res);
    });
  });
}

const discordLoginBtn = document.getElementById('discord-login-btn');
const friendsGrid = document.getElementById('friends-grid');
const refreshFriendsBtn = document.getElementById('refresh-friends-btn');

if (refreshFriendsBtn) {
  refreshFriendsBtn.addEventListener('click', async () => {
    refreshFriendsBtn.innerText = '↻ Refreshing...';
    refreshFriendsBtn.disabled = true;
    const res = await window.electronAPI.checkDiscordAuth();
    if (res.success) updateDiscordUI(res);
    refreshFriendsBtn.innerText = '↻ Refresh';
    refreshFriendsBtn.disabled = false;
  });
}

let isDiscordLinked = false;
let currentDiscordUser = null;
let currentPartyState = null;

// Auto-init Discord state on startup — no Refresh needed
setTimeout(async () => {
  const res = await window.electronAPI.checkDiscordAuth();
  if (res.success) updateDiscordUI(res);
}, 2500);

if (discordLoginBtn) {
  discordLoginBtn.addEventListener('click', async () => {
    if (isDiscordLinked) {
      discordLoginBtn.innerText = 'Unlinking...';
      const res = await window.electronAPI.discordLogout();
      if (res.success) {
        isDiscordLinked = false;
        discordLoginBtn.innerText = 'Link';
        discordLoginBtn.style.background = '';
        discordLoginBtn.style.color = '';
        discordLoginBtn.style.borderColor = '';
        const myAvatarEl = document.getElementById('my-discord-avatar');
        if (myAvatarEl) myAvatarEl.style.display = 'none';

        const myStatusEl = document.getElementById('my-discord-status');
        if (myStatusEl) {
          myStatusEl.innerText = 'Discord offline';
          myStatusEl.style.color = 'var(--text-dim)';
        }

        const friendsGrid = document.getElementById('friends-grid');
        if (friendsGrid) friendsGrid.innerHTML = '<div class="no-friends">Discord disconnected. Connect Discord to see friends.</div>';
      }
    } else {
      discordLoginBtn.innerText = 'Linking...';
      const res = await window.electronAPI.discordLogin();
      if (res.success) {
        updateDiscordUI(res);
      } else {
        discordLoginBtn.innerText = 'Link';
        Swal.fire('Discord Error', res.error, 'error');
      }
    }
  });
}


function updateDiscordUI(res) {
  if (res.success) {
    isDiscordLinked = true;
    if (discordLoginBtn) {
      discordLoginBtn.innerText = 'Unlink';
      discordLoginBtn.disabled = false;
      discordLoginBtn.style.background = 'rgba(255, 50, 50, 0.15)';
      discordLoginBtn.style.color = 'var(--error)';
      discordLoginBtn.style.borderColor = 'rgba(255, 50, 50, 0.3)';
    }

    if (res.user) {
      currentDiscordUser = { id: res.user.id, name: res.user.username, avatar: res.user.avatar };
      const myAvatarEl = document.getElementById('my-discord-avatar');
      if (myAvatarEl && res.user.id) {
        myAvatarEl.src = `https://cdn.discordapp.com/avatars/${res.user.id}/${res.user.avatar}.png`;
        myAvatarEl.style.display = 'block';
      }
    }

    window.updateMyStatus = () => {
      const myStatusEl = document.getElementById('my-discord-status');
      if (!myStatusEl) return;

      if (runningInstanceId || currentServerIp) {
        myStatusEl.innerText = currentServerIp ? `On Server: ${currentServerIp}` : `In Instance: ${runningInstanceId}`;
        myStatusEl.style.color = 'var(--success)';
        // Only update RPC when actually in-game — idle state is set by backend default
        if (isDiscordLinked && window.electronAPI && window.electronAPI.updateDiscordPresence) {
          if (currentServerIp) {
            window.electronAPI.getInstances().then(resInst => {
              const inst = resInst.instances?.find(i => i.id === runningInstanceId);
              window.electronAPI.updateDiscordPresence({
                serverIp: currentServerIp,
                details: 'Playing Crystalline',
                state: `On ${currentServerIp}`,
                version: inst?.version,
                loader: inst?.loader,
                loaderVersion: inst?.loaderVersion,
                instanceId: inst?.id
              });
            });
          } else {
            window.electronAPI.updateDiscordPresence({
              details: 'Playing Crystalline',
              state: `In Instance: ${runningInstanceId}`,
              instanceId: runningInstanceId
            });
          }
        }
      } else if (isLaunching) {
        myStatusEl.innerText = 'Launching Game...';
        myStatusEl.style.color = 'var(--success)';
      } else {
        myStatusEl.innerText = 'In Dashboard';
        myStatusEl.style.color = 'var(--text-dim)';
      }
    };
    window.updateMyStatus();

    if (res.friends && res.friends.length > 0) {
      let inLauncher = [];
      let onlineOthers = [];

      res.friends.forEach(f => {
        if (f.type !== 1 && f.type !== 'FRIEND') return;
        const pres = f.presence;
        const isOnline = pres && pres.status && pres.status !== 'offline';
        if (!isOnline) return;

        let isCrystalline = false;
        if (pres.activity && (pres.activity.application_id === '1523332306096357487' || pres.activity.name === 'Crystalline')) isCrystalline = true;
        if (pres.activities && pres.activities.some(a => a.application_id === '1523332306096357487' || a.name === 'Crystalline')) isCrystalline = true;

        if (isCrystalline) inLauncher.push(f);
        else onlineOthers.push(f);
      });

      const renderFriendCard = (f, isCrystalline) => {
        const pres = f.presence;
        let statusClass = 'online';
        if (pres?.status === 'idle') statusClass = 'idle';
        if (pres?.status === 'dnd') statusClass = 'dnd';

        const avatarUrl = f.user.avatar
          ? `https://cdn.discordapp.com/avatars/${f.user.id}/${f.user.avatar}.png?size=128`
          : null;

        let avatarHtml = '';
        if (avatarUrl) {
          avatarHtml = `<img src="${avatarUrl}" class="friend-avatar" alt="Avatar">`;
        } else {
          avatarHtml = `<div class="friend-avatar" style="background:linear-gradient(135deg, var(--primary), var(--secondary));display:flex;align-items:center;justify-content:center;font-size:20px;color:#000;font-weight:bold;">${f.user.username.charAt(0).toUpperCase()}</div>`;
        }

        let targetActivity = pres?.activity;
        if (pres?.activities && pres.activities.length > 0) {
          if (isCrystalline) {
            targetActivity = pres.activities.find(a => a.application_id === '1523332306096357487' || a.name === 'Crystalline') || targetActivity;
          } else {
            targetActivity = pres.activities.find(a => a.type === 0) || pres.activities[0];
          }
        }

        let activityText = 'Online';
        if (targetActivity && targetActivity.name) {
          const type = targetActivity.type;
          if (type === 1) activityText = `Streaming ${targetActivity.name}`;
          else if (type === 2) activityText = `Listening to ${targetActivity.name}`;
          else if (type === 3) activityText = `Watching ${targetActivity.name}`;
          else activityText = `Playing ${targetActivity.name}`;
        } else if (isCrystalline) {
          activityText = 'Playing Crystalline';
        }

        let detailsHtml = '';
        if (targetActivity?.details) {
          detailsHtml += `<span class="friend-activity-details">${targetActivity.details}</span>`;
        }
        if (targetActivity?.state) {
          detailsHtml += `<span class="friend-activity-details">${targetActivity.state}</span>`;
        }

        if (isCrystalline && !detailsHtml) {
          detailsHtml = `<span class="friend-activity-details">In Dashboard</span>`;
        }


        let isSameParty = false;
        if (isCrystalline && currentServerIp && targetActivity) {
          if (targetActivity.state && targetActivity.state.includes(currentServerIp)) isSameParty = true;
          if (targetActivity.party && targetActivity.party.id && targetActivity.party.id.includes(currentServerIp.replace(/[^a-zA-Z0-9]/g, '-'))) isSameParty = true;
        }

        let badgeHtml = '';
        if (isSameParty) {
          badgeHtml = '<div style="font-size: 10px; background: var(--success); color: #000; padding: 2px 6px; border-radius: 4px; font-weight: bold; margin-bottom: 4px; display: inline-block;">IN YOUR GROUP</div>';
        }

        let actionsHtml = '';
        if (currentServerIp || currentPartyState) {
          if (isSameParty) {
            actionsHtml = `
              <div class="friend-actions">
                <button class="btn-secondary" disabled style="width:100%; margin-top:8px; font-size:12px; padding:6px 0; opacity: 0.5; cursor: not-allowed; border: 1px solid var(--success); color: var(--success);">Already in Group</button>
              </div>
            `;
          } else {
            actionsHtml = `
              <div class="friend-actions">
                <button class="btn-invite" style="width:100%; margin-top:8px; font-size:12px; padding:6px 0;" onclick="window.sendInvite('${f.user.id}', '${f.user.username.replace(/'/g, "\\'")}')">Send Invite</button>
              </div>
            `;
          }
        }

        return `
          <div class="friend-card glass-panel" style="${isCrystalline ? (isSameParty ? 'border-color: var(--success); box-shadow: 0 0 10px rgba(0,255,100,0.2);' : 'border-color: var(--primary);') : 'opacity: 0.8;'}">
            <div class="friend-header">
              <div class="friend-avatar-wrap">
                ${avatarHtml}
                <div class="friend-status-dot ${statusClass}"></div>
              </div>
              <div class="friend-info">
                ${badgeHtml}
                <span class="friend-name">${f.user.global_name || f.user.username}</span>
                <span class="friend-activity" style="${!isCrystalline ? 'color: var(--text-dim);' : ''}">${activityText}</span>
                ${detailsHtml}
              </div>
            </div>
            ${actionsHtml}
          </div>
        `;
      };

      if (inLauncher.length > 0 || onlineOthers.length > 0) {
        let finalHtml = '';
        if (inLauncher.length > 0) {
          finalHtml += `<div style="grid-column: 1 / -1; font-size: 14px; font-weight: bold; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px;">In Crystalline (${inLauncher.length})</div>`;
          finalHtml += inLauncher.map(f => renderFriendCard(f, true)).join('');
        }
        if (onlineOthers.length > 0) {
          finalHtml += `<div style="grid-column: 1 / -1; font-size: 14px; font-weight: bold; color: var(--text-dim); text-transform: uppercase; letter-spacing: 1px; margin-top: 16px;">Discord Friends (${onlineOthers.length})</div>`;
          finalHtml += onlineOthers.map(f => renderFriendCard(f, false)).join('');
        }
        if (friendsGrid) {
          friendsGrid.innerHTML = finalHtml;
          document.querySelectorAll('.btn-invite-friend').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              const uid = e.target.getAttribute('data-userid');
              const originalText = e.target.innerText;
              e.target.innerText = 'Inviting...';
              e.target.disabled = true;
              try {
                const resp = await fetch('http://127.0.0.1:34322/api/invite', {
                  method: 'POST',
                  body: JSON.stringify({ userId: uid, host: 'ramazanfemboy.duckdns.org', port: 25568 })
                });
                const data = await resp.json();
                if (data.success) {
                  e.target.innerText = 'Sent!';
                } else {
                  e.target.innerText = 'Error!';
                  console.error(data.error);
                }
              } catch (err) {
                e.target.innerText = 'Failed';
                console.error(err);
              }
              setTimeout(() => {
                e.target.innerText = originalText;
                e.target.disabled = false;
              }, 2000);
            });
          });
        }
      } else {
        if (friendsGrid) friendsGrid.innerHTML = `
          <div class="empty-state">
            <span style="font-size:32px; margin-bottom:16px; display:block;">💤</span>
            No friends are currently playing Crystalline.
          </div>
        `;
      }
    } else {
      if (friendsGrid) friendsGrid.innerHTML = `
        <div class="empty-state">
          <span style="font-size:32px; margin-bottom:16px; display:block;">💤</span>
          You have no Discord friends.
        </div>
      `;
    }
  } else {
    isDiscordLinked = false;
    if (discordLoginBtn) {
      discordLoginBtn.innerText = 'Link';
      discordLoginBtn.disabled = false;
      discordLoginBtn.style.background = '';
      discordLoginBtn.style.color = '';
      discordLoginBtn.style.borderColor = '';
    }
    if (friendsGrid) {
      friendsGrid.innerHTML = `
        <div class="empty-state">
          <span style="font-size:32px; margin-bottom:16px; display:block;">💤</span>
          You have no Discord friends.
        </div>
      `;
    }
    if (res.error) {
      Swal.fire({
        title: 'Discord Error',
        text: res.error,
        icon: 'error',
        background: 'var(--surface-hover)',
        color: 'var(--text)'
      });
    }
  }
}

window.sendInvite = async (userId, username) => {
  if (!currentServerIp && !currentPartyState) {
    Swal.fire({
      title: 'Cannot send invite',
      text: 'You must be connected to a server or be in a Party before you can invite friends.',
      icon: 'info',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
    return;
  }
  const res = await window.electronAPI.sendDiscordInvite(userId);
  if (res.success) {
    const destination = currentPartyState ? 'your Party' : currentServerIp;
    Swal.fire({
      title: 'Invite Sent! <span style="font-size:18px;">✨</span>',
      text: `${username} received a Discord invite to join ${destination}.`,
      icon: 'success',
      background: 'var(--surface-hover)',
      color: 'var(--text)',
      timer: 3000,
      showConfirmButton: false
    });
  } else {
    Swal.fire({
      title: 'Invite Failed',
      text: res.error || 'Could not send invite via Discord RPC.',
      icon: 'error',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
  }
};

// When a friend accepts our invite, Discord sends us the joinSecret (= server IP)
window.electronAPI.onDiscordActivityJoin(async (secret) => {
  console.log('[INVITE] discord-activity-join received, secret:', secret);
  if (secret) {
    if (secret.startsWith('group:')) {
      const gParts = secret.split(':');
      if (gParts.length < 3) {
        console.warn('[INVITE] Invalid group secret format:', secret);
        return;
      }
      if (!currentDiscordUser) {
        Swal.fire({
          title: 'Discord not linked',
          text: 'You need to link your Discord account in the launcher before joining a party.',
          icon: 'warning',
          confirmButtonText: 'OK'
        });
        return;
      }
      Swal.fire({
        title: 'Joining Group',
        text: 'Connecting to party...',
        allowOutsideClick: false,
        didOpen: () => Swal.showLoading()
      });
      try {
        const result = await window.electronAPI.joinParty(gParts[1], gParts[2], currentDiscordUser);
        if (result && result.error) {
          Swal.fire('Party Error', result.error, 'error');
          return;
        }
        Swal.close();
        // Switch to friends view to see the party
        navFriends.click();
      } catch (e) {
        Swal.fire('Party Error', 'Could not connect to party: ' + e.message, 'error');
      }
      return;
    }

    const parts = secret.split('|');
    const serverIp = parts[0];
    const targetVersion = parts[1] || '1.21.1';
    const targetLoader = parts[2] || 'neoforge';
    const targetLoaderVersion = parts[3] || '21.1.230';
    const isOfficial = parts[4] === 'official';
    const isCustomPack = parts[4] && parts[4].startsWith('bb:');
    const bbKey = isCustomPack ? parts[4].substring(3) : null;

    await window.electronAPI.setPendingJoinServer(serverIp);

    if (isOfficial) {
      Swal.fire({
        title: 'Join Official Server',
        text: `Your friend is playing the Official Crystalline Modpack on ${serverIp}. Do you want to download/update the modpack and join?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Download & Join'
      }).then(async (result) => {
        if (result.isConfirmed) {
          const remoteInfo = await fetch('https://raw.githubusercontent.com/Minenblock/crystalline-launcher/main/modpack_info.json').then(r => r.json()).catch(() => null);
          if (remoteInfo) {
            Swal.fire({
              title: 'Downloading Modpack...',
              text: 'Please wait, this may take a moment.',
              allowOutsideClick: false,
              didOpen: () => { Swal.showLoading(); }
            });
            const res = await window.electronAPI.installOfficialModpack(remoteInfo.url, remoteInfo.version);
            if (res.success) {
              Swal.close();
              const playBtn = document.querySelector('.btn-play');
              if (playBtn) playBtn.click();
            } else {
              Swal.fire('Error', res.error, 'error');
            }
          }
        } else {
          window.electronAPI.setPendingJoinServer(null);
        }
      });
      return;
    }

    if (isCustomPack) {
      Swal.fire({
        title: 'Join Custom Modpack',
        text: `Your friend is playing a custom modpack on ${serverIp}. Do you want to download their mods and join?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Yes, Sync & Join'
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            Swal.fire({
              title: 'Fetching modlist...',
              allowOutsideClick: false,
              didOpen: () => { Swal.showLoading(); }
            });
            const bbRes = await fetch(`https://bytebin.lucko.me/${bbKey}`);
            const bbData = await bbRes.json();
            const urlsToDownload = bbData.mods || [];
            const missingMods = bbData.missingMods || [];

            const proceed = async () => {
              const res = await window.electronAPI.getInstances();
              let match = res.instances?.find(i => i.version === targetVersion && i.loader === targetLoader);
              let instanceIdToLaunch = match ? match.id : null;

              if (!match) {
                const newId = `AutoJoin-${targetVersion}-${targetLoader}`;
                await window.electronAPI.createInstance({
                  name: newId,
                  version: targetVersion,
                  loader: targetLoader,
                  loaderVersion: targetLoaderVersion
                });
                instanceIdToLaunch = newId;
              }

              if (urlsToDownload.length > 0) {
                Swal.fire({
                  title: 'Downloading Mods...',
                  text: `Downloading ${urlsToDownload.length} mods...`,
                  allowOutsideClick: false,
                  didOpen: () => { Swal.showLoading(); }
                });
                const dlRes = await window.electronAPI.downloadModpackUrls(urlsToDownload, instanceIdToLaunch);
                if (!dlRes.success) {
                  Swal.fire('Download Error', 'Failed to download all mods, game might crash: ' + dlRes.error, 'warning');
                }
              }

              Swal.close();
              const playBtn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
              if (playBtn) playBtn.click();
              else {
                loadInstances().then(() => {
                  const btn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
                  if (btn) btn.click();
                });
              }
            };

            if (missingMods.length > 0) {
              Swal.fire({
                title: 'Missing Mods!',
                html: `The following mods could not be synced and must be downloaded manually:<br><br><div style="text-align:left; font-size:12px; max-height:100px; overflow-y:auto; background:var(--surface); padding:8px; border-radius:4px;">${missingMods.join('<br>')}</div><br>Launch anyway?`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'Yes, Launch'
              }).then((res) => {
                if (res.isConfirmed) proceed();
                else window.electronAPI.setPendingJoinServer(null);
              });
            } else {
              proceed();
            }
            if (playBtn) playBtn.click();
            else {
              loadInstances().then(() => {
                const btn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
                if (btn) btn.click();
              });
            }
          } catch (e) {
            Swal.fire('Error', 'Failed to fetch modpack data', 'error');
            window.electronAPI.setPendingJoinServer(null);
          }
        } else {
          window.electronAPI.setPendingJoinServer(null);
        }
      });
      return;
    }

    const res = await window.electronAPI.getInstances();

    let match = res.instances?.find(i => i.version === targetVersion && i.loader === targetLoader);
    let instanceIdToLaunch = match ? match.id : null;

    if (!match) {
      const newId = `AutoJoin-${targetVersion}-${targetLoader}`;
      await window.electronAPI.createInstance({
        name: newId,
        version: targetVersion,
        loader: targetLoader,
        loaderVersion: targetLoaderVersion
      });
      instanceIdToLaunch = newId;
    }

    Swal.fire({
      title: 'Join Server',
      text: `Join ${serverIp}? (Using ${targetLoader} ${targetVersion})`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Launch Game'
    }).then((result) => {
      if (result.isConfirmed) {
        const playBtn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
        if (playBtn) playBtn.click();
        else {
          // We might need to refresh the list first
          loadInstances().then(() => {
            const btn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
            if (btn) btn.click();
          });
        }
      } else {
        window.electronAPI.setPendingJoinServer(null);
      }
    });
  }
});

// When a friend clicks "Join" in Discord, the host gets a popup to approve or deny
window.electronAPI.onDiscordJoinRequest(async (user) => {
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : null;
  const avatarHtml = avatarUrl
    ? `<img src="${avatarUrl}" alt="Server Icon" style="width:48px;height:48px;border-radius:50%;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;">`
    : '';
  const tag = user.discriminator && user.discriminator !== '0' ? `#${user.discriminator}` : '';
  const result = await Swal.fire({
    title: 'Join Request',
    html: `${avatarHtml}<b>${user.username}${tag}</b> wants to join your party.`,
    icon: null,
    showCancelButton: true,
    confirmButtonText: '✓ Accept',
    cancelButtonText: '✕ Deny',
    confirmButtonColor: '#22c55e',
    cancelButtonColor: '#ef4444',
    background: 'var(--surface)',
    color: 'var(--text)',
    timer: 30000,
    timerProgressBar: true
  });
  if (result.isConfirmed) {
    await window.electronAPI.approveJoinRequest(user.id);
  } else {
    await window.electronAPI.denyJoinRequest(user.id);
  }
});

// --- Party System Logic ---
const btnCreateParty = document.getElementById('btn-create-party');
const btnLeaveParty = document.getElementById('btn-leave-party');
const partyPanel = document.getElementById('party-panel');
const partyMembersDiv = document.getElementById('party-members');

if (btnCreateParty) {
  btnCreateParty.addEventListener('click', async () => {
    if (!currentDiscordUser) {
      Swal.fire('Error', 'You must link Discord to create a party.', 'error');
      return;
    }
    const res = await window.electronAPI.createParty();
    if (res && res.groupId) {
      currentPartyState = res;
      // Tell discord RPC that we are hosting a party!
      if (window.electronAPI.updateDiscordPresence) {
        window.electronAPI.updateDiscordPresence({
          details: 'Hosting a Party',
          state: 'Waiting for friends',
          partyId: res.groupId,
          partySize: 1,
          partyMax: 10,
          joinSecret: `group:${res.groupId}:${res.aesKey}`
        });
      }
      btnCreateParty.style.display = 'none';
      partyPanel.style.display = 'block';
      renderPartyMembers([{ id: currentDiscordUser.id, name: currentDiscordUser.name, avatar: currentDiscordUser.avatar }]);
      // Re-render friends list so invite buttons appear
      if (isDiscordLinked) {
        window.electronAPI.checkDiscordAuth().then(authRes => {
          if (authRes.success) updateDiscordUI(authRes);
        });
      }
    }
  });
}

if (btnLeaveParty) {
  btnLeaveParty.addEventListener('click', async () => {
    await window.electronAPI.leaveParty();
    currentPartyState = null;
    partyPanel.style.display = 'none';
    btnCreateParty.style.display = 'block';
    // Re-render friends list so invite buttons disappear
    if (isDiscordLinked) {
      window.electronAPI.checkDiscordAuth().then(authRes => {
        if (authRes.success) updateDiscordUI(authRes);
      });
    }

    // Reset discord RPC to normal launcher state
    if (window.electronAPI.updateDiscordPresence) {
      window.electronAPI.updateDiscordPresence({
        details: 'In Launcher',
        state: 'Preparing for an adventure'
      });
    }
  });
}

window.electronAPI.onPartyUpdate((state) => {
  currentPartyState = state;
  if (state && state.groupId) {
    btnCreateParty.style.display = 'none';
    partyPanel.style.display = 'block';
    renderPartyMembers(state.members);

    if (window.electronAPI.updateDiscordPresence) {
      window.electronAPI.updateDiscordPresence({
        details: 'In a Party',
        state: `Party of ${state.members.length}`,
        partyId: state.groupId,
        partySize: state.members.length,
        partyMax: 10,
        joinSecret: `group:${state.groupId}:${state.aesKey}`
      });
    }
  } else {
    partyPanel.style.display = 'none';
    btnCreateParty.style.display = 'block';
  }
});

function renderPartyMembers(members) {
  if (!partyMembersDiv) return;
  partyMembersDiv.innerHTML = members.map(m => `
    <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.05); padding:6px 12px; border-radius:100px;">
      <img src="https://cdn.discordapp.com/avatars/${m.id}/${m.avatar}.png?size=32" alt="Party Member" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'" style="width:24px; height:24px; border-radius:50%;">
      <span style="font-size:13px; color:var(--text);">${m.name}</span>
    </div>
  `).join('');
}

// --- Party Chat Logic ---
const partyChatLog = document.getElementById('party-chat-log');
const partyChatInput = document.getElementById('party-chat-input');
const partyChatSend = document.getElementById('party-chat-send');

function appendChatMessage(msg, isSelf) {
  if (!partyChatLog) return;
  // Remove placeholder
  const placeholder = partyChatLog.querySelector('span');
  if (placeholder) placeholder.remove();

  const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const el = document.createElement('div');
  el.className = `chat-msg ${isSelf ? 'self' : 'other'}`;
  el.innerHTML = `
    <div class="chat-meta">${isSelf ? 'You' : msg.user?.name || 'Unknown'} · ${time}</div>
    <div class="chat-bubble">${msg.message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  `;
  partyChatLog.appendChild(el);
  partyChatLog.scrollTop = partyChatLog.scrollHeight;
}

async function sendPartyChatMessage() {
  const text = partyChatInput?.value?.trim();
  if (!text || !currentDiscordUser) return;
  partyChatInput.value = '';
  const msg = {
    message: text,
    user: { id: currentDiscordUser.id, name: currentDiscordUser.name },
    timestamp: Date.now()
  };
  await window.electronAPI.sendPartyChat(text, { id: currentDiscordUser.id, name: currentDiscordUser.name });
  appendChatMessage(msg, true);
}

if (partyChatSend) {
  partyChatSend.addEventListener('click', sendPartyChatMessage);
}
if (partyChatInput) {
  partyChatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPartyChatMessage();
    }
  });
}

window.electronAPI.onPartyChatMessage((msg) => {
  // Only show messages from others (we already appended our own)
  const isSelf = msg.user?.id === currentDiscordUser?.id;
  if (!isSelf) appendChatMessage(msg, false);
});


window.electronAPI.onPartyStartInstance(async (payload) => {
  if (payload.modpackSegment) {
    const isCustomPack = payload.modpackSegment.startsWith('bb:');
    const bbKey = isCustomPack ? payload.modpackSegment.substring(3) : null;

    Swal.fire({
      title: 'Party Starting',
      text: `The party leader is starting a modpack. Do you want to join them?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Download & Join'
    }).then(async (result) => {
      if (result.isConfirmed) {
        if (payload.serverIp) {
          await window.electronAPI.setPendingJoinServer(payload.serverIp);
        }

        // Trigger the same modpack join logic as a regular Discord Invite
        if (bbKey) {
          Swal.fire({
            title: 'Fetching modlist...',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
          });
          try {
            const bbRes = await fetch(`https://bytebin.lucko.me/${bbKey}`);
            const bbData = await bbRes.json();

            const proceed = async () => {
              const res = await window.electronAPI.getInstances();
              let match = res.instances?.find(i => i.version === bbData.version && i.loader === bbData.loader);
              let instanceIdToLaunch = match ? match.id : null;

              if (!match) {
                const newId = `AutoJoin-${bbData.version}-${bbData.loader}`;
                await window.electronAPI.createInstance({
                  name: newId,
                  version: bbData.version,
                  loader: bbData.loader,
                  loaderVersion: bbData.loaderVersion
                });
                instanceIdToLaunch = newId;
              }

              const playBtn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
              if (playBtn) playBtn.click();
              else {
                loadInstances().then(() => {
                  const btn = document.querySelector(`.btn-play-sm[data-id="${instanceIdToLaunch}"]`);
                  if (btn) btn.click();
                });
              }
            };

            const urlsToDownload = bbData.mods || [];
            if (urlsToDownload.length > 0) {
              Swal.fire({
                title: 'Downloading Party Mods...',
                allowOutsideClick: false,
                didOpen: () => Swal.showLoading()
              });
              await window.electronAPI.downloadModpackUrls(urlsToDownload, `AutoJoin-${bbData.version}-${bbData.loader}`);
            }
            proceed();
          } catch (e) {
            Swal.fire('Error', 'Failed to fetch party modpack data', 'error');
          }
        }
      }
    });
  }
});

// ─── Launch status ──────────────────────────────────────────────
window.electronAPI.onLaunchStatus((status) => {
  // Parse percentage if present (e.g. "Downloading files... 45%")
  let pctMatch = status.match(/(\d+)%/);
  let percentage = pctMatch ? pctMatch[1] + '%' : null;
  let textOnly = status.replace(/\s*\d+%/, '').trim();

  const dbProg = document.getElementById('dashboard-download-progress');

  if (launchingInstanceId === 'default' && launchStatus) {
    if (percentage) {
      launchStatus.innerText = 'Installing...';
      if (dbProg) {
        dbProg.style.display = 'block';
        document.getElementById('dashboard-progress-text').innerText = textOnly;
        document.getElementById('dashboard-progress-pct').innerText = percentage;
        document.getElementById('dashboard-progress-fill').style.width = percentage;
      }
    } else {
      launchStatus.innerText = status;
      if (dbProg) dbProg.style.display = 'none';
    }
  }

  if (currentInstanceId === launchingInstanceId && detailStatus) {
    detailStatus.innerText = status;
  }

  // Handle resets
  const isCloseOrExit = status.toLowerCase().includes('close') || status.toLowerCase().includes('exit');
  const isCrashed = status.toLowerCase().includes('crashed');

  if (isCloseOrExit || status.toLowerCase().includes('game is running') || isCrashed) {
    const isRunning = status.toLowerCase().includes('game is running');
    if (isRunning) {
      runningInstanceId = launchingInstanceId || 'default';
      playLabel.innerText = 'Running';
      if (detailPlayLabel) detailPlayLabel.innerText = 'Running';
    } else {
      runningInstanceId = null;
      playLabel.innerText = 'Play';
      if (detailPlayLabel) detailPlayLabel.innerText = 'Play';
      launchStatus.innerText = '';

      // Globally re-enable all play buttons only when closing/exiting/crashing
      document.querySelectorAll('.btn-play, .btn-play-sm').forEach(btn => {
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.pointerEvents = 'auto';
      });
    }
    if (window.updateMyStatus) window.updateMyStatus();
    if (dbProg) dbProg.style.display = 'none';
  }

  const isError = status.toLowerCase().includes('launch failed') || status.toLowerCase().includes('launch error') || status.toLowerCase().includes('already running') || isCrashed;

  if (isError) {
    if (window.electronAPI.resetInstanceLock) window.electronAPI.resetInstanceLock(launchingInstanceId || 'default');
    isLaunching = false;
    runningInstanceId = null;
    if (window.updateMyStatus) window.updateMyStatus();
    playLabel.innerText = 'Play';
    if (dbProg) dbProg.style.display = 'none';

    // Globally re-enable all play buttons
    document.querySelectorAll('.btn-play, .btn-play-sm').forEach(btn => {
      btn.disabled = false;
      btn.style.opacity = '1';
      btn.style.pointerEvents = 'auto';
    });

    if (detailPlayLabel) detailPlayLabel.innerText = 'Play';

    // Notifications for actual errors/crashes (not 'already running')
    if (!status.toLowerCase().includes('already running')) {
      const isCrashEvent = isCrashed;
      const isCorruptionError = status.includes('NoClassDefFoundError') || status.includes('ClassNotFoundException') || status.includes('Mod resolution failed') || status.includes('java.lang.RuntimeException') || status.includes('Failed to download');

      Swal.fire({
        title: isCrashEvent ? 'Instance Crashed' : 'Launch Error',
        html: `<div style="margin-bottom:12px; color:var(--text-dim); font-size:15px;">D: Something happend:</div><div style="background: rgba(0,0,0,0.4); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05); text-align: left; max-height: 200px; overflow: auto; box-shadow: inset 0 2px 10px rgba(0,0,0,0.3);"><pre style="margin: 0; font-family: 'Consolas', monospace; font-size: 12px; color: #ff8888; white-space: pre; line-height: 1.4;">${status.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre></div>`,
        icon: 'error',
        showCancelButton: true,
        showDenyButton: isCorruptionError || isCrashEvent,
        confirmButtonText: isCorruptionError ? 'Repair Instance' : 'Copy Error',
        denyButtonText: isCorruptionError ? 'Copy Error' : (isCrashEvent ? 'Open Logs' : null),
        cancelButtonText: 'Close',
        reverseButtons: isCorruptionError
      }).then((result) => {
        if (result.isConfirmed) {
          if (isCorruptionError) {
            Swal.fire({ title: 'Repairing...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
            window.electronAPI.repairInstance(launchingInstanceId || 'default').then((res) => {
              if (res.success) Swal.fire({ title: 'Repaired', text: 'The instance cache has been cleared. Please try launching again.', icon: 'success' });
              else Swal.fire({ title: 'Repair Failed', text: res.error, icon: 'error' });
            });
          } else {
            navigator.clipboard.writeText(status);
            Swal.fire({ title: 'Copied!', text: 'The error message has been copied to your clipboard.', icon: 'success', timer: 1500, showConfirmButton: false });
          }
        } else if (result.isDenied) {
          if (isCorruptionError) {
            navigator.clipboard.writeText(status);
            Swal.fire({ title: 'Copied!', text: 'The error message has been copied to your clipboard.', icon: 'success', timer: 1500, showConfirmButton: false });
          } else if (isCrashEvent) {
            if (window.electronAPI.openInstanceFolder) window.electronAPI.openInstanceFolder(launchingInstanceId || 'default');
          }
        }
      });
    }
  }
});

import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

// ─── Instances ───────────────────────────────────────────────────
async function loadInstances() {
  const instancesGrid = document.getElementById('instances-grid');
  if (!instancesGrid) return;
  const res = await window.electronAPI.getInstances();
  if (res.success && res.instances) {
    instancesGrid.innerHTML = '';
    for (const inst of res.instances) {
      const loaderDisplay = inst.loaderVersion ? `${inst.loader} ${inst.loaderVersion}` : inst.loader;
      instancesGrid.innerHTML += `
        <div class="instance-card glass-panel" data-id="${inst.id}" style="cursor: pointer;">
          <div class="instance-icon">⛏</div>
          <div class="instance-info">
            <h3 class="instance-name">${inst.name}</h3>
            <p class="instance-meta">Minecraft ${inst.version} · ${loaderDisplay}</p>
          </div>
          <button class="btn-play-sm" data-id="${inst.id}">▶</button>
        </div>
      `;
    }

    // Click on the whole card to open details

    // Populate Last Played Instances widget
    const lastPlayedContent = document.getElementById('last-played-content');
    if (lastPlayedContent) {
      const sorted = [...res.instances].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
      const top3 = sorted.slice(0, 3);
      if (top3.length === 0) {
        lastPlayedContent.innerHTML = '<span style="color:var(--text-dim); font-size:13px;">No instances found</span>';
      } else {
        lastPlayedContent.innerHTML = '';
        for (const inst of top3) {
          const dateStr = inst.lastPlayed ? new Date(inst.lastPlayed).toLocaleString() : 'Never';
          lastPlayedContent.innerHTML += `
            <div style="display:flex; justify-content:space-between; align-items:center; padding: 6px; border-radius:4px; background: rgba(255,255,255,0.05);">
              <div>
                <div style="font-size:13px; font-weight:600; color:var(--text);">${inst.name}</div>
                <div style="font-size:11px; color:var(--text-dim);">${dateStr}</div>
              </div>
              <button class="btn-play-sm" data-id="${inst.id}" style="width:24px; height:24px; font-size:10px;">▶</button>
            </div>
          `;
        }
      }
    }

    document.querySelectorAll('.instance-card').forEach(card => {
      card.addEventListener('click', async (e) => {
        if (e.target.closest('.btn-play-sm')) return; // Ignore play button clicks

        const instanceId = card.getAttribute('data-id');
        const inst = res.instances.find(i => i.id === instanceId);
        if (inst) {
          currentInstanceId = instanceId;
          const loaderDisplay = inst.loaderVersion ? `${inst.loader} ${inst.loaderVersion}` : inst.loader;
          detailTitle.innerText = inst.name;
          detailSubtitle.innerText = `Minecraft ${inst.version} · ${loaderDisplay}`;

          if (isLaunching) {
            detailStatus.innerText = 'Busy...';
            if (detailPlayBtn) detailPlayBtn.disabled = true;
            if (detailPlayLabel) detailPlayLabel.innerText = 'Starting...';
          } else {
            detailStatus.innerText = 'Ready';
            if (detailPlayBtn) detailPlayBtn.disabled = false;
            if (detailPlayLabel) detailPlayLabel.innerText = 'Play';
          }

          // Hide '+ Add' button for mods if the instance is vanilla
          const btnBrowseMod = document.querySelector('.btn-browse[data-type="mod"]');
          if (btnBrowseMod) {
            btnBrowseMod.style.display = (inst.loader === 'vanilla') ? 'none' : 'block';
          }

          listWorlds.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';
          listMods.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';
          listResourcepacks.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';
          listShaderpacks.innerHTML = '<span style="color:var(--text-dim)">Loading...</span>';

          switchTab(null, viewInstanceDetails);

          const contents = await window.electronAPI.getInstanceContents(instanceId);
          const renderList = (arr, type, query = '') => {
            const listEl = document.getElementById(`list-${type}`);
            const actionBtn = document.getElementById(`action-${type}-delete`);

            let filtered = arr || [];
            if (query) {
              filtered = filtered.filter(f => f.toLowerCase().includes(query.toLowerCase()));
            }

            if (filtered.length === 0) {
              listEl.innerHTML = '<span style="color:var(--text-dim); padding-left: 2px;">None</span>';
              actionBtn.style.display = 'none';
              return;
            }

            let icon = '▤';
            if (type === 'worlds') icon = '◍';
            else if (type === 'mods') icon = '▦';
            else if (type === 'resourcepacks') icon = '▨';
            else if (type === 'shaderpacks') icon = '◬';

            listEl.innerHTML = filtered.map(f => `
              <label class="content-item" title="${f}" style="cursor:pointer; width:100%; box-sizing:border-box;">
                <input type="checkbox" class="content-checkbox" data-file="${f}" data-type="${type}">
                <span class="content-icon">${icon}</span>
                <span class="content-name" style="flex:1;">${f}</span>
              </label>
            `).join('');

            const newBtn = actionBtn.cloneNode(true);
            newBtn.style.display = 'none';
            actionBtn.parentNode.replaceChild(newBtn, actionBtn);

            const checkboxes = listEl.querySelectorAll('.content-checkbox');
            checkboxes.forEach(cb => {
              cb.addEventListener('change', () => {
                const anyChecked = Array.from(checkboxes).some(c => c.checked);
                newBtn.style.display = anyChecked ? 'block' : 'none';
              });
            });
            newBtn.addEventListener('click', async () => {
              const selected = Array.from(listEl.querySelectorAll('.content-checkbox:checked')).map(c => c.getAttribute('data-file'));
              if (selected.length === 0) return;

              const res = await Swal.fire({
                title: 'Delete Files?',
                text: `Are you sure you want to throw away ${selected.length} item(s)? Deleted Files can be restored from your Recycle Bin.`,
                icon: 'warning',
                showCancelButton: true,
                background: 'var(--surface)',
                color: 'var(--text)',
                confirmButtonColor: '#ff5555',
                confirmButtonText: 'Yes!'
              });

              if (res.isConfirmed) {
                for (const file of selected) {
                  await window.electronAPI.deleteInstanceFile(instanceId, type, file);
                }
                document.querySelector(`.instance-card[data-id="${instanceId}"]`)?.click();
              }
            });
          };

          renderList(contents.worlds, 'worlds');
          renderList(contents.mods, 'mods');
          renderList(contents.resourcepacks, 'resourcepacks');
          renderList(contents.shaderpacks, 'shaderpacks');

          ['worlds', 'mods', 'resourcepacks', 'shaderpacks'].forEach(type => {
            const searchInput = document.getElementById(`search-${type}`);
            if (searchInput) {
              const newSearch = searchInput.cloneNode(true);
              searchInput.parentNode.replaceChild(newSearch, searchInput);
              newSearch.value = '';
              newSearch.addEventListener('input', (e) => {
                renderList(contents[type], type, e.target.value);
              });
            }
          });
        }
      });
    });

    // Add event listeners to the small play buttons
    document.querySelectorAll('.btn-play-sm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const instanceId = e.target.getAttribute('data-id');
        launchGame(instanceId);
      });
    });
  }
}

// Call on load
loadInstances();

// Auto-reload instances when folder changes (e.g. restored from Recycle Bin)
if (window.electronAPI.onInstancesChanged) {
  window.electronAPI.onInstancesChanged(() => {
    loadInstances();
  });
}

// ─── New Instance ────────────────────────────────────────────────
newInstanceBtn.addEventListener('click', async () => {
  let releases = [{ id: '1.20.1' }];
  const verRes = await window.electronAPI.getMcVersions();
  if (verRes.success && verRes.versions) {
    releases = verRes.versions.filter(v => v.type === 'release');
  }

  const { value: formValues } = await Swal.fire({
    title: 'New Instance',
    html: `
      <div style="display:flex;flex-direction:column;gap:12px;text-align:left;">
        <label class="form-label" style="margin-bottom:0">Instance Name</label>
        <input id="swal-input-name" class="form-input" style="width:100%;box-sizing:border-box" placeholder="My Modpack">
        <label class="form-label" style="margin-bottom:0;margin-top:10px">Modloader</label>
        <input type="hidden" id="swal-input-loader" value="vanilla">
        <div id="select-loader" class="custom-select">
          <div class="custom-select-trigger">
            <span>Vanilla</span>
            <div class="arrow"></div>
          </div>
          <div class="custom-options">
            <div class="custom-option selected" data-value="vanilla">Vanilla</div>
            <div class="custom-option" data-value="forge">Forge</div>
            <div class="custom-option" data-value="neoforge">NeoForge</div>
            <div class="custom-option" data-value="fabric">Fabric</div>
          </div>
        </div>
        <div id="loader-version-container" style="display:none;">
          <label class="form-label" style="margin-bottom:0;margin-top:10px">Loader Version (optional)</label>
          <input type="hidden" id="swal-input-loader-version" value="">
          <div id="select-loader-version" class="custom-select">
            <div class="custom-select-trigger">
              <span>Select...</span>
              <div class="arrow"></div>
            </div>
            <div class="custom-options" id="loader-version-options">
            </div>
          </div>
        </div>
        <label class="form-label" style="margin-bottom:0;margin-top:10px">Minecraft Version</label>
        <input type="hidden" id="swal-input-version" value="${releases[0]?.id || '1.20.1'}">
        <div id="select-version" class="custom-select">
          <div class="custom-select-trigger">
            <span>${releases[0]?.id || '1.20.1'}</span>
            <div class="arrow"></div>
          </div>
          <div class="custom-options">
            <input type="text" class="custom-select-search" placeholder="Search version..." />
            ${releases.map((v, i) => `<div class="custom-option ${i === 0 ? 'selected' : ''}" data-value="${v.id}">${v.id}</div>`).join('')}
          </div>
        </div>
      </div>
    `,
    focusConfirm: false,
    showCancelButton: true,
    background: 'var(--surface-hover)',
    color: 'var(--text)',
    confirmButtonColor: 'var(--primary)',
    cancelButtonColor: 'rgba(255,255,255,0.1)',
    didOpen: () => {
      const initCustomSelect = (containerId, inputId) => {
        const container = document.getElementById(containerId);
        if (!container) return;
        const input = document.getElementById(inputId);
        const trigger = container.querySelector('.custom-select-trigger');
        const triggerText = trigger.querySelector('span');
        const options = container.querySelectorAll('.custom-option');
        const searchInput = container.querySelector('.custom-select-search');

        if (searchInput) {
          searchInput.addEventListener('click', (e) => e.stopPropagation());
          searchInput.addEventListener('input', (e) => {
            const filter = e.target.value.toLowerCase();
            options.forEach(opt => {
              opt.style.display = opt.innerText.toLowerCase().includes(filter) ? 'block' : 'none';
            });
          });
        }

        trigger.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.custom-select').forEach(s => {
            if (s !== container) s.classList.remove('open');
          });
          container.classList.toggle('open');
          if (container.classList.contains('open') && searchInput) {
            searchInput.value = '';
            options.forEach(opt => opt.style.display = 'block');
            setTimeout(() => searchInput.focus(), 100);
          }
        });

        options.forEach(opt => {
          opt.addEventListener('click', (e) => {
            e.stopPropagation();
            options.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
            triggerText.innerText = opt.innerText;
            input.value = opt.getAttribute('data-value');
            input.dispatchEvent(new Event('change', { bubbles: true }));
            container.classList.remove('open');
          });
        });

        document.addEventListener('click', (e) => {
          if (!container.contains(e.target)) container.classList.remove('open');
        });
      };

      initCustomSelect('select-version', 'swal-input-version');
      initCustomSelect('select-loader', 'swal-input-loader');

      const loaderInput = document.getElementById('swal-input-loader');
      const versionSelect = document.getElementById('select-version');
      const versionOptions = versionSelect.querySelectorAll('.custom-option');
      const versionTriggerText = versionSelect.querySelector('.custom-select-trigger span');
      const versionInput = document.getElementById('swal-input-version');


      const updateLoaderVersions = async () => {
        const loader = loaderInput.value;
        const mcVer = versionInput.value;
        if (loader === 'vanilla') {
          document.getElementById('loader-version-container').style.display = 'none';
          document.getElementById('swal-input-loader-version').value = '';
          return;
        }
        document.getElementById('loader-version-container').style.display = 'block';
        document.querySelector('#select-loader-version .custom-select-trigger span').innerText = 'Loading...';
        document.getElementById('loader-version-options').innerHTML = '<div class="custom-option">Loading...</div>';

        const res = await window.electronAPI.getLoaderVersions(mcVer, loader);
        const freshOptions = document.getElementById('loader-version-options');
        const freshTriggerText = document.querySelector('#select-loader-version .custom-select-trigger span');
        const freshInput = document.getElementById('swal-input-loader-version');

        if (res.success && res.versions && res.versions.length > 0) {
          freshOptions.innerHTML = res.versions.map((v, i) => `<div class="custom-option ${i === 0 ? 'selected' : ''}" data-value="${v}">${v}</div>`).join('');
          freshTriggerText.innerText = res.versions[0];
          freshInput.value = res.versions[0];

          // Rebind clicks for the newly injected elements
          const clonedSelect = document.getElementById('select-loader-version').cloneNode(true);
          document.getElementById('select-loader-version').replaceWith(clonedSelect);
          initCustomSelect('select-loader-version', 'swal-input-loader-version');
        } else {
          freshOptions.innerHTML = '<div class="custom-option" data-value="">No versions found</div>';
          freshTriggerText.innerText = 'No versions found';
          freshInput.value = '';
        }
      };

      const handleLoaderOrVersionChange = () => {
        const loader = loaderInput.value;
        let minMinor = 0;
        if (loader === 'fabric') minMinor = 14;
        else if (loader === 'neoforge') minMinor = 20;
        else if (loader === 'forge') minMinor = 7;

        let hasValidSelection = false;

        versionOptions.forEach(opt => {
          const ver = opt.getAttribute('data-value');
          if (!ver) return;
          const minor = parseInt(ver.split('.')[1] || 0);

          if (minor >= minMinor) {
            opt.style.display = 'block';
            opt.classList.remove('hidden-by-loader');
            if (opt.classList.contains('selected')) hasValidSelection = true;
          } else {
            opt.style.display = 'none';
            opt.classList.add('hidden-by-loader');
          }
        });

        if (!hasValidSelection) {
          const firstVisible = Array.from(versionOptions).find(o => o.style.display !== 'none');
          if (firstVisible) {
            versionOptions.forEach(o => o.classList.remove('selected'));
            firstVisible.classList.add('selected');
            versionTriggerText.innerText = firstVisible.innerText;
            versionInput.value = firstVisible.getAttribute('data-value');
          }
        }
        updateLoaderVersions();
      };

      loaderInput.addEventListener('change', handleLoaderOrVersionChange);
      versionInput.addEventListener('change', handleLoaderOrVersionChange);

      // trigger initially
      handleLoaderOrVersionChange();
    },
    preConfirm: () => {
      const name = document.getElementById('swal-input-name').value;
      if (!name) { Swal.showValidationMessage('Please enter a name'); return false; }
      return {
        name,
        version: document.getElementById('swal-input-version').value,
        loader: document.getElementById('swal-input-loader').value,
        loaderVersion: document.getElementById('swal-input-loader-version').value
      }
    }
  });

  if (!formValues) return;

  const result = await window.electronAPI.createInstance(formValues);
  if (result.success) {
    Swal.fire({
      title: 'Success!',
      text: 'Instance created successfully!',
      icon: 'success',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
    loadInstances();
  } else if (result.error !== 'Canceled') {
    Swal.fire({
      title: 'Error',
      text: result.error,
      icon: 'error',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
  }
});

// ─── Drag & Drop ─────────────────────────────────────────────────
function resetDropZone() {
  dropZone.classList.remove('drag-over');
  dropZone.innerHTML = `
    <div class="drop-icon">⇓</div>
    <h3 class="drop-title">Drop Modpack Here</h3>
    <p class="drop-subtitle">CurseForge • Modrinth • Prism Launcher (.zip, .mrpack)</p>
  `;
}

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault(); e.stopPropagation();
  dropZone.classList.remove('drag-over');

  const file = e.dataTransfer.files?.[0];
  if (!file?.name.endsWith('.zip') && !file?.name.endsWith('.mrpack')) {
    Swal.fire({
      title: 'Invalid File',
      text: 'Please drop a .zip or .mrpack modpack file.',
      icon: 'error',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
    return;
  }

  const { value: name } = await Swal.fire({
    title: 'Import Modpack',
    input: 'text',
    inputLabel: `Import "${file.name}" as:`,
    inputValue: file.name.replace('.zip', '').replace('.mrpack', ''),
    showCancelButton: true,
    background: 'var(--surface-hover)',
    color: 'var(--text)',
    confirmButtonColor: 'var(--primary)',
    cancelButtonColor: 'rgba(255,255,255,0.1)'
  });

  if (!name) return;

  dropZone.innerHTML = `<div class="drop-icon" style="animation: none;">⟳</div><h3 class="drop-title" style="color: var(--secondary);">Importing ${name}...</h3><p id="drop-status" class="drop-subtitle" style="color: var(--primary);">Preparing...</p>`;

  // Temporarily hook launch status to drop zone status
  const tempStatusHandler = (event, status) => {
    const el = document.getElementById('drop-status');
    if (el) el.innerText = status;
  };
  window.electronAPI.onLaunchStatus((status) => tempStatusHandler(null, status));

  const filePath = window.electronAPI.getFilePath(file) || file.path;
  const result = await window.electronAPI.importModpack(filePath, name);

  if (result.success) {
    dropZone.innerHTML = `<div class="drop-icon">✓</div><h3 class="drop-title">Imported successfully!</h3>`;
  } else {
    dropZone.innerHTML = `<div class="drop-icon" style="color:var(--error)">✕</div><h3 class="drop-title" style="color:var(--error)">Error: ${result.error}</h3>`;
  }
  setTimeout(resetDropZone, 4000);
});

// ─── Settings ────────────────────────────────────────────────────
const overrideInput = document.getElementById('setting-override');
const cardGameSettings = document.getElementById('card-game-settings');

const fovInput = document.getElementById('setting-fov');
const renderInput = document.getElementById('setting-render');
const fpsInput = document.getElementById('setting-fps');
const volInput = document.getElementById('setting-vol');
const volMusic = document.getElementById('setting-vol-music');
const volRecord = document.getElementById('setting-vol-record');
const volWeather = document.getElementById('setting-vol-weather');
const volBlock = document.getElementById('setting-vol-block');
const volHostile = document.getElementById('setting-vol-hostile');
const volNeutral = document.getElementById('setting-vol-neutral');
const volPlayer = document.getElementById('setting-vol-player');
const volAmbient = document.getElementById('setting-vol-ambient');
const volVoice = document.getElementById('setting-vol-voice');

const labelFov = document.getElementById('label-fov');
const labelRender = document.getElementById('label-render');
const labelFps = document.getElementById('label-fps');
const labelVol = document.getElementById('label-vol');

function updateSliderLabels() {
  if (fovInput) labelFov.innerText = fovInput.value;
  if (renderInput) labelRender.innerText = renderInput.value + ' Chunks';
  if (fpsInput) labelFps.innerText = fpsInput.value >= 260 ? 'Unlimited' : fpsInput.value + ' fps';
  if (volInput) labelVol.innerText = volInput.value + '%';
  if (volMusic) document.getElementById('label-vol-music').innerText = volMusic.value + '%';
  if (volRecord) document.getElementById('label-vol-record').innerText = volRecord.value + '%';
  if (volWeather) document.getElementById('label-vol-weather').innerText = volWeather.value + '%';
  if (volBlock) document.getElementById('label-vol-block').innerText = volBlock.value + '%';
  if (volHostile) document.getElementById('label-vol-hostile').innerText = volHostile.value + '%';
  if (volNeutral) document.getElementById('label-vol-neutral').innerText = volNeutral.value + '%';
  if (volPlayer) document.getElementById('label-vol-player').innerText = volPlayer.value + '%';
  if (volAmbient) document.getElementById('label-vol-ambient').innerText = volAmbient.value + '%';
  if (volVoice) document.getElementById('label-vol-voice').innerText = volVoice.value + '%';
}

[fovInput, renderInput, fpsInput, volInput, volMusic, volRecord, volWeather, volBlock, volHostile, volNeutral, volPlayer, volAmbient, volVoice].forEach(el => {
  if (el) el.addEventListener('input', updateSliderLabels);
});

if (overrideInput) {
  overrideInput.addEventListener('change', () => {
    if (cardGameSettings) cardGameSettings.style.display = overrideInput.checked ? 'block' : 'none';
    
    // Also show/hide the Game Settings tab button
    const gameTabBtn = document.getElementById('tab-btn-game');
    if (gameTabBtn) {
      gameTabBtn.style.display = overrideInput.checked ? 'block' : 'none';
      
      // If we're turning it off and we are CURRENTLY on the game tab, switch back to Java & Memory
      if (!overrideInput.checked && gameTabBtn.style.color === 'var(--primary)') {
        const javaTabBtn = document.querySelector('.settings-tab-btn[data-target="stab-java"]');
        if (javaTabBtn) javaTabBtn.click();
      }
    }
  });
}

async function loadSettings() {
  const s = await window.electronAPI.getSettings().catch(() => null);
  if (s) {
    if (s.ram) ramInput.value = s.ram;
    if (s.javaPath) javaInput.value = s.javaPath;
    if (s.override !== undefined && overrideInput) {
      overrideInput.checked = s.override;
      overrideInput.dispatchEvent(new Event('change'));
    }
    if (s.allowJoin !== undefined && allowJoinToggle) {
      allowJoinToggle.checked = s.allowJoin;
    }
    if (s.mcOptions) {
      const mc = s.mcOptions;
      if (mc.fov !== undefined && fovInput) fovInput.value = mc.fov;
      if (mc.renderDistance !== undefined && renderInput) renderInput.value = mc.renderDistance;
      if (mc.maxFps !== undefined && fpsInput) fpsInput.value = mc.maxFps;
      if (mc.masterVolume !== undefined && volInput) volInput.value = mc.masterVolume;
      if (mc.volMusic !== undefined && volMusic) volMusic.value = mc.volMusic;
      if (mc.volRecord !== undefined && volRecord) volRecord.value = mc.volRecord;
      if (mc.volWeather !== undefined && volWeather) volWeather.value = mc.volWeather;
      if (mc.volBlock !== undefined && volBlock) volBlock.value = mc.volBlock;
      if (mc.volHostile !== undefined && volHostile) volHostile.value = mc.volHostile;
      if (mc.volNeutral !== undefined && volNeutral) volNeutral.value = mc.volNeutral;
      if (mc.volPlayer !== undefined && volPlayer) volPlayer.value = mc.volPlayer;
      if (mc.volAmbient !== undefined && volAmbient) volAmbient.value = mc.volAmbient;
      if (mc.volVoice !== undefined && volVoice) volVoice.value = mc.volVoice;
      updateSliderLabels();
    }
    // Restore close behavior
    const closeBehaviorRadios = document.querySelectorAll('input[name="close-behavior"]');
    if (s.closeBehavior && closeBehaviorRadios.length) {
      closeBehaviorRadios.forEach(r => { r.checked = (r.value === s.closeBehavior); });
      updateCloseBehaviorStyles(s.closeBehavior);
    }
    const trayClickRadios = document.querySelectorAll('input[name="tray-click-action"]');
    const trayClick = s.trayClickAction || 'launcher';
    trayClickRadios.forEach(r => { r.checked = (r.value === trayClick); });
    updateTrayClickStyles(trayClick);
  }
}

// Update card styles based on selected close behavior
function updateCloseBehaviorStyles(value) {
  const trayLabel = document.getElementById('close-behavior-tray-label');
  const quitLabel = document.getElementById('close-behavior-quit-label');
  if (!trayLabel || !quitLabel) return;
  if (value === 'tray') {
    trayLabel.style.border = '2px solid var(--primary)';
    trayLabel.style.background = 'var(--primary-dim)';
    quitLabel.style.border = '2px solid var(--outline)';
    quitLabel.style.background = 'rgba(255,255,255,0.02)';
  } else {
    quitLabel.style.border = '2px solid var(--primary)';
    quitLabel.style.background = 'var(--primary-dim)';
    trayLabel.style.border = '2px solid var(--outline)';
    trayLabel.style.background = 'rgba(255,255,255,0.02)';
  }
}

saveSettingsBtn.addEventListener('click', async () => {
  // Save raw slider values (not converted to Minecraft format) for easy restore
  const mcOptions = {
    fov: fovInput ? parseInt(fovInput.value) : 90,
    renderDistance: renderInput ? parseInt(renderInput.value) : 12,
    maxFps: fpsInput ? parseInt(fpsInput.value) : 120,
    masterVolume: volInput ? parseInt(volInput.value) : 100,
    volMusic: volMusic ? parseInt(volMusic.value) : 100,
    volRecord: volRecord ? parseInt(volRecord.value) : 100,
    volWeather: volWeather ? parseInt(volWeather.value) : 100,
    volBlock: volBlock ? parseInt(volBlock.value) : 100,
    volHostile: volHostile ? parseInt(volHostile.value) : 100,
    volNeutral: volNeutral ? parseInt(volNeutral.value) : 100,
    volPlayer: volPlayer ? parseInt(volPlayer.value) : 100,
    volAmbient: volAmbient ? parseInt(volAmbient.value) : 100,
    volVoice: volVoice ? parseInt(volVoice.value) : 100
  };

  const selectedBehavior = document.querySelector('input[name="close-behavior"]:checked')?.value || 'tray';
  const selectedTrayClick = document.querySelector('input[name="tray-click-action"]:checked')?.value || 'launcher';

  const result = await window.electronAPI.saveSettings({
    ram: ramInput.value,
    javaPath: javaInput.value,
    override: overrideInput ? overrideInput.checked : false,
    allowJoin: allowJoinToggle ? allowJoinToggle.checked : true,
    closeBehavior: selectedBehavior,
    trayClickAction: selectedTrayClick,
    mcOptions
  });
  if (result.success) {
    saveSettingsBtn.innerText = '✓ Saved';
    saveSettingsBtn.style.background = 'linear-gradient(135deg, #00EDAB, #00B4D8)';
    setTimeout(() => {
      saveSettingsBtn.innerText = 'Save Settings';
      saveSettingsBtn.style.background = '';
    }, 2000);
  } else {
    alert('Error saving settings.');
  }
});

loadSettings();

// Live update card styling when close behavior radio is clicked
document.querySelectorAll('input[name="close-behavior"]').forEach(radio => {
  radio.addEventListener('change', () => updateCloseBehaviorStyles(radio.value));
});

function updateTrayClickStyles(value) {
  const launcherLabel = document.getElementById('tray-click-launcher-label');
  const menuLabel = document.getElementById('tray-click-menu-label');
  if (!launcherLabel || !menuLabel) return;
  if (value === 'launcher') {
    launcherLabel.style.border = '2px solid var(--primary)';
    launcherLabel.style.background = 'var(--primary-dim)';
    menuLabel.style.border = '2px solid var(--outline)';
    menuLabel.style.background = 'rgba(255,255,255,0.02)';
  } else {
    launcherLabel.style.border = '2px solid var(--outline)';
    launcherLabel.style.background = 'rgba(255,255,255,0.02)';
    menuLabel.style.border = '2px solid var(--primary)';
    menuLabel.style.background = 'var(--primary-dim)';
  }
}

document.querySelectorAll('input[name="tray-click-action"]').forEach(radio => {
  radio.addEventListener('change', () => updateTrayClickStyles(radio.value));
});

// ─── Settings Inner Tabs ─────────────────────────────────────────
(function() {
  const tabBtns = document.querySelectorAll('.settings-tab-btn');
  const panels  = document.querySelectorAll('.settings-sub-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.target;

      // Switch panels
      panels.forEach(p => { p.style.display = 'none'; });
      const activePanel = document.getElementById(target);
      if (activePanel) activePanel.style.display = 'block';

      // Update button styles
      tabBtns.forEach(b => {
        b.style.background = 'transparent';
        b.style.color = 'var(--text-dim)';
      });
      btn.style.background = 'var(--primary-dim)';
      btn.style.color = 'var(--primary)';

      // Re-init sliders that were hidden when settings first loaded
      if (target === 'stab-game') {
        document.querySelectorAll('#stab-game input[type="range"]').forEach(slider => {
          updateSliderFill(slider);
        });
      }
    });
  });
})();

// ─── Modrinth Browser ────────────────────────────────────────────
const modrinthModal = document.getElementById('modrinth-modal');
const modrinthClose = document.getElementById('modrinth-close');
const modrinthSearch = document.getElementById('modrinth-search');
const modrinthResults = document.getElementById('modrinth-results');
const modrinthTitle = document.getElementById('modrinth-title');

let currentModrinthType = 'mod';
let currentModrinthQuery = '';
let searchDebounce = null;

// Map internal types to Modrinth categories and folder names
const modrinthConfig = {
  'mod': { title: 'Browse Mods', facet: 'mod', folder: 'mods' },
  'resourcepack': { title: 'Browse Resource Packs', facet: 'resourcepack', folder: 'resourcepacks' },
  'shader': { title: 'Browse Shaderpacks', facet: 'shader', folder: 'shaderpacks' }
};

// Open Modrinth modal when a "Browse" button is clicked
document.addEventListener('click', (e) => {
  if (e.target.matches('.btn-browse')) {
    currentModrinthType = e.target.getAttribute('data-type');
    const config = modrinthConfig[currentModrinthType];
    if (config) {
      modrinthTitle.innerText = config.title;
      modrinthModal.style.display = 'block';
      modrinthSearch.value = '';
      currentModrinthQuery = '';
      const platformSelect = document.getElementById('modrinth-platform');
      if (platformSelect) platformSelect.value = 'modrinth'; // default
      loadCategories();
      fetchBrowserResults();
    }
  }
});

const platformSelect = document.getElementById('modrinth-platform');
const categorySelect = document.getElementById('modrinth-category');

if (platformSelect) {
  platformSelect.addEventListener('change', () => {
    loadCategories();
    fetchBrowserResults();
  });
}
if (categorySelect) {
  categorySelect.addEventListener('change', fetchBrowserResults);
}

if (modrinthClose) {
  modrinthClose.addEventListener('click', () => {
    modrinthModal.style.display = 'none';
  });
}

if (modrinthSearch) {
  modrinthSearch.addEventListener('input', (e) => {
    currentModrinthQuery = e.target.value;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(fetchBrowserResults, 400);
  });
}

async function loadCategories() {
  if (!categorySelect) return;
  categorySelect.innerHTML = '<option value="">Loading...</option>';
  const platform = platformSelect ? platformSelect.value : 'modrinth';

  if (platform === 'modrinth') {
    const projectType = modrinthConfig[currentModrinthType].facet; // mod, resourcepack
    try {
      const res = await fetch(`https://api.modrinth.com/v2/tag/category`);
      const data = await res.json();
      const relevant = data.filter(c => c.project_type === projectType);
      categorySelect.innerHTML = '<option value="">All Categories</option>' +
        relevant.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    } catch (e) {
      categorySelect.innerHTML = '<option value="">Failed to load</option>';
    }
  } else if (platform === 'curseforge') {
    const classId = currentModrinthType === 'mod' ? 6 : 12; // 6=Mods, 12=Resourcepacks
    try {
      const data = await window.electronAPI.getCurseForgeCategories(classId);
      if (data && data.data) {
        categorySelect.innerHTML = '<option value="">All Categories</option>' +
          data.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      } else {
        categorySelect.innerHTML = '<option value="">All Categories</option>';
      }
    } catch (e) {
      categorySelect.innerHTML = '<option value="">Failed to load</option>';
    }
  }
}

async function fetchBrowserResults() {
  modrinthResults.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">Loading...</div>';

  if (!currentInstanceId) return;

  const resInst = await window.electronAPI.getInstances();
  const instance = resInst.instances?.find(i => i.id === currentInstanceId);
  if (!instance) return;

  const version = instance.version;
  const platform = platformSelect ? platformSelect.value : 'modrinth';
  const category = categorySelect ? categorySelect.value : '';

  if (platform === 'modrinth') {
    let loader = instance.loader === 'neoforge' ? 'neoforge' : (instance.loader === 'forge' ? 'forge' : (instance.loader === 'fabric' ? 'fabric' : null));
    const config = modrinthConfig[currentModrinthType];
    let facets = [];
    if (config.facet === 'mod' || config.facet === 'resourcepack' || config.facet === 'shader') {
      facets.push([`project_type:${config.facet}`]);
    }
    if (version) facets.push([`versions:${version}`]);
    if (loader && config.facet === 'mod') facets.push([`categories:${loader}`]);
    if (category) facets.push([`categories:${category}`]);

    const queryParams = new URLSearchParams({
      query: currentModrinthQuery,
      limit: '20',
      facets: JSON.stringify(facets)
    });

    try {
      const response = await fetch(`https://api.modrinth.com/v2/search?${queryParams.toString()}`, {
        headers: { 'User-Agent': 'Crystalline-Launcher/1.0' }
      });
      const data = await response.json();
      renderBrowserResults(data.hits.map(hit => ({
        id: hit.project_id,
        title: hit.title,
        author: hit.author,
        description: hit.description,
        icon: hit.icon_url,
        downloads: hit.downloads,
        platform: 'modrinth'
      })));
    } catch (err) {
      modrinthResults.innerHTML = `<div style="color:var(--error); text-align:center; padding:20px;">Failed to fetch Modrinth: ${err.message}</div>`;
    }
  } else if (platform === 'curseforge') {
    let modLoaderType = 0; // Any
    if (currentModrinthType === 'mod') {
      if (instance.loader === 'forge') modLoaderType = 1;
      if (instance.loader === 'fabric') modLoaderType = 4;
      if (instance.loader === 'neoforge') modLoaderType = 6;
    }
    const classId = currentModrinthType === 'mod' ? 6 : 12;

    try {
      const data = await window.electronAPI.searchCurseForge({
        classId: classId,
        categoryId: category || undefined,
        gameVersion: version,
        searchFilter: currentModrinthQuery,
        modLoaderType: modLoaderType
      });

      if (!data || !data.data) throw new Error("Invalid response from CurseForge");

      const hits = data.data.filter(mod => mod.isAvailable || mod.allowModDistribution).map(mod => ({
        id: mod.id,
        title: mod.name,
        author: mod.authors.map(a => a.name).join(', '),
        description: mod.summary,
        icon: mod.logo ? mod.logo.thumbnailUrl : null,
        downloads: mod.downloadCount,
        platform: 'curseforge'
      }));
      renderBrowserResults(hits);
    } catch (err) {
      modrinthResults.innerHTML = `<div style="color:var(--error); text-align:center; padding:20px;">Failed to fetch CurseForge: ${err.message}</div>`;
    }
  }
}

function renderBrowserResults(hits) {
  modrinthResults.innerHTML = '';
  if (hits.length === 0) {
    modrinthResults.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">No results found for your Minecraft version.</div>';
    return;
  }

  hits.forEach(hit => {
    const card = document.createElement('div');
    card.className = 'glass-panel';
    card.style.display = 'flex';
    card.style.padding = '15px';
    card.style.gap = '15px';
    card.style.alignItems = 'center';

    const img = document.createElement('img');
    img.src = hit.icon || 'https://via.placeholder.com/64?text=N/A';
    img.style.width = '64px';
    img.style.height = '64px';
    img.style.borderRadius = '8px';
    img.style.objectFit = 'cover';

    const info = document.createElement('div');
    info.style.flex = '1';
    info.innerHTML = `
        <h3 style="margin:0 0 5px 0; color:var(--text); font-size:16px;">${hit.title} <span style="font-size:12px; color:var(--text-dim); font-weight:normal;">by ${hit.author}</span></h3>
        <p style="margin:0; font-size:13px; color:var(--text-dim); line-height:1.4;">${hit.description}</p>
        <div style="margin-top:8px; font-size:11px; color:var(--primary); display:flex; gap:10px;">
          <span>↓ ${hit.downloads ? hit.downloads.toLocaleString() : 0} downloads</span>
        </div>
      `;

    const btn = document.createElement('button');
    btn.className = 'btn-primary';
    btn.innerText = 'Download';
    btn.style.padding = '8px 16px';
    btn.onclick = () => downloadBrowserProject(hit.id, hit.platform, btn);

    card.appendChild(img);
    card.appendChild(info);
    card.appendChild(btn);
    modrinthResults.appendChild(card);
  });
}

async function downloadBrowserProject(projectId, platform, btnElement) {
  btnElement.innerText = 'Downloading...';
  btnElement.disabled = true;
  btnElement.style.opacity = '0.7';

  const res = await window.electronAPI.getInstances();
  const instance = res.instances?.find(i => i.id === currentInstanceId);
  const version = instance?.version;
  const folderName = modrinthConfig[currentModrinthType].folder;

  try {
    if (platform === 'modrinth') {
      let loader = instance?.loader === 'neoforge' ? 'neoforge' : (instance?.loader === 'forge' ? 'forge' : (instance?.loader === 'fabric' ? 'fabric' : null));
      let loadersQuery = '';
      if (loader && currentModrinthType === 'mod') loadersQuery = `&loaders=["${loader}"]`;

      const vRes = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version?game_versions=["${version}"]${loadersQuery}`, {
        headers: { 'User-Agent': 'Crystalline-Launcher/1.0' }
      });
      const versions = await vRes.json();
      if (!versions || versions.length === 0) throw new Error('No compatible version file found on Modrinth.');

      const primaryFile = versions[0].files.find(f => f.primary) || versions[0].files[0];
      if (!primaryFile) throw new Error('No downloadable file found.');

      const dlResult = await window.electronAPI.downloadModrinthFile(primaryFile.url, currentInstanceId, folderName, primaryFile.filename);
      if (!dlResult.success) throw new Error(dlResult.error);

    } else if (platform === 'curseforge') {
      let modLoaderType = undefined;
      if (currentModrinthType === 'mod') {
        if (instance?.loader === 'forge') modLoaderType = 1;
        if (instance?.loader === 'fabric') modLoaderType = 4;
        if (instance?.loader === 'neoforge') modLoaderType = 6;
      }
      const data = await window.electronAPI.getCurseForgeFiles(projectId, version, modLoaderType);
      if (!data || !data.data || data.data.length === 0) throw new Error('No compatible version file found on CurseForge.');

      const file = data.data[0];
      if (!file.downloadUrl) throw new Error('Third-party downloads disabled by author.');

      const dlResult = await window.electronAPI.downloadCurseForgeFile(file.downloadUrl, currentInstanceId, folderName, file.fileName);
      if (!dlResult.success) throw new Error(dlResult.error);
    }

    btnElement.innerText = '✓ Downloaded';
    btnElement.style.background = 'var(--success)';
    document.querySelector(`.instance-card[data-id="${currentInstanceId}"]`)?.click();
  } catch (err) {
    btnElement.innerText = 'Error';
    btnElement.style.background = 'var(--error)';
    Swal.fire('Download Error', err.message, 'error');
  }

  setTimeout(() => {
    if (btnElement.innerText === '✓ Downloaded') {
      btnElement.innerText = 'Download';
      btnElement.style.background = '';
      btnElement.disabled = false;
      btnElement.style.opacity = '1';
    }
  }, 3000);
}

// ─── Phase 1: Dashboard Widgets ──────────────────────────────────────
async function initDashboardWidgets() {
  const serverContent = document.getElementById('server-status-content');
  const newsContent = document.getElementById('news-content');
  if (!serverContent || !newsContent) return;

  // 1. Fetch Server Status
  try {
    const res = await fetch('https://api.mcsrvstat.us/3/ramazanfemboy.duckdns.org:25565');
    const data = await res.json();
    if (data.online) {
      serverContent.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
          <div style="width:12px; height:12px; border-radius:50%; background:var(--success); box-shadow: 0 0 8px var(--success);"></div>
          <span style="font-size:14px; color:var(--text); font-weight:600;">Online</span>
          <span style="font-size:13px; color:var(--primary); margin-left:auto;">${data.players.online} / ${data.players.max} Players</span>
        </div>
        ${data.motd?.clean?.length ? `<div style="margin-top:12px; font-size:12px; color:var(--text-dim); background:rgba(0,0,0,0.2); padding:8px; border-radius:6px; font-family:monospace;">${data.motd.clean.join('<br>')}</div>` : ''}
      `;
    } else {
      serverContent.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px; margin-top:8px;">
          <div style="width:12px; height:12px; border-radius:50%; background:var(--error); box-shadow: 0 0 8px var(--error);"></div>
          <span style="font-size:14px; color:var(--text); font-weight:600;">Offline</span>
        </div>
        <div style="margin-top:12px; font-size:12px; color:var(--text-dim);">Server is currently unreachable.</div>
      `;
    }
  } catch (err) {
    serverContent.innerHTML = `<div style="color:var(--error); margin-top:8px;">Failed to load status.</div>`;
  }

  // 2. Fetch Patch Notes from GitHub
  try {
    const res = await fetch('https://raw.githubusercontent.com/Minenblock/crystalline-launcher/main/patch_notes.md');
    if (!res.ok) throw new Error('Not found');
    const md = await res.text();

    // Simple Markdown → HTML renderer (h2, h3, bullet lists, bold, italic, hr)
    const renderMd = (text) => {
      const lines = text.split('\n');
      let html = '';
      let inList = false;
      for (const raw of lines) {
        const line = raw.trimEnd();
        if (line.startsWith('## ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<h2 style="margin:16px 0 4px; font-size:14px; color:var(--primary); border-bottom:1px solid var(--outline); padding-bottom:4px;">${line.slice(3)}</h2>`;
        } else if (line.startsWith('### ')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<h3 style="margin:10px 0 2px; font-size:12px; color:var(--text); font-weight:700;">${line.slice(4)}</h3>`;
        } else if (line.startsWith('- ') || line.startsWith('• ')) {
          if (!inList) { html += '<ul style="margin:4px 0 0 14px; padding:0; list-style:disc;">'; inList = true; }
          const item = line.slice(2).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
          html += `<li style="margin:3px 0; font-size:12px; color:var(--text-dim);">${item}</li>`;
        } else if (line === '---') {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<hr style="border:none; border-top:1px solid var(--outline); margin:12px 0;">`;
        } else if (line.startsWith('*') && line.endsWith('*')) {
          if (inList) { html += '</ul>'; inList = false; }
          html += `<p style="margin:2px 0; font-size:11px; color:var(--text-dim); font-style:italic;">${line.slice(1, -1)}</p>`;
        } else if (line.trim()) {
          if (inList) { html += '</ul>'; inList = false; }
          const p = line.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>');
          html += `<p style="margin:4px 0; font-size:12px; color:var(--text-dim);">${p}</p>`;
        } else {
          if (inList) { html += '</ul>'; inList = false; }
        }
      }
      if (inList) html += '</ul>';
      return html;
    };

    newsContent.innerHTML = `<div style="margin-top:8px; max-height:220px; overflow-y:auto; padding-right:4px;">${renderMd(md)}</div>`;
  } catch (err) {
    newsContent.innerHTML = `<div style="color:var(--error); margin-top:8px; font-size:12px;">Failed to load patch notes.</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboardWidgets();
  initCustomTooltips();
});

// ─── Custom Tooltips ──────────────────────────────────────────────
function initCustomTooltips() {
  const tooltip = document.createElement('div');
  tooltip.id = 'custom-tooltip';
  document.body.appendChild(tooltip);

  let activeElement = null;

  function showTooltip(e, text) {
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    positionTooltip(e);
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
    activeElement = null;
  }

  function positionTooltip(e) {
    if (!tooltip.classList.contains('visible')) return;
    
    // Position offset from cursor
    let x = e.clientX + 15;
    let y = e.clientY + 15;
    
    const rect = tooltip.getBoundingClientRect();
    
    // Prevent overflowing right edge
    if (x + rect.width > window.innerWidth - 10) {
      x = e.clientX - rect.width - 10;
    }
    
    // Prevent overflowing bottom edge
    if (y + rect.height > window.innerHeight - 10) {
      y = e.clientY - rect.height - 10;
    }
    
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  // Convert existing title attributes to data-tooltip
  document.querySelectorAll('[title]').forEach(el => {
    const title = el.getAttribute('title');
    if (title) {
      el.setAttribute('data-tooltip', title);
      el.removeAttribute('title');
    }
  });

  // Watch for dynamically added title attributes using MutationObserver
  const observer = new MutationObserver((mutations) => {
    mutations.forEach(mutation => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
        const el = mutation.target;
        const title = el.getAttribute('title');
        if (title) {
          el.setAttribute('data-tooltip', title);
          el.removeAttribute('title');
        }
      } else if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.hasAttribute('title')) {
              node.setAttribute('data-tooltip', node.getAttribute('title'));
              node.removeAttribute('title');
            }
            node.querySelectorAll('[title]').forEach(el => {
              el.setAttribute('data-tooltip', el.getAttribute('title'));
              el.removeAttribute('title');
            });
          }
        });
      }
    });
  });

  observer.observe(document.body, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['title']
  });

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
      activeElement = target;
      showTooltip(e, target.getAttribute('data-tooltip'));
    }
  });

  document.addEventListener('mouseout', (e) => {
    if (activeElement && !activeElement.contains(e.relatedTarget)) {
      hideTooltip();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (activeElement) {
      positionTooltip(e);
    }
  });
}

// ─── Phase 2: Skin Manager ──────────────────────────────────────────

let skinViewer = null;
let currentSkinPath = null;
window.skinViewerInitialized = false;

// IPC Listeners for Notifications
if (window.electronAPI.onShowTrayToast) {
  window.electronAPI.onShowTrayToast(() => {
    Swal.fire({
      toast: true,
      position: 'bottom-end',
      icon: 'info',
      title: 'Launcher minimized to tray',
      text: 'Running in the background...',
      showConfirmButton: false,
      timer: 2500,
      timerProgressBar: true
    });
  });
}

if (window.electronAPI.onShowQuitWarning) {
  window.electronAPI.onShowQuitWarning(() => {
    Swal.fire({
      title: 'Task in Progress',
      text: 'A download or installation is currently running in the background. Quitting the launcher now may corrupt your files. Are you sure you want to quit?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Force Quit',
      cancelButtonText: 'Cancel'
    }).then((result) => {
      if (result.isConfirmed) {
        window.electronAPI.forceQuit();
      }
    });
  });
}

async function initSkinViewer() {
  window.skinViewerInitialized = true;

  const canvasContainer = document.getElementById('skin-3d-canvas');
  if (!canvasContainer) return;

  skinViewer = new SkinViewer({
    canvas: document.createElement('canvas'),
    width: 260,
    height: 350,
    skin: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAgCAYAAACinX6EAAAB1UlEQVR42u2XMVLDQAxF9woUNDQUVFSho2Vo8AGoXFAzVG64AQfw0FDScQJOwgmYHIArGP4Ogh9FXk3WycSONzN/dkeSk9WLpGxCCKFL6ev9NanHm0XvsynfiFQADAbwcHWx9hxsBUABUADMB4Cl2QBIafQAPt+eu5Q8AEOfLwCmAMBqBbGVCpgDgOXPqh9c/voOHsDHy1MM1C/Y4JsNAEsFwCEA0Ia6rle06Rt6F6O+W6PIe/+7y/PudnEWhb3MIVlHASB1NR4KQJIXzRoAKoCTz2yp7QPIgZPbAoMBSKJVVcW1bdsVsU/7m6Yx+/s+nK59EGw4tJ4JMZlwHP0s2JCgN1MG/xmTBHMAQPgQHFQOK3skxmXLh5KYv9gxAOhL0PNzIjpJJI6KYJ9OPlaBA0DPD7Z5/p0DkAQhPpSUt7ZZ8SkAiEF/y4o+x15Wz78VAByDvmfJIa2Jb307VlwfAPi8i5XnzwIgyXEF9AHgZBiGlLvecwz21+GoFwB8ewGw6QzQAHS5WwCkDfYOQN8BLADe7z4PNA+AHoSjApAjDcAaeHoecPw/gJMVTQ6A9WeHv30PgKVJAOAZgVW3EAQ7A+ChiiRTmhQAa4YwBABIxUsM23YN4Bsrw+tBCbm7GwAAAABJRU5ErkJggg=='
  });
  canvasContainer.appendChild(skinViewer.canvas);

  skinViewer.animation = new IdleAnimation();
  skinViewer.autoRotate = true;
  skinViewer.autoRotateSpeed = 0.5;

  await refreshSkinLibrary();
  bindSkinEvents();

  if (isLoggedIn && usernameDisplay.innerText && usernameDisplay.innerText !== 'Not logged in') {
    const res = await window.electronAPI.fetchPlayerSkin(usernameDisplay.innerText);
    if (res.success && res.base64) {
      window.previewSkin(res.path, res.base64);
    }
  }
}

async function refreshSkinLibrary() {
  const res = await window.electronAPI.loadSkins();
  const grid = document.getElementById('skin-library-grid');
  if (!grid) return;

  if (res.success && res.skins.length > 0) {
    grid.innerHTML = res.skins.map(s => `
      <div class="skin-card" style="position:relative; background:rgba(255,255,255,0.05); border:1px solid var(--outline); border-radius:8px; padding:8px; cursor:pointer; text-align:center; transition:0.2s;" onmouseover="this.style.borderColor='var(--primary)'" onmouseout="this.style.borderColor='var(--outline)'" onclick="window.previewSkin('${s.path.replace(/\\/g, '\\\\')}', '${s.base64}')">
        <img src="${s.base64}" alt="Minecraft Skin" style="width:100%; height:auto; image-rendering:pixelated; border-radius:4px;">
        <div style="font-size:10px; color:var(--text); margin-top:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${s.name.replace('.png', '')}</div>
        <button onclick="event.stopPropagation(); window.deleteSkin('${s.name}')" style="position:absolute; top:4px; right:4px; background:var(--error); color:#fff; border:none; border-radius:4px; font-size:10px; cursor:pointer; padding:2px 4px;">X</button>
      </div>
    `).join('');
  } else {
    grid.innerHTML = '<span style="font-size:12px; color:var(--text-dim); grid-column: 1/-1;">No saved skins yet. Upload or search for one!</span>';
  }
}

window.previewSkin = async (path, base64) => {
  currentSkinPath = path;
  try {
    if (base64) {
      await skinViewer.loadSkin(base64);
    } else {
      // Fallback if needed, but we always supply base64 now
      await skinViewer.loadSkin(`file://${path.replace(/\\/g, '/')}`);
    }
  } catch (err) {
    let msg = err.message || err.toString() || err.reason;
    if (msg && msg.toLowerCase().includes('skin size')) {
      msg = 'Invalid skin resolution. Please ensure the skin image is exactly 64x64 or 64x32 pixels.';
    }
    Swal.fire({
      title: 'Skin Load Error',
      text: msg,
      icon: 'error',
      background: 'var(--surface-hover)',
      color: 'var(--text)'
    });
  }
};

window.deleteSkin = async (name) => {
  const res = await Swal.fire({
    title: 'Remove Skin?',
    text: `Are you sure you want to remove ${name} from your library?`,
    icon: 'warning',
    showCancelButton: true,
    background: 'var(--surface)',
    color: 'var(--text)',
    confirmButtonColor: '#ff5555',
    confirmButtonText: 'Yes!'
  });

  if (res.isConfirmed) {
    await window.electronAPI.deleteSkin(name);
    refreshSkinLibrary();
  }
};

function bindSkinEvents() {
  const btnUpload = document.getElementById('btn-upload-skin');
  const btnSearch = document.getElementById('btn-search-skin');
  const searchInput = document.getElementById('skin-search-input');
  const btnApply = document.getElementById('btn-apply-skin');
  const btnSaveLib = document.getElementById('btn-save-skin-library');
  const applyStatus = document.getElementById('skin-apply-status');

  btnUpload.addEventListener('click', async () => {
    const res = await window.electronAPI.selectSkinFile();
    if (res.success) {
      window.previewSkin(res.path, res.base64);
      refreshSkinLibrary();
    }
  });

  btnSearch.addEventListener('click', async () => {
    const username = searchInput.value.trim();
    if (!username) return;
    if (btnSearch.innerText === '...') return;

    btnSearch.innerText = '...';
    try {
      const res = await window.electronAPI.fetchPlayerSkin(username);

      if (res.success) {
        window.previewSkin(res.path, res.base64);
        refreshSkinLibrary();
      } else {
        Swal.fire({ title: 'Not Found', text: res.error, icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
      }
    } catch (e) {
      Swal.fire({ title: 'Search Error', text: e.message || String(e), icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
    } finally {
      btnSearch.innerText = 'Search';
    }
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      btnSearch.click();
    }
  });

  btnApply.addEventListener('click', async () => {
    if (!currentSkinPath) {
      Swal.fire({ title: 'No Skin', text: 'Please select a skin first.', icon: 'warning', background: 'var(--surface-hover)', color: 'var(--text)' });
      return;
    }
    btnApply.innerText = 'Applying...';
    btnApply.disabled = true;

    const res = await window.electronAPI.applyMinecraftSkin(currentSkinPath, 'classic');

    btnApply.innerText = '✓ Apply Skin';
    btnApply.disabled = false;

    if (res.success) {
      applyStatus.style.display = 'block';
      setTimeout(() => { applyStatus.style.display = 'none'; }, 3000);
    } else {
      Swal.fire({ title: 'Upload Failed', text: res.error, icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
    }
  });

  btnSaveLib.addEventListener('click', () => {
    Swal.fire({ title: 'Info', text: 'The previewed skin is already in your library!', icon: 'info', background: 'var(--surface-hover)', color: 'var(--text)' });
  });
}

// ─── Instance Details Tabs ───────────────────────────────────────
document.querySelectorAll('.instance-tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Remove active class from all buttons and tabs
    document.querySelectorAll('.instance-tab-btn').forEach(b => {
      b.classList.remove('active');
      b.style.color = 'var(--text-dim)';
    });
    document.querySelectorAll('.instance-tab-content').forEach(c => {
      c.classList.remove('active');
      c.style.display = 'none';
    });

    // Add active class to clicked button
    btn.classList.add('active');
    btn.style.color = 'var(--text)';

    // Show corresponding tab content
    const targetId = btn.getAttribute('data-tab');
    const targetEl = document.getElementById(targetId);
    if (targetEl) {
      targetEl.classList.add('active');
      targetEl.style.display = targetId === 'tab-logs' ? 'flex' : 'block';
      if (targetId === 'tab-logs' && typeof instanceLogs !== 'undefined' && instanceLogs) {
        // Scroll to bottom when logs are shown
        instanceLogs.scrollTop = instanceLogs.scrollHeight;
      }
    }
  });
});

// ─── Auto-Updater Frontend Logic ─────────────────────────────────
if (window.electronAPI.onUpdateAvailable) {
  window.electronAPI.onUpdateAvailable((info) => {
    Swal.fire({
      title: 'Update Available!',
      text: `Version ${info.version} is ready to download.`,
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Download',
      cancelButtonText: 'Later',
      background: 'var(--surface)',
      color: 'var(--text)',
      confirmButtonColor: 'var(--primary)'
    }).then((result) => {
      if (result.isConfirmed) {
        window.electronAPI.startDownloadUpdate();
        Swal.fire({
          title: 'Downloading Update...',
          html: '<div id="update-progress-bar" style="width: 100%; height: 10px; background: #333; border-radius: 5px; overflow: hidden; margin-top: 10px;"><div id="update-progress-fill" style="width: 0%; height: 100%; background: var(--primary); transition: width 0.2s;"></div></div><div id="update-progress-text" style="margin-top: 5px; font-size: 12px; color: var(--text-dim);">0%</div>',
          allowOutsideClick: false,
          showConfirmButton: false,
          background: 'var(--surface)',
          color: 'var(--text)'
        });
      }
    });
  });

  window.electronAPI.onUpdateDownloadProgress((progress) => {
    const fill = document.getElementById('update-progress-fill');
    const text = document.getElementById('update-progress-text');
    if (fill && text) {
      fill.style.width = `${progress.percent}%`;
      text.innerText = `${Math.round(progress.percent)}% (${(progress.transferred / 1024 / 1024).toFixed(2)} MB / ${(progress.total / 1024 / 1024).toFixed(2)} MB)`;
    }
  });

  window.electronAPI.onUpdateDownloaded((info) => {
    Swal.fire({
      title: 'Update Ready',
      text: `Version ${info.version} has been downloaded. Restart to install?`,
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: 'Restart & Install',
      cancelButtonText: 'Later',
      background: 'var(--surface)',
      color: 'var(--text)',
      confirmButtonColor: 'var(--primary)',
      allowOutsideClick: false
    }).then((result) => {
      if (result.isConfirmed) {
        window.electronAPI.quitAndInstallUpdate();
      }
    });
  });

  window.electronAPI.onUpdateError((err) => {
    Swal.fire({
      title: 'Update Error',
      text: err,
      icon: 'error',
      background: 'var(--surface)',
      color: 'var(--text)'
    });
  });
}


setInterval(async () => {
  if (isDiscordLinked && viewFriends.style.display !== 'none') {
    const res = await window.electronAPI.checkDiscordAuth();
    if (res.success) updateDiscordUI(res);
  }
}, 15000);

// ─── Storage / Version Management ────────────────────────────────
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function loadStorageVersions() {
  const container = document.getElementById('storage-versions-list');
  if (!container) return;
  container.innerHTML = '<span style="color:var(--text-dim); font-size:13px;">Loading...</span>';

  const res = await window.electronAPI.listVersions();
  if (!res.success || res.versions.length === 0) {
    container.innerHTML = '<span style="color:var(--text-dim); font-size:13px;">No versions found in shared cache.</span>';
    return;
  }

  container.innerHTML = res.versions.map(v => {
    const inUse = v.usedBy.length > 0;
    const tooltip = inUse
      ? `Used by: ${v.usedBy.join(', ')}`
      : 'Not used by any instance';
    const badge = inUse
      ? `<span style="font-size:10px; background:rgba(217,70,239,0.15); color:var(--primary); border:1px solid rgba(217,70,239,0.3); border-radius:100px; padding:2px 8px; white-space:nowrap;">${v.usedBy.length} instance${v.usedBy.length > 1 ? 's' : ''}</span>`
      : `<span style="font-size:10px; background:rgba(255,255,255,0.05); color:var(--text-dim); border:1px solid rgba(255,255,255,0.1); border-radius:100px; padding:2px 8px;">Unused</span>`;
    return `
      <div style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; transition:background 0.2s;"
           title="${tooltip}">
        <span style="font-size:13px; color:var(--text); flex:1; font-family:monospace;">${v.name}</span>
        <span style="font-size:12px; color:var(--text-dim); min-width:60px; text-align:right;">${formatBytes(v.sizeBytes)}</span>
        ${badge}
        <button data-version="${v.name}" class="btn-delete-version"
          style="background:rgba(255,85,85,0.1); color:#ff5555; border:1px solid rgba(255,85,85,0.25); border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; transition:all 0.2s; white-space:nowrap;"
          ${inUse ? 'title="This version is still in use — deleting it will force a re-download on next launch"' : ''}>
          🗑 Delete
        </button>
      </div>`;
  }).join('');

  // Bind delete buttons
  container.querySelectorAll('.btn-delete-version').forEach(btn => {
    btn.addEventListener('click', async () => {
      const vName = btn.dataset.version;
      const inUse = res.versions.find(v => v.name === vName)?.usedBy.length > 0;
      const warningText = inUse
        ? `"${vName}" is still used by one or more instances. They will need to re-download this version on next launch.`
        : `"${vName}" is not used by any instance and can be safely removed.`;
      const { isConfirmed } = await Swal.fire({
        title: 'Delete Version?',
        text: warningText,
        icon: inUse ? 'warning' : 'question',
        showCancelButton: true,
        background: 'var(--surface-hover)',
        color: 'var(--text)',
        confirmButtonColor: '#ff5555',
        cancelButtonColor: 'rgba(255,255,255,0.1)',
        confirmButtonText: 'Move to Trash'
      });
      if (!isConfirmed) return;
      btn.disabled = true;
      btn.textContent = '...';
      const delRes = await window.electronAPI.deleteVersion(vName);
      if (delRes.success) {
        loadStorageVersions();
      } else {
        Swal.fire({ title: 'Error', text: delRes.error, icon: 'error', background: 'var(--surface-hover)', color: 'var(--text)' });
        btn.disabled = false;
        btn.innerHTML = '🗑 Delete';
      }
    });
  });
}

// Refresh button in the Storage card
document.getElementById('btn-refresh-versions')?.addEventListener('click', loadStorageVersions);

// ─── Range Slider Fill (keep left side pink) ─────────────────────
function updateSliderFill(slider) {
  const min = parseFloat(slider.min) || 0;
  const max = parseFloat(slider.max) || 100;
  const val = parseFloat(slider.value) || 0;
  const pct = ((val - min) / (max - min)) * 100;
  slider.style.backgroundSize = `${pct}% 100%`;
}

function initAllSliders() {
  document.querySelectorAll('input[type="range"].form-range').forEach(slider => {
    updateSliderFill(slider);
    slider.addEventListener('input', () => updateSliderFill(slider));
  });
}

// Run once on load, and again whenever settings tab is opened (sliders may be hidden initially)
initAllSliders();
navSettings.addEventListener('click', () => setTimeout(initAllSliders, 50));
