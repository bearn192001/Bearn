// Public short route: /p/{slug} -> BEARN Payment Link page.
export async function onRequest({ request, params }) {
  const slug = String(params?.slug || '').trim();
  if (!/^[a-z0-9_-]{4,40}$/i.test(slug)) {
    return new Response('Payment Link tidak ditemukan.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const target = new URL('/payment.html', request.url);
  target.searchParams.set('type', 'payment');
  target.searchParams.set('slug', slug);
  return Response.redirect(target.toString(), 302);
}
