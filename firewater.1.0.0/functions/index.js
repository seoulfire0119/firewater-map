const functions = require('firebase-functions');
const fetch = require('node-fetch');

const SEOUL_API_BASE = 'http://openAPI.seoul.go.kr:8088';

// 서울 Open API HTTP → HTTPS 프록시
// 클라이언트: /api/seoul/<나머지 경로>
// 실제 요청:  http://openAPI.seoul.go.kr:8088/<나머지 경로>
exports.seoulProxy = functions
  .region('asia-northeast3')  // 서울 리전
  .https.onRequest(async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET');
      res.set('Access-Control-Max-Age', '3600');
      res.status(204).send('');
      return;
    }

    // /api/seoul/<path> → path 추출
    const path = req.path.replace(/^\/api\/seoul/, '');
    const targetUrl = `${SEOUL_API_BASE}${path}`;

    try {
      const apiRes = await fetch(targetUrl, { timeout: 15000 });
      const contentType = apiRes.headers.get('content-type') || 'text/xml';
      const body = await apiRes.text();
      res.set('Content-Type', contentType);
      res.status(apiRes.status).send(body);
    } catch (err) {
      functions.logger.error('Seoul API proxy error:', err);
      res.status(502).json({ error: 'Bad Gateway', message: err.message });
    }
  });
