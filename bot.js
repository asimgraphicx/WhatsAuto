const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const fs = require('fs-extra');
const path = require('path');

class WhatsAppGeminiBot {
    constructor() {
        this.config = this.loadConfig();
        this.sock = null;
        this.authState = null;
        this.trainContent = '';
        this.setupDirectories();
        this.loadTrainingData();
    }

    loadConfig() {
        try {
            return JSON.parse(fs.readFileSync('config.json', 'utf8'));
        } catch (error) {
            this.log('ERROR: config.json not found or invalid. Please run setup first.');
            process.exit(1);
        }
    }

    setupDirectories() {
        fs.ensureDirSync('logs');
        fs.ensureDirSync('session');
    }

    loadTrainingData() {
        try {
            this.trainContent = fs.readFileSync('train.txt', 'utf8');
            this.log('Training data loaded successfully');
        } catch (error) {
            this.log('WARNING: train.txt not found. Create this file for AI context.');
            this.trainContent = '';
        }
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        console.log(logMessage);
        
        if (this.config.logMessages) {
            fs.appendFileSync('logs/bot.log', logMessage + '\n');
        }
    }

    logMessage(from, message, type = 'RECEIVED') {
        if (!this.config.logMessages) return;
        
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${type}: ${from} - ${message}\n`;
        fs.appendFileSync('logs/messages.log', logEntry);
    }

    async sendToGemini(userMessage) {
        const prompt = this.trainContent ? 
            `Context: ${this.trainContent}\n\nUser: ${userMessage}\n\nResponse:` : 
            userMessage;

        const requestBody = {
            contents: [{
                parts: [{ text: prompt }]
            }]
        };

        try {
            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${this.config.geminiApiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody)
                }
            );

            if (!response.ok) {
                throw new Error(`Gemini API error: ${response.status}`);
            }

            const data = await response.json();
            return data.candidates[0]?.content?.parts[0]?.text || 'Sorry, I could not generate a response.';
        } catch (error) {
            this.log(`Gemini API Error: ${error.message}`);
            return 'Sorry, I encountered an error while processing your request.';
        }
    }

    async handleMessage(messages) {
        for (const message of messages) {
            if (!message.message) continue;
            
            const messageText = message.message.conversation || 
                              message.message.extendedTextMessage?.text || '';
            
            if (!messageText || message.key.fromMe) continue;

            const from = message.key.remoteJid;
            const senderName = message.pushName || from.split('@')[0];
            
            this.log(`Message from ${senderName}: ${messageText}`);
            this.logMessage(senderName, messageText, 'RECEIVED');

            // Send typing indicator
            await this.sock.sendPresenceUpdate('composing', from);

            // Get AI response
            const aiResponse = await this.sendToGemini(messageText);
            const response = this.config.responsePrefix + aiResponse;

            // Send response
            await this.sock.sendMessage(from, { text: response });
            
            this.log(`Response sent to ${senderName}`);
            this.logMessage(senderName, response, 'SENT');

            // Clear typing indicator
            await this.sock.sendPresenceUpdate('paused', from);
        }
    }

    async connectWithPairingCode() {
        const { state, saveCreds } = await useMultiFileAuthState('session');
        this.authState = state;

        this.sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            browser: ['WhatsApp Gemini Bot', 'Chrome', '3.0'],
            generateHighQualityLinkPreview: true
        });

        this.sock.ev.on('creds.update', saveCreds);

        this.sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                this.log('Connection closed. Reconnecting: ' + shouldReconnect);
                
                if (shouldReconnect) {
                    setTimeout(() => this.connectWithPairingCode(), 5000);
                }
            } else if (connection === 'open') {
                this.log('✅ Connected to WhatsApp successfully!');
                this.log(`Bot is ready! Send messages to get AI responses.`);
            }
        });

        this.sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                await this.handleMessage(m.messages);
            }
        });

        // Request pairing code if not connected
        if (!this.sock.authState.creds.registered && this.config.phoneNumber) {
            setTimeout(async () => {
                try {
                    const code = await this.sock.requestPairingCode(this.config.phoneNumber);
                    this.log(`🔐 Your pairing code: ${code}`);
                    this.log('Enter this code in WhatsApp: Settings > Linked Devices > Link a Device > Link with Phone Number');
                } catch (error) {
                    this.log(`Error requesting pairing code: ${error.message}`);
                }
            }, 3000);
        }
    }

    async start() {
        this.log('🚀 Starting WhatsApp Gemini Bot...');
        
        if (!this.config.phoneNumber) {
            this.log('ERROR: Phone number not configured. Please run setup first.');
            return;
        }

        if (!this.config.geminiApiKey) {
            this.log('ERROR: Gemini API key not configured.');
            return;
        }

        await this.connectWithPairingCode();
    }
}

// Start the bot
const bot = new WhatsAppGeminiBot();
bot.start().catch(console.error);

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Bot shutting down...');
    process.exit(0);
});
