import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const pump = promisify(pipeline);

// Admin API Key - set this in .env
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'your-secure-admin-key-here';

// Upload directory
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';

interface AuthHeaders {
    'x-admin-key': string;
}

// Middleware to check admin authentication
async function authenticateAdmin(request: FastifyRequest, reply: FastifyReply) {
    const adminKey = request.headers['x-admin-key'];
    if (adminKey !== ADMIN_API_KEY) {
        reply.code(401).send({ error: 'Unauthorized - Invalid or missing admin key' });
        return false;
    }
    return true;
}

export async function adminRoutes(fastify: FastifyInstance) {
    // Ensure upload directory exists
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }

    // ==========================================
    // 1. UPLOAD PHOTOS
    // ==========================================
    fastify.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const parts = request.parts();
            const files: string[] = [];
            let variantId: number | null = null;
            let modelId: number | null = null;
            let label: string | null = null;

            for await (const part of parts) {
                if (part.type === 'file') {
                    const filename = `${Date.now()}-${part.filename}`;
                    const filepath = path.join(UPLOAD_DIR, filename);
                    
                    await pump(part.file, fs.createWriteStream(filepath));
                    
                    const fileUrl = `${process.env.DOMAIN || ''}/uploads/${filename}`;
                    files.push(fileUrl);

                    // If variantId is provided, save to database
                    if (variantId) {
                        await prisma.carMedia.create({
                            data: {
                                variantId,
                                modelId,
                                url: fileUrl,
                                type: 'IMAGE',
                                label: label || part.filename,
                            },
                        });
                    }
                } else if (part.type === 'field') {
                    if (part.fieldname === 'variantId') variantId = parseInt(part.value as string);
                    if (part.fieldname === 'modelId') modelId = parseInt(part.value as string);
                    if (part.fieldname === 'label') label = part.value as string;
                }
            }

            reply.send({ 
                success: true, 
                files, 
                message: files.length > 0 ? 'Files uploaded successfully' : 'No files uploaded' 
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Upload failed', details: (error as Error).message });
        }
    });

    // ==========================================
    // 2. ADD/UPDATE CAR MODELS
    // ==========================================
    
    // Get all models
    fastify.get('/models', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        const models = await prisma.carModel.findMany({
            include: {
                variants: {
                    include: {
                        media: true,
                    },
                },
            },
            orderBy: { name: 'asc' },
        });

        reply.send({ models });
    });

    // Add new car model
    fastify.post('/models', async (request: FastifyRequest<{ Body: {
        name: string;
        segment?: string;
        description?: string;
        year?: number;
        variants: Array<{
            name: string;
            srp: number;
            transmission?: string;
            fuel?: string;
            specs?: any;
        }>;
    }}>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const { name, segment, description, year, variants } = request.body;

            const model = await prisma.carModel.create({
                data: {
                    name,
                    segment,
                    description,
                    year,
                    variants: {
                        create: variants.map(v => ({
                            name: v.name,
                            srp: v.srp,
                            transmission: v.transmission,
                            fuel: v.fuel,
                            specs: v.specs || {},
                        })),
                    },
                },
                include: { variants: true },
            });

            reply.send({ success: true, model });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Failed to create model', details: (error as Error).message });
        }
    });

    // Update car model
    fastify.put('/models/:id', async (request: FastifyRequest<{ 
        Params: { id: string };
        Body: Partial<{
            name: string;
            segment: string;
            description: string;
            year: number;
        }>
    }>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const modelId = parseInt(request.params.id);
            const model = await prisma.carModel.update({
                where: { id: modelId },
                data: request.body,
            });

            reply.send({ success: true, model });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Failed to update model', details: (error as Error).message });
        }
    });

    // ==========================================
    // 3. UPDATE VARIANT PRICES
    // ==========================================
    
    // Update variant price
    fastify.put('/variants/:id/price', async (request: FastifyRequest<{
        Params: { id: string };
        Body: { srp: number }
    }>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const variantId = parseInt(request.params.id);
            const { srp } = request.body;

            const variant = await prisma.carVariant.update({
                where: { id: variantId },
                data: { srp },
                include: { model: true },
            });

            reply.send({ 
                success: true, 
                message: `Price updated for ${variant.model.name} ${variant.name}`,
                variant 
            });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Failed to update price', details: (error as Error).message });
        }
    });

    // Add new variant to existing model
    fastify.post('/models/:id/variants', async (request: FastifyRequest<{
        Params: { id: string };
        Body: {
            name: string;
            srp: number;
            transmission?: string;
            fuel?: string;
            specs?: any;
        }
    }>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const modelId = parseInt(request.params.id);
            const variant = await prisma.carVariant.create({
                data: {
                    modelId,
                    ...request.body,
                    specs: request.body.specs || {},
                },
                include: { model: true },
            });

            reply.send({ success: true, variant });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Failed to create variant', details: (error as Error).message });
        }
    });

    // ==========================================
    // 4. VIEW QUOTES/BOOKINGS
    // ==========================================
    
    // Get all quotes/bookings
    fastify.get('/quotes', async (request: FastifyRequest<{ Querystring: {
        status?: string;
        limit?: string;
        offset?: string;
    }}>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        const { status, limit = '50', offset = '0' } = request.query;

        const where = status ? { status } : {};

        const [quotes, total] = await Promise.all([
            prisma.quote.findMany({
                where,
                include: {
                    variant: {
                        include: {
                            model: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
                take: parseInt(limit),
                skip: parseInt(offset),
            }),
            prisma.quote.count({ where }),
        ]);

        // Get user details from sessions or external lookup
        const quotesWithUser = await Promise.all(
            quotes.map(async (quote) => {
                const session = await prisma.session.findUnique({
                    where: { id: quote.userId },
                });
                return {
                    ...quote,
                    user: session || { id: quote.userId, lastSeen: quote.createdAt },
                };
            })
        );

        reply.send({ 
            quotes: quotesWithUser, 
            total, 
            limit: parseInt(limit), 
            offset: parseInt(offset) 
        });
    });

    // Get single quote details
    fastify.get('/quotes/:id', async (request: FastifyRequest<{ Params: { id: string }}>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        const quoteId = request.params.id;

        const quote = await prisma.quote.findUnique({
            where: { id: quoteId },
            include: {
                variant: {
                    include: {
                        model: true,
                    },
                },
            },
        });

        if (!quote) {
            reply.code(404).send({ error: 'Quote not found' });
            return;
        }

        const session = await prisma.session.findUnique({
            where: { id: quote.userId },
        });

        reply.send({ 
            quote: {
                ...quote,
                user: session || { id: quote.userId },
            }
        });
    });

    // Update quote status
    fastify.put('/quotes/:id/status', async (request: FastifyRequest<{
        Params: { id: string };
        Body: { status: string }
    }>, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        try {
            const quoteId = request.params.id;
            const { status } = request.body;

            const quote = await prisma.quote.update({
                where: { id: quoteId },
                data: { status },
                include: {
                    variant: {
                        include: { model: true },
                    },
                },
            });

            reply.send({ success: true, quote });
        } catch (error) {
            fastify.log.error(error);
            reply.code(500).send({ error: 'Failed to update quote status', details: (error as Error).message });
        }
    });

    // ==========================================
    // DASHBOARD STATS
    // ==========================================
    fastify.get('/stats', async (request: FastifyRequest, reply: FastifyReply) => {
        if (!(await authenticateAdmin(request, reply))) return;

        const [
            totalModels,
            totalVariants,
            totalQuotes,
            totalPhotos,
            recentQuotes,
        ] = await Promise.all([
            prisma.carModel.count(),
            prisma.carVariant.count(),
            prisma.quote.count(),
            prisma.carMedia.count({ where: { type: 'IMAGE' } }),
            prisma.quote.count({
                where: {
                    createdAt: {
                        gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                    },
                },
            }),
        ]);

        reply.send({
            stats: {
                totalModels,
                totalVariants,
                totalQuotes,
                totalPhotos,
                recentQuotes,
            },
        });
    });
}
