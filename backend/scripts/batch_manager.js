#!/usr/bin/env node

/**
 * VKR Security Stand - Batch Manager
 * Manages batch security scans with real-time progress updates
 */

import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTIFACTS_DIR = path.join(__dirname, '../artifacts');
const BATCH_DIR = path.join(ARTIFACTS_DIR, 'batch');
const SCRIPTS_DIR = __dirname;

class BatchManager {
    constructor() {
        this.batches = new Map();
        this.activeScans = new Map();
        this.maxConcurrent = 3; // Максимум 3 одновременных сканирования
    }

    /**
     * Создать новый batch
     */
    createBatch(config) {
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${config.tool}_${config.profile}`;

        // Инициализировать статусы для каждого run'а
        const runStatuses = [];
        for (let i = 0; i < config.repetitions; i++) {
            runStatuses.push({
                runIndex: i,
                runId: `${batchId}_run_${i}`,
                status: 'pending', // pending, running, completed, failed
                startedAt: null,
                completedAt: null,
                duration: null,
                result: null,
                logs: []
            });
        }

        const batch = {
            id: batchId,
            config: config,
            status: 'created',
            createdAt: Date.now(),
            runs: [],
            runStatuses: runStatuses,
            progress: {
                total: config.repetitions,
                completed: 0,
                running: 0,
                failed: 0
            },
            clients: new Set() // WebSocket клиенты для обновлений
        };

        this.batches.set(batchId, batch);
        this.ensureBatchDirectory(batchId);

        console.log(`Created batch ${batchId} with ${config.repetitions} runs`);
        return batch;
    }

    /**
     * Создать директорию для batch
     */
    ensureBatchDirectory(batchId) {
        const batchPath = path.join(ARTIFACTS_DIR, batchId);

        if (!fs.existsSync(batchPath)) {
            fs.mkdirSync(batchPath, { recursive: true });
        }
    }

    /**
     * Запустить batch
     */
    async startBatch(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch) {
            throw new Error(`Batch ${batchId} not found`);
        }

        batch.status = 'running';
        batch.startedAt = Date.now();

        this.broadcastToBatch(batchId, {
            type: 'batch_started',
            batchId: batchId,
            total: batch.config.repetitions
        });

        // Запустить все прогоны
        const runPromises = [];
        for (let i = 0; i < batch.config.repetitions; i++) {
            runPromises.push(this.scheduleRun(batchId, i));
        }

        // Ждать завершения всех прогонов
        await Promise.allSettled(runPromises);

        // Завершить batch
        await this.finalizeBatch(batchId);
    }

    /**
     * Запланировать запуск одного прогона
     */
    async scheduleRun(batchId, runIndex) {
        const batch = this.batches.get(batchId);

        // Ждать доступного слота для параллельного выполнения
        while (batch.progress.running >= this.maxConcurrent) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        batch.progress.running++;
        const runId = `${batchId}_run_${runIndex}`;

        try {
            // Обновить статус run'а
            batch.runStatuses[runIndex].status = 'running';
            batch.runStatuses[runIndex].startedAt = Date.now();

            this.broadcastToBatch(batchId, {
                type: 'run_status_update',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId,
                status: 'running',
                startedAt: batch.runStatuses[runIndex].startedAt
            });

            this.broadcastToBatch(batchId, {
                type: 'run_started',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId
            });

            // Запустить сканирование
            const result = await this.runScan(runId, { ...batch.config, batchId });

            batch.runs.push({
                runIndex: runIndex,
                runId: runId,
                result: result,
                completedAt: Date.now()
            });

            // Обновить статус run'а
            batch.runStatuses[runIndex].status = 'completed';
            batch.runStatuses[runIndex].completedAt = Date.now();
            batch.runStatuses[runIndex].duration = result.duration;
            batch.runStatuses[runIndex].result = result;

            batch.progress.completed++;

            this.broadcastToBatch(batchId, {
                type: 'run_status_update',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId,
                status: 'completed',
                completedAt: batch.runStatuses[runIndex].completedAt,
                duration: result.duration,
                result: result
            });

            this.broadcastToBatch(batchId, {
                type: 'run_completed',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId,
                result: result
            });

        } catch (error) {
            console.error(`Run ${runId} failed:`, error);
            batch.progress.failed++;

            // Обновить статус run'а
            batch.runStatuses[runIndex].status = 'failed';
            batch.runStatuses[runIndex].completedAt = Date.now();
            batch.runStatuses[runIndex].error = error.message;

            batch.runs.push({
                runIndex: runIndex,
                runId: runId,
                error: error.message,
                completedAt: Date.now()
            });

            this.broadcastToBatch(batchId, {
                type: 'run_status_update',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId,
                status: 'failed',
                completedAt: batch.runStatuses[runIndex].completedAt,
                error: error.message
            });

            this.broadcastToBatch(batchId, {
                type: 'run_failed',
                batchId: batchId,
                runIndex: runIndex,
                runId: runId,
                error: error.message
            });
        } finally {
            batch.progress.running--;
        }
    }

    /**
     * Запустить одиночное сканирование
     */
    async runScan(runId, config) {
        const startTime = Date.now();

        // Генерировать уникальный run ID для скрипта
        const scriptRunId = `${runId}_${Date.now()}`;

        // Запустить скрипт сканирования (скрипт сам обрабатывает вывод и файлы)
        const scriptPath = path.join(SCRIPTS_DIR, 'run_scan.sh');
        const process = execa(scriptPath, [
            config.tool,
            config.profile,
            scriptRunId,
            config.targetUrl,
            runId, // Передаем правильный runId как 5-й аргумент
            config.batchId // Передаем batchId как 6-й аргумент для организации файлов
        ]);

        let stdout = '';
        let stderr = '';

        // Читать stdout/stderr в real-time для WebSocket broadcasting
        process.stdout.on('data', (chunk) => {
            const line = chunk.toString();
            stdout += line;
            this.broadcastToBatch(config.batchId, {
                type: 'stdout',
                runId: runId,
                line: line.trim(),
                timestamp: Date.now()
            });
        });

        process.stderr.on('data', (chunk) => {
            const line = chunk.toString();
            stderr += line;
            this.broadcastToBatch(config.batchId, {
                type: 'stderr',
                runId: runId,
                line: line.trim(),
                timestamp: Date.now()
            });
        });

        try {
            const result = await process;
            const endTime = Date.now();

            // Сохранить stdout в файл для markdown генерации
            const rawFilePath = path.join(ARTIFACTS_DIR, config.batchId, `${runId}_raw.txt`);
            fs.writeFileSync(rawFilePath, stdout);

            return {
                runId: scriptRunId,
                exitCode: result.exitCode,
                stdout: stdout,
                stderr: stderr,
                duration: endTime - startTime,
                success: true
            };
        } catch (error) {
            const endTime = Date.now();

            // Сохранить stdout в файл даже при ошибке
            const rawFilePath = path.join(ARTIFACTS_DIR, config.batchId, `${runId}_raw.txt`);
            fs.writeFileSync(rawFilePath, stdout);

            return {
                runId: scriptRunId,
                exitCode: error.exitCode,
                stdout: stdout,
                stderr: stderr,
                error: error.message,
                duration: endTime - startTime,
                success: false
            };
        }
    }

    /**
     * Завершить batch и сохранить результаты
     */
    async finalizeBatch(batchId) {
        const batch = this.batches.get(batchId);
        batch.status = 'completed';
        batch.completedAt = Date.now();

        // Сгенерировать markdown отчеты
        await this.generateMarkdownReports(batchId);

        this.broadcastToBatch(batchId, {
            type: 'batch_completed',
            batchId: batchId
        });

        console.log(`Batch ${batchId} completed`);
    }

    /**
     * Сгенерировать markdown отчеты для всех прогонов batch
     */
    async generateMarkdownReports(batchId) {
        console.log(`Generating markdown reports for batch ${batchId}...`);

        for (const run of this.batches.get(batchId).runs) {
            if (run.result) {
                try {
                    await this.generateMarkdownReport(run.runId, run.result, batchId);
                    console.log(`Markdown report generated for run ${run.runId}`);
                    this.broadcastToBatch(batchId, {
                        type: 'markdown_generated',
                        batchId: batchId,
                        runId: run.runId,
                        reportPath: `artifacts/${batchId}/${run.runId}_report.md`
                    });
                } catch (error) {
                    console.error(`Failed to generate markdown for run ${run.runId}:`, error);
                    this.broadcastToBatch(batchId, {
                        type: 'markdown_error',
                        batchId: batchId,
                        runId: run.runId,
                        error: error.message
                    });
                }
            }
        }

        console.log(`Markdown generation completed for batch ${batchId}`);
    }

    /**
     * Сгенерировать markdown отчет из STDOUT для одного прогона
     */
    async generateMarkdownReport(runId, result, batchId) {
        const batch = this.batches.get(batchId);
        const batchDir = path.join(ARTIFACTS_DIR, batchId);

        const rawFilePath = path.join(batchDir, `${runId}_raw.txt`);
        const markdownPath = path.join(batchDir, `${runId}_report.md`);

        // Загрузить raw output
        let rawOutput = '';
        if (fs.existsSync(rawFilePath)) {
            rawOutput = fs.readFileSync(rawFilePath, 'utf8');
        }

        // Найти дополнительные файлы отчетов (JSON/HTML от ZAP)
        let reportFiles = [];
        if (fs.existsSync(batchDir)) {
            reportFiles = fs.readdirSync(batchDir)
                .filter(file => file.includes(runId) && (file.endsWith('.json') || file.endsWith('.html')))
                .map(file => `artifacts/${batchId}/${file}`);
        }

        // Парсить ценную информацию из STDOUT
        const parsedFindings = this.parseFindingsFromStdout(rawOutput, batch.config.tool);

        // Создать metadata объект из доступных данных
        const metadata = {
            tool: batch.config.tool,
            profile: batch.config.profile,
            target_url: batch.config.targetUrl,
            duration_seconds: result.duration / 1000, // конвертировать в секунды
            timestamp: new Date().toISOString()
        };

        // Генерировать markdown
        const markdown = this.generateMarkdownContent(runId, metadata, result, parsedFindings, reportFiles, batchId);
        fs.writeFileSync(markdownPath, markdown);

        console.log(`Markdown report generated: ${markdownPath}`);
    }

    /**
     * Парсить findings из STDOUT разных инструментов
     */
    parseFindingsFromStdout(rawOutput, tool) {
        const findings = [];

        switch (tool) {
            case 'zap':
                // Парсить ZAP WARN-NEW/FAIL-NEW
                const zapLines = rawOutput.split('\n');
                for (const line of zapLines) {
                    if (line.includes('WARN-NEW:') || line.includes('FAIL-NEW:')) {
                        const severity = line.includes('WARN-NEW:') ? 'WARN' : 'FAIL';
                        const titleMatch = line.match(/(?:WARN-NEW|FAIL-NEW):\s*(.+?)(?:\s*\[|\s*$)/);
                        const title = titleMatch ? titleMatch[1].trim() : 'Unknown vulnerability';

                        findings.push({
                            severity: severity,
                            title: title,
                            tool: 'zap',
                            line: line.trim()
                        });
                    }
                }
                break;

            case 'nikto':
                // Парсить Nikto + findings
                const niktoLines = rawOutput.split('\n');
                for (const line of niktoLines) {
                    if (line.startsWith('+')) {
                        const vulnMatch = line.match(/\+ (.+?):\s*(.+?)\s*-\s*(.+?):\s*(.+)/);
                        if (vulnMatch) {
                            const [, osvdbId, title] = vulnMatch;
                            findings.push({
                                severity: 'INFO',
                                title: title.trim(),
                                tool: 'nikto',
                                line: line.trim()
                            });
                        }
                    }
                }
                break;

            case 'wapiti':
                // Парсить Wapiti vulnerabilities
                const wapitiLines = rawOutput.split('\n');
                for (const line of wapitiLines) {
                    if (line.includes(']') && (line.includes('XSS') || line.includes('SQL') || line.includes('Injection'))) {
                        const vulnMatch = line.match(/(\w+)\s+(.+?)\s+-\s+(.+)/);
                        if (vulnMatch) {
                            const [, severity, vulnType] = vulnMatch;
                            findings.push({
                                severity: severity.toUpperCase(),
                                title: vulnType,
                                tool: 'wapiti',
                                line: line.trim()
                            });
                        }
                    }
                }
                break;

            default:
                findings.push({
                    severity: 'INFO',
                    title: 'Parser not implemented for this tool',
                    tool: tool,
                    line: 'Raw output available in artifacts'
                });
        }

        return findings;
    }

    /**
     * Сгенерировать содержимое markdown отчета
     */
    generateMarkdownContent(runId, metadata, result, findings, reportFiles, batchId) {
        const timestamp = metadata.timestamp || new Date().toISOString();

        let markdown = `# Security Scan Report - ${runId}

## Scan Information
- **Tool**: ${metadata.tool || 'Unknown'}
- **Profile**: ${metadata.profile || 'Unknown'}
- **Target URL**: ${metadata.target_url || 'Unknown'}
- **Duration**: ${Math.round((metadata.duration_seconds || 0) * 100) / 100}s
- **Exit Code**: ${result.exitCode || 'Unknown'}
- **Timestamp**: ${timestamp}

## Findings Summary
**Total Findings**: ${findings.length}

`;

        if (findings.length > 0) {
            markdown += '| Severity | Title | Tool |\n';
            markdown += '|----------|-------|------|\n';

            for (const finding of findings) {
                markdown += `| ${finding.severity} | ${finding.title} | ${finding.tool} |\n`;
            }

            markdown += '\n## Detailed Findings\n\n';
            for (let i = 0; i < findings.length; i++) {
                const finding = findings[i];
                markdown += `### ${i + 1}. ${finding.title}\n`;
                markdown += `- **Severity**: ${finding.severity}\n`;
                markdown += `- **Tool**: ${finding.tool}\n`;
                markdown += `- **Raw Output**: \`${finding.line}\`\n\n`;
            }
        }

        markdown += '## File Artifacts\n\n';
        markdown += `### Raw Output\n`;
        markdown += `- \`artifacts/${batchId}/${runId}_raw.txt\` - Complete stdout from ${metadata.tool || 'tool'}\n`;

        if (reportFiles.length > 0) {
            markdown += '\n### Tool Reports\n';
            for (const file of reportFiles) {
                const ext = file.split('.').pop();
                const type = ext === 'json' ? 'JSON Report' : ext === 'html' ? 'HTML Report' : 'Report';
                markdown += `- \`${file}\` - ${metadata.tool || 'Tool'} ${type}\n`;
            }
        }

        markdown += `\n### Markdown Report\n`;
        markdown += `- \`artifacts/${batchId}/${runId}_report.md\` - This report\n`;

        if (result.error) {
            markdown += '\n## Error Information\n';
            markdown += `\`\`\`\n${result.error}\n\`\`\`\n`;
        }

        return markdown;
    }

    /**
     * Подписать WebSocket клиента на обновления batch
     */
    subscribeClient(batchId, ws) {
        const batch = this.batches.get(batchId);
        if (batch) {
            batch.clients.add(ws);

            // Отправить текущий статус со всеми run'ами
            ws.send(JSON.stringify({
                type: 'batch_status',
                batchId: batchId,
                status: batch.status,
                progress: batch.progress,
                runStatuses: batch.runStatuses
            }));

            // Обработчик отключения клиента
            ws.on('close', () => {
                batch.clients.delete(ws);
            });
        }
    }

    /**
     * Отправить сообщение всем клиентам batch
     */
    broadcastToBatch(batchId, data) {
        const batch = this.batches.get(batchId);
        if (batch) {
            const message = JSON.stringify(data);
            batch.clients.forEach(ws => {
                if (ws.readyState === 1) { // OPEN
                    ws.send(message);
                }
            });
        }
    }

    /**
     * Получить статус batch
     */
    getBatchStatus(batchId) {
        const batch = this.batches.get(batchId);
        if (!batch) {
            return null;
        }

        return {
            id: batch.id,
            status: batch.status,
            progress: batch.progress,
            createdAt: batch.createdAt,
            startedAt: batch.startedAt,
            completedAt: batch.completedAt,
            config: batch.config
        };
    }

    /**
     * Получить все активные batches
     */
    getActiveBatches() {
        const active = [];
        for (const [batchId, batch] of this.batches) {
            if (batch.status === 'running' || batch.status === 'created') {
                active.push(this.getBatchStatus(batchId));
            }
        }
        return active;
    }
}

export default BatchManager;
