// /api/image/:key
// R2バケットに保存された画像そのものを返します。

export async function onRequestGet({ params, env }) {
  const key = params.key;
  if (!key) return new Response("Not found", { status: 404 });

  const obj = await env.PHOTOS_BUCKET.get(key);
  if (!obj) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  headers.set("cache-control", "public, max-age=31536000, immutable");

  return new Response(obj.body, { headers });
}
