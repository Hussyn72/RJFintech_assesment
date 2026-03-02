import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import routes from "./routes.js";
import authRoutes from "./authRoutes.js";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "rj-fintech-backend" });
});

app.use("/auth", authRoutes);
app.use("/api", routes);

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode ?? 500;
  res.status(statusCode).json({
    message: error.message ?? "Internal Server Error"
  });
});

export default app;
