# 🚀 Devploy – Modern Automated Deployment Platform

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![AWS ECS](https://img.shields.io/badge/AWS%20ECS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)
![AWS S3](https://img.shields.io/badge/AWS%20S3-569A31?style=for-the-badge&logo=amazonaws&logoColor=white)
![Kafka](https://img.shields.io/badge/Kafka-231F20?style=for-the-badge&logo=apachekafka&logoColor=white)
![ClickHouse](https://img.shields.io/badge/ClickHouse-FCCC00?style=for-the-badge&logo=clickhouse&logoColor=black)

Devploy is a **Modern Cloud-Native Deployment Platform** that automates building, deploying, and serving web apps.  
It integrates with **AWS ECS, S3, Kafka, Prisma, and ClickHouse** to deliver **fast, scalable deployments**.

---

## 📌 Features
- **Project Management API** – create/manage projects with subdomains  
- **Automated Builds** – isolated builds using **AWS ECS (Fargate)**  
- **Real-time Logs** – via **Kafka → ClickHouse → WebSockets**  
- **Static Hosting** – built apps uploaded & served from **AWS S3**  
- **Reverse Proxy** – subdomain mapping for each project  
- **Retries & Checks** – reliable S3 uploads  
- **Microservices Architecture** – API, build server, reverse proxy  

---

## 🛠️ Tech Stack
- **Node.js / Express.js** – backend API & reverse proxy  
- **Docker + AWS ECS** – containerized builds  
- **AWS S3** – hosting artifacts  
- **Kafka + ClickHouse** – log streaming & storage  
- **Prisma + PostgreSQL** – database ORM & persistence  
- **Socket.IO** – real-time log streaming  

---
##  🖼️ Architecture design
![devploy -backend Architecture][https://github.com/BalrajMahto/Devploy-AWS-KAFKA-backend/blob/c61ea5c3aec49b219736e37c34364c9fd958255c/architecture.png]
## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/<your-username>/devploy.git
cd devploy

2. Install dependencies
npm install

3. Set environment variables

Create a .env file:

DATABASE_URL=postgresql://user:password@host:5432/devploy
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET=devploy-data
KAFKA_BROKER=broker:9092
CLICKHOUSE_URL=http://clickhouse:8123

4. Run services
# Run API server
cd api-server && npm start

# Run build server
cd build-server && npm start

# Run reverse proxy
cd s3-reverse-proxy && npm start

🐳 Docker Setup
Build Docker image
docker build -t devploy-api ./api-server

Run container
docker run -p 9000:9000 devploy-api

☁️ Deploying to AWS
1. Authenticate Docker to AWS ECR
aws ecr get-login-password --region ap-south-1 \
| docker login --username AWS --password-stdin <aws-account-id>.dkr.ecr.ap-south-1.amazonaws.com

2. Create an ECR Repository
aws ecr create-repository --repository-name devploy-api

3. Tag & Push Image to ECR
docker tag devploy-api:latest <aws-account-id>.dkr.ecr.ap-south-1.amazonaws.com/devploy-api:latest

docker push <aws-account-id>.dkr.ecr.ap-south-1.amazonaws.com/devploy-api:latest

4. Deploy on ECS

Create a Task Definition in ECS

Add the ECR image URL

Run it as a Service (Fargate or EC2)

Expose API & reverse proxy ports via Load Balancer

✅ Verification

Once deployed:

API → http://<ecs-service-public-dns>:9000/project

Logs (WebSocket) → ws://<ecs-service-dns>:9001

App → http://<project-name>.<your-domain>

You should see your app live 🚀

🔮 Future Improvements

Dashboard UI for managing deployments

Multi-cloud support (Azure/GCP)

CDN integration for faster static delivery

Support for backend container deployments

📜 License

MIT License – use, modify, and share freely.

⭐️ Made with ❤️ for modern developers

---
