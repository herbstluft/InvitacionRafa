const fetch = globalThis.fetch;

exports.handler = async (event, context) => {
    // Enable CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        const postData = JSON.parse(event.body);

        // 1. Direct Webhook setup proxy (bypassing the Sheets URL)
        if (postData.action === "setup-webhook") {
            try {
                const tgResponse = await fetch(`https://api.telegram.org/bot${postData.data.token}/setWebhook?url=${encodeURIComponent(postData.data.url)}`);
                const tgData = await tgResponse.json();
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(tgData)
                };
            } catch (err) {
                return {
                    statusCode: 500,
                    headers,
                    body: JSON.stringify({ ok: false, description: err.message })
                };
            }
        }

        // 2. Proxy request to Google Sheets App Script URL
        const apiUrl = process.env.API_URL;
        if (!apiUrl) {
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: "La variable de entorno API_URL no está configurada en Netlify." })
            };
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: event.body
        });

        const data = await response.json();

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error("Proxy error:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: "Fallo de conexión con la API backend.", message: error.message })
        };
    }
};
