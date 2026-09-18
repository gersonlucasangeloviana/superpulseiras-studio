import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function proxy(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backend = process.env.BACKEND_URL || 'http://superpulseiras-studio-api:8000';
  const target = new URL(`/api/${path.join('/')}${request.nextUrl.search}`, backend);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
    redirect: 'manual',
  });

  return new Response(response.body, { status: response.status, headers: response.headers });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
