const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.post('/proxy/ask', async (req, res) => {
    try {
        const response = await fetch('https://7860-01jsbrn78sydwxvkhr021tsz56.cloudspaces.litng.ai/ask', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        res.json(await response.json());
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3001, () => console.log('Proxy running on port 3001'));