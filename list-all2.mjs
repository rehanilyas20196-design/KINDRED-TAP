import {getDriver, query, closeDb} from "./api/src/db/index.js";
await getDriver();
const r = await query("SELECT email,role FROM users WHERE lower(email) LIKE '%test@kindredtap.test%' ORDER BY role,email");
console.log(r.rows.map(x => x.email + ": " + x.role).join("\n"));
await closeDb();
process.exit(0);
