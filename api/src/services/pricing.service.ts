import { PrismaClient, CarVariant, PriceRule } from '@prisma/client';

const prisma = new PrismaClient();

export interface PricingInput {
    variantId: number;
    region?: string;
    addons?: Array<{
        name: string;
        price: number;
    }>;
    downPaymentPercent?: number; // 0-100
    financingMonths?: number; // 12, 24, 36, 48, 60
    interestRate?: number; // Annual rate (e.g., 5.5 for 5.5%)
}

export interface PricingBreakdown {
    srp: number;
    addons: number;
    fees: {
        registration: number;
        chattel: number;
        insurance: number;
        others: Record<string, number>;
        total: number;
    };
    promos: {
        discount: number;
        freebies: string[];
    };
    subtotal: number;
    total: number;
}

export interface QuoteCalculation {
    breakdown: PricingBreakdown;
    cash: {
        total: number;
    };
    financing?: {
        downPayment: number;
        downPaymentPercent: number;
        amountFinanced: number;
        monthlyAmortization: number;
        months: number;
        interestRate: number;
        totalInterest: number;
        totalPayable: number;
    };
}

export class PricingService {
    /**
     * Get price rules for a region
     */
    async getPriceRules(region: string = 'NCR'): Promise<PriceRule | null> {
        return prisma.priceRule.findFirst({
            where: { region },
            orderBy: { updatedAt: 'desc' },
        });
    }

    /**
     * Calculate pricing breakdown
     */
    async calculatePrice(input: PricingInput): Promise<QuoteCalculation | null> {
        // Get variant details
        const variant = await prisma.carVariant.findUnique({
            where: { id: input.variantId },
            include: { model: true },
        });

        if (!variant) {
            return null;
        }

        // Get price rules for region
        const priceRule = await this.getPriceRules(input.region);
        const fees = (priceRule?.fees as Record<string, number>) || {};
        const promos = (priceRule?.promos as Record<string, any>) || {};

        // Calculate breakdown
        const srp = Number(variant.srp);
        const addonsTotal = input.addons?.reduce((sum, addon) => sum + addon.price, 0) || 0;

        const registrationFee = fees.registration || 5000;
        const chattelFee = fees.chattel || 15000;
        const insuranceFee = fees.insurance || srp * 0.025; // Default 2.5% of SRP

        const otherFees: Record<string, number> = {};
        for (const [key, value] of Object.entries(fees)) {
            if (!['registration', 'chattel', 'insurance'].includes(key)) {
                otherFees[key] = value;
            }
        }

        const feesTotal = registrationFee + chattelFee + insuranceFee + Object.values(otherFees).reduce((a, b) => a + b, 0);

        const discount = promos.discount || 0;
        const freebies = promos.freebies || [];

        const subtotal = srp + addonsTotal + feesTotal;
        const total = subtotal - discount;

        const breakdown: PricingBreakdown = {
            srp,
            addons: addonsTotal,
            fees: {
                registration: registrationFee,
                chattel: chattelFee,
                insurance: insuranceFee,
                others: otherFees,
                total: feesTotal,
            },
            promos: {
                discount,
                freebies,
            },
            subtotal,
            total,
        };

        // Calculate cash option
        const cash = {
            total,
        };

        // Calculate financing if requested
        let financing: QuoteCalculation['financing'] = undefined;
        if (input.downPaymentPercent !== undefined && input.financingMonths) {
            const downPayment = total * (input.downPaymentPercent / 100);
            const amountFinanced = total - downPayment;
            const rate = input.interestRate || 5.5; // Default 5.5% annual
            const months = input.financingMonths;

            // Calculate monthly amortization using simple interest formula
            // Monthly = (P + (P * r * t)) / n
            // Where P = principal, r = annual rate, t = years, n = months
            const years = months / 12;
            const totalInterest = amountFinanced * (rate / 100) * years;
            const monthlyAmortization = (amountFinanced + totalInterest) / months;
            const totalPayable = downPayment + (monthlyAmortization * months);

            financing = {
                downPayment,
                downPaymentPercent: input.downPaymentPercent,
                amountFinanced,
                monthlyAmortization,
                months,
                interestRate: rate,
                totalInterest,
                totalPayable,
            };
        }

        return {
            breakdown,
            cash,
            financing,
        };
    }

    /**
     * Format pricing for chat display
     */
    formatQuoteForChat(calculation: QuoteCalculation, variantName: string): string {
        const { breakdown, cash, financing } = calculation;

        let message = `💰 *Price Quote: ${variantName}*\n\n`;

        // SRP
        message += `SRP: ${this.formatCurrency(breakdown.srp)}\n`;

        // Add-ons
        if (breakdown.addons > 0) {
            message += `Add-ons: ${this.formatCurrency(breakdown.addons)}\n`;
        }

        // Fees
        message += `\n*Fees:*\n`;
        message += `• Registration: ${this.formatCurrency(breakdown.fees.registration)}\n`;
        message += `• Chattel: ${this.formatCurrency(breakdown.fees.chattel)}\n`;
        message += `• Insurance: ${this.formatCurrency(breakdown.fees.insurance)}\n`;

        // Other fees
        for (const [key, value] of Object.entries(breakdown.fees.others)) {
            message += `• ${key}: ${this.formatCurrency(value)}\n`;
        }

        message += `Subtotal: ${this.formatCurrency(breakdown.subtotal)}\n`;

        // Promos
        if (breakdown.promos.discount > 0) {
            message += `\n*Promotions:*\n`;
            message += `• Discount: -${this.formatCurrency(breakdown.promos.discount)}\n`;
        }

        if (breakdown.promos.freebies.length > 0) {
            message += `• Freebies: ${breakdown.promos.freebies.join(', ')}\n`;
        }

        // Cash option
        message += `\n*💵 Cash Price: ${this.formatCurrency(cash.total)}*\n`;

        // Financing option
        if (financing) {
            message += `\n*💳 Financing (${financing.downPaymentPercent}% DP):*\n`;
            message += `• Down Payment: ${this.formatCurrency(financing.downPayment)}\n`;
            message += `• Amount Financed: ${this.formatCurrency(financing.amountFinanced)}\n`;
            message += `• Monthly for ${financing.months} months: ${this.formatCurrency(financing.monthlyAmortization)}\n`;
            message += `• Interest Rate: ${financing.interestRate}% p.a.\n`;
            message += `• Total Payable: ${this.formatCurrency(financing.totalPayable)}\n`;
        }

        message += `\n💬 Reply "book" to schedule a test drive or "agent" to talk to a sales agent.`;

        return message;
    }

    /**
     * Format currency for Philippines Peso
     */
    private formatCurrency(amount: number): string {
        return amount.toLocaleString('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    }
}

export const pricingService = new PricingService();
