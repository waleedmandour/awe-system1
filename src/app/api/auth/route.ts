import { NextRequest, NextResponse } from 'next/server';
import { isEmailWhitelisted } from '@/lib/whitelist';

/**
 * POST /api/auth
 *
 * Authenticates a user by verifying their email against the whitelist.
 * If valid, issues a signed authentication token as an httpOnly cookie.
 *
 * Request body: { email: string }
 * Response: { success: true, email: string } | { error: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email address is required.' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      );
    }

    // Check whitelist
    if (!isEmailWhitelisted(normalizedEmail)) {
      return NextResponse.json(
        { error: 'This email is not authorized to use the iAWE System. Please contact the administrator if you believe this is an error.' },
        { status: 403 }
      );
    }

    // Generate authentication token using HMAC
    // Token format: base64url(email) + "." + base64url(hmac-sha256(email, secret))
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      console.error('AUTH_SECRET environment variable is not set');
      return NextResponse.json(
        { error: 'Server configuration error. Please contact the administrator.' },
        { status: 500 }
      );
    }

    const token = await generateToken(normalizedEmail, authSecret);

    // Set httpOnly cookie with the token (30-day expiry)
    const response = NextResponse.json({
      success: true,
      email: normalizedEmail,
    });

    response.cookies.set('awe-auth-token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    // Also set a readable cookie so the client knows it's authenticated
    response.cookies.set('awe-auth-email', normalizedEmail, {
      httpOnly: false,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return response;
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Authentication failed. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth
 *
 * Verifies if the current auth token is still valid.
 * Used by the client to check authentication status on app load.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('awe-auth-token')?.value;
    const email = request.cookies.get('awe-auth-email')?.value;

    if (!token || !email) {
      return NextResponse.json({ authenticated: false });
    }

    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret) {
      return NextResponse.json({ authenticated: false });
    }

    const isValid = await verifyToken(token, email, authSecret);

    if (!isValid) {
      // Clear invalid cookies
      const response = NextResponse.json({ authenticated: false });
      response.cookies.delete('awe-auth-token');
      response.cookies.delete('awe-auth-email');
      return response;
    }

    // Double-check the email is still on the whitelist
    if (!isEmailWhitelisted(email)) {
      const response = NextResponse.json({ authenticated: false });
      response.cookies.delete('awe-auth-token');
      response.cookies.delete('awe-auth-email');
      return response;
    }

    return NextResponse.json({ authenticated: true, email });
  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json({ authenticated: false });
  }
}

/**
 * DELETE /api/auth
 *
 * Logs out the user by clearing auth cookies.
 */
export async function DELETE() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete('awe-auth-token');
  response.cookies.delete('awe-auth-email');
  return response;
}

// ─── Token Utilities ──────────────────────────────────────────────────────────

/**
 * Generate an HMAC-signed token for the given email.
 * Format: base64url(email) + "." + base64url(hmac-sha256(email, secret))
 */
async function generateToken(email: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(email);

  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('HMAC', key, messageData);
  const signatureB64 = arrayBufferToBase64Url(signature);
  const emailB64 = arrayBufferToBase64Url(new Uint8Array(encoder.encode(email)).buffer as ArrayBuffer);

  return `${emailB64}.${signatureB64}`;
}

/**
 * Verify an HMAC-signed token.
 */
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

    // Verify the HMAC signature
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

/**
 * Convert ArrayBuffer to base64url string.
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Convert base64url string to ArrayBuffer.
 */
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
