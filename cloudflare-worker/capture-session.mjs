#!/usr/bin/env node
// Extrai cookies + _S_ID de um "Copy as cURL" do DevTools e envia
// pro endpoint /session/update do Worker.
//
// Uso:
//   1. No DevTools (Network), ache QUALQUER POST pra HandleEvent.
//   2. Botão direito → Copy → "Copy as cURL (bash)".
//   3. Cole num arquivo, ex: /tmp/req.sh
//   4. Rode:
//        API_KEY=SUA_KEY node capture-session.mjs /tmp/req.sh
//
//   Ou cole direto via stdin:
//        API_KEY=SUA_KEY pbpaste | node capture-session.mjs -
//        (Linux: use `xclip -o -selection clipboard` em vez de pbpaste)

import { readFileSync } from "node:fs";

const file = process.argv[2];
const apiKey = process.env.API_KEY;
const workerUrl = (process.env.WORKER_URL || "https://spokenmed.meyssiner.workers.dev").replace(/\/+$/, "");

if (!file || !apiKey) {
  console.error("Uso: API_KEY=xxx node capture-session.mjs <arquivo-curl.sh | ->");
  process.exit(1);
}

const curl = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");

function pick(re) {
  const m = curl.match(re);
  return m ? m[1] : "";
}

// Cookies: tanto -H 'cookie: ...' quanto -b '...'
const cookies =
  pick(/-H\s+['"]cookie:\s*([^'"]+)['"]/i) ||
  pick(/-b\s+['"]([^'"]+)['"]/);

// Body do POST (--data, --data-raw, --data-urlencode, -d)
const data =
  pick(/--data-raw\s+['"]([^'"]+)['"]/) ||
  pick(/--data\s+['"]([^'"]+)['"]/) ||
  pick(/\s-d\s+['"]([^'"]+)['"]/);

const sidRaw = (data.match(/_S_ID=([^&]+)/) || [])[1] || "";
const sId = sidRaw ? decodeURIComponent(sidRaw) : "";

if (!cookies || !sId) {
  console.error("❌ Não consegui extrair cookies ou _S_ID do cURL.");
  console.error("   cookies encontrados:", cookies ? cookies.slice(0, 60) + "..." : "(vazio)");
  console.error("   _S_ID encontrado   :", sId || "(vazio)");
  console.error("   Confira se você copiou um POST do HandleEvent.");
  process.exit(2);
}

console.log("✅ cookies :", cookies.slice(0, 80) + (cookies.length > 80 ? "..." : ""));
console.log("✅ _S_ID   :", sId);
console.log("→ POST", `${workerUrl}/session/update`);

const res = await fetch(`${workerUrl}/session/update?api_key=${encodeURIComponent(apiKey)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cookies, s_id: sId }),
});
const txt = await res.text();
console.log("← status", res.status);
console.log("←", txt);
process.exit(res.ok ? 0 : 3);
