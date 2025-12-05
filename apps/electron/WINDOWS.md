# Building Voice AI for Windows

Complete guide for building, signing, and distributing Voice AI on Windows.

## Prerequisites

### Required Software

1. **Node.js 18+** - [Download](https://nodejs.org/)
2. **Git for Windows** - [Download](https://git-scm.com/download/win)
3. **Visual Studio Build Tools** - Required for native modules
   ```powershell
   # Install via npm
   npm install --global windows-build-tools
   
   # Or download Visual Studio Build Tools
   # https://visualstudio.microsoft.com/visual-cpp-build-tools/
   ```

### Optional (for code signing)

4. **Code Signing Certificate** - EV or Standard certificate from DigiCert, Sectigo, etc.
5. **SignTool** - Included with Windows SDK

## Quick Start (Development)

```powershell
# Clone the repo
git clone https://github.com/sethdford/voiceai.git
cd voiceai

# Install dependencies
cd apps\electron
npm install

# Build frontend (from project root)
cd ..\..
cd frontend-typescript
npm install
npm run build

# Copy to Electron
xcopy dist\* ..\apps\electron\web\ /E /Y

# Run in development
cd ..\apps\electron
npm start
```

## Building for Distribution

### Unsigned Build (Testing)

```powershell
cd apps\electron

# Build frontend and package
npm run build:win

# Output will be in dist/
# - Voice AI Setup-1.0.0.exe (NSIS installer)
# - Voice AI-1.0.0-portable.exe (Portable version)
```

### Signed Build (Production)

#### 1. Get a Code Signing Certificate

For Windows SmartScreen trust, you need a code signing certificate:

- **EV Certificate** (Recommended) - Instant SmartScreen reputation
  - DigiCert, Sectigo, GlobalSign
  - ~$400-500/year
  - Requires hardware token (USB)

- **Standard Certificate** - Builds reputation over time
  - Cheaper (~$100-200/year)
  - Takes time to build SmartScreen trust

#### 2. Configure Signing

Create environment variables (or add to CI/CD):

```powershell
# For PFX file-based signing
$env:CSC_LINK = "path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"

# For EV certificate (hardware token)
$env:CSC_LINK = "path\to\certificate.pfx"
$env:CSC_KEY_PASSWORD = "your-password"
$env:WIN_CSC_LINK = "path\to\ev-certificate.pfx"
$env:WIN_CSC_KEY_PASSWORD = "your-ev-password"
```

#### 3. Build Signed App

```powershell
npm run build:win
```

## CI/CD Pipeline (GitHub Actions)

Create `.github/workflows/build-windows.yml`:

```yaml
name: Build Windows

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest
    
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      
      - name: Install dependencies
        run: |
          cd frontend-typescript
          npm ci
          cd ../apps/electron
          npm ci
      
      - name: Build frontend
        run: |
          cd frontend-typescript
          npm run build
      
      - name: Copy web assets
        run: xcopy frontend-typescript\dist\* apps\electron\web\ /E /Y
      
      - name: Build Electron
        env:
          CSC_LINK: ${{ secrets.WINDOWS_CERTIFICATE }}
          CSC_KEY_PASSWORD: ${{ secrets.WINDOWS_CERT_PASSWORD }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          cd apps/electron
          npm run build:win
      
      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: apps/electron/dist/*.exe
```

## Distribution Options

### 1. Direct Download (Website)

Host the installer on your website:
- `Voice AI Setup-1.0.0.exe` - NSIS installer
- `Voice AI-1.0.0-portable.exe` - Portable (no install)

### 2. Microsoft Store

Benefits:
- Auto-updates
- Sandboxed (trusted)
- No SmartScreen warnings

Steps:
1. Create Microsoft Partner Center account
2. Convert to MSIX package:
   ```powershell
   npm install -g electron-windows-store
   electron-windows-store --input-directory dist/win-unpacked --output-directory dist/msix
   ```
3. Submit to Store

### 3. GitHub Releases (Auto-Update)

The app is configured for GitHub-based auto-updates:

1. Create a GitHub release with the tag `v1.0.0`
2. Upload the `.exe` files
3. Users will auto-update on next launch

## SmartScreen Warnings

### Why It Happens

Windows SmartScreen flags apps from "unknown publishers":
- New apps without reputation
- Apps signed with non-EV certificates
- Unsigned apps

### Solutions

1. **EV Certificate** - Instant reputation (recommended)
2. **Build reputation** - More downloads = better trust
3. **Microsoft Store** - No warnings
4. **User instructions** - "Click More Info → Run Anyway"

## Troubleshooting

### Build Fails: "Cannot find module 'electron'"

```powershell
npm install
npm run postinstall
```

### Native Module Errors

```powershell
# Rebuild native modules
npm rebuild
# Or
.\node_modules\.bin\electron-rebuild
```

### Signing Fails

- Ensure certificate is valid and not expired
- Check CSC_LINK path is correct
- For EV certs, ensure USB token is connected
- Try with full path: `$env:CSC_LINK = "C:\full\path\to\cert.pfx"`

### App Crashes on Launch

1. Check Windows Event Viewer for errors
2. Run from command line to see console output:
   ```powershell
   .\dist\win-unpacked\Voice AI.exe
   ```
3. Check if antivirus is blocking

## Architecture Support

The build produces:
- **x64**: Most Windows PCs
- **arm64**: Windows on ARM (Surface Pro X, etc.)

Both are included in the installer by default.

## File Sizes

Typical output sizes:
- NSIS Installer: ~80-100MB
- Portable: ~80-100MB
- Unpacked: ~200MB+

## Security Considerations

1. **Hardened Runtime** - App is sandboxed where possible
2. **No unnecessary permissions** - Only mic and network
3. **Sentry for errors** - Monitor crashes in production
4. **Auto-update** - Keep users on latest secure version

## Related Documentation

- [Electron Builder Windows](https://www.electron.build/configuration/win)
- [Code Signing Guide](https://www.electron.build/code-signing)
- [Windows Store Publishing](https://docs.microsoft.com/en-us/windows/uwp/publish/)

