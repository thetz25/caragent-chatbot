import fastifyRateLimit from '@fastify/rate-limit';
import { FastifyInstance } from 'fastify';

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
}

export async function setupRateLimiting(fastify: FastifyInstance): Promise<void> {
    await fastify.register(fastifyRateLimit, {
        max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
        timeWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
        // Skip health checks from rate limiting
        skipOnError: true,
        keyGenerator: (req) => {
            // Use IP address + user ID (if available) as key
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            // For webhook requests, use a different key to avoid blocking legitimate Facebook requests
            if (req.url?.includes('/webhook')) {
                return `webhook:${ip}`;
            }
            return ip;
        },
        errorResponseBuilder: (req, context) => {
            return {
                statusCode: 429,
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Try again in ${context.after}`,
                retryAfter: context.after,
            };
        },
    });

    // Stricter rate limit for webhook endpoint to prevent abuse
    await fastify.register(fastifyRateLimit, {
        max: parseInt(process.env.WEBHOOK_RATE_LIMIT_MAX || '1000'),
        timeWindow: process.env.WEBHOOK_RATE_LIMIT_WINDOW || '1 minute',
        prefix: '/webhook',
        keyGenerator: (req) => {
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            return `webhook:${ip}`;
        },
        errorResponseBuilder: (req, context) => {
            fastify.log.warn({ ip: req.ip, path: req.url }, 'Webhook rate limit exceeded');
            return {
                statusCode: 429,
                error: 'Too Many Requests',
                message: 'Webhook rate limit exceeded. Please slow down.',
                retryAfter: context.after,
            };
        },
    });

    fastify.log.info('Rate limiting configured');
}
