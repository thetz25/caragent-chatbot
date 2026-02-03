import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MessengerService } from '../services/messenger.service';
import { catalogService, CarModelWithVariants } from '../services/catalog.service';
import { quoteFlowService } from '../services/quote-flow.service';
import { createLLMService, LLMConfig } from '../services/llm.service';
import { ragService } from '../services/rag.service';
import { guardrailsService } from '../services/guardrails.service';
import { 
    cleanQuery, 
    extractPhotoQuery, 
    extractSpecQuery, 
    extractQuoteQuery,
    isPhotoRequest,
    isSpecRequest,
    isQuoteRequest,
    generateNotFoundMessage,
    generateQuickReplySuggestions
} from '../services/nlp.utils';

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
        quick_reply?: {
            payload: string;
        };
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
                if (result.quickReplies) {
                    await messenger.sendQuickReplies(senderId, result.message, result.quickReplies);
                } else {
                    await messenger.sendTextMessage(senderId, result.message);
                }
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

            // Greetings - warm and conversational
            if (intent === 'greeting' || lowerMessage.includes('hi') || lowerMessage.includes('hello') || lowerMessage.includes('hey') || lowerMessage === 'start') {
                await messenger.sendQuickReplies(
                    senderId,
                    `Hey there! 👋 Welcome to Mitsubishi Motors! I'm your virtual assistant and I'm super excited to help you find your dream car! 🚗💨\n\nWhat would you like to do today?`,
                    [
                        { title: '🚙 Browse Models', payload: 'SHOW_MODELS' },
                        { title: '💰 Get a Quote', payload: 'GET_QUOTE' },
                        { title: '📸 View Photos', payload: 'VIEW_PHOTOS' },
                        { title: '❓ Ask Questions', payload: 'ASK_QUESTIONS' }
                    ]
                );
                return;
            }

            // Show all models - conversational
            if (intent === 'show_models' || lowerMessage.includes('models') || lowerMessage.includes('available') || lowerMessage.includes('cars')) {
                const models = await catalogService.getAllModels();
                if (models.length === 0) {
                    await messenger.sendTextMessage(senderId, "Hmm, it looks like our catalog is empty right now. That's weird! Let me check on that for you. 🔧");
                    return;
                }

                const modelList = models.map(m => `• ${m.name} (${m.segment || 'Sedan'})`).join('\n');
                
                await messenger.sendTextMessage(
                    senderId,
                    `Absolutely! Here's our complete Mitsubishi lineup 🚗✨\n\n${modelList}\n\nWhich one catches your eye? Just tell me the name and I'll show you all the details, photos, and pricing! Or if you're not sure what you're looking for, tell me what you need (like "family car" or "fuel efficient") and I'll help you pick! 😊`
                );
                return;
            }

            // Quote request - start quote flow with natural language understanding
            if (intent === 'get_quote' || isQuoteRequest(messageText)) {
                // Priority: 1. LLM entity, 2. Extracted query from message
                const variantQuery = entities?.variant || entities?.model || extractQuoteQuery(messageText) || undefined;
                const result = await quoteFlowService.startQuoteFlow(senderId, variantQuery);
                if (result.quickReplies) {
                    await messenger.sendQuickReplies(senderId, result.message, result.quickReplies);
                } else {
                    await messenger.sendTextMessage(senderId, result.message);
                }
                return;
            }

            // Try to find a specific model with cleaned query
            const searchQuery = entities?.model || cleanQuery(messageText);
            const model: CarModelWithVariants | null = await catalogService.getModelByName(searchQuery);
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

            // Photos request - with improved natural language understanding
            if (intent === 'show_photos' || isPhotoRequest(messageText)) {
                // Priority: 1. LLM entity, 2. Extracted query from message, 3. Cleaned full message
                const query = entities?.model || entities?.variant || extractPhotoQuery(messageText) || cleanQuery(messageText);
                console.log('Photo request - Original:', messageText, 'Extracted:', query);
                await handlePhotosRequest(senderId, query, messenger, fastify);
                return;
            }

            // Specs request - with guardrails and improved parsing
            if (intent === 'show_specs' || isSpecRequest(messageText)) {
                // Priority: 1. LLM entity, 2. Extracted query, 3. Cleaned message
                const query = entities?.variant || entities?.model || extractSpecQuery(messageText) || cleanQuery(messageText);
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

            // Default fallback with conversational tone
            await messenger.sendTextMessage(
                senderId,
                `I'm here to help you find the perfect Mitsubishi! 🚗✨\n\nHere's what I can do for you:\n\n🚙 *Browse Cars* - Say "show me models" or "what cars do you have?"\n📸 *See Photos* - Ask "show me photos of Xpander" or "what does Montero look like?"\n📋 *Get Specs* - Ask "tell me about Xpander specs" or "what are the features?"\n💰 *Get a Quote* - Say "how much is Montero?" or "I want a quote for Xpander"\n❓ *Ask Questions* - "What's the warranty?" "Do you have financing?" etc.\n\nWhat are you looking for today? Feel free to ask naturally! 😊`
            );
        } else if (event.postback) {
            fastify.log.info({ senderId, postback: event.postback }, 'Received postback');
            await handlePostback(senderId, event.postback.payload, messenger, fastify);
        } else if (event.message?.quick_reply) {
            // Handle quick reply responses
            const payload = event.message.quick_reply.payload;
            fastify.log.info({ senderId, quickReply: payload }, 'Received quick reply');
            await handleQuickReply(senderId, payload, messenger, fastify);
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
                '📸 I\'d love to show you photos! Which Mitsubishi model are you interested in?\n\nYou can say:\n• "Show me Xpander"\n• "Photos of Montero"\n• "Images of Mirage"\n• Or type "models" to see all available cars'
            );
            return;
        }

        // Try to find model with fuzzy matching
        const model: CarModelWithVariants | null = await catalogService.getModelByName(query);
        if (!model) {
            // Get all models for suggestions
            const allModels = await catalogService.getAllModels();
            const modelNames = allModels.map(m => m.name);
            
            // Generate conversational error message with suggestions
            const errorMessage = generateNotFoundMessage(query, modelNames, 'car model');
            await messenger.sendTextMessage(senderId, errorMessage);
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
                '📋 I can share detailed specifications with you! Which variant would you like to know about?\n\nTry saying:\n• "What are the specs of Xpander GLS?"\n• "Tell me about Montero Sport features"\n• "Details of Mirage G4"\n• Or type a model name to see available variants'
            );
            return;
        }

        // Search for variant by name with fuzzy matching
        const variant = await catalogService.searchVariantByName(query);
        if (!variant) {
            // Try to get all variants for suggestions
            const allVariants = await catalogService.getAllVariants();
            const variantNames = allVariants.map(v => `${v.model.name} ${v.name}`);
            
            // Generate quick reply suggestions
            const quickReplies = generateQuickReplySuggestions(query, variantNames.slice(0, 20), 10);
            
            if (quickReplies && quickReplies.length > 0) {
                await messenger.sendQuickReplies(
                    senderId,
                    `I couldn't find "${query}". Did you mean one of these?`,
                    quickReplies
                );
            } else {
                const errorMessage = generateNotFoundMessage(query, variantNames.slice(0, 20), 'variant');
                await messenger.sendTextMessage(senderId, errorMessage);
            }
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

async function handleQuickReply(
    senderId: string,
    payload: string,
    messenger: MessengerService,
    fastify: FastifyInstance
): Promise<void> {
    const lowerPayload = payload.toLowerCase();
    
    try {
        // Handle main menu actions
        if (lowerPayload === 'show_models') {
            const models = await catalogService.getAllModels();
            if (models.length === 0) {
                await messenger.sendTextMessage(senderId, "Hmm, it looks like our catalog is empty right now. That's weird! Let me check on that for you. 🔧");
                return;
            }
            const modelList = models.map(m => `• ${m.name} (${m.segment || 'Sedan'})`).join('\n');
            await messenger.sendTextMessage(
                senderId,
                `Absolutely! Here's our complete Mitsubishi lineup 🚗✨\n\n${modelList}\n\nWhich one catches your eye? Just tell me the name and I'll show you all the details, photos, and pricing! Or if you're not sure what you're looking for, tell me what you need (like "family car" or "fuel efficient") and I'll help you pick! 😊`
            );
            return;
        }
        
        if (lowerPayload === 'get_quote') {
            const result = await quoteFlowService.startQuoteFlow(senderId);
            if (result.quickReplies) {
                await messenger.sendQuickReplies(senderId, result.message, result.quickReplies);
            } else {
                await messenger.sendTextMessage(senderId, result.message);
            }
            return;
        }
        
        if (lowerPayload === 'view_photos') {
            await messenger.sendTextMessage(
                senderId,
                '📸 I\'d love to show you photos! Which Mitsubishi model are you interested in?\n\nYou can say:\n• "Show me Xpander"\n• "Photos of Montero"\n• "Images of Mirage"\n• Or type "models" to see all available cars'
            );
            return;
        }
        
        if (lowerPayload === 'ask_questions') {
            await messenger.sendTextMessage(
                senderId,
                '❓ I\'m here to help answer your questions! You can ask me about:\n\n• Warranty coverage\n• Financing options\n• After-sales service\n• Features and specifications\n• Availability\n\nWhat would you like to know? 😊'
            );
            return;
        }
        
        // Handle variant selections (from suggestions)
        if (lowerPayload.startsWith('select_')) {
            const variantName = payload.replace(/^select_/i, '').replace(/_/g, ' ');
            const variant = await catalogService.searchVariantByName(variantName);
            
            if (variant) {
                let response = `🚗 *${variant.model.name} ${variant.name}*\n`;
                const price = Number(variant.srp).toLocaleString('en-PH', { style: 'currency', currency: 'PHP' });
                response += `*Price:* ${price}\n`;
                response += `*Transmission:* ${variant.transmission || 'N/A'}\n`;
                response += `*Fuel:* ${variant.fuel || 'N/A'}\n\n`;
                response += 'Reply with "photos", "specs", or "quote" for more details!';
                await messenger.sendTextMessage(senderId, response);
            }
            return;
        }
        
        // Handle quote flow quick replies
        const inQuoteFlow = await quoteFlowService.isInQuoteFlow(senderId);
        if (inQuoteFlow) {
            const result = await quoteFlowService.processMessage(senderId, payload);
            if (result.quickReplies) {
                await messenger.sendQuickReplies(senderId, result.message, result.quickReplies);
            } else {
                await messenger.sendTextMessage(senderId, result.message);
            }
            return;
        }
        
        // Default: treat as regular message
        await messenger.sendTextMessage(senderId, `Received action: ${payload}`);
    } catch (error) {
        fastify.log.error({ error, senderId, payload }, 'Error handling quick reply');
        await messenger.sendTextMessage(senderId, 'Sorry, something went wrong processing your selection. Please try again.');
    }
}

async function handlePostback(
    senderId: string,
    payload: string,
    messenger: MessengerService,
    fastify: FastifyInstance
): Promise<void> {
    try {
        // Handle View Specs postback from photo carousel
        if (payload.startsWith('specs_')) {
            const parts = payload.replace('specs_', '').split('_');
            const query = parts.join(' ');
            await handleSpecsRequest(senderId, query, messenger, fastify);
            return;
        }
        
        // Default postback handler
        await messenger.sendTextMessage(senderId, `Action received: ${payload}`);
    } catch (error) {
        fastify.log.error({ error, senderId, payload }, 'Error handling postback');
        await messenger.sendTextMessage(senderId, 'Sorry, something went wrong. Please try again.');
    }
}
