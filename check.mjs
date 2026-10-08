import {getDriver, query, closeDb} from "./api/src/db/index.js";
await getDriver();
const r = await query("SELECT email,role,status FROM users WHERE lower(email)='user.test@kindredtap.test'");
console.log(JSON.stringify(r.rows));
await closeDb();
process.exit(0);
