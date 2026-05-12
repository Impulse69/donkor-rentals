const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.env.APPDATA, '@donkor/desktop/db/donkor.sqlite');
const db = new Database(dbPath);

try {
  db.exec('PRAGMA writable_schema = ON;');
  db.exec('PRAGMA defensive = OFF;');
  
  db.exec(`
    UPDATE sqlite_master 
    SET sql = replace(sql, 'REFERENCES bookings_old(id)', 'REFERENCES bookings(id)')
    WHERE type = 'table' AND sql LIKE '%REFERENCES bookings_old(id)%';
  `);
  
  db.exec('PRAGMA writable_schema = OFF;');
  db.exec('PRAGMA defensive = ON;');
  console.log("Writable schema fix applied.");
  
  // Verify it
  const tables = ['booking_lines', 'invoices', 'returns'];
  for (const table of tables) {
    const row = db.prepare(`SELECT sql FROM sqlite_master WHERE name = ?`).get(table);
    console.log(`${table} uses bookings_old:`, row ? row.sql.includes('bookings_old') : 'not found');
  }

} catch(err) {
  console.error("Error:", err);
  db.exec('PRAGMA writable_schema = OFF;');
  db.exec('PRAGMA defensive = ON;');
}
