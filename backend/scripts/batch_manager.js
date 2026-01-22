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
        const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${config.tool}`;

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
            scriptRunId,
            runId, // Передаем runId как 3-й аргумент
            config.targetUrl, // Передаем targetUrl как 4-й аргумент
            config.batchId // Передаем batchId как 5-й аргумент для организации файлов
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

        // Парсить ценную информацию из STDOUT и JSON отчетов
        let parsedFindings = this.parseFindingsFromStdout(rawOutput, batch.config.tool);
        
        // Дополнительно парсить JSON отчеты если они доступны
        const jsonFindings = this.parseJsonReports(batchDir, runId, batch.config.tool);
        parsedFindings = parsedFindings.concat(jsonFindings);

        // Создать metadata объект из доступных данных
        const metadata = {
            tool: batch.config.tool,
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
                // Комбинированный парсинг для ZAP (STDOUT + JSON если доступен)
                findings.push(...this.parseZapFindings(rawOutput));
                break;

            case 'nikto':
                findings.push(...this.parseNiktoFindings(rawOutput));
                break;

            case 'wapiti':
                findings.push(...this.parseWapitiFindings(rawOutput));
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
     * Улучшенный парсер для ZAP с поддержкой всех профилей
     */
    parseZapFindings(rawOutput) {
        const findings = [];
        const lines = rawOutput.split('\n');

        // Парсинг STDOUT для baseline сканов
        for (const line of lines) {
            if (line.includes('WARN-NEW:') || line.includes('FAIL-NEW:')) {
                const severity = line.includes('WARN-NEW:') ? 'MEDIUM' : 'HIGH';
                const titleMatch = line.match(/(?:WARN-NEW|FAIL-NEW):\s*(.+?)(?:\s*\[|\s*$)/);
                const title = titleMatch ? titleMatch[1].trim() : 'Unknown vulnerability';

                findings.push({
                    severity: severity,
                    title: title,
                    tool: 'zap',
                    type: 'baseline_finding',
                    line: line.trim()
                });
            }

            // Парсинг для automation framework (deep, api, xss профилей)
            if (line.includes('FINISHED JOB') || line.includes('alerts found')) {
                const alertsMatch = line.match(/(\d+)\s+alerts?\s+found/i);
                if (alertsMatch) {
                    const alertCount = parseInt(alertsMatch[1]);
                    if (alertCount > 0) {
                        findings.push({
                            severity: 'INFO',
                            title: `ZAP Automation Framework scan completed: ${alertCount} alerts found`,
                            tool: 'zap',
                            type: 'scan_summary',
                            alertCount: alertCount,
                            line: line.trim()
                        });
                    }
                }
            }

            // Детекция типов уязвимостей в выводе
            if (line.includes('Cross Site Scripting') || line.includes('XSS')) {
                findings.push({
                    severity: this.determineZapSeverity(line),
                    title: 'Cross-Site Scripting (XSS) vulnerability detected',
                    tool: 'zap',
                    type: 'xss_finding',
                    line: line.trim()
                });
            }

            if (line.includes('SQL Injection') || line.includes('SQLi')) {
                findings.push({
                    severity: this.determineZapSeverity(line),
                    title: 'SQL Injection vulnerability detected',
                    tool: 'zap',
                    type: 'sql_injection',
                    line: line.trim()
                });
            }

            if (line.includes('Path Traversal') || line.includes('Directory Browsing')) {
                findings.push({
                    severity: this.determineZapSeverity(line),
                    title: 'Path Traversal vulnerability detected',
                    tool: 'zap',
                    type: 'path_traversal',
                    line: line.trim()
                });
            }

            if (line.includes('CSRF') || line.includes('Cross-Site Request Forgery')) {
                findings.push({
                    severity: this.determineZapSeverity(line),
                    title: 'CSRF vulnerability detected',
                    tool: 'zap',
                    type: 'csrf',
                    line: line.trim()
                });
            }

            // API-специфичные уязвимости
            if (line.includes('/rest/') || line.includes('/api/')) {
                if (line.includes('500') || line.includes('error') || line.includes('exception')) {
                    findings.push({
                        severity: 'MEDIUM',
                        title: 'API endpoint error/exception detected',
                        tool: 'zap',
                        type: 'api_error',
                        line: line.trim()
                    });
                }
            }
        }

        return findings;
    }

    /**
     * Определить серьезность уязвимости ZAP из контекста
     */
    determineZapSeverity(line) {
        if (line.includes('FAIL') || line.includes('HIGH') || line.includes('Critical')) {
            return 'HIGH';
        } else if (line.includes('WARN') || line.includes('MEDIUM') || line.includes('Warning')) {
            return 'MEDIUM';
        } else if (line.includes('INFO') || line.includes('LOW') || line.includes('Information')) {
            return 'LOW';
        }
        return 'MEDIUM'; // default
    }

    /**
     * Улучшенный парсер для Nikto
     */
    parseNiktoFindings(rawOutput) {
        const findings = [];
        const lines = rawOutput.split('\n');

        for (const line of lines) {
            // Основные findings с +
            if (line.startsWith('+')) {
                const vulnMatch = line.match(/\+\s*(.+?):\s*(.+)/);
                if (vulnMatch) {
                    const [, identifier, description] = vulnMatch;
                    
                    let severity = 'LOW';
                    let type = 'info';
                    
                    // Определение серьезности по содержанию
                    if (description.includes('admin') || description.includes('password') || description.includes('config')) {
                        severity = 'HIGH';
                        type = 'sensitive_exposure';
                    } else if (description.includes('directory') || description.includes('file') || description.includes('backup')) {
                        severity = 'MEDIUM';
                        type = 'information_disclosure';
                    } else if (description.includes('version') || description.includes('server')) {
                        severity = 'LOW';
                        type = 'version_disclosure';
                    }

                    findings.push({
                        severity: severity,
                        title: description.trim(),
                        tool: 'nikto',
                        type: type,
                        identifier: identifier.trim(),
                        line: line.trim()
                    });
                }
            }

            // Статистика сканирования
            if (line.includes('items checked') || line.includes('requests made')) {
                const statsMatch = line.match(/(\d+)\s+(items checked|requests made)/);
                if (statsMatch) {
                    findings.push({
                        severity: 'INFO',
                        title: `Nikto scan statistics: ${statsMatch[0]}`,
                        tool: 'nikto',
                        type: 'scan_stats',
                        line: line.trim()
                    });
                }
            }

            // Ошибки сервера
            if (line.includes('ERROR') || line.includes('500') || line.includes('403')) {
                findings.push({
                    severity: 'MEDIUM',
                    title: 'Server error or access restriction detected',
                    tool: 'nikto',
                    type: 'server_error',
                    line: line.trim()
                });
            }
        }

        return findings;
    }

    /**
     * Улучшенный парсер для Wapiti
     */
    parseWapitiFindings(rawOutput) {
        const findings = [];
        const lines = rawOutput.split('\n');

        for (const line of lines) {
            // Основные уязвимости
            if (line.includes('XSS') || line.includes('Cross Site Scripting')) {
                findings.push({
                    severity: 'HIGH',
                    title: 'Cross-Site Scripting vulnerability',
                    tool: 'wapiti',
                    type: 'xss',
                    line: line.trim()
                });
            }

            if (line.includes('SQL') || line.includes('sql injection')) {
                findings.push({
                    severity: 'HIGH',
                    title: 'SQL Injection vulnerability',
                    tool: 'wapiti',
                    type: 'sql_injection',
                    line: line.trim()
                });
            }

            if (line.includes('SSRF') || line.includes('Server Side Request Forgery')) {
                findings.push({
                    severity: 'HIGH',
                    title: 'Server-Side Request Forgery vulnerability',
                    tool: 'wapiti',
                    type: 'ssrf',
                    line: line.trim()
                });
            }

            if (line.includes('upload') && line.includes('vulnerability')) {
                findings.push({
                    severity: 'HIGH',
                    title: 'File Upload vulnerability',
                    tool: 'wapiti',
                    type: 'file_upload',
                    line: line.trim()
                });
            }

            if (line.includes('redirect') || line.includes('open redirect')) {
                findings.push({
                    severity: 'MEDIUM',
                    title: 'Open Redirect vulnerability',
                    tool: 'wapiti',
                    type: 'open_redirect',
                    line: line.trim()
                });
            }

            // Статистика и информация о сканировании
            if (line.includes('pages found') || line.includes('forms found')) {
                const statsMatch = line.match(/(\d+)\s+(pages|forms)\s+found/);
                if (statsMatch) {
                    findings.push({
                        severity: 'INFO',
                        title: `Wapiti discovery: ${statsMatch[0]}`,
                        tool: 'wapiti',
                        type: 'scan_stats',
                        line: line.trim()
                    });
                }
            }

            // Ошибки и предупреждения
            if (line.includes('[!]') || line.includes('WARNING') || line.includes('ERROR')) {
                let severity = 'LOW';
                if (line.includes('ERROR')) severity = 'MEDIUM';
                if (line.includes('CRITICAL')) severity = 'HIGH';

                findings.push({
                    severity: severity,
                    title: 'Wapiti scan warning or error',
                    tool: 'wapiti',
                    type: 'scan_issue',
                    line: line.trim()
                });
            }
        }

        return findings;
    }

    /**
     * Парсить JSON отчеты от инструментов сканирования
     */
    parseJsonReports(batchDir, runId, tool) {
        const findings = [];

        if (tool !== 'zap') {
            return findings; // Пока только для ZAP
        }

        try {
            // Поиск JSON отчетов ZAP в директории
            const files = fs.readdirSync(batchDir);
            const zapJsonFiles = files.filter(file => 
                file.includes('report.json') || 
                (file.includes(runId) && file.endsWith('.json'))
            );

            // Для baseline скана ZAP генерирует report.json по умолчанию
            const baselineReportPath = path.join(batchDir, 'report.json');
            if (fs.existsSync(baselineReportPath)) {
                zapJsonFiles.push('report.json');
            }

            // Парсить каждый найденный JSON файл
            for (const jsonFile of zapJsonFiles) {
                const jsonPath = path.join(batchDir, jsonFile);
                if (fs.existsSync(jsonPath)) {
                    console.log(`Parsing ZAP JSON report: ${jsonPath}`);
                    const jsonFindings = this.parseZapJsonReport(jsonPath);
                    findings.push(...jsonFindings);
                }
            }

        } catch (error) {
            console.error(`Error parsing JSON reports for ${runId}:`, error);
            findings.push({
                severity: 'INFO',
                title: `JSON parsing error: ${error.message}`,
                tool: tool,
                type: 'parser_error',
                line: `Error occurred while parsing JSON reports`
            });
        }

        return findings;
    }

    /**
     * Парсить ZAP JSON отчет
     */
    parseZapJsonReport(jsonPath) {
        const findings = [];

        try {
            const jsonContent = fs.readFileSync(jsonPath, 'utf8');
            const report = JSON.parse(jsonContent);

            // ZAP JSON отчет имеет структуру: site -> alerts
            if (report.site && Array.isArray(report.site)) {
                for (const site of report.site) {
                    if (site.alerts && Array.isArray(site.alerts)) {
                        for (const alert of site.alerts) {
                            const severity = this.mapZapRiskToSeverity(alert.riskcode);
                            const confidence = alert.confidence || 'Unknown';
                            
                            findings.push({
                                severity: severity,
                                title: alert.name || 'Unknown ZAP Alert',
                                tool: 'zap',
                                type: 'json_alert',
                                description: alert.desc || '',
                                solution: alert.solution || '',
                                reference: alert.reference || '',
                                confidence: confidence,
                                riskcode: alert.riskcode,
                                count: alert.count || 1,
                                instances: alert.instances ? alert.instances.length : 0,
                                cweid: alert.cweid || null,
                                wascid: alert.wascid || null,
                                line: `ZAP JSON Alert: ${alert.name} (Risk: ${alert.riskcode}, Confidence: ${confidence})`
                            });
                        }
                    }
                }
            }

            console.log(`Parsed ${findings.length} alerts from ZAP JSON report: ${jsonPath}`);

        } catch (error) {
            console.error(`Failed to parse ZAP JSON report ${jsonPath}:`, error);
            findings.push({
                severity: 'INFO',
                title: `Failed to parse ZAP JSON report: ${path.basename(jsonPath)}`,
                tool: 'zap',
                type: 'json_parse_error',
                line: `JSON parsing failed: ${error.message}`
            });
        }

        return findings;
    }

    /**
     * Преобразовать ZAP risk code в стандартную серьезность
     */
    mapZapRiskToSeverity(riskcode) {
        switch (String(riskcode)) {
            case '3': return 'HIGH';     // High Risk
            case '2': return 'MEDIUM';   // Medium Risk  
            case '1': return 'LOW';      // Low Risk
            case '0': return 'INFO';     // Informational
            default: return 'MEDIUM';    // Default fallback
        }
    }

    /**
     * Сгенерировать содержимое markdown отчета
     */
    generateMarkdownContent(runId, metadata, result, findings, reportFiles, batchId) {
        const timestamp = metadata.timestamp || new Date().toISOString();

        let markdown = `# Security Scan Report - ${runId}

## Scan Information
- **Tool**: ${metadata.tool || 'Unknown'}
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
                
                // Дополнительная информация для JSON alerts
                if (finding.type === 'json_alert') {
                    if (finding.confidence) markdown += `- **Confidence**: ${finding.confidence}\n`;
                    if (finding.count) markdown += `- **Instances**: ${finding.count}\n`;
                    if (finding.cweid) markdown += `- **CWE ID**: ${finding.cweid}\n`;
                    if (finding.wascid) markdown += `- **WASC ID**: ${finding.wascid}\n`;
                    if (finding.description) {
                        markdown += `- **Description**: ${finding.description.slice(0, 200)}${finding.description.length > 200 ? '...' : ''}\n`;
                    }
                    if (finding.solution) {
                        markdown += `- **Solution**: ${finding.solution.slice(0, 200)}${finding.solution.length > 200 ? '...' : ''}\n`;
                    }
                } else if (finding.type === 'scan_summary' && finding.alertCount) {
                    markdown += `- **Alert Count**: ${finding.alertCount}\n`;
                } else if (finding.identifier) {
                    markdown += `- **Identifier**: ${finding.identifier}\n`;
                }
                
                markdown += `- **Type**: ${finding.type || 'unknown'}\n`;
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
