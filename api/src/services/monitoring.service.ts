import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface MetricsData {
    timestamp: Date;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTime: number;
    activeUsers: number;
    popularIntents: Array<{ intent: string; count: number }>;
}

export interface HealthStatus {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    checks: {
        database: { status: 'up' | 'down'; responseTime: number };
        api: { status: 'up' | 'down'; responseTime: number };
        messenger: { status: 'up' | 'down'; lastError?: string };
    };
    version: string;
    uptime: number;
}

export class MonitoringService {
    private startTime: number;
    private requestCount: number = 0;
    private errorCount: number = 0;
    private responseTimes: number[] = [];

    constructor() {
        this.startTime = Date.now();
    }

    /**
     * Record a request metric
     */
    recordRequest(responseTime: number, success: boolean): void {
        this.requestCount++;
        this.responseTimes.push(responseTime);

        // Keep only last 1000 response times
        if (this.responseTimes.length > 1000) {
            this.responseTimes.shift();
        }

        if (!success) {
            this.errorCount++;
        }
    }

    /**
     * Get current metrics
     */
    getMetrics(): MetricsData {
        const avgResponseTime = this.responseTimes.length > 0
            ? this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length
            : 0;

        return {
            timestamp: new Date(),
            totalRequests: this.requestCount,
            successfulRequests: this.requestCount - this.errorCount,
            failedRequests: this.errorCount,
            averageResponseTime: Math.round(avgResponseTime),
            activeUsers: 0, // Will be populated from database
            popularIntents: [], // Will be populated from database
        };
    }

    /**
     * Get comprehensive health status
     */
    async getHealthStatus(): Promise<HealthStatus> {
        const checks: HealthStatus['checks'] = {
            database: { status: 'down', responseTime: 0 },
            api: { status: 'up', responseTime: 0 },
            messenger: { status: 'up' },
        };

        // Check database
        const dbStart = Date.now();
        try {
            await prisma.$queryRaw`SELECT 1`;
            checks.database.status = 'up';
            checks.database.responseTime = Date.now() - dbStart;
        } catch (error) {
            checks.database.status = 'down';
        }

        // Check API (already up if we can run this)
        checks.api.status = 'up';
        checks.api.responseTime = 0;

        // Determine overall status
        let status: HealthStatus['status'] = 'healthy';
        if (checks.database.status === 'down') {
            status = 'unhealthy';
        } else if (checks.database.responseTime > 1000) {
            status = 'degraded';
        }

        return {
            status,
            timestamp: new Date().toISOString(),
            checks,
            version: process.env.npm_package_version || '1.0.0',
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
        };
    }

    /**
     * Log structured message
     */
    logStructured(
        level: 'info' | 'warn' | 'error',
        message: string,
        metadata?: Record<string, any>
    ): void {
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            ...metadata,
            service: 'mitsubishi-chatbot',
            environment: process.env.NODE_ENV || 'development',
        };

        // In production, this would go to a log aggregator
        console.log(JSON.stringify(logEntry));
    }

    /**
     * Get uptime in human-readable format
     */
    getUptime(): string {
        const uptime = Math.floor((Date.now() - this.startTime) / 1000);
        const days = Math.floor(uptime / 86400);
        const hours = Math.floor((uptime % 86400) / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = uptime % 60;

        if (days > 0) return `${days}d ${hours}h ${minutes}m`;
        if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
        return `${minutes}m ${seconds}s`;
    }
}

export const monitoringService = new MonitoringService();

/**
 * Setup monitoring middleware for Fastify
 */
export async function setupMonitoring(fastify: FastifyInstance): Promise<void> {
    // Request timing hook
    fastify.addHook('onRequest', async (request) => {
        (request as any).startTime = Date.now();
    });

    // Response logging hook
    fastify.addHook('onSend', async (request, reply, payload) => {
        const startTime = (request as any).startTime;
        if (startTime) {
            const responseTime = Date.now() - startTime;
            const success = reply.statusCode < 400;
            monitoringService.recordRequest(responseTime, success);

            // Log slow requests
            if (responseTime > 1000) {
                monitoringService.logStructured('warn', 'Slow request detected', {
                    path: request.url,
                    method: request.method,
                    responseTime,
                    statusCode: reply.statusCode,
                });
            }
        }
    });

    // Error logging hook
    fastify.addHook('onError', async (request, reply, error) => {
        monitoringService.logStructured('error', 'Request error', {
            path: request.url,
            method: request.method,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        });
    });

    // Add metrics endpoint
    fastify.get('/metrics', async (request, reply) => {
        const metrics = monitoringService.getMetrics();
        return {
            ...metrics,
            uptime: monitoringService.getUptime(),
        };
    });

    // Add detailed health endpoint
    fastify.get('/health', async (request, reply) => {
        const health = await monitoringService.getHealthStatus();
        reply.code(health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503);
        return health;
    });

    fastify.log.info('Monitoring configured');
}
