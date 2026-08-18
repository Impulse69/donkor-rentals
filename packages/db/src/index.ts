export interface Migration {
  id: string; // e.g. "0001_init"
  sql: string;
}
