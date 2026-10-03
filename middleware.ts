import { NextRequest, NextResponse } from 'next/server';
import { localAccessError } from './src/common/personal/local-access';

export function middleware(request: NextRequest) {
  const error = localAccessError(request.url, request.headers, request.method);
  return error ? NextResponse.json({ error }, { status: 403 }) : NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
