const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = '0.0.0.0'; // Bind to all interfaces for network access
const BASE_DIR = __dirname;
const RAZORPAY_API = 'https://api.razorpay.com/v1';

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeEqualHex(a, b) {
  if (!/^[a-f0-9]+$/i.test(a || '') || !/^[a-f0-9]+$/i.test(b || '')) return false;
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function razorpayRequest(endpoint, options = {}) {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error('Razorpay keys are not configured');
  const response = await fetch(`${RAZORPAY_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.description || 'Razorpay request failed');
  return payload;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'POST' && pathname === '/api/webhooks/razorpay') {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) return sendJson(res, 503, { error: 'Webhook is not configured.' });
    try {
      const rawBody = await readBody(req);
      const signature = req.headers['x-razorpay-signature'] || '';
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (!safeEqualHex(expected, signature)) return sendJson(res, 400, { error: 'Invalid webhook signature.' });
      const event = JSON.parse(rawBody.toString('utf8'));
      const tracked = new Set(['subscription.activated', 'subscription.charged', 'subscription.pending', 'subscription.halted', 'subscription.cancelled', 'subscription.completed']);
      if (tracked.has(event.event)) {
        const line = JSON.stringify({ id: req.headers['x-razorpay-event-id'] || null, event: event.event, created_at: event.created_at, subscription_id: event.payload?.subscription?.entity?.id || null, payment_id: event.payload?.payment?.entity?.id || null, received_at: new Date().toISOString() }) + '\n';
        await fs.promises.appendFile(path.join(BASE_DIR, 'razorpay-events.jsonl'), line, { encoding: 'utf8', flag: 'a' });
      }
      return sendJson(res, 200, { received: true });
    } catch (error) {
      console.error('Razorpay webhook processing failed:', error.message);
      return sendJson(res, 400, { error: 'Webhook processing failed.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/payments/create-order') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return sendJson(res, 503, { error: 'Checkout is not configured yet.' });
    }
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const email = String(body.email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Enter a valid email address.' });
      const order = await razorpayRequest('/orders', {
        method: 'POST',
        body: JSON.stringify({ amount: 490000, currency: 'INR', receipt: `es_${crypto.randomUUID().replaceAll('-', '').slice(0, 32)}`, notes: { product: 'ElectroShorts one-time license', email } })
      });
      return sendJson(res, 200, { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, email });
    } catch (error) {
      console.error('Razorpay order creation failed:', error.message);
      return sendJson(res, 400, { error: error.message || 'Could not start checkout.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/payments/create-subscription') {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET || !process.env.RAZORPAY_MONTHLY_PLAN_ID) {
      return sendJson(res, 503, { error: 'Monthly checkout is not configured yet.' });
    }
    try {
      const plan = await razorpayRequest(`/plans/${encodeURIComponent(process.env.RAZORPAY_MONTHLY_PLAN_ID)}`);
      if (plan.period !== 'monthly' || plan.interval !== 1 || plan.item?.amount !== 33300 || plan.item?.currency !== 'INR') {
        return sendJson(res, 503, { error: 'Configured Razorpay plan must be ₹333 INR billed monthly.' });
      }
      const subscription = await razorpayRequest('/subscriptions', {
        method: 'POST',
        body: JSON.stringify({ plan_id: process.env.RAZORPAY_MONTHLY_PLAN_ID, total_count: 12, quantity: 1, customer_notify: 0, notes: { product: 'ElectroShorts monthly plan' } })
      });
      return sendJson(res, 200, { keyId: process.env.RAZORPAY_KEY_ID, subscriptionId: subscription.id });
    } catch (error) {
      console.error('Razorpay subscription creation failed:', error.message);
      return sendJson(res, 400, { error: error.message || 'Could not start monthly checkout.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/payments/verify-subscription') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const { razorpay_subscription_id: subscriptionId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
      if (![subscriptionId, paymentId, signature].every(value => typeof value === 'string' && value.length < 200)) return sendJson(res, 400, { error: 'Invalid subscription response.' });
      const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${paymentId}|${subscriptionId}`).digest('hex');
      if (!process.env.RAZORPAY_KEY_SECRET || !safeEqualHex(expected, signature)) return sendJson(res, 400, { error: 'Subscription authorization verification failed.' });
      const subscription = await razorpayRequest(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
      if (subscription.plan_id !== process.env.RAZORPAY_MONTHLY_PLAN_ID || !['authenticated', 'active'].includes(subscription.status)) {
        return sendJson(res, 400, { error: 'Subscription is not authorized for this plan.' });
      }
      return sendJson(res, 200, { verified: true, message: 'Monthly subscription authorized.' });
    } catch (error) {
      console.error('Razorpay subscription verification failed:', error.message);
      return sendJson(res, 400, { error: 'Could not verify subscription. Contact support.' });
    }
  }

  if (req.method === 'POST' && pathname === '/api/payments/verify') {
    try {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = body;
      if (![orderId, paymentId, signature].every(value => typeof value === 'string' && value.length < 200)) return sendJson(res, 400, { error: 'Invalid payment response.' });
      const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '').update(`${orderId}|${paymentId}`).digest('hex');
      if (!process.env.RAZORPAY_KEY_SECRET || !safeEqualHex(expected, signature)) return sendJson(res, 400, { error: 'Payment verification failed.' });
      const payment = await razorpayRequest(`/payments/${encodeURIComponent(paymentId)}`);
      if (payment.order_id !== orderId || payment.amount !== 490000 || payment.currency !== 'INR' || payment.status !== 'captured') {
        return sendJson(res, 400, { error: 'Payment is not captured for this order.' });
      }
      return sendJson(res, 200, { verified: true, message: 'Payment confirmed. We will send your license details to your email.' });
    } catch (error) {
      console.error('Razorpay payment verification failed:', error.message);
      return sendJson(res, 400, { error: 'Could not verify payment. Contact support with your payment ID.' });
    }
  }

  return false;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push({ name, address: net.address });
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(urlObj.pathname);

  if (pathname.startsWith('/api/')) {
    handleApi(req, res, pathname).then(result => {
      if (result === false) sendJson(res, 404, { error: 'Not found.' });
    }).catch(error => {
      console.error('Payment API error:', error.message);
      sendJson(res, 500, { error: 'Payment service error.' });
    });
    return;
  }

  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  let filePath = path.join(BASE_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('500 Internal Server Error');
      }
    });
    stream.pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  const networkAddrs = getNetworkAddresses();
  console.log('\n  ⚡ ElectroShorts Web Server Running\n');
  console.log(`  ➜  Local:   http://localhost:${PORT}/`);
  networkAddrs.forEach(({ name, address }) => {
    console.log(`  ➜  Network: http://${address}:${PORT}/  (${name})`);
  });
  console.log('\n  Ready for access from other PCs, phones, or tablets on the same network!\n');
});
