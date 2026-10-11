import express from "express";
import dotenv from "dotenv";
import http from "http";
import {Server} from "socket.io";
import cors from "cors";
import helmet from "helmet";
import { connectDB } from "./src/db/db.js";
import {telemetryRouter} from "./src/routers/telemetry.router.js";
import { connectRedis } from "./src/db/redis.js";
import { initSocketService } from "./src/services/socket.service.js";


const app = express();
dotenv.config({})
const server = http.createServer(app);

app.use(express.json());
app.use(express.urlencoded({extended : true}));
app.use(cors({origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173'}))
app.use(helmet());


app.use('/api', telemetryRouter);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await connectRedis();
  initSocketService(io);

  server.listen(PORT, () => {
    console.log(` Backend Server running on port ${PORT}`);
  });
};

startServer();