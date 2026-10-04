export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  return Response.json({ ok: true, version: process.env.NEXT_PUBLIC_BUILD_PKGVER, buildHash: process.env.NEXT_PUBLIC_BUILD_HASH, instance: process.env.SECTOR7_DESKTOP_TOKEN?.slice(-12) }, { headers: { 'Cache-Control': 'no-store' } });
}
