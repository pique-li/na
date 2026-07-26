// /api/photos
// GET    … 写真一覧を返す（新しい順）
// POST   … 画像をアップロードする（password / file / title を multipart/form-data で送信）
// DELETE … 写真を削除する（?key=... とヘッダー x-upload-password）
//
// 必要な設定（Cloudflare Pages のプロジェクト設定）:
//  - R2 バケットのバインディング名: PHOTOS_BUCKET
//  - 環境変数（Secret）: UPLOAD_PASSWORD

const MAX_SIZE = 8 * 1024 * 1024; // 8MB

export async function onRequestGet({ env }) {
  const list = await env.PHOTOS_BUCKET.list({ limit: 1000 });
  const items = list.objects
    .map((o) => ({
      key: o.key,
      title: (o.customMetadata && o.customMetadata.title) || "",
      uploaded: o.uploaded,
    }))
    .sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  return Response.json(items);
}

export async function onRequestPost({ request, env }) {
  if (!env.UPLOAD_PASSWORD) {
    return new Response("サーバー側にUPLOAD_PASSWORDが設定されていません。", { status: 500 });
  }

  let form;
  try {
    form = await request.formData();
  } catch (err) {
    return new Response("送信内容を読み取れませんでした。", { status: 400 });
  }

  const password = form.get("password");
  if (password !== env.UPLOAD_PASSWORD) {
    return new Response("パスワードが違います。", { status: 401 });
  }

  const file = form.get("file");
  const title = (form.get("title") || "").toString().slice(0, 60);

  if (!file || typeof file === "string") {
    return new Response("画像ファイルがありません。", { status: 400 });
  }
  if (!file.type || !file.type.startsWith("image/")) {
    return new Response("画像ファイルのみアップロードできます。", { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return new Response("ファイルサイズは8MB以内にしてください。", { status: 400 });
  }

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const key = `photo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await env.PHOTOS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: { title },
  });

  return Response.json({ ok: true, key });
}

export async function onRequestDelete({ request, env }) {
  if (!env.UPLOAD_PASSWORD) {
    return new Response("サーバー側にUPLOAD_PASSWORDが設定されていません。", { status: 500 });
  }

  const password = request.headers.get("x-upload-password");
  if (password !== env.UPLOAD_PASSWORD) {
    return new Response("パスワードが違います。", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get("key");
  if (!key) {
    return new Response("keyが必要です。", { status: 400 });
  }

  await env.PHOTOS_BUCKET.delete(key);
  return Response.json({ ok: true });
}
