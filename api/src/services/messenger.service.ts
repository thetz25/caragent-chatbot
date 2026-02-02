import axios from 'axios';

interface MessengerConfig {
    pageAccessToken: string;
    verifyToken: string;
    appSecret?: string;
}

interface TextMessage {
    recipient: { id: string };
    message: { text: string };
}

interface ImageMessage {
    recipient: { id: string };
    message: {
        attachment: {
            type: 'image';
            payload: { url: string; is_reusable?: boolean };
        };
    };
}

interface GenericTemplateElement {
    title: string;
    subtitle?: string;
    image_url?: string;
    buttons?: Array<{
        type: string;
        title: string;
        payload?: string;
        url?: string;
    }>;
}

interface GenericTemplateMessage {
    recipient: { id: string };
    message: {
        attachment: {
            type: 'template';
            payload: {
                template_type: 'generic';
                elements: GenericTemplateElement[];
            };
        };
    };
}

type SendMessagePayload = TextMessage | ImageMessage | GenericTemplateMessage;

export class MessengerService {
    private config: MessengerConfig;
    private sendApiUrl = 'https://graph.facebook.com/v18.0/me/messages';

    constructor(config: MessengerConfig) {
        this.config = config;
    }

    /**
     * Verify webhook callback from Meta
     */
    verifyWebhook(mode: string, token: string, challenge: string): string | null {
        if (mode === 'subscribe' && token === this.config.verifyToken) {
            return challenge;
        }
        return null;
    }

    /**
     * Send a text message
     */
    async sendTextMessage(recipientId: string, text: string): Promise<void> {
        const payload: TextMessage = {
            recipient: { id: recipientId },
            message: { text },
        };
        await this.sendMessage(payload);
    }

    /**
     * Send an image
     */
    async sendImage(recipientId: string, imageUrl: string): Promise<void> {
        const payload: ImageMessage = {
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: 'image',
                    payload: { url: imageUrl, is_reusable: true },
                },
            },
        };
        await this.sendMessage(payload);
    }

    /**
     * Send a generic template (carousel)
     */
    async sendCarousel(recipientId: string, elements: GenericTemplateElement[]): Promise<void> {
        const payload: GenericTemplateMessage = {
            recipient: { id: recipientId },
            message: {
                attachment: {
                    type: 'template',
                    payload: {
                        template_type: 'generic',
                        elements: elements.slice(0, 10), // Max 10 elements
                    },
                },
            },
        };
        await this.sendMessage(payload);
    }

    /**
     * Send quick replies
     */
    async sendQuickReplies(
        recipientId: string,
        text: string,
        quickReplies: Array<{ title: string; payload: string }>
    ): Promise<void> {
        const payload = {
            recipient: { id: recipientId },
            message: {
                text,
                quick_replies: quickReplies.map((qr) => ({
                    content_type: 'text',
                    title: qr.title,
                    payload: qr.payload,
                })),
            },
        };
        await this.sendMessage(payload);
    }

    /**
     * Core send method
     */
    private async sendMessage(payload: SendMessagePayload | object): Promise<void> {
        try {
            await axios.post(this.sendApiUrl, payload, {
                params: { access_token: this.config.pageAccessToken },
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (error: any) {
            console.error('Send API Error:', error.response?.data || error.message);
            throw error;
        }
    }
}
