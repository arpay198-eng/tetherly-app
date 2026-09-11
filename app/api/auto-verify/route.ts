import { NextResponse } from 'next/server';
import { runAutoVerify } from '@/lib/autoVerifyCore';
import { getAuth } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const auth = getAuth(request);
    if (!auth || !auth.isAdmin) {
      return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
    }
    const result = await runAutoVerify();
    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Auto-verify failed' }, { status: 200 });
    }
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('API auto-verify error:', error);
    return NextResponse.json({ error: 'Internal server error', detail: error?.message }, { status: 500 });
  }
}