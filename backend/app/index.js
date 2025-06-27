import express from "express";
import { execa } from "execa";
const app = express();
const PORT = 3001;

try {
  app.use(express.json());
} catch {}

app.get("/api/ping", (req, res) => {
  res.json({ message: "pong" });
});

const options = {
  zap: {
    imageName: "zaproxy/zap-stable",
  },
};

app.post("/api/:service/run", async (req, res) => {
  const { service } = req.params;
  const { command } = req.body;

  const startTime = Date.now();
  try {
    if (!Object.keys(options).includes(service)) {
      throw new Error(`Сервис ${service} не поддерживается`);
    }

    const imageName = options[service].imageName;

    const finalCommand = `docker run --rm -t ${imageName} ${command}`;

    const { stdout } = await runCommand(finalCommand);
    const endTime = Date.now();

    res.json({
      message: "Команда выполнена",
      output: stdout,
      time: (endTime - startTime) / 1000, // время в секундах
    });
  } catch (error) {
    const endTime = Date.now();
    if (error.exitCode === 2) {
      res.json({
        message: "Сканирование завершено с находками (exit code 2)",
        output: error.stdout,
        time: (endTime - startTime) / 1000, // время в секундах
      });
      return;
    }

    res.status(500).json({
      message: "Ошибка при выполнении команды",
      error: error.stderr || error.message,
      time: (endTime - startTime) / 1000, // время в секундах
    });
  }
});

const runCommand = async (command) => {
  console.log("runCommand", command);

  const [app, ...rest] = command.split(" ");

  return execa(app, rest);
};

app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
