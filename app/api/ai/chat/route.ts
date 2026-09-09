import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

const SYSTEM_PROMPT = `You are Tetherly AI, a helpful assistant for the Tetherly USDT deposit/withdrawal platform. 
You help users with:
- Understanding how to deposit/withdraw USDT
- Explaining transaction statuses (pending, completed, failed)
- Guiding users through the app features
- Answering questions about BEP20 network
- General crypto and USDT related questions

Be concise, friendly, and helpful. If you don't know something about the user's specific account, tell them to check their dashboard or contact support.`;

export async function POST(req: NextRequest) {
  try {
    // Auth check
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!DEEPSEEK_API_KEY) {
      return NextResponse.json({ error: 'AI service not configured' }, { status: 503 });
    }

    const body = await req.json();
    const { messages } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages array required' }, { status: 400 });
    }

    // Rate limit: 20 messages per user per hour
    const now = Date.now();
    const userKey = `ai_${payload.id}`;
    const rateKey = `${userKey}_${Math.floor(now / 3600000)}`;
    const rateLimit = (globalThis as any).__aiRateLimit || {};
    (globalThis as any).__aiRateLimit = rateLimit;
    rateLimit[rateKey] = (rateLimit[rateKey] || 0) + 1;
    if (rateLimit[rateKey] > 20) {
      return NextResponse.json({ error: 'Rate limit exceeded. Try again later.' }, { status: 429 });
    }

    // Call DeepSeek API
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
        max_tokens: 1024,
        temperature: 0.7,
        thinking: { type: 'disabled' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('DeepSeek API error:', response.status, err);
      return NextResponse.json({ error: 'AI service temporarily unavailable' }, { status: 502 });
    }

    const data = await response.json();
    const reply = data.choices?.[0]?.message?.content || 'No response generated.';

    return NextResponse.json({ reply });
  } catch (err: any) {
    console.error('AI chat error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
