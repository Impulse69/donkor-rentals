const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(process.env.APPDATA, '@donkor/desktop/db/donkor.sqlite');
const db = new Database(dbPath);

console.log('--- Child Tables Foreign Keys ---');
const tables = ['booking_lines', 'invoices', 'returns'];
for (const table of tables) {
  const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table);
  console.log(`${table}:`, row ? row.sql.includes('bookings_old') : 'not found');
}

console.log('\n--- Bookings Triggers ---');
const triggers = db.prepare(`SELECT name, tbl_name FROM sqlite_master WHERE type = 'trigger' AND tbl_name IN ('bookings', 'bookings_old')`).all();
console.log(triggers);
