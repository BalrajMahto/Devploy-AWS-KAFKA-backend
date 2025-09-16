const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const { Kafka } = require("kafkajs");
require("dotenv").config();

const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const projectId = process.env.PROJECT_ID;
const DEPLOYMENT_ID = process.env.DEPLOYMENT_ID;

// Kafka setup
const kafkaCertPath = path.join(__dirname, "kafka.pem");
if (!fs.existsSync(kafkaCertPath)) {
  console.error("❌ Kafka SSL certificate not found at:", kafkaCertPath);
  process.exit(1);
}

const kafka = new Kafka({
  clientId: "api-server",
  brokers: [
    "kafka-1ec32890-balrajkvbndm-e4be.d.aivencloud.com:24776",
  ],
  ssl: { ca: [fs.readFileSync(kafkaCertPath, "utf-8")] },
  sasl: {
    mechanism: "plain",
    username: process.env.KAFKA_USERNAME,
    password: process.env.KAFKA_PASSWORD 
  },
});

const producer = kafka.producer();

async function publishlog(message) {
  try {
    await producer.send({
      topic: "container-logs",
      messages: [
        {
          key: "log",
          value: JSON.stringify({
            projectId,
            deploymentId: DEPLOYMENT_ID,
            log: message,
          }),
        },
      ],
    });
  } catch (error) {
    console.error("❌ Failed to publish log:", error.message);
  }
}

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, arrayOfFiles);
    } else {
      arrayOfFiles.push(fullPath); // store absolute path
    }
  }
  return arrayOfFiles;
}

async function init() {
  try {
    await producer.connect();
    console.log("✅ Kafka producer connected");

    const outputDir = path.join(__dirname, "output");
    console.log("Executing build script...");
    await publishlog("Build started...");

    const p = exec(`cd ${outputDir} && npm install && npm run build`);

    p.stdout.on("data", (data) => {
      console.log(data.toString());
      publishlog(data.toString()).catch(() => {});
    });

    p.stderr.on("data", (data) => {
      console.error("Error:", data.toString());
      publishlog(`error: ${data.toString()}`).catch(() => {});
    });

    p.on("close", async () => {
      console.log(`Build Complete`);
      await publishlog(`Build complete. Starting upload...`);

      // Vite → dist, CRA → build
      let distFolderPath = path.join(outputDir, "dist");
      if (!fs.existsSync(distFolderPath)) {
        distFolderPath = path.join(outputDir, "build");
      }

      if (!fs.existsSync(distFolderPath)) {
        const msg = "❌ Build folder not found. Did the build actually succeed?";
        console.error(msg);
        await publishlog(msg);
        process.exit(1);
      }

      const distFolderContents = getAllFiles(distFolderPath);

      for (const filePath of distFolderContents) {
        if (!fs.existsSync(filePath)) {
          console.error(`❌ File not found: ${filePath}`);
          await publishlog(`❌ File not found: ${filePath}`);
          continue; // Skip missing files
        }

        const relativeKey = path.relative(distFolderPath, filePath).replace(/\\/g, "/");
        await uploadFile(filePath, relativeKey);
      }

      async function uploadFile(filePath, relativeKey) {
        const maxRetries = 3;
        let attempt = 0;

        while (attempt < maxRetries) {
          try {
            const fileStats = fs.statSync(filePath);

            const command = new PutObjectCommand({
              Bucket: "devploy-data",
              Key: `__outputs/${projectId}/${relativeKey}`,
              Body: fs.createReadStream(filePath),
              ContentType: mime.lookup(filePath) || "application/octet-stream",
              ContentLength: fileStats.size,
            });

            await s3Client.send(command);
            console.log("Uploaded:", relativeKey);
            await publishlog(`Uploaded: ${relativeKey}`);
            return; // Exit loop on success
          } catch (err) {
            attempt++;
            console.error(`❌ Failed upload (attempt ${attempt}):`, filePath, err.message);
            await publishlog(`❌ Failed upload (attempt ${attempt}): ${filePath} - ${err.message}`);
            if (attempt === maxRetries) {
              console.error("❌ Max retries reached for:", filePath);
            }
          }
        }
      }

      console.log("✅ Upload Done...");
      await publishlog(
        `✅ Upload Done. Your app should be live in a few minutes.`
      );

      console.log("All done, disconnecting...");
      await producer.disconnect();
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Error during initialization:", error.message);
    await publishlog(`❌ Error during initialization: ${error.message}`);
    await producer.disconnect();
    process.exit(1);
  }
}

init();
