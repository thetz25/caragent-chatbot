import { PrismaClient, CarModel, CarVariant, CarMedia } from '@prisma/client';

const prisma = new PrismaClient();

export interface CarModelWithVariants extends CarModel {
    variants: (CarVariant & { media: CarMedia[] })[];
}

export class CatalogService {
    /**
     * Get all car models (summary)
     */
    async getAllModels(): Promise<CarModel[]> {
        return prisma.carModel.findMany({
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Get model with all variants
     */
    async getModelByName(name: string): Promise<CarModelWithVariants | null> {
        return prisma.carModel.findFirst({
            where: {
                name: {
                    contains: name,
                    mode: 'insensitive',
                },
            },
            include: {
                variants: {
                    include: {
                        media: true,
                    },
                    orderBy: { srp: 'asc' },
                },
            },
        });
    }

    /**
     * Get variant by ID with full details
     */
    async getVariantById(id: number): Promise<(CarVariant & { model: CarModel; media: CarMedia[] }) | null> {
        return prisma.carVariant.findUnique({
            where: { id },
            include: {
                model: true,
                media: true,
            },
        });
    }

    /**
     * Search variants by filters
     */
    async searchVariants(filters: {
        minPrice?: number;
        maxPrice?: number;
        segment?: string;
        fuel?: string;
    }): Promise<(CarVariant & { model: CarModel })[]> {
        return prisma.carVariant.findMany({
            where: {
                srp: {
                    gte: filters.minPrice,
                    lte: filters.maxPrice,
                },
                model: {
                    segment: filters.segment,
                },
                fuel: filters.fuel,
            },
            include: {
                model: true,
            },
            orderBy: { srp: 'asc' },
        });
    }

    /**
     * Search variant by name (fuzzy match)
     */
    async searchVariantByName(query: string): Promise<(CarVariant & { model: CarModel; media: CarMedia[] }) | null> {
        // Try exact match first
        const exactMatch = await prisma.carVariant.findFirst({
            where: {
                name: {
                    contains: query,
                    mode: 'insensitive',
                },
            },
            include: {
                model: true,
                media: true,
            },
        });

        if (exactMatch) {
            return exactMatch;
        }

        // Try to match by splitting the query (e.g., "xpander gls" -> model: xpander, variant: gls)
        const words = query.toLowerCase().split(' ');
        if (words.length >= 2) {
            // Assume first word(s) might be model name, last part might be variant
            const possibleModel = words[0];
            const possibleVariant = words.slice(1).join(' ');

            const modelMatch = await prisma.carModel.findFirst({
                where: {
                    name: {
                        contains: possibleModel,
                        mode: 'insensitive',
                    },
                },
                include: {
                    variants: {
                        include: {
                            model: true,
                            media: true,
                        },
                    },
                },
            });

            if (modelMatch && modelMatch.variants.length > 0) {
                // Find best matching variant
                const matchingVariant = modelMatch.variants.find((v) =>
                    v.name.toLowerCase().includes(possibleVariant)
                );
                if (matchingVariant) {
                    return matchingVariant;
                }
                // If no specific variant match, return first variant of the model
                return modelMatch.variants[0];
            }
        }

        // Fallback: search all variants
        const variants = await prisma.carVariant.findMany({
            where: {
                name: {
                    contains: words[0],
                    mode: 'insensitive',
                },
            },
            include: {
                model: true,
                media: true,
            },
            take: 1,
        });

        return variants[0] || null;
    }

    /**
     * Get photos for a variant
     */
    async getVariantPhotos(variantId: number): Promise<CarMedia[]> {
        return prisma.carMedia.findMany({
            where: {
                variantId,
                type: 'IMAGE',
            },
            orderBy: { id: 'asc' },
        });
    }

    /**
     * Get spec sheet PDFs for a variant
     */
    async getVariantSpecSheets(variantId: number): Promise<CarMedia[]> {
        return prisma.carMedia.findMany({
            where: {
                variantId,
                type: 'PDF',
            },
        });
    }

    /**
     * Format model summary for chat
     */
    formatModelSummary(model: CarModel): string {
        return `🚗 *${model.name}* (${model.segment || 'Sedan'})\n${model.description || ''}`;
    }

    /**
     * Format variant summary for chat
     */
    formatVariantSummary(variant: CarVariant & { model?: CarModel }): string {
        const price = Number(variant.srp).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
        return `• ${variant.name} - ${price}\n  ${variant.transmission || ''} | ${variant.fuel || ''}`;
    }
}

export const catalogService = new CatalogService();
