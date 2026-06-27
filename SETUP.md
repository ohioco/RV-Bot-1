# Firefighter Shift Manager Bot — Setup Guide

A single Discord command, `/shift-manage`, that posts an embed with three
buttons: **Start Shift**, **Go on Break**, **Stop Shift**. The embed shows
elapsed time and total worked time live. When a shift ends, it posts a
summary embed (name, rank, start time, end time, total time) and logs that
shift as a new row in a Google Sheet.

## How it works
- `roster.json` maps each firefighter's Discord ID to their **name** and **rank**. You maintain this file.
- `/shift-manage` shows the current status and buttons:
  - **Start Shift** — clocks in. Disabled if already on a shift.
  - **Go on Break** — pauses the worked-time clock. Button relabels to "Resume Shift" while on break.
  - **Stop Shift** — clocks out, shows a final summary embed, and appends a row to the Google Sheet.
- Break time is excluded from "Total Worked Time" — it's tracked separately and subtracted.
- No emojis are used anywhere in the bot's output.

---

## 1. Install Node.js
You need Node.js 18+. Check with:
```
node -v
```
If you don't have it, get it from https://nodejs.org (LTS version).

## 2. Install dependencies
In the project folder:
```
npm install
```

## 3. Create the Discord bot
1. Go to https://discord.com/developers/applications → **New Application**.
2. Sidebar → **Bot** → **Reset Token** → copy it. This is your `DISCORD_TOKEN`.
3. Sidebar → **OAuth2** → **URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`
   - Open the generated URL and add the bot to your server.
4. Copy the **Application ID** (General Information page) → `CLIENT_ID`.
5. Get your **Server (Guild) ID**: enable Developer Mode (User Settings → Advanced), then right-click your server icon → Copy Server ID → `GUILD_ID`.

## 4. Create the Google Sheet
1. Make a new Google Sheet.
2. Rename a tab to `Log` (or set `GOOGLE_SHEET_TAB` to whatever you name it).
3. Optional: add a header row — `Name | Rank | Start Time | End Time | Worked Time | Break Time`
4. Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/THIS_PART/edit`

## 5. Create a Google Service Account (one-time)
1. https://console.cloud.google.com/ → create a new project.
2. Search for **Google Sheets API** → **Enable**.
3. **IAM & Admin** → **Service Accounts** → **Create Service Account** (any name) → Done.
4. Open it → **Keys** → **Add Key** → **Create New Key** → **JSON**. This downloads a file.
5. Rename that file to `service-account.json` and put it in the project folder.
6. Open the file, copy the `client_email` value.
7. In your Google Sheet, click **Share**, paste that email, give it **Editor** access.

Forgetting step 7 is the most common cause of a "permission denied" error.

## 6. Configure environment variables
```
cp .env.example .env
```
Fill in `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `GOOGLE_SHEET_ID`, `GOOGLE_SHEET_TAB`.

## 7. Fill in your roster
Edit `roster.json`. Get each person's Discord ID by enabling Developer Mode,
right-clicking their name, and choosing **Copy User ID**:
```json
{
  "123456789012345678": { "name": "John Smith", "rank": "Captain" },
  "234567890123456789": { "name": "Maria Lopez", "rank": "Lieutenant" }
}
```
Anyone not in this file still works — they'll just show as their Discord username with rank "Unlisted."

## 8. Run the bot
```
npm start
```
You should see:
```
Logged in as Shift Bot#1234
Slash commands registered.
```
In Discord, run `/shift-manage`. Keep the process running (use `pm2` or similar to keep it alive long-term).

---

## Notes on persistence
Active (in-progress) shifts are stored in `active-shifts.json`, which the
bot creates automatically. If the bot restarts while someone is mid-shift,
their progress is preserved — but the buttons on their original Discord
message will need a fresh `/shift-manage` call to display correctly again,
since Discord doesn't let a bot resume editing an old message reference
after a restart in all cases.

## Troubleshooting
- **"The caller does not have permission"** → the Google Sheet wasn't shared with the service account email (step 5.7).
- **Slash command doesn't appear** → check `CLIENT_ID` / `GUILD_ID`, restart the bot.
- **Rank shows "Unlisted"** → that Discord ID isn't in `roster.json` yet.
- **Bot offline** → check `DISCORD_TOKEN` and that `npm start` is still running.
