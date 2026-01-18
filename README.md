# VKR Web Security Stand

Упрощенная платформа для пакетного запуска сканов безопасности веб-приложений с автоматической генерацией markdown отчетов.

## Возможности

- **Пакетное сканирование**: Параллельный запуск нескольких сканов с настраиваемой конкурентностью
- **Raw output capture**: Полное сохранение stdout/stderr от инструментов безопасности
- **Автоматические markdown отчеты**: Парсинг результатов и генерация читаемых отчетов
- **Real-time мониторинг**: WebSocket стриминг логов и прогресса выполнения
- **Чистая архитектура**: Минимум обработки, максимум raw данных

## Поддерживаемые инструменты

- **OWASP ZAP** (baseline scans)
- **Nikto** (web server scanner)
- **Wapiti** (web application scanner)

## Архитектура

### Backend (Node.js + Express)
- **Batch Manager**: Управление параллельными сканами
- **WebSocket Server**: Real-time коммуникация (порт 3002)
- **Docker Integration**: Запуск контейнеров с инструментами безопасности
- **Markdown Generation**: Парсинг и генерация отчетов

### Frontend (React + Vite)
- **Batch Configuration**: Форма настройки параметров сканирования
- **Real-time Dashboard**: Мониторинг прогресса и логов
- **Artifact Browser**: Доступ к сгенерированным файлам

### Структура артефактов
```
artifacts/
└── {batch_id}_{tool}_{profile}/
    ├── {run_id}_raw.txt          # Полный stdout инструмента
    ├── {run_id}_report.json      # JSON отчет (если генерируется)
    └── {run_id}_report.md        # Markdown отчет с findings
```

## Требования

- **Node.js** 18+
- **Yarn** 1.22+
- **Docker** 20+
- **Docker Compose** (для локальной разработки)

## Установка и запуск

### 1. Клонирование и установка зависимостей
```bash
git clone <repository-url>
cd vkr-stand
yarn install
```

### 2. Запуск в режиме разработки
```bash
yarn dev
```

### 3. Доступ к сервисам
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **WebSocket**: ws://localhost:3002

### 4. Создание batch скана
```bash
curl -X POST http://localhost:3001/api/batch/create \
  -H "Content-Type: application/json" \
  -d '{
    "tool": "zap",
    "profile": "baseline",
    "targetUrl": "http://example.com",
    "repetitions": 3
  }'
```

## API Endpoints

### Batch Management
- `POST /api/batch/create` - Создание нового batch
- `POST /api/batch/:id/start` - Запуск batch
- `GET /api/batch/:id/status` - Статус batch
- `GET /api/batch/active` - Список активных batch'ей

### WebSocket Events
- `batch_started` - Batch запущен
- `run_completed` - Прогон завершен
- `markdown_generated` - Markdown отчет создан
- `stdout/stderr` - Live логи от инструментов

## Разработка

### Структура проекта
```
vkr-stand/
├── backend/              # Node.js backend
│   ├── scripts/         # Batch manager и run_scan.sh
│   ├── app/index.js     # Express API + WebSocket
│   └── artifacts/       # Генерируемые файлы
├── frontend/            # React frontend
│   ├── src/App.jsx      # Главный компонент
│   └── src/main.jsx     # Точка входа
├── memory-bank/         # Документация проекта
└── docker-compose.yml   # Локальная инфраструктура
```

### Добавление нового инструмента
1. Добавить парсер в `batch_manager.js`
2. Добавить логику запуска в `run_scan.sh`
3. Обновить документацию

### Кастомизация отчетов
Markdown отчеты генерируются в `generateMarkdownContent()`. Можно модифицировать:
- Форматирование таблиц
- Структура секций
- Уровень детализации findings

## Решение проблем

### Authenticated ZAP scans не работают
- Проверьте конфигурацию в `backend/zap-config/zap_auth_simple.yaml`
- Убедитесь, что ZAP automation framework корректно настроен
- Проверьте логи контейнера: `docker logs <container_id>`

### Пустые директории batch
- Проверьте права доступа к `backend/artifacts/`
- Убедитесь, что Docker работает: `docker ps`
- Проверьте логи backend: `tail -f backend/logs/*.log`

### WebSocket не подключается
- Проверьте, что порт 3002 свободен
- Убедитесь, что backend запущен: `curl http://localhost:3001/api/ping`

## Лицензия

VKR Project - Internal Use Only
