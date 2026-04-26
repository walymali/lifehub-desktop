# LifeHub Admin Dashboard

Personal admin panel for managing 45+ HTML tools with usage analytics and license management.

## Quick Start

**⚠️ Important:** You MUST run a local HTTP server for analytics to work across tools. The `file://` protocol isolates localStorage per directory, so each tool would have its own silo.

```bash
cd /Users/walysmac
python3 -m http.server 8000
```

Then open: **http://localhost:8000/dashboard/**

## Features

### 1. Tools View
- Browse all 45+ tools in a searchable grid
- Filter by category (Productivity, Finance, Design, Tools, Content, Landing)
- Click "Open Tool" to launch in a new tab
- See per-tool stats: opens count, time spent, Pro status

### 2. Analytics View
- **KPIs:** Total opens, active tools (30d), total time, most used
- **Top 10 Chart:** Bar chart of most-used tools
- **Timeline:** Last 30 days activity sparkline
- **Distribution:** Category donut chart

### 3. Pro Manager
- Generate license keys for any tool
- Revoke active licenses
- Copy keys to clipboard
- Keys follow format: `LH-TOOL-XXXX-XXXX`

### 4. Settings
- Export/Import full backup as JSON
- Configure cloud endpoint (future feature)
- Reset all data

## How Tools Integrate

Add ONE script tag before `</body>` in any tool:

```html
<script src="../dashboard/lifehub-sdk.js"
        data-tool-id="habit-tracker"
        data-tool-name="Habit Tracker"
        data-category="productivity"></script>
```

The SDK automatically:
- Tracks tool opens and time spent
- Exposes `window.LifeHub` API for custom events
- Applies Pro gating on `[data-pro]` elements
- Shows upgrade modal for locked features

## API Reference

```javascript
// Track custom events
LifeHub.track('habit_added', { name: 'Exercise' });

// Check Pro status
if (LifeHub.isPro('unlimited-habits')) {
  // Unlock feature
}

// Activate a license
const result = LifeHub.activate('LH-HBT-1234-ABCD');
console.log(result.message);

// Get current license
const license = LifeHub.getLicense();
```

## Pro Gating HTML

Mark any element as Pro-only with `data-pro`:

```html
<button data-pro="export-csv">Export to CSV</button>
<section data-pro="unlimited-habits">
  <!-- This section is blurred for free users -->
</section>
```

When a user without a valid license encounters these elements, they see a blur overlay with an upgrade prompt.

## Data Storage

All data is in localStorage under the key `lifehub:v1`:

```json
{
  "tools": { "habit-tracker": { "opens": 42, "timeSpent": 18420, ... } },
  "sessions": [ { "toolId": "habit-tracker", "start": 1712..., "duration": 340 } ],
  "licenses": { "habit-tracker": { "key": "LH-HBT-...", "tier": "pro", ... } },
  "global": { "cloudEndpoint": "", "version": 1 }
}
```

## Cloud Sync (Future)

To enable cloud analytics later:

1. Set up a simple endpoint (e.g., Firebase Cloud Function, Supabase, or your own)
2. In the dashboard → Settings → Cloud Sync, paste the URL
3. SDK will POST events to that endpoint in the background
4. Build a reader on your backend to aggregate cross-device data

## Integrated Tools (Demo)

The following tools have the SDK pre-integrated:

1. **habit-tracker** - Pro: unlimited habits, CSV export, streak analytics
2. **budget-tracker** - Pro: unlimited accounts, recurring transactions, PDF reports
3. **resume-builder** - Pro: premium templates, watermark-free PDF
4. **lifeboard-pro** - Pro: unlimited widgets, cloud sync
5. **quickinvoice-pro** - Pro: recurring invoices, branded templates

Other tools can be integrated by adding the script tag + `data-pro` attributes.

## Security Note

License validation is entirely client-side. This is fine for personal use and demos, but if you sell these tools publicly, you should add server-side validation via the `cloudEndpoint` hook. Without it, any user could bypass Pro gating by editing localStorage directly.

## File Structure

```
/Users/walysmac/
├── dashboard/
│   ├── index.html          # This dashboard
│   ├── lifehub-sdk.js      # Shared SDK (loaded by tools)
│   ├── config.json         # Tool registry
│   └── README.md           # This file
├── habit-tracker/
│   └── index.html          # A tool that imports the SDK
├── budget-tracker/
│   └── index.html
└── ... (43 more tools)
```
