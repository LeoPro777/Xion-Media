/**
 * Global AI Provider Switcher
 * Switches AI operation between Gemini (default) and OpenAI transparently.
 */
const http = require('http');
const https = require('https');

const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const geminiApiKey =
  process.env.GEMINI_API_KEY ||
  process.env.OPENAI_API_KEY ||
  '';
const defaultGeminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const proxyPort = parseInt(process.env.AI_PROXY_PORT || '4040', 10);

if (provider !== 'openai') {
  process.env.OPENAI_API_KEY = geminiApiKey;
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${proxyPort}/v1`;

  if (!globalThis.__geminiProxyStarted) {
    globalThis.__geminiProxyStarted = true;

    const server = http.createServer((req, res) => {
      // 1. Models list
      if (req.method === 'GET' && req.url && req.url.includes('/models')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            object: 'list',
            data: [
              { id: 'gpt-4.1', object: 'model', owned_by: 'system' },
              { id: 'gpt-5.2', object: 'model', owned_by: 'system' },
              { id: defaultGeminiModel, object: 'model', owned_by: 'system' },
            ],
          })
        );
        return;
      }

      let chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', async () => {
        let payload = Buffer.concat(chunks).toString();
        let json = null;
        try {
          json = JSON.parse(payload);
        } catch (e) {
          // not JSON
        }

        // 2. Image generation
        if (req.url && req.url.includes('/images/generations')) {
          try {
            const prompt = json?.prompt || 'creative social media image';
            const isVertical = json?.size && json.size.includes('1536');
            const width = isVertical ? 1024 : 1024;
            const height = isVertical ? 1536 : 1024;
            const imgUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(
              prompt
            )}?width=${width}&height=${height}&nologo=true`;

            const imgRes = await fetch(imgUrl);
            if (imgRes.ok) {
              const buffer = Buffer.from(await imgRes.arrayBuffer());
              const b64 = buffer.toString('base64');
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  created: Math.floor(Date.now() / 1000),
                  data: [{ b64_json: b64, url: imgUrl }],
                })
              );
              return;
            }
          } catch (imgErr) {
            console.error('[AI Switcher] Image generation error:', imgErr);
          }
        }

        // 3. Normalization for Gemini
        if (json) {
          // Map models to Gemini
          if (
            !json.model ||
            json.model.startsWith('gpt-') ||
            json.model.startsWith('chatgpt-') ||
            json.model.startsWith('dall-e')
          ) {
            json.model = defaultGeminiModel;
          }

          // Clean tools for Gemini compatibility
          if (Array.isArray(json.tools)) {
            json.tools = json.tools.map((t) => {
              if (t && t.name && !t.function) {
                return {
                  type: 'function',
                  function: {
                    name: t.name,
                    description: t.description || '',
                    parameters: t.parameters || { type: 'object' },
                  },
                };
              }
              const cleanTool = { ...t };
              delete cleanTool.strict;
              if (cleanTool.function) {
                cleanTool.function = { ...cleanTool.function };
                delete cleanTool.function.strict;
              }
              return cleanTool;
            });
          }

          // Convert OpenAI Responses API format to standard chat completions
          if (json.input && !json.messages) {
            json.messages = Array.isArray(json.input)
              ? json.input.map((item) => {
                  if (typeof item === 'string') return { role: 'user', content: item };
                  if (item && item.content) return item;
                  return { role: 'user', content: JSON.stringify(item) };
                })
              : [{ role: 'user', content: String(json.input) }];
            delete json.input;
          }

          // Strip OpenAI Responses-specific fields unknown to Gemini
          delete json.parallel_tool_calls;
          delete json.previous_response_id;
          delete json.instructions;
          delete json.store;
          delete json.prompt_cache_key;
          delete json.prompt_cache_retention;
          delete json.safety_identifier;
          delete json.top_logprobs;
          delete json.truncation;
          delete json.include;
          delete json.metadata;

          delete json.strict;
          delete json.service_tier;

          payload = JSON.stringify(json);
        }

        const isEmbeddings = req.url && req.url.includes('/embeddings');
        const targetPath = isEmbeddings
          ? '/v1beta/openai/embeddings'
          : '/v1beta/openai/chat/completions';

        const forwardHeaders = {
          'content-type': req.headers['content-type'] || 'application/json',
          'content-length': Buffer.byteLength(payload),
          authorization: `Bearer ${geminiApiKey}`,
        };

        if (req.headers.accept) {
          forwardHeaders.accept = req.headers.accept;
        }

        const geminiReq = https.request(
          {
            hostname: 'generativelanguage.googleapis.com',
            path: targetPath,
            method: req.method,
            headers: forwardHeaders,
          },
          (geminiRes) => {
            res.writeHead(geminiRes.statusCode, geminiRes.headers);
            geminiRes.pipe(res);
          }
        );

        geminiReq.on('error', (err) => {
          console.error('[AI Switcher] Proxy error to Gemini:', err.message);
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(
            JSON.stringify({
              error: {
                message: `AI Switcher proxy error: ${err.message}`,
                type: 'proxy_error',
              },
            })
          );
        });

        geminiReq.write(payload);
        geminiReq.end();
      });
    });

    server.on('error', (err) => {
      if (err.code !== 'EADDRINUSE') {
        console.error('[AI Switcher] Server error:', err.message);
      }
    });

    server.listen(proxyPort, '127.0.0.1', () => {
      console.log(
        `[AI Switcher] Active. Routing AI requests to Gemini (${defaultGeminiModel}) via port ${proxyPort}`
      );
    });
  }
} else {
  console.log('[AI Switcher] Active with provider: OpenAI');
}

module.exports = { provider, defaultGeminiModel };
