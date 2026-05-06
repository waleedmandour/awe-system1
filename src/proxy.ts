import { NextRequest, NextResponse } from 'next/server';

/**
 * Proxy for AWE System1
 *
 * Protects API routes (/api/ocr, /api/assess) by verifying the
 * authentication token cookie. Unauthenticated requests receive 401.
 *
 * The /api/auth route is excluded from protection so users can authenticate.
 * Other routes (/api/courses, /api/essays, /api/pdf, /api) are public.
 */

export const config = {
  matcher: ['/api/ocr/:path*', '/api/assess/:path*'],
};

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('awe-auth-token')?.value;
  const email = request.cookies.get('awe-auth-email')?.value;

  // No auth cookies present
  if (!token || !email) {
    return NextResponse.json(
      { error: 'Authentication required. Please sign in with your authorized email address.' },
      { status: 401 }
    );
  }

  // Verify the HMAC token signature
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    console.error('AUTH_SECRET environment variable is not set');
    return NextResponse.json(
      { error: 'Server configuration error.' },
      { status: 500 }
    );
  }

  const isValid = await verifyToken(token, email, authSecret);

  if (!isValid) {
    // Token is invalid — clear cookies and reject
    const response = NextResponse.json(
      { error: 'Invalid authentication. Please sign in again.' },
      { status: 401 }
    );
    response.cookies.delete('awe-auth-token');
    response.cookies.delete('awe-auth-email');
    return response;
  }

  // Token is valid — allow the request to proceed
  return NextResponse.next();
}

// ─── Token Verification ──────────────────────────────────────────────────

async function verifyToken(token: string, expectedEmail: string, secret: string): Promise<boolean> {
  try {
    const [emailB64, signatureB64] = token.split('.');
    if (!emailB64 || !signatureB64) return false;

    // Decode the email from the token
    const emailBytes = base64UrlToArrayBuffer(emailB64);
    const decoder = new TextDecoder();
    const tokenEmail = decoder.decode(emailBytes);

    // Ensure the email matches
    if (tokenEmail !== expectedEmail) return false;

    // Verify the HMAC signature using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(tokenEmail);

    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureBytes = base64UrlToArrayBuffer(signatureB64);
    return crypto.subtle.verify('HMAC', key, signatureBytes, messageData);
  } catch {
    return false;
  }
}

function base64UrlToArrayBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
