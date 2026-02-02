import { PrismaClient, CarVariant } from '@prisma/client';
import { catalogService } from './catalog.service';
import { pricingService } from './pricing.service';

const prisma = new PrismaClient();

export interface GuardrailCheck {
    allowed: boolean;
    reason?: string;
    data?: any;
}

export class GuardrailsService {
    /**
     * Check if we should answer a pricing question
     * Returns actual pricing data if variant is clear, otherwise suggests quote flow
     */
    async checkPricingQuestion(message: string): Promise<GuardrailCheck> {
        const lowerMessage = message.toLowerCase();

        // Try to extract variant from message
        const variant = await catalogService.searchVariantByName(message);

        if (!variant) {
            return {
                allowed: false,
                reason: 'Cannot provide specific pricing without knowing the exact variant.',
                data: {
                    suggestion: 'Please specify which variant you want pricing for (e.g., "Xpander GLS A/T"), or type "quote" to get a detailed quotation.',
                },
            };
        }

        // Check if price data is recent
        const lastUpdated = variant.updatedAt;
        const daysSinceUpdate = Math.floor((Date.now() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24));

        if (daysSinceUpdate > 30) {
            return {
                allowed: true,
                reason: 'Pricing may be outdated. Please verify with sales agent.',
                data: {
                    variant,
                    warning: `This pricing data was last updated ${daysSinceUpdate} days ago. Please confirm current pricing with our sales team.`,
                },
            };
        }

        // Check if it's a general question vs specific
        const isGeneralQuestion = /(how much|price range|expensive|cheap)/i.test(message) && 
                                  !message.includes(variant.model.name) &&
                                  !message.includes(variant.name);

        if (isGeneralQuestion) {
            return {
                allowed: true,
                reason: 'General pricing question detected.',
                data: {
                    variant,
                    isGeneral: true,
                    message: `The ${variant.model.name} ${variant.name} starts at ₱${Number(variant.srp).toLocaleString('en-PH')}. For a complete quote with fees and financing options, type "quote ${variant.name}".`,
                },
            };
        }

        return {
            allowed: true,
            reason: 'Specific variant identified.',
            data: { variant },
        };
    }

    /**
     * Check if we should answer a specs question
     * Returns specs data if confident, otherwise asks for clarification
     */
    async checkSpecsQuestion(message: string): Promise<GuardrailCheck> {
        const variant = await catalogService.searchVariantByName(message);

        if (!variant) {
            return {
                allowed: false,
                reason: 'Cannot provide specs without knowing the exact variant.',
                data: {
                    suggestion: 'Please specify which variant you want specs for (e.g., "specs Xpander GLS A/T").',
                },
            };
        }

        // Check if specs data exists
        const hasSpecs = variant.specs && Object.keys(variant.specs as object).length > 0;

        if (!hasSpecs) {
            return {
                allowed: false,
                reason: 'Specs data not available for this variant.',
                data: {
                    variant,
                    suggestion: `I don't have detailed specs for the ${variant.name} yet. Please visit our website or contact a sales agent for complete specifications.`,
                },
            };
        }

        return {
            allowed: true,
            reason: 'Specs data available.',
            data: { variant },
        };
    }

    /**
     * Validate a user-provided price against our database
     * Useful for checking if external prices are accurate
     */
    async validatePrice(variantId: number, claimedPrice: number): Promise<GuardrailCheck> {
        const variant = await prisma.carVariant.findUnique({
            where: { id: variantId },
        });

        if (!variant) {
            return {
                allowed: false,
                reason: 'Variant not found.',
            };
        }

        const srp = Number(variant.srp);
        const difference = Math.abs(claimedPrice - srp);
        const percentDiff = (difference / srp) * 100;

        // Allow up to 5% variance (could be outdated prices or promos)
        if (percentDiff <= 5) {
            return {
                allowed: true,
                reason: 'Price within acceptable range.',
                data: {
                    officialPrice: srp,
                    claimedPrice,
                    difference,
                    isAccurate: true,
                },
            };
        }

        return {
            allowed: false,
            reason: 'Price variance too high.',
            data: {
                officialPrice: srp,
                claimedPrice,
                difference,
                percentDifference: percentDiff.toFixed(2),
                isAccurate: false,
                message: `The official SRP is ₱${srp.toLocaleString('en-PH')}. The price you mentioned differs by ${percentDiff.toFixed(1)}%. Prices may vary due to promotions or location.`,
            },
        };
    }

    /**
     * Check for potentially harmful/off-topic content
     */
    async checkContentSafety(message: string): Promise<GuardrailCheck> {
        const lowerMessage = message.toLowerCase();

        // List of topics we shouldn't discuss
        const blockedTopics = [
            'hack', 'crack', 'exploit', 'illegal', 'stolen', 'fraud',
            'scam', 'fake', 'counterfeit', 'dangerous', 'weapon'
        ];

        for (const topic of blockedTopics) {
            if (lowerMessage.includes(topic)) {
                return {
                    allowed: false,
                    reason: 'Content violates safety guidelines.',
                    data: {
                        message: 'I can only assist with Mitsubishi vehicles, pricing, and related services. Please ask about our cars or type "help" for available options.',
                    },
                };
            }
        }

        return { allowed: true };
    }

    /**
     * Sanitize user input
     */
    sanitizeInput(input: string): string {
        // Remove potential injection attempts
        return input
            .replace(/[<>]/g, '') // Remove HTML tags
            .replace(/javascript:/gi, '') // Remove javascript protocol
            .slice(0, 500); // Limit length
    }

    /**
     * Format a safe pricing response
     */
    formatSafePricingResponse(variant: CarVariant, modelName: string, warning?: string): string {
        const price = Number(variant.srp).toLocaleString('en-PH', {
            style: 'currency',
            currency: 'PHP',
            maximumFractionDigits: 0,
        });

        let response = `💰 *${modelName} ${variant.name}*\n\n`;
        response += `Official SRP: ${price}\n\n`;

        if (warning) {
            response += `⚠️ ${warning}\n\n`;
        }

        response += `*Important:*\n`;
        response += `• Prices may vary by location\n`;
        response += `• Promotional discounts may apply\n`;
        response += `• Final price includes fees and taxes\n\n`;
        response += `Type "quote ${variant.name}" for a detailed breakdown with all fees!`;

        return response;
    }

    /**
     * Format a safe specs response
     */
    formatSafeSpecsResponse(variant: CarVariant, modelName: string): string {
        const specs = variant.specs as Record<string, any> || {};

        let response = `📋 *${modelName} ${variant.name} - Specifications*\n\n`;
        response += `SRP: ₱${Number(variant.srp).toLocaleString('en-PH')}\n`;
        response += `Transmission: ${variant.transmission || 'N/A'}\n`;
        response += `Fuel Type: ${variant.fuel || 'N/A'}\n\n`;

        if (specs.engine) {
            response += `Engine: ${specs.engine}\n`;
        }
        if (specs.seats) {
            response += `Seating Capacity: ${specs.seats}\n`;
        }

        if (specs.features && Array.isArray(specs.features)) {
            response += `\nKey Features:\n`;
            specs.features.forEach((feature: string) => {
                response += `• ${feature}\n`;
            });
        }

        response += `\n*Note:* Specifications may vary. Please verify with our sales team or visit a dealership for complete details.`;

        return response;
    }
}

export const guardrailsService = new GuardrailsService();
