import fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';
import { webhookRoutes } from './routes/webhook.routes';
import { setupRateLimiting } from './config/rate-limit';
import { setupMonitoring } from './services/monitoring.service';

dotenv.config();

const server = fastify({
    logger: {
        level: process.env.LOG_LEVEL || 'info',
    },
    // Trust proxy (needed when behind Caddy/Nginx)
    trustProxy: true,
});

const start = async () => {
    try {
        // Security middleware
        await server.register(cors);
        await server.register(helmet);

        // Rate limiting
        await setupRateLimiting(server);

        // Monitoring and metrics
        await setupMonitoring(server);

        // Messenger webhook routes
        await server.register(webhookRoutes);

        await server.listen({ port: 3000, host: '0.0.0.0' });
        console.log('Server running on http://localhost:3000');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
};

start();
