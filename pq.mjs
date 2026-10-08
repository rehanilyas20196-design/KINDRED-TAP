const a = [
  "You recharge best when you have time alone after being around a lot of people",
  "You think through problems step by step before acting",
  "You prefer to try new ideas rather than stick to what is already known",
  "Unexpected changes throw you off more than they excite you",
  "You feel most at ease in familiar routines",
  "You often notice small details others miss",
  "You are comfortable speaking up in a group even if no one has asked",
  "You find it easier to listen than to interrupt",
  "You tend to imagine many possible outcomes before making a decision",
  "You feel your emotions strongly before you fully understand them",
];
import { getDriver, query, closeDb } from "./api/src/db/index.js";
await getDriver();
for (let i = 0; i < 10; i++) {
  await query(
    "INSERT INTO personality_questions (position,prompt,hint,trait,reverse,active) VALUES ($1,$2,null,'o',false,true) ON CONFLICT (position) DO UPDATE SET prompt=$2, active=true",
    [i + 1, a[i]]
  );
}
await closeDb();
console.log("ok");
process.exit(0);
