#!/usr/bin/env node
// Extrai _S_ID (e cookies, se houver) de um "Copy as cURL" do DevTools
// (bash OU Windows cmd) e envia pro /session/update do Worker.
//
// Uso:
//   API_KEY=SUA_KEY node capture-session.mjs /tmp/req.sh
//   API_KEY=SUA_KEY node capture-session.mjs -        # cola via stdin

import { readFileSync } from "node:fs";

const file = process.argv[2];
const apiKey = process.env.API_KEY;
const workerUrl = (process.env.WORKER_URL || "https://spokenmed.meyssiner.workers.dev").replace(/\/+$/, "");

if (!file || !apiKey) {
  console.error("Uso: API_KEY=xxx node capture-session.mjs <arquivo-curl | ->");
  process.exit(1);
}

let curl = file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");

// Normaliza cURL do Windows cmd: tira ^ continuações e ^" → "
curl = curl
  .replace(/\^\r?\n/g, " ")    // ^ no fim de linha = continuação
  .replace(/\^"/g, '"')        // ^" = "
  .replace(/\^\^/g, "^")
  .replace(/\\\r?\n/g, " ");   // \ continuação (bash)

function pickHeader(name) {
  const re = new RegExp(`-H\\s+['"]${name}:\\s*([^'"\\r\\n]+)['"]`, "i");
  const m = curl.match(re);
  return m ? m[1].trim() : "";
}

function pickBody() {
  const m =
    curl.match(/--data-raw\s+['"]([^'"]+)['"]/) ||
    curl.match(/--data\s+['"]([^'"]+)['"]/) ||
    curl.match(/\s-d\s+['"]([^'"]+)['"]/);
  return m ? m[1] : "";
}

// 1) cookies (qualquer um dos formatos)
const cookies =
  pickHeader("cookie") ||
  (curl.match(/-b\s+['"]([^'"]+)['"]/) || [, ""])[1] ||
  "";

// 2) _S_ID — em header (_s_id ou unisessionid) OU no body
let sId =
  pickHeader("_s_id") ||
  pickHeader("unisessionid") ||
  "";

if (!sId) {
  const body = pickBody();
  const m = body.match(/_S_ID=([^&]+)/);
  if (m) sId = decodeURIComponent(m[1]);
}

if (!sId) {
  console.error("❌ Não achei _S_ID no cURL (procurei nos headers _s_id, unisessionid e no body).");
  process.exit(2);
}

console.log("✅ _S_ID   :", sId);
console.log(cookies ? "✅ cookies : " + cookies.slice(0, 80) + (cookies.length > 80 ? "..." : "")
                    : "ℹ️  cookies : (não encontrados — este uniGUI usa só headers)");
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
