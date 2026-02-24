import { run } from "./index.ts";

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
