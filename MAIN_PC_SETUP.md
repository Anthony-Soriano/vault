# Orbit Vault — Main PC Setup and Recovery

This repository is the transferable source copy of Orbit Vault. Follow these steps on the main Windows PC after signing into GitHub.

## What is and is not stored in Git

Git contains the application source, configuration, documentation, tests, and lockfile. It intentionally does **not** contain dependencies, compiled output, installers, development Vaults, `vault.db` files, logs, caches, or personal user data.

If an existing Vault must also be moved, copy its entire Vault directory separately (including `vault.db`, `projects/`, and `backups/`) to an external drive or private storage. Do not publish a personal Vault in this repository.

## 1. Install prerequisites

Install:

- Git for Windows
- Node.js 22.13 or newer
- pnpm 11.9.0

From PowerShell:

```powershell
corepack enable
corepack prepare pnpm@11.9.0 --activate
node --version
pnpm --version
```

## 2. Clone (the Git equivalent of unpacking)

Choose a normal local development directory that is not inside OneDrive if possible:

```powershell
New-Item -ItemType Directory -Force C:\Dev | Out-Null
Set-Location C:\Dev
git clone https://github.com/AnthonySoriano999/vault.git orbit-vault
Set-Location C:\Dev\orbit-vault
```

Git reconstructs the complete source tree, so there is no separate ZIP to unpack.

## 3. Restore dependencies and verify the source

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
```

Expected baseline when this transfer snapshot was prepared:

- 18 tests pass.
- Electron main, preload, and renderer production builds succeed.

If `pnpm install --frozen-lockfile` reports that the lockfile must change, stop and inspect the Node/pnpm versions before running a non-frozen install.

## 4. Run the development application

```powershell
pnpm dev
```

This starts Vite and launches the Electron desktop window. After adding a brand-new renderer dependency, fully stop and restart `pnpm dev`; do not rely only on hot reload.

## 5. Build an installer or unpacked application

Windows installer:

```powershell
pnpm package
```

Expected output directory: `release\`

Expected installer name: `Orbit-Vault-0.1.3-Setup.exe`

Unpacked/portable build for verification:

```powershell
pnpm package:dir
```

The generated output is disposable and excluded from Git.

## 6. Restore an existing Vault

1. Copy the complete Vault directory to the main PC.
2. Start Orbit Vault.
3. Choose **Open Vault**.
4. Select the directory containing `vault.db`.
5. Confirm projects, folders, documents, Knowledge, search, and Atlas appear.

Do not select only the `projects` subdirectory when restoring an existing Vault; select its parent Vault directory containing `vault.db`.

## 7. Start a new agent session safely

Give the agent the repository path and instruct it to read these files first:

1. `ORBIT_VAULT_MASTER_HANDOFF.md`
2. `README.md`
3. `docs/architecture.md`

Then have it run:

```powershell
git status --short
pnpm test
pnpm typecheck
pnpm build
```

The agent must not delete Vault directories, reset the working tree, or commit generated output. The master handoff describes current architectural rules, roadmap, graph decisions, and known risks.

## 8. Confirm the transfer

```powershell
git remote -v
git log --oneline --decorate -5
git status --short
```

The remote should point to `AnthonySoriano999/vault`. A clean status after cloning confirms that every tracked source file was reconstructed successfully.
