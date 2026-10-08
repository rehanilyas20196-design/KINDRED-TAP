import bcrypt from "bcryptjs";
import { getDriver, transaction, closeDb } from "./api/src/db/index.js";

const pw = "Passw0rd123";
const hash = await bcrypt.hash(pw, 10);
await getDriver();
await transaction(async (tx) => {
  await tx.query(
    "UPDATE users SET password_hash=$1, updated_at=now() WHERE lower(email)=lower('user.test@kindredtap.test')",
    [hash]
  );
});
await closeDb();
console.log("ok");
process.exit(0);
