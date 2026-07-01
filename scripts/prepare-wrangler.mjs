import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourcePath = path.join(rootDir, "wrangler.jsonc");
const outputDir = path.join(rootDir, ".wrangler");
const outputPath = path.join(outputDir, "deploy.wrangler.jsonc");

const rawConfig = fs.readFileSync(sourcePath, "utf8");
const envDatabaseId = process.env.CLOUDFLARE_D1_DATABASE_ID?.trim();
const envBucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();

const databaseIdMatch = rawConfig.match(/"database_id"\s*:\s*"([^"]+)"/);
if (!databaseIdMatch) {
  throw new Error("wrangler.jsonc 中缺少 d1_databases.database_id 配置。");
}

const currentDatabaseId = databaseIdMatch[1];
const resolvedDatabaseId = envDatabaseId || currentDatabaseId;
if (!resolvedDatabaseId || resolvedDatabaseId === "REPLACE_WITH_D1_DATABASE_ID") {
  console.error(
    [
      "缺少 Cloudflare D1 database_id。",
      "请二选一：",
      "1. 先把 wrangler.jsonc 里的 REPLACE_WITH_D1_DATABASE_ID 改成真实 database_id。",
      "2. 或者在部署前设置环境变量 CLOUDFLARE_D1_DATABASE_ID。",
    ].join("\n"),
  );
  process.exit(1);
}

let outputConfig = rawConfig.replace(
  /"database_id"\s*:\s*"[^"]+"/,
  `"database_id": "${resolvedDatabaseId}"`,
);

outputConfig = outputConfig.replace(
  /"\$schema"\s*:\s*"node_modules\/wrangler\/config-schema\.json"/,
  `"$schema": "../node_modules/wrangler/config-schema.json"`,
);
outputConfig = outputConfig.replace(
  /"main"\s*:\s*"src\/worker\.ts"/,
  `"main": "../src/worker.ts"`,
);
outputConfig = outputConfig.replace(
  /"directory"\s*:\s*"\.\/dist"/,
  `"directory": "../dist"`,
);
outputConfig = outputConfig.replace(
  /"migrations_dir"\s*:\s*"migrations"/,
  `"migrations_dir": "../migrations"`,
);

if (envBucketName) {
  outputConfig = outputConfig.replace(
    /"bucket_name"\s*:\s*"[^"]+"/,
    `"bucket_name": "${envBucketName}"`,
  );
  outputConfig = outputConfig.replace(
    /"preview_bucket_name"\s*:\s*"[^"]+"/,
    `"preview_bucket_name": "${envBucketName}"`,
  );
}

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(outputPath, outputConfig);

console.log(`Prepared ${path.relative(rootDir, outputPath)}`);
