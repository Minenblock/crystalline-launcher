# Crystalline Launcher

Crystalline Launcher is a custom Minecraft launcher focused on speed, simplicity, and ease of use. It is designed to manage game instances, modpacks, and multiplayer sessions with minimal setup.

## Features

- **Multi-Instance Support**: Create and manage multiple Minecraft installations with different versions, configurations, and modloaders.
- **Modloader Integration**: Out-of-the-box support for NeoForge, Forge, Fabric, and Quilt.
- **Discord Rich Presence**: Share your game status, current server, and invite friends to join your party directly through Discord.
- **Modpack Downloads**: Import and download modpacks from CurseForge and Modrinth easily.
- **Auto-Updater**: The launcher checks for updates automatically to keep you on the latest version.
- **Skin Manager**: Manage and switch Minecraft skins directly inside the interface.

## Getting Started

1. Download the latest installer from the Releases tab.
2. Run the installer and launch the application.
3. Log in with your Microsoft Account.
4. Click the Play button to install vanilla Minecraft or create a custom instance to install mods.

## Development

If you want to build the launcher from source:

### Prerequisites
- Node.js (v18 or higher)
- npm

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Running in Development Mode
```bash
npm run dev
```

### Building the Installer
```bash
npm run dist
```
