const { google } = require('googleapis');
const path = require('path');

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.GOOGLE_SHEET_TAB || 'Log';
const KEY_PATH = path.join(__dirname, 'service-account.json');

async function getSheetsClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const client = await auth.getClient();
  return google.sheets({ version: 'v4', auth: client });
}

/**
 * Appends one completed shift as a new row.
 * Columns: Name | Rank | Start Time | End Time | Worked Time | Break Time
 */
async function logCompletedShift({ name, rank, startTime, endTime, workedDuration, breakDuration }) {
  if (!SHEET_ID) {
    throw new Error('GOOGLE_SHEET_ID is not set in .env');
  }

  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A:F`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[name, rank, startTime, endTime, workedDuration, breakDuration]],
    },
  });
}

module.exports = { logCompletedShift };
