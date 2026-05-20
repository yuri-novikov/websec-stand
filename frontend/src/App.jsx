import React, { useState, useRef, useEffect } from "react";
import {
  Button,
  Typography,
  message,
  Form,
  Input,
  Select,
  Flex,
  Progress,
  Card,
  Tag,
  InputNumber,
  Row,
  Col,
  Table,
  Space,
  Drawer,
  Checkbox,
  Segmented,
  Statistic,
  Divider,
  Empty,
  Descriptions,
} from "antd";
import axiosBase from "axios";

const { Title, Text, Paragraph } = Typography;

const API_BASE =
  import.meta.env.VITE_API_SCHEME + "://" + import.meta.env.VITE_API_HOST;

const axios = axiosBase.create({ baseURL: API_BASE });

const pingBackend = async () => {
  try {
    const res = await axios.get("/api/ping");
    message.success(res.data.message);
  } catch (e) {
    message.error("Ошибка запроса к бэкенду");
  }
};

const WSS_URL = import.meta.env.VITE_WSS_URL;

const routes = {
  scanner: "/",
  recommendations: "/recommendations",
};

const getCurrentRoute = () =>
  window.location.pathname === routes.recommendations
    ? routes.recommendations
    : routes.scanner;

const navigateTo = (path) => {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const externalLinks = {
  brokenAccess: "https://owasp.org/Top10/A01_2021-Broken_Access_Control/",
  injection: "https://owasp.org/Top10/A03_2021-Injection/",
  xss: "https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html",
  auth: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
  crypto: "https://owasp.org/Top10/A02_2021-Cryptographic_Failures/",
  misconfiguration:
    "https://owasp.org/Top10/A05_2021-Security_Misconfiguration/",
  logging:
    "https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html",
  container:
    "https://cheatsheetseries.owasp.org/cheatsheets/Docker_Security_Cheat_Sheet.html",
  componentAnalysis: "https://owasp.org/www-community/Component_Analysis",
  sbom: "https://cheatsheetseries.owasp.org/cheatsheets/Dependency_Graph_SBOM_Cheat_Sheet.html",
  cicd: "https://owasp.org/www-project-devsecops-guideline/",
  zap: "https://www.zaproxy.org/",
  semgrep: "https://semgrep.dev/",
  trivy: "https://trivy.dev/",
  gitleaks: "https://gitleaks.io/",
  dependencyTrack: "https://owasp.org/www-project-dependency-track/",
  cyclonedx: "https://cyclonedx.org/",
  syft: "https://github.com/anchore/syft",
  grype: "https://github.com/anchore/grype",
  falco: "https://falco.org/",
};

const recommendations = [
  {
    key: "access-control",
    category: "Прикладная логика",
    title: "Ошибки контроля доступа в backend или API",
    threat:
      "Несанкционированный доступ к данным другого пользователя, повышение привилегий",
    detection: [
      "Анализ бизнес-сценариев",
      "Ручное тестирование",
      "Интеграционные тесты",
      "DAST",
    ],
    protection: [
      "Проверять права на стороне сервера при каждом обращении к объекту",
      "Применять принцип минимальных привилегий",
      "Покрывать сценарии доступа интеграционными тестами",
    ],
    stage: ["Проверка кода", "Тесты перед merge", "DAST на тестовом стенде"],
    definitions: [
      { label: "OWASP Broken Access Control", url: externalLinks.brokenAccess },
    ],
    tools: [{ label: "OWASP ZAP", url: externalLinks.zap }],
  },
  {
    key: "input-processing",
    category: "Прикладная логика",
    title: "Некорректная обработка пользовательского ввода",
    threat: "SQL-инъекция, инъекция команды, изменение логики запроса",
    detection: ["SAST", "DAST", "Проверка кода", "Тесты негативных сценариев"],
    protection: [
      "Использовать параметризованные запросы",
      "Валидировать ввод",
      "Отказаться от конкатенации команд и SQL-строк",
    ],
    stage: [
      "SAST при merge request",
      "DAST после развертывания тестового стенда",
    ],
    definitions: [{ label: "OWASP Injection", url: externalLinks.injection }],
    tools: [
      { label: "Semgrep", url: externalLinks.semgrep },
      { label: "OWASP ZAP", url: externalLinks.zap },
    ],
  },
  {
    key: "client-output",
    category: "Прикладная логика",
    title: "Некорректный вывод данных на клиенте",
    threat: "XSS, кража сессии, выполнение действий от имени пользователя",
    detection: ["DAST", "SAST", "Ручная проверка DOM-сценариев"],
    protection: [
      "Использовать контекстное экранирование",
      "Безопасно работать с HTML",
      "Настроить Content Security Policy",
      "Проверять клиентские библиотеки",
    ],
    stage: [
      "Проверка frontend-кода",
      "DAST",
      "Контроль HTTP-заголовков безопасности",
    ],
    definitions: [{ label: "OWASP XSS Prevention", url: externalLinks.xss }],
    tools: [
      { label: "OWASP ZAP", url: externalLinks.zap },
      { label: "Semgrep", url: externalLinks.semgrep },
    ],
  },
  {
    key: "sessions",
    category: "Прикладная логика",
    title: "Ошибки аутентификации и управления сессиями",
    threat:
      "Захват учетной записи, обход входа, повторное использование сессии",
    detection: ["Ручное тестирование", "DAST", "Анализ конфигурации cookies"],
    protection: [
      "Использовать Secure, HttpOnly и SameSite cookies",
      "Ограничивать время жизни токенов",
      "Защитить восстановление пароля",
    ],
    stage: ["Интеграционные тесты", "Проверка конфигурации", "Тестовый DAST"],
    definitions: [
      { label: "OWASP Authentication Cheat Sheet", url: externalLinks.auth },
    ],
    tools: [{ label: "OWASP ZAP", url: externalLinks.zap }],
  },
  {
    key: "crypto",
    category: "Прикладная логика",
    title: "Ошибки криптографической защиты",
    threat: "Раскрытие паролей, токенов и чувствительных данных",
    detection: ["SAST", "Проверка конфигурации", "Проверка кода"],
    protection: [
      "Использовать TLS",
      "Применять надежное хэширование паролей",
      "Отказаться от устаревших алгоритмов",
      "Безопасно хранить ключи",
    ],
    stage: ["SAST", "Проверка переменных окружения", "Проверка конфигурации"],
    definitions: [
      { label: "OWASP Cryptographic Failures", url: externalLinks.crypto },
    ],
    tools: [
      { label: "Semgrep", url: externalLinks.semgrep },
      { label: "Gitleaks", url: externalLinks.gitleaks },
    ],
  },
  {
    key: "security-config",
    category: "Конфигурация и эксплуатация",
    title: "Ошибки конфигурации безопасности",
    threat:
      "Раскрытие служебной информации, доступ к административным endpoint'ам, небезопасный CORS",
    detection: ["DAST", "Проверка конфигураций", "Анализ deployment-файлов"],
    protection: [
      "Отключить debug-режим",
      "Настроить security headers",
      "Ограничить CORS",
      "Закрыть служебные endpoint'ы",
    ],
    stage: ["Этап сборки и развертывания", "DAST после деплоя"],
    definitions: [
      {
        label: "OWASP Security Misconfiguration",
        url: externalLinks.misconfiguration,
      },
    ],
    tools: [
      { label: "OWASP ZAP", url: externalLinks.zap },
      { label: "Trivy", url: externalLinks.trivy },
    ],
  },
  {
    key: "logging",
    category: "Конфигурация и эксплуатация",
    title: "Недостаточное логирование и мониторинг",
    threat: "Позднее обнаружение атаки, невозможность расследования инцидента",
    detection: [
      "Анализ логов",
      "Проверка событий безопасности",
      "Тестирование негативных сценариев",
    ],
    protection: [
      "Вести структурированное логирование",
      "Исключить секреты из логов",
      "Настроить алерты на критические события",
    ],
    stage: ["Runtime", "Staging", "Эксплуатационная среда"],
    definitions: [
      { label: "OWASP Logging Cheat Sheet", url: externalLinks.logging },
    ],
    tools: [{ label: "Gitleaks", url: externalLinks.gitleaks }],
  },
  {
    key: "runtime-components",
    category: "Конфигурация и эксплуатация",
    title: "Избыточные возможности сторонних компонентов в runtime",
    threat: "Доступ зависимости к файловой системе, сети или выполнению команд",
    detection: [
      "Runtime-мониторинг",
      "Анализ capabilities",
      "Проверка поведения зависимостей",
    ],
    protection: [
      "Ограничить права процесса",
      "Использовать контейнерную изоляцию",
      "Рассмотреть CBOM и runtime enforcement",
    ],
    stage: ["Staging", "Эксплуатационная среда"],
    definitions: [
      {
        label: "OWASP Component Analysis",
        url: externalLinks.componentAnalysis,
      },
    ],
    tools: [
      { label: "Falco", url: externalLinks.falco },
      { label: "Dependency-Track", url: externalLinks.dependencyTrack },
    ],
  },
  {
    key: "container-image",
    category: "Конфигурация и эксплуатация",
    title: "Уязвимости контейнерного образа",
    threat:
      "Эксплуатация уязвимого базового образа, запуск приложения с избыточными правами",
    detection: ["Сканирование образов", "Проверка Dockerfile", "Анализ слоев"],
    protection: [
      "Использовать минимальный базовый образ",
      "Запускать приложение не от root",
      "Удалять dev-зависимости и секреты",
    ],
    stage: ["Этап сборки Docker-образа"],
    definitions: [
      { label: "OWASP Docker Security", url: externalLinks.container },
    ],
    tools: [{ label: "Trivy", url: externalLinks.trivy }],
  },
  {
    key: "known-dependencies",
    category: "Цепочка поставки и DevSecOps",
    title: "Известные уязвимости в зависимостях",
    threat:
      "Эксплуатация известных уязвимостей в прямых или транзитивных пакетах",
    detection: ["SCA", "SBOM", "SBOM-based vulnerability scanning"],
    protection: [
      "Анализировать зависимости",
      "Проверять install-скрипты",
      "Сканировать секреты",
    ],
    stage: ["Job проверки зависимостей до сборки приложения"],
    definitions: [
      {
        label: "OWASP Component Analysis",
        url: externalLinks.componentAnalysis,
      },
    ],
    tools: [
      { label: "Dependency-Track", url: externalLinks.dependencyTrack },
      { label: "Trivy", url: externalLinks.trivy },
    ],
  },
  {
    key: "unsafe-packages",
    category: "Цепочка поставки и DevSecOps",
    title: "Вредоносные или небезопасные пакеты",
    threat:
      "Утечка секретов, выполнение вредоносного install-скрипта, подмена поведения приложения",
    detection: [
      "Фиксация версий",
      "Обновление зависимостей",
      "Контроль lock-файлов",
      "Отказ от неподдерживаемых пакетов",
    ],
    protection: [
      "Минимизировать зависимости",
      "Контролировать новые пакеты",
      "Запретить небезопасные lifecycle-скрипты",
      "Включить двухфакторную защиту учетных записей",
    ],
    stage: ["Этап установки зависимостей", "Просмотр изменений списка пакетов"],
    definitions: [
      {
        label: "OWASP Component Analysis",
        url: externalLinks.componentAnalysis,
      },
    ],
    tools: [
      { label: "Gitleaks", url: externalLinks.gitleaks },
      { label: "Semgrep", url: externalLinks.semgrep },
    ],
  },
  {
    key: "sbom-quality",
    category: "Цепочка поставки и DevSecOps",
    title: "Неполный или некорректный SBOM",
    threat:
      "Ложноотрицательный результат при проверке уязвимостей, ложное ощущение безопасности",
    detection: [
      "Валидация SBOM",
      "Сравнение результатов разных инструментов",
      "Контроль обязательных полей",
    ],
    protection: [
      "Использовать стабильный генератор SBOM",
      "Проверять формат",
      "Сохранять SBOM как артефакт",
    ],
    stage: ["Этап генерации SBOM после установки зависимостей"],
    definitions: [
      { label: "OWASP SBOM Cheat Sheet", url: externalLinks.sbom },
      { label: "CycloneDX", url: externalLinks.cyclonedx },
    ],
    tools: [
      { label: "Syft", url: externalLinks.syft },
      { label: "Dependency-Track", url: externalLinks.dependencyTrack },
    ],
  },
  {
    key: "cicd-compromise",
    category: "Цепочка поставки и DevSecOps",
    title: "Компрометация CI/CD-конвейера",
    threat:
      "Подмена артефакта, утечка токенов, выполнение вредоносной команды в конвейере",
    detection: [
      "Проверка YAML-файлов",
      "Сканирование на секреты",
      "Аудит прав агентов сборки",
    ],
    protection: [
      "Использовать защищенные ветки",
      "Ограничить права агентов сборки",
      "Разделять секреты",
      "Запретить вывод секретов в логи",
    ],
    stage: ["Все этапы CI/CD", "Build", "Deploy"],
    definitions: [
      { label: "OWASP DevSecOps Guideline", url: externalLinks.cicd },
    ],
    tools: [
      { label: "Gitleaks", url: externalLinks.gitleaks },
      { label: "Semgrep", url: externalLinks.semgrep },
    ],
  },
];

const categoryOptions = [
  ...new Set(recommendations.map((item) => item.category)),
];
const detectionOptions = [
  ...new Set(recommendations.flatMap((item) => item.detection)),
].sort((a, b) => a.localeCompare(b, "ru"));
const stageOptions = [
  ...new Set(recommendations.flatMap((item) => item.stage)),
].sort((a, b) => a.localeCompare(b, "ru"));

const scenarioPresets = {
  Все: {},
  "Перед merge": {
    detections: [
      "SAST",
      "Проверка кода",
      "Проверка YAML-файлов",
      "Сканирование на секреты",
    ],
  },
  "После деплоя": {
    detections: ["DAST", "Ручное тестирование", "Анализ конфигурации cookies"],
  },
  Контейнеры: {
    query: "контейнер",
  },
  Зависимости: {
    query: "зависим",
  },
};

const linkList = (items) => (
  <Space size={[8, 8]} wrap>
    {items.map((item) => (
      <Button key={item.url} href={item.url} target="_blank" size="small">
        {item.label}
      </Button>
    ))}
  </Space>
);

const tagList = (items, color) => (
  <Space size={[4, 4]} wrap>
    {items.map((item) => (
      <Tag key={item} color={color}>
        {item}
      </Tag>
    ))}
  </Space>
);

const RecommendationsPage = () => {
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState([]);
  const [detections, setDetections] = useState([]);
  const [stages, setStages] = useState([]);
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredRecommendations = recommendations.filter((item) => {
    const haystack = [
      item.category,
      item.title,
      item.threat,
      ...item.detection,
      ...item.protection,
      ...item.stage,
    ]
      .join(" ")
      .toLowerCase();

    const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
    const matchesCategory =
      categories.length === 0 || categories.includes(item.category);
    const matchesDetection =
      detections.length === 0 ||
      detections.some((method) => item.detection.includes(method));
    const matchesStage =
      stages.length === 0 || stages.some((stage) => item.stage.includes(stage));

    return matchesQuery && matchesCategory && matchesDetection && matchesStage;
  });

  const applyScenario = (scenario) => {
    const preset = scenarioPresets[scenario] || {};
    setQuery(preset.query || "");
    setDetections(preset.detections || []);
    setCategories(preset.categories || []);
    setStages(preset.stages || []);
  };

  const toolCount = new Set(
    filteredRecommendations.flatMap((item) =>
      item.tools.map((tool) => tool.label),
    ),
  ).size;

  const columns = [
    {
      title: "Характеристика уязвимости",
      dataIndex: "title",
      key: "title",
      width: 300,
      render: (value, record) => (
        <Space direction="vertical" size={4}>
          <Button
            type="link"
            style={{
              padding: 0,
              height: "auto",
              whiteSpace: "normal",
              textAlign: "left",
            }}
            onClick={() => setSelectedRecommendation(record)}
          >
            {value}
          </Button>
          <Space size={[4, 4]} wrap>
            <div
              style={{
                color: "grey",
                fontSize: "0.7rem",
              }}
            >
              {record.category}
            </div>
          </Space>
        </Space>
      ),
    },
    {
      title: "Возможная угроза",
      dataIndex: "threat",
      key: "threat",
      responsive: ["md"],
    },
    {
      title: "Методы обнаружения",
      dataIndex: "detection",
      key: "detection",
      render: (items) => tagList(items, "geekblue"),
    },
    {
      title: "Основные меры защиты",
      dataIndex: "protection",
      key: "protection",
      responsive: ["lg"],
      render: (items) => tagList(items, "purple"),
    },
    {
      title: "Место внедрения в CI/CD или процесс разработки",
      dataIndex: "stage",
      key: "stage",
      responsive: ["lg"],
      render: (items) => tagList(items, "green"),
    },
    {
      title: "Ссылки на определения и инструменты",
      key: "links",
      width: 190,
      render: (_, record) => linkList([...record.definitions, ...record.tools]),
    },
  ];

  return (
    <Flex vertical gap={16}>
      <Card>
        <Flex vertical gap={16}>
          <Flex align="start" justify="space-between" gap={16} wrap="wrap">
            <div>
              <Title level={2} style={{ marginTop: 0, marginBottom: 8 }}>
                Навигатор рекомендаций по защите
              </Title>
            </div>
            <Space size={12} wrap>
              <Statistic
                title="Найдено"
                value={filteredRecommendations.length}
              />
              <Statistic title="Инструментов" value={toolCount} />
            </Space>
          </Flex>

          <div>
            <Text strong>Пресеты под типовые ситуации</Text>
            <div style={{ marginTop: 8 }}>
              <Segmented
                options={Object.keys(scenarioPresets)}
                defaultValue="Все"
                onChange={applyScenario}
              />
            </div>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={24} lg={8}>
              <Flex vertical gap={6}>
                <Text strong>Поиск</Text>
                <Input.Search
                  allowClear
                  placeholder="XSS, SBOM, DAST, cookies..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </Flex>
            </Col>
            <Col xs={24} lg={5}>
              <Flex vertical gap={6}>
                <Text strong>Категория</Text>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Все категории"
                  value={categories}
                  onChange={setCategories}
                  options={categoryOptions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  style={{ width: "100%" }}
                />
              </Flex>
            </Col>
            <Col xs={24} lg={5}>
              <Flex vertical gap={6}>
                <Text strong>Методы обнаружения</Text>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Все методы"
                  value={detections}
                  onChange={setDetections}
                  options={detectionOptions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  style={{ width: "100%" }}
                />
              </Flex>
            </Col>
            <Col xs={24} lg={6}>
              <Flex vertical gap={6}>
                <Text strong>
                  Место внедрения в CI/CD или процесс разработки
                </Text>
                <Select
                  mode="multiple"
                  allowClear
                  placeholder="Все этапы"
                  value={stages}
                  onChange={setStages}
                  options={stageOptions.map((value) => ({
                    value,
                    label: value,
                  }))}
                  style={{ width: "100%" }}
                />
              </Flex>
            </Col>
          </Row>
        </Flex>
      </Card>

      <Table
        rowKey="key"
        columns={columns}
        dataSource={filteredRecommendations}
        pagination={false}
        locale={{
          emptyText: (
            <Empty description="Под такие фильтры рекомендаций не найдено" />
          ),
        }}
        scroll={{ x: 1500 }}
      />

      <Drawer
        title={selectedRecommendation?.title}
        width={620}
        open={Boolean(selectedRecommendation)}
        onClose={() => setSelectedRecommendation(null)}
      >
        {selectedRecommendation && (
          <Flex vertical gap={16}>
            <Descriptions column={1} size="small" bordered>
              <Descriptions.Item label="Категория">
                {selectedRecommendation.category}
              </Descriptions.Item>
              <Descriptions.Item label="Возможная угроза">
                {selectedRecommendation.threat}
              </Descriptions.Item>
            </Descriptions>

            <div>
              <Text strong>Методы обнаружения</Text>
              <div style={{ marginTop: 8 }}>
                {tagList(selectedRecommendation.detection, "geekblue")}
              </div>
            </div>

            <div>
              <Text strong>Основные меры защиты</Text>
              <Checkbox.Group
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  marginTop: 8,
                }}
                options={selectedRecommendation.protection.map((item) => ({
                  label: item,
                  value: item,
                }))}
              />
            </div>

            <div>
              <Text strong>Место внедрения в CI/CD или процесс разработки</Text>
              <div style={{ marginTop: 8 }}>
                {tagList(selectedRecommendation.stage, "green")}
              </div>
            </div>

            <Divider style={{ margin: "4px 0" }} />

            <div>
              <Text strong>Определения и методики</Text>
              <div style={{ marginTop: 8 }}>
                {linkList(selectedRecommendation.definitions)}
              </div>
            </div>

            <div>
              <Text strong>Инструменты</Text>
              <div style={{ marginTop: 8 }}>
                {linkList(selectedRecommendation.tools)}
              </div>
            </div>
          </Flex>
        )}
      </Drawer>
    </Flex>
  );
};

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
      <Card
        title="Массовые прогоны сканирования"
        style={{ marginBottom: 16 }}
        extra={<Button onClick={pingBackend}>Пинг бэкенда</Button>}
      >
        <Form
          form={batchForm}
          layout="vertical"
          onFinish={onBatchFinish}
          onValuesChange={handleBatchFormChange}
          initialValues={batchInitialValues}
        >
          <Row gutter={[16, 16]}>
            <Col xs={24} md={12}>
              <Form.Item
                label="Целевой URL"
                name="targetUrl"
                rules={[{ required: true, message: "Введите URL цели" }]}
              >
                <Input placeholder="http://juice-shop:3000" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
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

          <Row gutter={[16, 16]}>
            <Col xs={24} md={8} style={{ display: "flex", alignItems: "end" }}>
              <Form.Item
                label="Количество повторений"
                name="repetitions"
                rules={[
                  { required: true, message: "Укажите количество" },
                  { type: "number", min: 1, max: 50, message: "1-50 прогонов" },
                ]}
                style={{ flex: 1 }}
              >
                <InputNumber min={1} max={50} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8} style={{ display: "flex", alignItems: "end" }}>
              <Form.Item
                label="Интервал между прогонами (сек)"
                name="intervalSeconds"
                rules={[
                  { required: true },
                  { type: "number", min: 0, max: 60, message: "0-60 секунд" },
                ]}
                style={{ flex: 1 }}
              >
                <InputNumber min={0} max={60} style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col
              xs={24}
              md={8}
              style={{ display: "flex", alignItems: "end", marginBottom: 24 }}
            >
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
  const [route, setRoute] = useState(getCurrentRoute);

  useEffect(() => {
    const handlePopState = () => setRoute(getCurrentRoute());

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const currentPage =
    route === routes.recommendations ? <RecommendationsPage /> : <BatchScans />;

  return (
    <Flex
      vertical
      style={{
        padding: "clamp(20px, 4vw, 40px)",
      }}
    >
      <Flex align="start" justify="space-between">
        <Title>ВКР методы защиты веб-приложений</Title>
        <Space wrap justify="flex-end">
          <Button
            size="large"
            type={route === routes.scanner ? "link" : "text"}
            style={{
              borderRadius: 0,
              padding: 0,
              margin: "0 15px",
              borderBottom:
                route === routes.scanner ? "1px solid blue" : "none",
            }}
            onClick={() => navigateTo(routes.scanner)}
          >
            {`Сканирование`.toLocaleUpperCase()}
          </Button>
          <Button
            size="large"
            type={route === routes.recommendations ? "link" : "text"}
            style={{
              borderRadius: 0,
              padding: 0,
              margin: "0 15px",
              borderBottom:
                route === routes.recommendations ? "1px solid blue" : "none",
            }}
            onClick={() => navigateTo(routes.recommendations)}
          >
            {`Рекомендации`.toUpperCase()}
          </Button>
        </Space>
      </Flex>

      {currentPage}
    </Flex>
  );
};

export default App;
