import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MessengerService } from '../services/messenger.service';
import { catalogService } from '../services/catalog.service';
import { quoteFlowService } from '../services/quote-flow.service';
import { createLLMService, LLMConfig } from '../services/llm.service';
import { ragService } from '../services/rag.service';
import { guardrailsService } from '../services/guardrails.service';

interface WebhookQuery {
    'hub.mode'?: string;
    'hub.verify_token'?: string;
    'hub.challenge'?: string;
}

interface MessagingEvent {
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
        mid: string;
        text?: string;
        attachments?: Array<{ type: string; payload: { url: string } }>;
    };
    postback?: {
        title: string;
        payload: string;
    };
}

interface WebhookBody {
    object: string;
    entry: Array<{
        id: string;
        time: number;
        messaging: MessagingEvent[];
    }>;
}

export async function webhookRoutes(fastify: FastifyInstance) {
    const messengerService = new MessengerService({
        pageAccessToken: process.env.META_PAGE_ACCESS_TOKEN || '',
        verifyToken: process.env.META_VERIFY_TOKEN || '',
        appSecret: process.env.META_APP_SECRET,
    });

    // GET - Webhook Verification
    fastify.get('/webhook', async (request: FastifyRequest<{ Querystring: WebhookQuery }>, reply: FastifyReply) => {
        const mode = request.query['hub.mode'];
        const token = request.query['hub.verify_token'];
        const challenge = request.query['hub.challenge'];

        fastify.log.info({ mode, token }, 'Webhook verification request');

        if (mode && token && challenge) {
            const result = messengerService.verifyWebhook(mode, token, challenge);
            if (result) {
                fastify.log.info('Webhook verified successfully');
                return reply.code(200).send(result);
            }
        }

        fastify.log.warn('Webhook verification failed');
        return reply.code(403).send('Forbidden');
    });

    // POST - Receive Messages
    fastify.post('/webhook', async (request: FastifyRequest<{ Body: WebhookBody }>, reply: FastifyReply) => {
        const body = request.body;

        if (body.object !== 'page') {
            return reply.code(404).send('Not Found');
        }

        // Process each entry
        for (const entry of body.entry) {
            for (const event of entry.messaging) {
                await handleMessagingEvent(event, messengerService, fastify);
            }
        }

        // Always return 200 OK quickly to acknowledge receipt
        return reply.code(200).send('EVENT_RECEIVED');
    });
}

async function handleMessagingEvent(
    event: MessagingEvent,
    messenger: MessengerService,
    fastify: FastifyInstance
): Promise<void> {
    const senderId = event.sender.id;

    try {
        if (event.message?.text) {
            const messageText = event.message.text;
            const lowerMessage = messageText.toLowerCase();
            fastify.log.info({ senderId, text: messageText }, 'Received message');

            // Check content safety first
            const safetyCheck = await guardrailsService.checkContentSafety(messageText);
            if (!safetyCheck.allowed) {
                await messenger.sendTextMessage(senderId, safetyCheck.data?.message || 'I cannot process that request.');
                return;
            }

            // Check if user is in quote flow
            const inQuoteFlow = await quoteFlowService.isInQuoteFlow(senderId);
            if (inQuoteFlow && !['hi', 'hello', 'start', 'models', 'cars'].includes(lowerMessage)) {
                const result = await quoteFlowService.processMessage(senderId, messageText);
                await messenger.sendTextMessage(senderId, result.message);
                return;
            }

            // Use LLM for intent detection if API key is available
            let intent: string = 'unknown';
            let intentConfidence = 0;
            let entities: any = {};

            if (process.env.OPENAI_API_KEY) {
                try {
                    const llmConfig: LLMConfig = {
                        provider: 'openai',
                        apiKey: process.env.OPENAI_API_KEY,
                        model: 'gpt-3.5-turbo',
                    };
                    const llmService = createLLMService(llmConfig);
                    const detection = await llmService.detectIntent(messageText);
                    intent = detection.intent;
                    intentConfidence = detection.confidence;
                    entities = detection.entities || {};
                    fastify.log.info({ intent, confidence: intentConfidence, entities }, 'LLM intent detected');
                } catch (error) {
                    fastify.log.warn('LLM intent detection failed, using fallback');
                }
            }

            // Greetings
            if (intent === 'greeting' || lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage === 'start') {
                await messenger.sendTextMessage(
                    senderId,
                    'Hello! Welcome to Mitsubishi Motors. 🚗\n\nHow can I help you today?\n\n• Type "models" to see available cars\n• Type a model name (e.g., "Xpander") for details\n• Type "quote" to get a quotation\n• Ask me anything about Mitsubishi!'
                );
                return;
            }

            // Show all models
            if (intent === 'show_models' || lowerMessage.includes('models') || lowerMessage.includes('available') || lowerMessage.includes('cars')) {
                const models = await catalogService.getAllModels();
                if (models.length === 0) {
                    await messenger.sendTextMessage(senderId, 'No models found in our catalog yet.');
                    return;
                }

                let response = '🚗 *Available Models:*\n\n';
                models.forEach((model) => {
                    response += `• ${model.name} (${model.segment || 'Sedan'})\n`;
                });
                response += '\nType a model name to see variants and prices!';
                await messenger.sendTextMessage(senderId, response);
                return;
            }

            // Quote request - start quote flow
            if (intent === 'get_quote' || lowerMessage === 'quote' || lowerMessage.includes('get quote') || lowerMessage.includes('quotation')) {
                const variantQuery = messageText.toLowerCase().replace(/quote|quotation|for|get/g, '').trim();
                const result = await quoteFlowService.startQuoteFlow(senderId, variantQuery || entities?.variant || undefined);
                await messenger.sendTextMessage(senderId, result.message);
                return;
            }

            // Try to find a specific model
            const model = await catalogService.getModelByName(entities?.model || messageText);
            if (model && !intent) {
                let response = `🚗 *${model.name}*\n${model.description || ''}\n\n*Variants:*\n`;
                model.variants.forEach((v) => {
                    const price = Number(v.srp).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
                    response += `• ${v.name} - ${price}\n`;
                });
                response += '\nReply with "photos [variant]" or "specs [variant]" for more details!';
                await messenger.sendTextMessage(senderId, response);
                return;
            }

            // Photos request
            if (intent === 'show_photos' || lowerMessage.startsWith('photos')) {
                const query = messageText.replace(/photos/i, '').trim() || entities?.model || '';
                await handlePhotosRequest(senderId, query, messenger, fastify);
                return;
            }

            // Specs request - with guardrails
            if (intent === 'show_specs' || lowerMessage.startsWith('specs')) {
                const query = messageText.replace(/specs/i, '').trim() || entities?.variant || entities?.model || '';
                const guardrailCheck = await guardrailsService.checkSpecsQuestion(query);
                
                if (!guardrailCheck.allowed) {
                    await messenger.sendTextMessage(senderId, guardrailCheck.data?.suggestion || guardrailCheck.reason || 'Please specify a variant.');
                    return;
                }
                
                await handleSpecsRequest(senderId, query, messenger, fastify);
                return;
            }

            // Handle general questions with RAG
            if (intent === 'general_question' || intent === 'unknown') {
                const relevantFAQs = await ragService.searchRelevantFAQs(messageText, 3);
                
                if (relevantFAQs.length > 0) {
                    // Use LLM to generate answer if available
                    if (process.env.OPENAI_API_KEY) {
                        try {
                            const llmConfig: LLMConfig = {
                                provider: 'openai',
                                apiKey: process.env.OPENAI_API_KEY,
                            };
                            const llmService = createLLMService(llmConfig);
                            const answer = await llmService.generateFAQAnswer(messageText, relevantFAQs);
                            if (answer) {
                                await messenger.sendTextMessage(senderId, answer);
                                return;
                            }
                        } catch (error) {
                            fastify.log.warn('LLM FAQ generation failed, using direct answer');
                        }
                    }
                    
                    // Fallback: return the most relevant FAQ answer
                    const bestFAQ = relevantFAQs[0];
                    let response = `${bestFAQ.answer}\n\n`;
                    if (relevantFAQs.length > 1) {
                        response += '*Related questions you can ask:*\n';
                        relevantFAQs.slice(1, 3).forEach((faq, i) => {
                            response += `${i + 1}. ${faq.question}\n`;
                        });
                    }
                    await messenger.sendTextMessage(senderId, response);
                    return;
                }
            }

            // Default fallback with helpful suggestions
            await messenger.sendTextMessage(
                senderId,
                `I'm not sure what you're asking. Here are some things you can try:\n\n• "models" - see available cars\n• "Xpander" - get model details\n• "photos Xpander" - view images\n• "quote" - get a price quote\n• "What is the warranty?" - ask FAQs\n\nWhat would you like to know?`
            );
        } else if (event.postback) {
            fastify.log.info({ senderId, postback: event.postback }, 'Received postback');
            await messenger.sendTextMessage(senderId, `You clicked: ${event.postback.title}`);
        }
    } catch (error) {
        fastify.log.error({ error, senderId }, 'Error handling message');
        await messenger.sendTextMessage(senderId, 'Sorry, something went wrong. Please try again.');
    }
}

async function handlePhotosRequest(
    senderId: string,
    query: string,
    messenger: MessengerService,
    fastify: FastifyInstance
): Promise<void> {
    try {
        if (!query) {
            await messenger.sendTextMessage(
                senderId,
                '📸 To see photos, please specify a model.\n\nExamples:\n• "photos Xpander"\n• "photos Montero"'
            );
            return;
        }

        // Try to find model
        const model = await catalogService.getModelByName(query);
        if (!model) {
            await messenger.sendTextMessage(
                senderId,
                `❌ Couldn't find model matching "${query}".\n\nType "models" to see available cars.`
            );
            return;
        }

        // Collect all media from all variants
        const allMedia: Array<{ url: string; label: string | null; variantName: string }> = [];
        for (const variant of model.variants) {
            const photos = await catalogService.getVariantPhotos(variant.id);
            for (const photo of photos) {
                allMedia.push({
                    url: photo.url,
                    label: photo.label,
                    variantName: variant.name,
                });
            }
        }

        if (allMedia.length === 0) {
            await messenger.sendTextMessage(
                senderId,
                `📸 Sorry, no photos available for ${model.name} yet. Please visit our website for images.`
            );
            return;
        }

        // Create carousel elements (max 10)
        const elements = allMedia.slice(0, 10).map((media) => ({
            title: `${model.name} - ${media.variantName}`,
            subtitle: media.label || 'Gallery Image',
            image_url: media.url,
            buttons: [
                {
                    type: 'postback',
                    title: 'View Specs',
                    payload: `specs_${model.name}_${media.variantName}`,
                },
            ],
        }));

        await messenger.sendCarousel(senderId, elements);
        fastify.log.info({ senderId, model: model.name, photosCount: allMedia.length }, 'Sent photo gallery');
    } catch (error) {
        fastify.log.error({ error, senderId, query }, 'Error handling photos request');
        await messenger.sendTextMessage(senderId, 'Sorry, couldn\'t load photos. Please try again.');
    }
}

async function handleSpecsRequest(
    senderId: string,
    query: string,
    messenger: MessengerService,
    fastify: FastifyInstance
): Promise<void> {
    try {
        if (!query) {
            await messenger.sendTextMessage(
                senderId,
                '📋 To see specifications, please specify a variant.\n\nExamples:\n• "specs Xpander GLS A/T"\n• "specs Montero Black Series"'
            );
            return;
        }

        // Search for variant by name
        const variant = await catalogService.searchVariantByName(query);
        if (!variant) {
            await messenger.sendTextMessage(
                senderId,
                `❌ Couldn't find variant matching "${query}".\n\nType a model name first to see available variants.`
            );
            return;
        }

        // Format specs
        const specs = variant.specs as Record<string, any> || {};
        const price = Number(variant.srp).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });

        let response = `🚗 *${variant.model.name} ${variant.name}*\n\n`;
        response += `*Price:* ${price}\n`;
        response += `*Transmission:* ${variant.transmission || 'N/A'}\n`;
        response += `*Fuel:* ${variant.fuel || 'N/A'}\n\n`;
        response += `*Specifications:*\n`;

        // Add specs from JSON
        for (const [key, value] of Object.entries(specs)) {
            if (key === 'features' && Array.isArray(value)) {
                response += `\n*Features:*\n`;
                value.forEach((feature: string) => {
                    response += `• ${feature}\n`;
                });
            } else {
                response += `• ${key}: ${value}\n`;
            }
        }

        response += '\n💬 Type "photos" to see images or "quote" for pricing!';

        await messenger.sendTextMessage(senderId, response);
        fastify.log.info({ senderId, variant: variant.name }, 'Sent specs');

        // Also check for spec sheet PDFs
        const specSheets = await catalogService.getVariantSpecSheets(variant.id);
        if (specSheets.length > 0) {
            const pdfElements = specSheets.slice(0, 3).map((sheet) => ({
                title: `${variant.name} - Spec Sheet`,
                subtitle: sheet.label || 'Full Specifications PDF',
                buttons: [
                    {
                        type: 'web_url',
                        title: 'Download PDF',
                        url: sheet.url,
                    },
                ],
            }));
            await messenger.sendCarousel(senderId, pdfElements);
        }
    } catch (error) {
        fastify.log.error({ error, senderId, query }, 'Error handling specs request');
        await messenger.sendTextMessage(senderId, 'Sorry, couldn\'t load specifications. Please try again.');
    }
}
