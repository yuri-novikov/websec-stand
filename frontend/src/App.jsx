import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Typography,
  message,
  Form,
  Input,
  Select,
  Alert,
  Flex,
  Progress,
  Card,
  List,
  Tag,
  InputNumber,
  Row,
  Col,
} from "antd";
import axios from "axios";

const { Title } = Typography;

const pingBackend = async () => {
  try {
    const res = await axios.get("/api/ping");
    message.success(res.data.message);
  } catch (e) {
    message.error("Ошибка запроса к бэкенду");
  }
};

const WSS_URL = import.meta.env.VITE_WSS_URL;

// Batch component
const BatchScans = () => {
  const [batchForm] = Form.useForm();
  const [batchLoading, setBatchLoading] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(null);
  const [progress, setProgress] = useState({
    total: 1,
    completed: 0,
    running: 0,
    failed: 0,
    status: "ready",
  });
  const [runStatuses, setRunStatuses] = useState(
    Array.from({ length: 1 }, (_, index) => ({
      runIndex: index,
      runId: `pending_${index}`,
      status: "pending",
      startedAt: null,
      completedAt: null,
      duration: null,
      result: null,
      logs: [],
    })),
  );
  const [logs, setLogs] = useState([]);
  const [selectedRunIndex, setSelectedRunIndex] = useState(0);
  const wsRef = useRef(null);
  const logsScrollRef = useRef(null);

  // Автоматическая прокрутка логов вниз при обновлении
  useEffect(() => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [logs]);

  const batchInitialValues = {
    targetUrl: "http://juice-shop:3000",
    tool: "zap",
    repetitions: 1,
    intervalSeconds: 2,
  };

  const connectWebSocket = (batchId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    const ws = new WebSocket(WSS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      ws.send(JSON.stringify({ type: "subscribe", batchId }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log("WebSocket message:", data);

      switch (data.type) {
        case "batch_started":
          setProgress((prev) => ({
            ...prev,
            status: "running",
            total: data.total || prev.total,
          }));
          setLogs((prev) => [
            ...prev,
            `🚀 Batch started with ${data.total || prev.total} runs`,
          ]);
          break;

        case "run_started":
          setLogs((prev) => [...prev, `▶️ Started run ${data.runIndex + 1}`]);
          break;

        case "run_status_update":
          setRunStatuses((prev) => {
            const updated = [...prev];
            if (updated[data.runIndex]) {
              updated[data.runIndex] = { ...updated[data.runIndex], ...data };
            }
            return updated;
          });
          break;

        case "run_metrics_update":
          console.log("🎯 Received run_metrics_update:", data);
          setRunStatuses((prev) => {
            const updated = [...prev];
            if (updated[data.runIndex]) {
              updated[data.runIndex] = {
                ...updated[data.runIndex],
                metrics: data.metrics,
              };
              console.log(
                "📊 Updated runStatus with metrics:",
                updated[data.runIndex],
              );
            } else {
              console.error("❌ No runStatus found for index:", data.runIndex);
            }
            return updated;
          });
          break;

        case "stdout":
          setLogs((prev) => [...prev, `[${data.runId}] ${data.line}`]);
          break;

        case "stderr":
          setLogs((prev) => [...prev, `❌ [${data.runId}] ${data.line}`]);
          break;

        case "run_completed":
          setProgress((prev) => ({
            ...prev,
            completed: (prev?.completed || 0) + 1,
          }));
          setLogs((prev) => [...prev, `✅ Run ${data.runIndex + 1} completed`]);
          break;

        case "run_failed":
          setProgress((prev) => ({
            ...prev,
            failed: (prev?.failed || 0) + 1,
          }));
          setLogs((prev) => [
            ...prev,
            `❌ Run ${data.runIndex + 1} failed: ${data.error}`,
          ]);
          break;

        case "processing_started":
          setLogs((prev) => [...prev, `🔄 Processing results...`]);
          break;

        case "processing_completed":
          setLogs((prev) => [...prev, `✅ Processing completed`]);
          break;

        case "batch_completed":
          setProgress((prev) => ({ ...prev, status: "completed" }));
          setLogs((prev) => [...prev, `🎉 Batch completed!`]);
          setBatchLoading(false); // Включаем кнопку после завершения
          message.success("Batch completed successfully!");
          break;

        case "batch_status":
          setProgress((prev) => ({ ...prev, ...data }));
          if (data.runStatuses) {
            setRunStatuses(data.runStatuses);
          }
          break;
      }
    };

    ws.onerror = (error) => {
      console.error("WebSocket error:", error);
      setLogs((prev) => [...prev, `🔌 WebSocket error: ${error}`]);
    };

    ws.onclose = () => {
      console.log("WebSocket closed");
    };
  };

  const createBatch = async (values) => {
    try {
      const res = await axios.post("/api/batch/create", values);
      return res.data.batchId;
    } catch (error) {
      throw new Error("Failed to create batch: " + error.message);
    }
  };

  const startBatch = async (batchId) => {
    try {
      await axios.post(`/api/batch/${batchId}/start`);
    } catch (error) {
      throw new Error("Failed to start batch: " + error.message);
    }
  };

  const onBatchFinish = async (values) => {
    setBatchLoading(true);
    setLogs([]);
    // Не сбрасываем progress, чтобы сохранить total из формы

    try {
      // Create batch
      const batchId = await createBatch(values);
      setCurrentBatch(batchId);
      message.success(`Batch created: ${batchId}`);

      // Start batch
      await startBatch(batchId);

      // Connect WebSocket for progress updates
      connectWebSocket(batchId);
    } catch (error) {
      message.error(error.message);
      setBatchLoading(false);
    }
  };

  // Обработчик изменений формы
  const handleBatchFormChange = (changed, all) => {
    if (changed.repetitions !== undefined && !currentBatch) {
      const repetitions = all.repetitions || 5;
      setProgress({
        total: repetitions,
        completed: 0,
        running: 0,
        failed: 0,
        status: "ready",
      });
      setRunStatuses(
        Array.from({ length: repetitions }, (_, index) => ({
          runIndex: index,
          runId: `pending_${index}`,
          status: "pending",
          startedAt: null,
          completedAt: null,
          duration: null,
          result: null,
          logs: [],
        })),
      );
    }
  };

  const getProgressPercent = () => {
    if (!progress) return 0;
    const total = progress.total || 1;
    const completed = progress.completed || 0;
    return Math.round((completed / total) * 100);
  };

  return (
    <div>
      <Card title="Массовые прогоны сканирования" style={{ marginBottom: 16 }}>
        <Form
          form={batchForm}
          layout="vertical"
          onFinish={onBatchFinish}
          onValuesChange={handleBatchFormChange}
          initialValues={batchInitialValues}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="Целевой URL"
                name="targetUrl"
                rules={[{ required: true, message: "Введите URL цели" }]}
              >
                <Input placeholder="http://juice-shop:3000" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="Инструмент"
                name="tool"
                rules={[{ required: true }]}
              >
                <Select>
                  <Select.Option value="zap">
                    OWASP ZAP (Baseline)
                  </Select.Option>
                  <Select.Option value="nikto">Nikto</Select.Option>
                  <Select.Option value="wapiti">Wapiti</Select.Option>
                  <Select.Option value="arachni">Arachni</Select.Option>
                  <Select.Option value="w4af">w4af</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={8}>
              <Form.Item
                label="Количество повторений"
                name="repetitions"
                rules={[
                  { required: true, message: "Укажите количество" },
                  { type: "number", min: 1, max: 50, message: "1-50 прогонов" },
                ]}
              >
                <InputNumber min={1} max={50} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="Интервал между прогонами (сек)"
                name="intervalSeconds"
                rules={[
                  { required: true },
                  { type: "number", min: 0, max: 60, message: "0-60 секунд" },
                ]}
              >
                <InputNumber min={0} max={60} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col span={8} style={{ display: "flex", alignItems: "end" }}>
              <Button
                type="primary"
                htmlType="submit"
                loading={batchLoading}
                disabled={batchLoading}
                block
              >
                Запустить batch
              </Button>
            </Col>
          </Row>
        </Form>
      </Card>

      <Card title="Прогресс выполнения" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <span>
              Статус:{" "}
              <Tag
                color={
                  progress.status === "running"
                    ? "processing"
                    : progress.status === "processing"
                      ? "warning"
                      : progress.status === "completed"
                        ? "success"
                        : progress.status === "failed"
                          ? "error"
                          : "default"
                }
              >
                {(progress.status === "ready" && "🎯 Готов к запуску") ||
                  (progress.status === "running" && "🔄 Выполняется") ||
                  (progress.status === "processing" &&
                    "🔄 Обработка результатов") ||
                  (progress.status === "completed" && "✅ Завершен") ||
                  (progress.status === "failed" && "❌ Ошибка")}
              </Tag>
            </span>
            <span>Batch ID: {currentBatch}</span>
          </div>
          <Progress
            percent={getProgressPercent()}
            status={progress.status === "running" ? "active" : "success"}
            strokeColor={{
              "0%": "#108ee9",
              "100%": "#87d068",
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 8,
            }}
          >
            <span>
              Выполнено: {progress.completed || 0}/{progress.total || 0}
            </span>
            <span>Ошибок: {progress.failed || 0}</span>
          </div>
        </div>
      </Card>

      {runStatuses.length > 0 && (
        <Row gutter={16}>
          {/* Левая колонка - карточки прогонов */}
          <Col xs={24} md={10} lg={8}>
            <Card
              title="Статус каждого прогона"
              style={{ marginBottom: 16, height: "600px", overflow: "auto" }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {runStatuses.map((runStatus, index) => {
                  const getStatusColor = (status) => {
                    switch (status) {
                      case "pending":
                        return "default";
                      case "running":
                        return "processing";
                      case "completed":
                        return "success";
                      case "failed":
                        return "error";
                      default:
                        return "default";
                    }
                  };

                  const formatDuration = (duration) => {
                    if (!duration) return "-";
                    return `${(duration / 1000).toFixed(1)}s`;
                  };

                  const formatTime = (timestamp) => {
                    if (!timestamp) return "-";
                    return new Date(timestamp).toLocaleTimeString();
                  };

                  const isSelected = selectedRunIndex === index;

                  return (
                    <Card
                      key={index}
                      size="small"
                      hoverable
                      onClick={() => setSelectedRunIndex(index)}
                      style={{
                        cursor: "pointer",
                        borderLeft: `4px solid ${runStatus.status === "completed" ? "#52c41a" : runStatus.status === "failed" ? "#ff4d4f" : runStatus.status === "running" ? "#1890ff" : "#d9d9d9"}`,
                        backgroundColor: isSelected ? "#f0f8ff" : "white",
                        border: isSelected
                          ? "2px solid #1890ff"
                          : "1px solid #d9d9d9",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontWeight: "bold" }}>
                          Прогон {index + 1}
                        </span>
                        <Tag color={getStatusColor(runStatus.status)}>
                          {runStatus.status === "pending" && "⏳ Ожидает"}
                          {runStatus.status === "running" && "🔄 Выполняется"}
                          {runStatus.status === "completed" && "✅ Завершен"}
                          {runStatus.status === "failed" && "❌ Ошибка"}
                        </Tag>
                      </div>

                      <div style={{ fontSize: "12px", color: "#666" }}>
                        <div>ID: {runStatus.runId}</div>
                        <div>Начало: {formatTime(runStatus.startedAt)}</div>
                        <div>
                          Завершение: {formatTime(runStatus.completedAt)}
                        </div>
                        <div>
                          Длительность: {formatDuration(runStatus.duration)}
                        </div>
                        {runStatus.metrics && (
                          <div
                            style={{
                              marginTop: 4,
                              padding: "4px",
                              backgroundColor: "#f0f8ff",
                              borderRadius: "4px",
                            }}
                          >
                            <div>
                              📊 Метрики: P:
                              {runStatus.metrics.precision?.toFixed(2)} R:
                              {runStatus.metrics.recall?.toFixed(2)} F1:
                              {runStatus.metrics.f1?.toFixed(2)}
                            </div>
                            <div>
                              🔍 Находок: {runStatus.metrics.totalFindings} (TP:
                              {runStatus.metrics.truePositives} FP:
                              {runStatus.metrics.falsePositives} UN:
                              {runStatus.metrics.unmatchedFindings})
                            </div>
                          </div>
                        )}
                        {runStatus.error && (
                          <div style={{ color: "#ff4d4f", marginTop: 4 }}>
                            Ошибка: {runStatus.error}
                          </div>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            </Card>
          </Col>

          {/* Правая колонка - лог выбранного прогона */}
          <Col xs={24} md={14} lg={16}>
            <Card
              title={`Лог прогона ${selectedRunIndex + 1}`}
              style={{ height: "600px" }}
            >
              {(() => {
                const selectedRun = runStatuses[selectedRunIndex];
                if (!selectedRun) {
                  return (
                    <div
                      style={{
                        textAlign: "center",
                        color: "#999",
                        padding: 20,
                      }}
                    >
                      Выберите прогон для просмотра лога
                    </div>
                  );
                }

                // Фильтруем логи только для выбранного прогона
                const filteredLogs = logs.filter(
                  (log) =>
                    log.includes(`[${selectedRun.runId}]`) ||
                    (log.includes(selectedRun.runId) && !log.includes("[")),
                );

                if (filteredLogs.length === 0) {
                  return (
                    <div
                      style={{
                        textAlign: "center",
                        color: "#999",
                        padding: 20,
                      }}
                    >
                      Лог еще не доступен
                    </div>
                  );
                }

                return (
                  <div
                    ref={logsScrollRef}
                    style={{ height: "500px", overflow: "auto" }}
                  >
                    <pre
                      style={{
                        fontFamily: "monospace",
                        fontSize: "12px",
                        margin: 0,
                        padding: "8px",
                        whiteSpace: "pre-wrap",
                        wordWrap: "break-word",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "4px",
                      }}
                    >
                      {filteredLogs
                        .map((log) =>
                          log.replace(`[${selectedRun.runId}] `, ""),
                        )
                        .join("\n")}
                    </pre>
                  </div>
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}
    </div>
  );
};

const App = () => {
  return (
    <Flex vertical style={{ padding: 40 }}>
      <Flex align="start" justify="space-between">
        <Title>VKR Web Security Scanner</Title>
        <Button type="primary" onClick={pingBackend}>
          Пинг бэкенда
        </Button>
      </Flex>

      <BatchScans />
    </Flex>
  );
};

export default App;
