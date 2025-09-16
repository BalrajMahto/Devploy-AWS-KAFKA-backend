const express = require('express');
const { generateSlug } = require('random-word-slugs');
const { ECSClient, RunTaskCommand } = require('@aws-sdk/client-ecs');
const { Server } = require('socket.io');
const { z } = require('zod');
const { PrismaClient } = require('@prisma/client');
const { Kafka } = require('kafkajs');
const { createClient } = require('@clickhouse/client');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { de } = require('zod/v4/locales');
const { log } = require('console');
require('dotenv').config();

// =======================
// ClickHouse Client
// =======================
const client = createClient({
  url:process.env.CLICK_HOUSE_URL,
  username: process.env.CLICK_HOUSE_USER,
  password: process.env.CLICK_HOUSE_PASSWORD,
  database: 'default'
});

// =======================
// Kafka Client
// =======================
const kafka = new Kafka({
  clientId: `docker-build-server`,
  brokers: ['kafka-1ec32890-balrajkvbndm-e4be.d.aivencloud.com:24776'],
  ssl: {
    ca: [fs.readFileSync(path.join(__dirname,'kafka.pem'), 'utf-8')]
  },
  sasl: {
    mechanism: 'plain',
    username: process.env.KAFKA_SASL_USERNAME,
    password: process.env.KAFKA_SASL_PASSWORD
  }
});

const consumer = kafka.consumer({ groupId: 'api-server-logs-consumer' });

// =======================
// Socket.IO
// =======================
const io = new Server({ cors: { origin: '*' } });
io.on('connection', (socket) => {
  socket.on('subscribe', channel => {
    socket.join(channel);
    socket.emit('subscribed', `Subscribed to ${channel}`);
  });
});
io.listen(9001, () => console.log('✅ Socket server listening on 9001'));

// =======================
// Express + Prisma + ECS
// =======================
const app = express();
const port = 9000;

const prisma = new PrismaClient();

const ecsClient = new ECSClient({
  region: 'ap-south-1',
  credentials: {
    accessKeyId: process.env.WS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

const config = {
  CLUSTER: process.env.AWS_CLUSTER_ARN,
  TASK: process.env.AWS_TASK_DEFINITION
};

app.use(express.json());

// =======================
// Routes
// =======================

// Create Project
app.post('/project', async (req, res) => {
  const schema = z.object({
    name: z.string(),
    gitURL: z.string().url()
  });

  const safeParseResult = schema.safeParse(req.body);
  if (!safeParseResult.success) {
    return res.status(400).json({ error: safeParseResult.error });
  }

  const { name, gitURL } = safeParseResult.data;

  try {
    const project = await prisma.project.create({
      data: {
        name,
        gitURL,
        subDomain: generateSlug()
      }
    });

    return res.json({ status: 'success', data: { project } });
  } catch (err) {
    console.error('DB Error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Deploy Project
app.post('/deploy', async (req, res) => {
  try {
    const { projectId } = req.body;
    if (!projectId) return res.status(400).json({ error: 'projectId is required' });

    const project = await prisma.project.findUnique({
      where: { id: projectId }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const deployment = await prisma.deployment.create({
      data: {
        projectId,
        status: 'QUEUED'
      }
    });

    const command = new RunTaskCommand({
      cluster: config.CLUSTER,
      taskDefinition: config.TASK,
      launchType: 'FARGATE',
      count: 1,
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets: [
            'subnet-068f427de330b2115',
            'subnet-061bb7fb3860ccc75',
            'subnet-0d4f7595e22c1bfa4'
          ],
          securityGroups: ['sg-0862127aa3b64ce5f'],
          assignPublicIp: 'ENABLED'
        }
      },
      overrides: {
        containerOverrides: [
          {
            name: 'builder-image',
            environment: [
              { name: 'GIT_REPOSITORY_URL', value: project.gitURL },
              { name: 'PROJECT_ID', value: String(projectId) },
              { name: 'DEPLOYMENT_ID', value: String(deployment.id) }
            ]
          }
        ]
      }
    });

    await ecsClient.send(command);

    return res.json({
      status: 'BUILDING',
      data: {
        projectSlug: project.subDomain,
        deploymentId: deployment.id,
        url: `http://${project.subDomain}.localhost:8000`
      }
    });
  } catch (error) {
    console.error('ECS RunTask Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/logs/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const logs = await client.query({
      query: `SELECT event_id, deployment_id, log, timestamp FROM log_events WHERE deployment_id = {deployment_id:String}`,
      query_params: { deployment_id: id },
      format: 'JSONEachRow'
    });

    const rawLogs = await logs.json();
    return res.json({ logs: rawLogs });
  } catch (error) {
    console.error('Error fetching logs:', error.message);
    return res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// =======================
// Kafka Consumer for Logs
// =======================
async function initKafkaConsumer() {
  try {
    await consumer.connect();
    await consumer.subscribe({ topic: 'container-logs', fromBeginning: false });

    await consumer.run({
      autoCommit: false,
      eachBatch: async ({ batch, heartbeat, commitOffsetsIfNecessary, resolveOffset }) => {
        console.log(`Processing batch of ${batch.messages.length} messages`);

        for (let message of batch.messages) {
          try {
            console.log("Raw Kafka Message:", message.value.toString());
            const stringMessage = message.value.toString();
            const { projectId, deploymentId, log } = JSON.parse(stringMessage);

            await client.insert({
              table: 'log_events',
              values: [
                {
                  event_id: uuidv4(),
                  deployment_id: deploymentId,
                  log: log,
                  timestamp: new Date().toISOString()
                }
              ],
              format: 'JSONEachRow'
            });

            resolveOffset(message.offset);
            await commitOffsetsIfNecessary();
            await heartbeat();
          } catch (err) {
            console.error('Kafka Processing Error:', err.message);
          }
        }
      }
    });
  } catch (err) {
    console.error('Kafka Init Error:', err.message);
    setTimeout(initKafkaConsumer, 5000);
  }
}

initKafkaConsumer().catch(err => console.error('Kafka Init Error:', err));

// =======================
// Start API Server
// =======================
app.listen(port, () => console.log(`🚀 API server running on port ${port}`));
