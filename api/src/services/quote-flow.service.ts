import { PrismaClient, Session, Quote } from '@prisma/client';
import { pricingService, PricingInput } from './pricing.service';
import { catalogService } from './catalog.service';

const prisma = new PrismaClient();

export interface QuoteSessionState {
    step: QuoteStep;
    context: {
        variantId?: number;
        variantName?: string;
        paymentType?: 'cash' | 'financing';
        downPaymentPercent?: number;
        financingMonths?: number;
        region?: string;
    };
}

export enum QuoteStep {
    IDLE = 'IDLE',
    ASK_VARIANT = 'ASK_VARIANT',
    ASK_PAYMENT_TYPE = 'ASK_PAYMENT_TYPE',
    ASK_DOWN_PAYMENT = 'ASK_DOWN_PAYMENT',
    ASK_FINANCING_TERM = 'ASK_FINANCING_TERM',
    CONFIRM_DETAILS = 'CONFIRM_DETAILS',
    GENERATE_QUOTE = 'GENERATE_QUOTE',
}

export class QuoteFlowService {
    /**
     * Get or create user session
     */
    async getSession(userId: string): Promise<QuoteSessionState> {
        const session = await prisma.session.findUnique({
            where: { id: userId },
        });

        if (session?.state) {
            return session.state as unknown as QuoteSessionState;
        }

        // Return default state
        return {
            step: QuoteStep.IDLE,
            context: {},
        };
    }

    /**
     * Update session state
     */
    async updateSession(userId: string, state: QuoteSessionState): Promise<void> {
        await prisma.session.upsert({
            where: { id: userId },
            create: {
                id: userId,
                state: state as unknown as any,
                lastSeen: new Date(),
            },
            update: {
                state: state as unknown as any,
                lastSeen: new Date(),
            },
        });
    }

    /**
     * Clear session
     */
    async clearSession(userId: string): Promise<void> {
        await prisma.session.delete({
            where: { id: userId },
        }).catch(() => {
            // Ignore if session doesn't exist
        });
    }

    /**
     * Start quote flow
     */
    async startQuoteFlow(userId: string, variantQuery?: string): Promise<{ message: string; state: QuoteSessionState }> {
        const state: QuoteSessionState = {
            step: QuoteStep.ASK_VARIANT,
            context: {},
        };

        // If variant is provided, try to find it
        if (variantQuery) {
            const variant = await catalogService.searchVariantByName(variantQuery);
            if (variant) {
                state.context.variantId = variant.id;
                state.context.variantName = `${variant.model.name} ${variant.name}`;
                state.step = QuoteStep.ASK_PAYMENT_TYPE;

                await this.updateSession(userId, state);

                return {
                    message: `Great! I found the *${state.context.variantName}*.\n\nWould you like:\n1️⃣ Cash purchase\n2️⃣ Financing`,
                    state,
                };
            }
        }

        await this.updateSession(userId, state);

        return {
            message: `Let's get you a price quote! 💰\n\nWhich model/variant are you interested in?\n\nExamples:\n• "Xpander GLS A/T"\n• "Montero Sport Black Series"`,
            state,
        };
    }

    /**
     * Process message based on current step
     */
    async processMessage(userId: string, message: string): Promise<{ message: string; state: QuoteSessionState }> {
        const state = await this.getSession(userId);
        const lowerMessage = message.toLowerCase().trim();

        // Allow cancellation
        if (['cancel', 'stop', 'exit'].includes(lowerMessage)) {
            await this.clearSession(userId);
            return {
                message: 'Quote cancelled. Type "quote" anytime to start again!',
                state: { step: QuoteStep.IDLE, context: {} },
            };
        }

        switch (state.step) {
            case QuoteStep.ASK_VARIANT:
                return this.handleAskVariant(userId, message, state);

            case QuoteStep.ASK_PAYMENT_TYPE:
                return this.handleAskPaymentType(userId, message, state);

            case QuoteStep.ASK_DOWN_PAYMENT:
                return this.handleAskDownPayment(userId, message, state);

            case QuoteStep.ASK_FINANCING_TERM:
                return this.handleAskFinancingTerm(userId, message, state);

            case QuoteStep.GENERATE_QUOTE:
                return this.generateQuote(userId, state);

            default:
                return this.startQuoteFlow(userId, message);
        }
    }

    /**
     * Handle variant selection
     */
    private async handleAskVariant(
        userId: string,
        message: string,
        state: QuoteSessionState
    ): Promise<{ message: string; state: QuoteSessionState }> {
        const variant = await catalogService.searchVariantByName(message);

        if (!variant) {
            return {
                message: `❌ I couldn't find "${message}".\n\nPlease try:\n• Typing the exact model name\n• Type "models" to see all available cars\n• Or type "cancel" to stop`,
                state,
            };
        }

        state.context.variantId = variant.id;
        state.context.variantName = `${variant.model.name} ${variant.name}`;
        state.step = QuoteStep.ASK_PAYMENT_TYPE;

        await this.updateSession(userId, state);

        return {
            message: `Perfect! I found the *${state.context.variantName}*.\n\nSRP: ₱${Number(variant.srp).toLocaleString('en-PH')}\n\nHow would you like to purchase?\n\n1️⃣ *Cash* - Full payment\n2️⃣ *Financing* - Monthly payments`,
            state,
        };
    }

    /**
     * Handle payment type selection
     */
    private async handleAskPaymentType(
        userId: string,
        message: string,
        state: QuoteSessionState
    ): Promise<{ message: string; state: QuoteSessionState }> {
        const lowerMessage = message.toLowerCase();

        if (['cash', '1', 'full', 'one'].includes(lowerMessage)) {
            state.context.paymentType = 'cash';
            state.step = QuoteStep.GENERATE_QUOTE;
            await this.updateSession(userId, state);
            return this.generateQuote(userId, state);
        }

        if (['financing', 'finance', '2', 'monthly', 'installment', 'two'].includes(lowerMessage)) {
            state.context.paymentType = 'financing';
            state.step = QuoteStep.ASK_DOWN_PAYMENT;
            await this.updateSession(userId, state);

            return {
                message: `Great! Let's set up financing.\n\nWhat down payment percentage?\n\nTypical options:\n• 20% (minimum)\n• 30%\n• 50%\n\nJust reply with a number (e.g., "30" for 30%)`,
                state,
            };
        }

        return {
            message: `Please choose:\n1️⃣ Cash (type "cash")\n2️⃣ Financing (type "financing")`,
            state,
        };
    }

    /**
     * Handle down payment percentage
     */
    private async handleAskDownPayment(
        userId: string,
        message: string,
        state: QuoteSessionState
    ): Promise<{ message: string; state: QuoteSessionState }> {
        const percentage = parseInt(message.replace('%', '').trim());

        if (isNaN(percentage) || percentage < 0 || percentage > 100) {
            return {
                message: `Please enter a valid percentage between 0 and 100.\n\nExamples: "20", "30", "50"`,
                state,
            };
        }

        state.context.downPaymentPercent = percentage;
        state.step = QuoteStep.ASK_FINANCING_TERM;
        await this.updateSession(userId, state);

        return {
            message: `Down payment: ${percentage}%\n\nNow choose your financing term:\n\n• 12 months (1 year)\n• 24 months (2 years)\n• 36 months (3 years)\n• 48 months (4 years)\n• 60 months (5 years)\n\nJust reply with the number of months (e.g., "36")`,
            state,
        };
    }

    /**
     * Handle financing term selection
     */
    private async handleAskFinancingTerm(
        userId: string,
        message: string,
        state: QuoteSessionState
    ): Promise<{ message: string; state: QuoteSessionState }> {
        const months = parseInt(message.trim());
        const validTerms = [12, 24, 36, 48, 60];

        if (!validTerms.includes(months)) {
            return {
                message: `Please choose a valid term: 12, 24, 36, 48, or 60 months.`,
                state,
            };
        }

        state.context.financingMonths = months;
        state.step = QuoteStep.GENERATE_QUOTE;
        await this.updateSession(userId, state);

        return this.generateQuote(userId, state);
    }

    /**
     * Generate and save quote
     */
    private async generateQuote(
        userId: string,
        state: QuoteSessionState
    ): Promise<{ message: string; state: QuoteSessionState }> {
        if (!state.context.variantId) {
            return {
                message: 'Error: No variant selected. Please start over with "quote".',
                state: { step: QuoteStep.IDLE, context: {} },
            };
        }

        const pricingInput: PricingInput = {
            variantId: state.context.variantId,
            region: state.context.region || 'NCR',
        };

        if (state.context.paymentType === 'financing') {
            pricingInput.downPaymentPercent = state.context.downPaymentPercent || 20;
            pricingInput.financingMonths = state.context.financingMonths || 60;
        }

        const calculation = await pricingService.calculatePrice(pricingInput);

        if (!calculation) {
            return {
                message: 'Sorry, I couldn\'t generate a quote at this time. Please try again later.',
                state,
            };
        }

        // Save quote to database
        const quote = await prisma.quote.create({
            data: {
                userId,
                variantId: state.context.variantId,
                details: calculation as any,
                status: 'GENERATED',
            },
        });

        // Clear session after quote generation
        await this.clearSession(userId);

        const quoteMessage = pricingService.formatQuoteForChat(
            calculation,
            state.context.variantName || 'Unknown'
        );

        return {
            message: quoteMessage + `\n\n📋 Quote ID: ${quote.id.slice(0, 8)}\n(Reference this when talking to our sales team)`,
            state: { step: QuoteStep.IDLE, context: {} },
        };
    }

    /**
     * Check if user is in quote flow
     */
    async isInQuoteFlow(userId: string): Promise<boolean> {
        const state = await this.getSession(userId);
        return state.step !== QuoteStep.IDLE;
    }
}

export const quoteFlowService = new QuoteFlowService();
