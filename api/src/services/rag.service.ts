import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface FAQDocument {
    id?: number;
    question: string;
    answer: string;
    category: string;
    keywords: string[];
}

export class RAGService {
    /**
     * Add a new FAQ to the knowledge base
     */
    async addFAQ(faq: FAQDocument): Promise<void> {
        await prisma.fAQ.create({
            data: {
                question: faq.question,
                answer: faq.answer,
                category: faq.category,
                keywords: faq.keywords,
            },
        });
    }

    /**
     * Search for relevant FAQs based on query
     * Uses simple keyword matching (can be enhanced with embeddings in v2)
     */
    async searchRelevantFAQs(query: string, limit: number = 3): Promise<FAQDocument[]> {
        const queryWords = query.toLowerCase().split(/\s+/);

        // Get all FAQs
        const allFAQs = await prisma.fAQ.findMany();

        // Score each FAQ based on keyword matches
        const scoredFAQs = allFAQs.map((faq) => {
            let score = 0;
            const faqKeywords = faq.keywords as string[];
            const faqQuestion = faq.question.toLowerCase();
            const faqAnswer = faq.answer.toLowerCase();

            // Check keyword matches
            for (const word of queryWords) {
                // Exact keyword match (high weight)
                if (faqKeywords.some((k) => k.toLowerCase() === word)) {
                    score += 3;
                }
                // Partial keyword match
                else if (faqKeywords.some((k) => k.toLowerCase().includes(word))) {
                    score += 2;
                }
                // Question contains word
                if (faqQuestion.includes(word)) {
                    score += 1.5;
                }
                // Answer contains word
                if (faqAnswer.includes(word)) {
                    score += 0.5;
                }
            }

            return { faq, score };
        });

        // Sort by score and return top matches
        const topFAQs = scoredFAQs
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map((item) => ({
                id: item.faq.id,
                question: item.faq.question,
                answer: item.faq.answer,
                category: item.faq.category,
                keywords: item.faq.keywords as string[],
            }));

        return topFAQs;
    }

    /**
     * Get all FAQs by category
     */
    async getFAQsByCategory(category: string): Promise<FAQDocument[]> {
        const faqs = await prisma.fAQ.findMany({
            where: { category },
        });

        return faqs.map((faq) => ({
            id: faq.id,
            question: faq.question,
            answer: faq.answer,
            category: faq.category,
            keywords: faq.keywords as string[],
        }));
    }

    /**
     * Get all unique categories
     */
    async getCategories(): Promise<string[]> {
        const faqs = await prisma.fAQ.findMany({
            select: { category: true },
            distinct: ['category'],
        });

        return faqs.map((f) => f.category);
    }

    /**
     * Delete FAQ by ID
     */
    async deleteFAQ(id: number): Promise<void> {
        await prisma.fAQ.delete({
            where: { id },
        });
    }

    /**
     * Seed initial FAQs
     */
    async seedInitialFAQs(): Promise<void> {
        const initialFAQs: FAQDocument[] = [
            {
                question: 'What is the warranty for Mitsubishi vehicles?',
                answer: 'All new Mitsubishi vehicles come with a 3-year or 100,000km warranty, whichever comes first. The warranty covers manufacturing defects and powertrain components.',
                category: 'Warranty',
                keywords: ['warranty', 'guarantee', 'coverage', '3 years', '100000km'],
            },
            {
                question: 'How often should I service my Mitsubishi?',
                answer: 'We recommend servicing your Mitsubishi every 5,000km or 6 months, whichever comes first. Regular maintenance includes oil change, filter replacement, and general inspection.',
                category: 'Maintenance',
                keywords: ['service', 'maintenance', 'oil change', 'PMS', 'schedule'],
            },
            {
                question: 'What is the fuel consumption of the Xpander?',
                answer: 'The Mitsubishi Xpander has a fuel consumption rating of approximately 15-18 km/L for highway driving and 9-12 km/L for city driving, depending on driving conditions and variant.',
                category: 'Fuel Economy',
                keywords: ['fuel', 'consumption', 'mileage', 'km/L', 'Xpander', 'efficiency'],
            },
            {
                question: 'Do you offer test drives?',
                answer: 'Yes! We offer test drives for all our models. Simply visit any Mitsubishi dealership or book a test drive through this chatbot by typing "book test drive". Bring a valid driver\'s license.',
                category: 'Test Drive',
                keywords: ['test drive', 'try', 'experience', 'drive', 'book'],
            },
            {
                question: 'What financing options are available?',
                answer: 'We partner with major banks (BDO, BPI, Metrobank, Security Bank) to offer flexible financing. Options include low down payment (as low as 20%), extended terms (up to 60 months), and competitive interest rates.',
                category: 'Financing',
                keywords: ['financing', 'bank', 'loan', 'installment', 'payment', 'interest'],
            },
            {
                question: 'What are the requirements for car financing?',
                answer: 'Standard requirements include: Valid ID, Proof of Income (ITR, payslips, or bank statements), Proof of Billing, and TIN. For business owners, additional business documents may be required.',
                category: 'Financing',
                keywords: ['requirements', 'documents', 'financing', 'loan requirements', 'apply'],
            },
            {
                question: 'Does the Xpander have a third row?',
                answer: 'Yes, the Mitsubishi Xpander is a 7-seater MPV with a third row that can comfortably seat 2 passengers. The third row can also be folded down to increase cargo space.',
                category: 'Features',
                keywords: ['third row', '7 seater', 'seats', 'capacity', 'Xpander', 'passengers'],
            },
            {
                question: 'What safety features does the Montero Sport have?',
                answer: 'The Montero Sport comes with advanced safety features including: Forward Collision Mitigation, Blind Spot Warning, Rear Cross Traffic Alert, Multi-around Monitor, and 7 SRS airbags.',
                category: 'Safety',
                keywords: ['safety', 'airbags', 'montero', 'features', 'secure', 'protection'],
            },
            {
                question: 'Can I trade in my old car?',
                answer: 'Yes, we accept trade-ins! Bring your vehicle to any Mitsubishi dealership for a free appraisal. The trade-in value can be used as down payment for your new Mitsubishi.',
                category: 'Trade-in',
                keywords: ['trade in', 'trade-in', 'exchange', 'old car', 'appraisal'],
            },
            {
                question: 'How long does it take to get a car loan approved?',
                answer: 'Car loan approval typically takes 3-5 banking days, depending on the completeness of your documents and the bank\'s verification process. Some banks offer fast-track approval for qualified applicants.',
                category: 'Financing',
                keywords: ['approval', 'how long', 'processing', 'bank', 'loan approval'],
            },
            {
                question: 'What colors are available for the Xpander?',
                answer: 'The Xpander is available in these colors: White Pearl, Titanium Grey Metallic, Red Metallic, Silver Metallic, and Black. Availability may vary by variant.',
                category: 'Colors',
                keywords: ['color', 'colour', 'available', 'Xpander', 'options', 'paint'],
            },
            {
                question: 'Is there a hybrid or electric Mitsubishi available?',
                answer: 'Currently, Mitsubishi Philippines focuses on gasoline and diesel models. However, we have hybrid technology in other markets and are evaluating EV options for the Philippines.',
                category: 'Technology',
                keywords: ['hybrid', 'electric', 'EV', 'green', 'eco', 'environment'],
            },
        ];

        for (const faq of initialFAQs) {
            await prisma.fAQ.upsert({
                where: { 
                    question: faq.question 
                },
                update: {},
                create: {
                    question: faq.question,
                    answer: faq.answer,
                    category: faq.category,
                    keywords: faq.keywords,
                },
            });
        }

        console.log(`Seeded ${initialFAQs.length} FAQs`);
    }
}

export const ragService = new RAGService();
