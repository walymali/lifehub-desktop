# Releasing LifeHub Desktop

Auto-update pipeline using GitHub Releases + electron-updater.

## One-time setup

1. Create a public GitHub repo `lifehub-desktop` (or private — works either way)
2. Edit `package.json` → `build.publish[0].owner` → set to your GitHub username
3. Push the desktop project to the repo:
   ```bash
   cd /Users/walysmac/lifehub-desktop
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin git@github.com:YOUR_USERNAME/lifehub-desktop.git
   git push -u origin main
   ```

## Shipping a new version

```bash
# 1. Bump the version in package.json (e.g. 1.0.0 → 1.0.1)
npm version patch    # or minor / major
# This auto-creates a git commit + tag

# 2. Push the tag → triggers the GitHub Actions release workflow
git push origin main --follow-tags
```

GitHub Actions then:
1. Builds Mac (.dmg + .zip), Windows (.exe + portable), Linux (.AppImage + .deb)
2. Creates a GitHub Release with all installers attached
3. Generates the `latest-mac.yml`, `latest.yml`, `latest-linux.yml` metadata files

Customers' Desktop apps poll the release feed every 4h, download the update silently, and prompt to install on next launch.

## Manual release (no GitHub Actions)

```bash
# Set your GitHub token first:
export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxxxx

# Build + publish:
npx electron-builder --mac --publish always
npx electron-builder --win --publish always
npx electron-builder --linux --publish always
```

## Code signing (optional but recommended for distribution)

**Mac**: Apple Developer Program ($99/yr)
1. Generate a "Developer ID Application" certificate in your Apple Developer account
2. Install it in Keychain
3. In GitHub Actions secrets, add:
   - `APPLE_ID` — your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD` — generated at appleid.apple.com → Sign-In + Security → App-Specific Passwords
   - `APPLE_TEAM_ID` — found in your Apple Developer account
4. Update `package.json` mac config:
   ```json
   "mac": {
     "hardenedRuntime": true,
     "gatekeeperAssess": true,
     "identity": "Developer ID Application: YOUR NAME (TEAM_ID)",
     "entitlements": "build/entitlements.mac.plist",
     "entitlementsInherit": "build/entitlements.mac.plist"
   }
   ```
5. Uncomment the APPLE_* env vars in `.github/workflows/release.yml`

**Windows**: $200/yr code signing certificate from Sectigo or DigiCert. See [electron-builder docs](https://www.electron.build/code-signing).

Without signing, users will see "unverified developer" warnings on first launch (right-click → Open is the workaround).

## Verify auto-updater works

1. Build a release with version 1.0.0
2. Install it locally
3. Bump version to 1.0.1, push tag, wait for Actions to publish
4. Quit + reopen LifeHub on your machine
5. You should see "LifeHub update ready" dialog within ~30 seconds

## Channel strategy (advanced)

By default, all customers get the latest release. To run beta + stable channels separately:

```yaml
# package.json publish config
"publish": {
  "provider": "github",
  "owner": "YOUR_USERNAME",
  "repo": "lifehub-desktop",
  "channel": "latest"  // or "beta"
}
```

Tag prereleases as `v1.1.0-beta.1` and stable as `v1.1.0`.
