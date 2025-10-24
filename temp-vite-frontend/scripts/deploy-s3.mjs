// scripts/deploy-s3.mjs
import { config } from "dotenv";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bucket = process.env.BUCKET;
if (!bucket) {
  console.error("ERROR: BUCKET not set in .env");
  process.exit(1);
}

console.log(`Deploying to bucket: ${bucket}`);

const sync = (excludeHtml = false, cacheControl, contentType = "") => {
  const cmd = [
    "aws s3 sync",
    join(__dirname, "..", "dist").replace(/\\/g, "/"),
    `s3://${bucket}`,
    "--delete",
    `--cache-control "${cacheControl}"`,
    excludeHtml ? '--exclude "*.html"' : "",
    !excludeHtml ? '--exclude "*.*" --include "*.html"' : "",
    contentType ? `--content-type "${contentType}"` : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
};

// Upload assets (long cache)
sync(true, "max-age=31536000,public");

// Upload HTML (no cache)
sync(false, "max-age=0,no-cache,no-store,must-revalidate", "text/html");

console.log("Deploy complete!");
