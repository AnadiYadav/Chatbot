const express = require('express');
const { exec } = require('child_process');
const app = express();
const PORT = 3000;

app.use(express.json());

// Enhanced CORS middleware
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

app.post('/api/chat', (req, res) => {
    const message = req.body.message;
    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Escape special characters in the message
    const escapedMessage = JSON.stringify(message).slice(1, -1);
    
    // Construct the curl command exactly as per Gradio's API
    const curlCommand = `curl -X POST https://ayushs9020-aaadf.hf.space/gradio_api/call/chat -s \
        -H "Content-Type: application/json" \
        -d '{"data":["${escapedMessage}"]}' \
        | awk -F'"' '{ print $4}' \
        | read EVENT_ID; curl -N https://ayushs9020-aaadf.hf.space/gradio_api/call/chat/$EVENT_ID`;

    console.log('Executing command:', curlCommand);

    // Execute the command
    exec(curlCommand, { shell: '/bin/bash' }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error:', error);
            return res.status(500).json({ error: 'Failed to process request' });
        }
        
        if (stderr) {
            console.error('Stderr:', stderr);
        }

        try {
            // Process the streaming response
            const response = stdout.toString();
            console.log('Raw response:', response);
            
            // Extract the final response (modify based on actual API output)
            const botResponse = response.split('\n').filter(line => line.trim()).pop();
            
            res.json({
                data: [botResponse || "I couldn't process that request."]
            });
        } catch (e) {
            console.error('Parse error:', e);
            res.status(500).json({ error: 'Invalid response format' });
        }
    });
});

app.listen(PORT, () => {
    console.log(`Proxy server running on http://localhost:${PORT}`);
});