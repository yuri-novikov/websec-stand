import express from "express";
import { WebSocketServer } from "ws";
import BatchManager from "../scripts/batch_manager.js";
const app = express();
const PORT = 3001;
const WS_PORT = 3002;

// Инициализация Batch Manager
const batchManager = new BatchManager();

try {
  app.use(express.json());
} catch {}

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

// Удален одиночный API endpoint - теперь все через batch API

// Batch API endpoints
app.post("/api/batch/create", (req, res) => {
  try {
    const config = req.body;
    const batch = batchManager.createBatch(config);
    res.json({
      success: true,
      batchId: batch.id,
      message: `Batch created with ${config.repetitions} runs`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/api/batch/:batchId/start", async (req, res) => {
  try {
    const { batchId } = req.params;

    // Запустить batch в фоне
    batchManager.startBatch(batchId).catch(error => {
      console.error(`Batch ${batchId} failed:`, error);
    });

    res.json({
      success: true,
      message: `Batch ${batchId} started`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/batch/:batchId/status", (req, res) => {
  try {
    const { batchId } = req.params;
    const status = batchManager.getBatchStatus(batchId);

    if (!status) {
      return res.status(404).json({
        success: false,
        error: `Batch ${batchId} not found`
      });
    }

    res.json({
      success: true,
      status: status
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get("/api/batch/active", (req, res) => {
  try {
    const activeBatches = batchManager.getActiveBatches();
    res.json({
      success: true,
      batches: activeBatches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// WebSocket сервер для real-time обновлений
const wss = new WebSocketServer({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe' && data.batchId) {
        batchManager.subscribeClient(data.batchId, ws);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
  });
});

console.log(`WebSocket server listening on port ${WS_PORT}`);

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
