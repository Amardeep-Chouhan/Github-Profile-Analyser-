import "dotenv/config"
import mysql from "mysql2/promise";
console.log("ENV CHECK:", process.env.DB_HOST, process.env.DB_USER, process.env.DB_PASSWORD ? "[set]" : "[MISSING]");
const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "github_analyzer",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z",
});

async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log("✅ MySQL connected successfully");
    conn.release();
  } catch (err) {
    console.error("❌ MySQL connection failed:", err.message);
    process.exit(1);
  }
}

export { pool, testConnection };
