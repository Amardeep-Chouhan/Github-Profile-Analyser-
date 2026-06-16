import dotenv from "dotenv";
import app from "./src/app.js";
import { testConnection } from "./src/config/database.js";
dotenv.config();

const PORT = parseInt(process.env.PORT) || 3000;

async function start() {
  await testConnection();
  app.listen(PORT, () => {
    console.log(`🚀 GitHub Profile Analyzer running on http://localhost:${PORT}`);
    console.log(`📖 API docs: http://localhost:${PORT}/`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
