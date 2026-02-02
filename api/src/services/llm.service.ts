import axios from 'axios';

export interface LLMConfig {
    provider: 'openai' | 'anthropic' | 'gemini';
    apiKey: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}

export interface IntentDetectionResult {
    intent: 'show_models' | 'show_specs' | 'show_photos' | 'get_quote' | 'general_question' | 'greeting' | 'unknown';
    confidence: number;
    entities?: {
        model?: string;
        variant?: string;
        paymentType?: 'cash' | 'financing';
    };
}

export interface FAQContext {
    question: string;
    answer: string;
    category: string;
    keywords: string[];
}

export class LLMService {
    private config: LLMConfig;
    private apiUrl: string;

    constructor(config: LLMConfig) {
        this.config = {
            model: 'gpt-3.5-turbo',
            temperature: 0.3,
            maxTokens: 150,
            ...config,
        };

        // Set API URL based on provider
        switch (this.config.provider) {
            case 'openai':
                this.apiUrl = 'https://api.openai.com/v1/chat/completions';
                break;
            case 'anthropic':
                this.apiUrl = 'https://api.anthropic.com/v1/messages';
                break;
            case 'gemini':
                this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`;
                break;
            default:
                this.apiUrl = 'https://api.openai.com/v1/chat/completions';
        }
    }

    /**
     * Detect user intent from message
     */
    async detectIntent(message: string): Promise<IntentDetectionResult> {
        const systemPrompt = `You are an intent classifier for a Mitsubishi car dealership chatbot. 
Classify the user's intent into one of these categories:
- show_models: User wants to see available car models (e.g., "what cars do you have?", "show models")
- show_specs: User wants specifications (e.g., "what are the specs of Xpander?", "engine size")
- show_photos: User wants to see images (e.g., "show me pictures", "photos")
- get_quote: User wants pricing/quotation (e.g., "how much?", "price", "quote")
- general_question: General FAQ about Mitsubishi (e.g., "what is the warranty?", "maintenance cost")
- greeting: Hello/hi/start (e.g., "hello", "hi", "good morning")
- unknown: Doesn't match any above

Also extract entities:
- model: Car model name mentioned (e.g., "Xpander", "Montero Sport")
- variant: Specific variant mentioned (e.g., "GLS A/T", "Black Series")
- paymentType: "cash" or "financing" if mentioned

Respond in JSON format only:
{
  "intent": "category",
  "confidence": 0.95,
  "entities": {
    "model": "name or null",
    "variant": "name or null",
    "paymentType": "cash/financing or null"
  }
}`;

        try {
            const response = await this.callLLM(systemPrompt, message);
            const result = JSON.parse(response);
            return {
                intent: result.intent || 'unknown',
                confidence: result.confidence || 0.5,
                entities: result.entities || {},
            };
        } catch (error) {
            console.error('Intent detection error:', error);
            // Fallback to keyword-based detection
            return this.fallbackIntentDetection(message);
        }
    }

    /**
     * Generate RAG-based answer for FAQs
     */
    async generateFAQAnswer(question: string, relevantFAQs: FAQContext[]): Promise<string> {
        if (relevantFAQs.length === 0) {
            return '';
        }

        const context = relevantFAQs
            .map((faq, i) => `Q${i + 1}: ${faq.question}\nA${i + 1}: ${faq.answer}`)
            .join('\n\n');

        const systemPrompt = `You are a helpful assistant for Mitsubishi Motors Philippines. 
Use ONLY the provided FAQ context to answer the user's question. 
If the context doesn't contain the answer, say you don't have that information and suggest they contact a sales agent.

Context:
${context}

Answer concisely and naturally. Be friendly but professional. Use "we" and "our" when referring to Mitsubishi.`;

        try {
            return await this.callLLM(systemPrompt, question);
        } catch (error) {
            console.error('FAQ generation error:', error);
            return '';
        }
    }

    /**
     * Check if message is about pricing (for guardrails)
     */
    async isPricingQuestion(message: string): Promise<boolean> {
        const pricingKeywords = [
            'price', 'cost', 'how much', 'pricing', 'srp', 'expensive', 'cheap',
            'discount', 'promo', 'financing', 'monthly', 'down payment', 'dp'
        ];
        
        const lowerMessage = message.toLowerCase();
        return pricingKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Check if message is asking about specs
     */
    async isSpecsQuestion(message: string): Promise<boolean> {
        const specsKeywords = [
            'spec', 'specs', 'specification', 'engine', 'horsepower', 'torque',
            'fuel consumption', 'mileage', 'dimension', 'size', 'capacity',
            'feature', 'features', 'transmission', 'fuel type'
        ];
        
        const lowerMessage = message.toLowerCase();
        return specsKeywords.some(keyword => lowerMessage.includes(keyword));
    }

    /**
     * Call LLM API
     */
    private async callLLM(systemPrompt: string, userMessage: string): Promise<string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        let payload: any;

        switch (this.config.provider) {
            case 'openai':
                headers['Authorization'] = `Bearer ${this.config.apiKey}`;
                payload = {
                    model: this.config.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage },
                    ],
                    temperature: this.config.temperature,
                    max_tokens: this.config.maxTokens,
                };
                break;

            case 'anthropic':
                headers['x-api-key'] = this.config.apiKey;
                headers['anthropic-version'] = '2023-06-01';
                payload = {
                    model: this.config.model || 'claude-3-haiku-20240307',
                    max_tokens: this.config.maxTokens,
                    temperature: this.config.temperature,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }],
                };
                break;

            case 'gemini':
                payload = {
                    contents: [
                        {
                            role: 'user',
                            parts: [
                                { text: `${systemPrompt}\n\nUser: ${userMessage}` },
                            ],
                        },
                    ],
                    generationConfig: {
                        temperature: this.config.temperature,
                        maxOutputTokens: this.config.maxTokens,
                    },
                };
                break;
        }

        const response = await axios.post(this.apiUrl, payload, { headers });

        // Parse response based on provider
        switch (this.config.provider) {
            case 'openai':
                return response.data.choices[0]?.message?.content || '';
            case 'anthropic':
                return response.data.content[0]?.text || '';
            case 'gemini':
                return response.data.candidates[0]?.content?.parts[0]?.text || '';
            default:
                return '';
        }
    }

    /**
     * Fallback keyword-based intent detection
     */
    private fallbackIntentDetection(message: string): IntentDetectionResult {
        const lowerMessage = message.toLowerCase();

        // Check for greeting
        if (/^(hi|hello|hey|good morning|good afternoon|start)$/i.test(lowerMessage)) {
            return { intent: 'greeting', confidence: 0.9 };
        }

        // Check for models
        if (/(model|cars|available|what.*(car|vehicle)|show.*car)/i.test(lowerMessage)) {
            return { intent: 'show_models', confidence: 0.85 };
        }

        // Check for specs
        if (/(spec|specs|specification|engine|feature)/i.test(lowerMessage)) {
            return { intent: 'show_specs', confidence: 0.85 };
        }

        // Check for photos
        if (/(photo|photos|picture|pictures|image|images|see.*car)/i.test(lowerMessage)) {
            return { intent: 'show_photos', confidence: 0.85 };
        }

        // Check for quote/price
        if (/(price|cost|how much|quote|pricing|discount|financing)/i.test(lowerMessage)) {
            return { intent: 'get_quote', confidence: 0.85 };
        }

        // Extract potential model name
        const models = ['xpander', 'montero', 'mirage', 'lancer', 'strada', 'triton'];
        const foundModel = models.find(m => lowerMessage.includes(m));

        if (foundModel) {
            return {
                intent: 'general_question',
                confidence: 0.6,
                entities: { model: foundModel },
            };
        }

        return { intent: 'unknown', confidence: 0.5 };
    }
}

export const createLLMService = (config: LLMConfig): LLMService => {
    return new LLMService(config);
};
