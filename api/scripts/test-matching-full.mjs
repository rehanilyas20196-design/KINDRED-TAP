import { getDriver } from "./src/db/index.js";
import { findMatches } from "./src/routes/matching.routes.js";

(async () => {
  await getDriver();
  
  try {
    console.log("Testing findMatches...");
    const result = await findMatches("ANGER", [], "842daf49-81e6-4d47-add7-26c3340fd014");
    console.log("Match result:", JSON.stringify(result, null, 2));
  } catch (e) {
    console.error("Error:", e.message);
    console.error(e.stack);
  }
  
  process.exit(0);
})();