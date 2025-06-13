const fs = require('fs-extra');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function question(prompt) {
    return new Promise((resolve) => {
        rl.question(prompt, resolve);
    });
}

async function setup() {
    console.log('🔧 WhatsApp Gemini Bot Setup\n');
    
    const phoneNumber = await question('Enter your phone number (with country code, e.g., 1234567890): ');
    const botName = await question('Enter bot name (default: GeminiBot): ') || 'GeminiBot';
    
    const config = {
        phoneNumber: phoneNumber.replace(/[^\d]/g, ''),
        geminiApiKey: "AIzaSyDd91YaWU1rPHfj50K3AgIao0F5gdjtAxY",
        botName: botName,
        logMessages: true,
        responsePrefix: "🤖 ",
        maxRetries: 3
    };

    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
    
    // Create train.txt if it doesn't exist
    if (!fs.existsSync('train.txt')) {
        fs.writeFileSync('train.txt', 
            'You are a helpful AI assistant. Respond to user questions in a friendly and informative manner.\n' +
            'Keep responses concise and relevant. If you don\'t know something, admit it honestly.'
        );
    }

    console.log('\n✅ Setup complete!');
    console.log('📝 Edit train.txt to customize your bot\'s behavior');
    console.log('🚀 Run: npm start');
    
    rl.close();
}

setup().catch(console.error);
