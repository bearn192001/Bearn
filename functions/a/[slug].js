// Public short route: /a/{slug} -> BEARN Auto Link flow.
export async function onRequest({ request, params }) {
  const slug = String(params?.slug || '').trim();
  if (!/^[a-z0-9_-]{3,40}$/i.test(slug)) {
    return new Response('Auto Link tidak ditemukan.', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
  const target = new URL('/go.html', request.url);
  target.searchParams.set('slug', slug);
  return Response.redirect(target.toString(), 302);
}
