import bcrypt from "bcryptjs";
import {getDriver, query, closeDb} from "./api/src/db/index.js";
await getDriver();
const r = await query("SELECT email,password_hash FROM users WHERE lower(email)='user.test@kindredtap.test'");
const ok = await bcrypt.compare("Passw0rd123", r.rows[0].password_hash);
console.log(ok);
await closeDb();
process.exit(0);
