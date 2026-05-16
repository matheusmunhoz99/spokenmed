// Durable Object: FiorilliDO
// Singleton (idFromName("global")) que mantém sessão Puppeteer + cookies + _S_ID
// e responde a /lookup?cpf=XXXXXXXXXXX com JSON estruturado.

import puppeteer from "@cloudflare/puppeteer";

const SESSION_TTL_MS = 25 * 60 * 1000;
const PUPPETEER_TIMEOUT_MS = 45_000;
const HTTP_TIMEOUT_MS = 15_000;

function formatCpfMasked(cpf) {
  const d = cpf.replace(/\D/g, "");
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function jarToHeader(jar) {
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function ingestSetCookies(res, jar) {
  const getter = res.headers.getSetCookie?.bind(res.headers);
  const list = getter
    ? getter()
    : (() => {
        const raw = res.headers.get("set-cookie");
        return raw ? [raw] : [];
      })();
  for (const sc of list) {
    const first = sc.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (name) jar.set(name, value);
  }
}

function decodeJsString(s) {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseUniguiResponse(js) {
  const raw = {};
  const reList = [
    /(O[0-9A-Fa-f]+)\.setText\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.setText\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g,
    /(O[0-9A-Fa-f]+)\.stateValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
    /(O[0-9A-Fa-f]+)\.originalValue\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g,
  ];
  for (const re of reList) {
    let m;
    while ((m = re.exec(js)) !== null) {
      const id = m[1];
      const value = decodeJsString(m[2]);
      if (!(id in raw)) raw[id] = value;
    }
  }

  const cidadeRaw = raw["O11DB"] ?? null;
  let cidade = null;
  let uf = null;
  if (cidadeRaw) {
    const parts = cidadeRaw.split("-").map((s) => s.trim());
    if (parts.length >= 2 && parts[parts.length - 1].length === 2) {
      uf = parts[parts.length - 1].toUpperCase();
      cidade = parts.slice(0, -1).join("-");
    } else {
      cidade = cidadeRaw;
    }
  }

  const knownIds = new Set(["O11CB", "O11CF", "O11D3", "O11DB", "O11E3", "O11E7"]);
  let nome = null;
  for (const [id, value] of Object.entries(raw)) {
    if (knownIds.has(id)) continue;
    const t = value.trim();
    if (t.length >= 6 && t.length <= 120 && /\s/.test(t) && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ ]+$/.test(t)) {
      nome = t;
      break;
    }
  }

  let telefone = null;
  for (const value of Object.values(raw)) {
    const t = value.trim();
    if (/^\(?\d{2}\)?\s*\d{4,5}-?\d{4}$/.test(t)) {
      telefone = t;
      break;
    }
  }

  return {
    raw,
    logradouro: raw["O11CB"] ?? null,
    numero: raw["O11CF"] ?? null,
    bairro: raw["O11D3"] ?? null,
    cidade,
    uf,
    cns: raw["O11E7"] ?? null,
    cns_secundario: raw["O11E3"] ?? null,
    nome,
    telefone,
  };
}

function looksLikeSessionExpired(js) {
  if (/\.setText\(/i.test(js)) return false;
  return /login|sess[aã]o|expirad|invalid|_S_ID/i.test(js) || js.length < 50;
}

export class FiorilliDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.session = null; // { cookies: Map, sId, createdAt }
    this.seq = 0xe0;
    this.bootstrapPromise = null;
    this.lookupQueue = Promise.resolve();
    // Carrega sessão persistida (sobrevive a evictions do DO)
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get("session");
      if (saved && Date.now() - saved.createdAt < SESSION_TTL_MS) {
        this.session = { ...saved, cookies: new Map(saved.cookies) };
        console.log("[do] sessão restaurada do storage, idade:",
          Math.round((Date.now() - saved.createdAt) / 1000), "s");
      }
      const savedSeq = await this.state.storage.get("seq");
      if (typeof savedSeq === "number") this.seq = savedSeq;
    });
  }

  nextSeq() {
    const s = this.seq.toString(16);
    this.seq += 1;
    // best-effort persist (não bloqueia)
    this.state.storage.put("seq", this.seq).catch(() => {});
    return s;
  }

  async persistSession() {
    if (!this.session) {
      await this.state.storage.delete("session").catch(() => {});
      return;
    }
    await this.state.storage.put("session", {
      cookies: Array.from(this.session.cookies.entries()),
      sId: this.session.sId,
      createdAt: this.session.createdAt,
    }).catch((e) => console.error("[do] persist session falhou:", e));
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/reset") {
      this.session = null;
      await this.persistSession();
      console.log("[do] sessão resetada via /reset");
      return new Response(JSON.stringify({ ok: true, reset: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.pathname !== "/lookup") {
      return new Response(JSON.stringify({ ok: false, error: "not_found" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    }
    const cpf = (url.searchParams.get("cpf") || "").replace(/\D/g, "");
    if (cpf.length !== 11) {
      return new Response(JSON.stringify({ ok: false, error: "cpf_invalido" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    try {
      const result = await this.runLookupSerialized(cpf);
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    } catch (err) {
      console.error("[do] lookup error:", err?.stack || err);
      return new Response(
        JSON.stringify({ ok: false, error: "rede", detail: String(err?.message || err) }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }
  }

  async runLookupSerialized(cpf) {
    const prev = this.lookupQueue.catch(() => null);
    let release;
    const next = new Promise((r) => {
      release = r;
    });
    this.lookupQueue = prev.then(() => next);
    await prev;
    try {
      await this.ensureSession();
      let js = await this.rawLookup(cpf);
      if (looksLikeSessionExpired(js)) {
        console.log("[do] sessão expirada, refazendo login");
        this.session = null;
        await this.persistSession();
        await this.ensureSession();
        js = await this.rawLookup(cpf);
      }
      const parsed = parseUniguiResponse(js);
      const setTextCount = Object.keys(parsed.raw).length;
      if (setTextCount === 0) {
        return { ok: false, error: "lookup_sem_resposta" };
      }
      if (!parsed.logradouro && !parsed.cns && !parsed.cidade && !parsed.nome) {
        return { ok: false, error: "cpf_nao_encontrado" };
      }
      return {
        ok: true,
        dados: {
          nome: parsed.nome,
          logradouro: parsed.logradouro,
          numero: parsed.numero,
          bairro: parsed.bairro,
          cidade: parsed.cidade,
          uf: parsed.uf,
          cns: parsed.cns,
          cns_secundario: parsed.cns_secundario,
          telefone: parsed.telefone,
        },
      };
    } finally {
      release();
    }
  }

  async ensureSession() {
    if (this.session && Date.now() - this.session.createdAt < SESSION_TTL_MS) return;
    if (this.bootstrapPromise) return this.bootstrapPromise;
    this.bootstrapPromise = (async () => {
      try {
        this.session = await this.bootstrap();
        await this.persistSession();
      } finally {
        this.bootstrapPromise = null;
      }
    })();
    return this.bootstrapPromise;
  }

  async bootstrap() {
    console.log("[do] bootstrap build=fiorilli-debug-v4");
    const baseUrl = (this.env.OPP_BASE_URL || "").replace(/\/+$/, "");
    const user = this.env.OPP_USERNAME;
    const pass = this.env.OPP_PASSWORD;
    const sisIndex = `${baseUrl}/sis/`;

    let browser = null;
    try {
      browser = await puppeteer.launch(this.env.BROWSER);
      const page = await browser.newPage();
      page.setDefaultTimeout(PUPPETEER_TIMEOUT_MS);
      page.setDefaultNavigationTimeout(PUPPETEER_TIMEOUT_MS);

      await page.goto(sisIndex, { waitUntil: "networkidle0" });
      console.log("[do] step=goto_sis status=ok url=", page.url());

      const userSel = "#O30 input, input#O30, input[name='O30']";
      const passSel = "#O34 input, input#O34, input[name='O34']";

      await page.waitForSelector(userSel, { visible: true });
      await page.click(userSel, { clickCount: 3 });
      await page.type(userSel, user, { delay: 30 });

      await page.waitForSelector(passSel, { visible: true });
      await page.click(passSel, { clickCount: 3 });
      await page.type(passSel, pass, { delay: 30 });

      await this.submitLogin(page);
      console.log("[do] step=submit_login status=ok");

      await this.waitForDesktop(page);
      console.log("[do] step=wait_desktop status=ok url=", page.url());

      const opened = await this.openAmbulatoryModule(page);
      console.log("[do] step=open_ambulatorio status=ok via=", opened);

      const ambulatoryFrame = await this.waitForAmbulatoryFrame(page);
      const frameUrl = ambulatoryFrame?.url?.() || "";
      console.log("[do] step=wait_iframe status=ok src=", frameUrl || "sem-url");

      const sId = await this.extractSessionId(page, ambulatoryFrame);
      if (!sId) {
        const snippet = (await page.content()).slice(0, 1200);
        console.error("[do] _S_ID ausente. URL:", page.url(), "iframe:", frameUrl, "html:", snippet);
        throw new Error("login_invalido: _S_ID ausente");
      }
      console.log("[do] step=extract_sid status=ok");

      const cookieUrls = [page.url(), frameUrl].filter(Boolean);
      const cookies = cookieUrls.length ? await page.cookies(...cookieUrls) : await page.cookies();
      const jar = new Map();
      for (const c of cookies) jar.set(c.name, c.value);

      console.log("[do] session ready. cookies:", jar.size);
      return { cookies: jar, sId, createdAt: Date.now() };
    } finally {
      try {
        await browser?.close();
      } catch {
        /* ignore */
      }
    }
  }

  async submitLogin(page) {
    // Dump dos candidatos pra log (id, tag, text, type)
    const dump = await page
      .evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        return Array.from(document.querySelectorAll("button,input,a,.x-btn"))
          .filter(visible)
          .slice(0, 30)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            type: el.getAttribute("type") || null,
            text: (el.textContent || el.value || "").trim().slice(0, 40),
            cls: (el.className || "").toString().slice(0, 80),
          }));
      })
      .catch(() => []);
    console.log("[do] login_form_candidates=", JSON.stringify(dump));

    // Sucesso = URL mudou pra sis.dll OU formulário de login sumiu OU desktop apareceu
    const navPromise = page
      .waitForFunction(
        () => {
          if (/sis\.dll/i.test(location.href)) return true;
          if (document.querySelector(".x-desktop, .x-taskbar, .x-menubar")) return true;
          // Login sumiu? procura inputs de password visíveis
          const pwd = Array.from(document.querySelectorAll('input[type="password"]'))
            .find((el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            });
          return !pwd;
        },
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);

    // Clica EXATAMENTE no botão "Entrar" (ExtJS .x-btn com textContent === "Entrar")
    let viaUsed = null;
    const clicked = await page
      .evaluate(() => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        // 1) Match exato em .x-btn por texto "Entrar"
        const btns = Array.from(document.querySelectorAll(".x-btn")).filter(visible);
        let target = btns.find((b) => (b.textContent || "").trim().toLowerCase() === "entrar");
        // 2) Fallback: contém "entrar" mas NÃO "sair"/"acesso público"
        if (!target) {
          target = btns.find((b) => {
            const t = (b.textContent || "").trim().toLowerCase();
            return /entrar|acessar|^login$|^ok$/.test(t) && !/sair|acesso\s+p[uú]blico/.test(t);
          });
        }
        if (!target) return null;
        target.click();
        return target.id || target.className.slice(0, 60);
      })
      .catch(() => null);
    if (clicked) viaUsed = `text-exact:${clicked}`;

    // Fallback: Enter no campo de senha
    if (!viaUsed) {
      await page.focus('input[type="password"]').catch(() => null);
      await page.keyboard.press("Enter").catch(() => null);
      viaUsed = "enter-key";
    }
    const navegou = await navPromise;
    console.log("[do] submit_login via=", viaUsed, "navegou=", navegou, "url=", page.url());

    // Dismiss eventual dialog pós-login (boas-vindas, aviso senha, news)
    await page
      .evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll(".x-window, .x-message-box"));
        for (const dlg of dialogs) {
          const r = dlg.getBoundingClientRect();
          if (r.width === 0) continue;
          const btn = Array.from(dlg.querySelectorAll(".x-btn, button"))
            .find((b) => /ok|fechar|continuar|sim|close/i.test(b.textContent || ""));
          btn?.click();
        }
      })
      .catch(() => null);

    if (!navegou) {
      throw new Error("login_invalido: submit_nao_navegou (botão errado ou credencial inválida)");
    }
  }

  async waitForDesktop(page) {
    // Espera o splash "Acessando SIS 9.0" sumir E o login sumir E aparecer menubar/desktop real
    await page
      .waitForFunction(
        () => {
          const visible = (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          // Splash visível? ainda carregando
          const splash = Array.from(document.querySelectorAll("body *"))
            .filter(visible)
            .find((el) => /Acessando SIS/i.test((el.textContent || "").trim()) && (el.textContent || "").trim().length < 60);
          if (splash) return false;
          // Login ainda visível?
          const pwd = Array.from(document.querySelectorAll('input[type="password"]')).find(visible);
          if (pwd) return false;
          // Tem menubar/toolbar/desktop?
          if (document.querySelector(".x-menubar, .x-desktop, .x-taskbar")) return true;
          // Ou um botão de menu real (Ambulatório/Cadastros/etc)
          const btns = Array.from(document.querySelectorAll(".x-btn, .x-btn-inner")).filter(visible);
          return btns.some((b) => /ambulat[óo]rio|cadastros|configura[çc][õo]es|relat[óo]rios|atendimento/i.test(b.textContent || ""));
        },
        { timeout: 25_000 },
      )
      .catch(async () => {
        // Dump pra diagnosticar
        const dump = await page
          .evaluate(() => {
            const visible = (el) => {
              const r = el.getBoundingClientRect();
              return r.width > 0 && r.height > 0;
            };
            return Array.from(document.querySelectorAll(".x-btn, .x-btn-inner, .x-menubar, .x-toolbar"))
              .filter(visible)
              .slice(0, 30)
              .map((el) => (el.textContent || "").trim().slice(0, 40));
          })
          .catch(() => []);
        console.error("[do] desktop timeout. dump=", JSON.stringify(dump));
        throw new Error("login_invalido: desktop_nao_carregou (splash não terminou)");
      });
  }

  async openAmbulatoryModule(page) {
    // Helper sleep dentro do evaluate
    const result = await page
      .evaluate(async () => {
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const isAmb = (txt) => /ambulat[óo]rio/i.test(txt || "");

        // 1) Botão direto no menubar/toolbar com texto "Ambulatório"
        const menubarBtns = Array.from(
          document.querySelectorAll(".x-menubar .x-btn, .x-toolbar .x-btn, .x-menubar a.x-btn, .x-toolbar a.x-btn"),
        ).filter(visible);
        let hit = menubarBtns.find((b) => isAmb(b.textContent));
        if (hit) {
          hit.click();
          await sleep(150);
          // Se abriu menu dropdown, tenta clicar no primeiro item Ambulatório
          const sub = Array.from(document.querySelectorAll(".x-menu .x-menu-item")).filter(visible).find((m) => isAmb(m.textContent));
          if (sub) sub.click();
          return { via: "menubar-direct", text: (hit.textContent || "").trim().slice(0, 60) };
        }

        // 2) Abre cada botão da menubar e procura subitem "Ambulatório"
        for (const b of menubarBtns) {
          try {
            b.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
            b.click();
          } catch {}
          await sleep(180);
          const sub = Array.from(document.querySelectorAll(".x-menu .x-menu-item, .x-menu-item-text"))
            .filter(visible)
            .find((m) => isAmb(m.textContent));
          if (sub) {
            const clickable = sub.closest(".x-menu-item") || sub;
            clickable.click();
            return { via: "menubar-submenu", parent: (b.textContent || "").trim().slice(0, 40), text: (sub.textContent || "").trim().slice(0, 60) };
          }
        }

        // 3) Selectors ExtJS clássicos
        const extSelectors = [
          ".x-btn-inner", ".x-menu-item-text", ".x-tree-node-text",
          ".x-desktop-shortcut-text", ".x-tab-inner", ".x-grid-cell-inner",
        ];
        for (const sel of extSelectors) {
          const els = Array.from(document.querySelectorAll(sel)).filter(visible);
          const h = els.find((el) => isAmb(el.textContent) || isAmb(el.getAttribute("data-qtip")));
          if (h) {
            const clickable = h.closest(".x-btn, .x-menu-item, .x-tree-node, .x-desktop-shortcut, .x-tab") || h;
            clickable.click();
            try { clickable.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true })); } catch {}
            return { via: `ext:${sel}`, text: (h.textContent || "").trim().slice(0, 60) };
          }
        }

        // 4) Dump diagnóstico
        const dump = {
          menubar: menubarBtns.map((b) => (b.textContent || "").trim().slice(0, 40)),
          allBtns: Array.from(document.querySelectorAll(".x-btn")).filter(visible).slice(0, 30).map((b) => (b.textContent || "").trim().slice(0, 40)),
          menuItems: Array.from(document.querySelectorAll(".x-menu-item-text")).filter(visible).slice(0, 30).map((b) => (b.textContent || "").trim().slice(0, 40)),
        };
        return { via: null, dump };
      })
      .catch((e) => ({ via: null, error: String(e) }));

    if (!result?.via) {
      console.error("[do] menu Ambulatório não encontrado. dump=", JSON.stringify(result));
      throw new Error("login_invalido: menu_ambulatorio_nao_encontrado");
    }
    return `${result.via} (${result.text || ""})`;
  }

  async waitForAmbulatoryFrame(page) {
    const frameHandle = await page
      .waitForFunction(
        () => {
          const frames = Array.from(document.querySelectorAll("iframe"));
          return frames.find((frame) => {
            const src = frame.getAttribute("src") || frame.src || "";
            return /ambulatorio\.dll|\/ambulatorio\//i.test(src);
          }) || null;
        },
        { timeout: 20_000 },
      )
      .catch(() => null);

    if (!frameHandle) {
      const iframes = await page
        .evaluate(() =>
          Array.from(document.querySelectorAll("iframe")).map((f) => ({
            id: f.id, src: f.getAttribute("src") || f.src || "",
          })),
        )
        .catch(() => []);
      console.error("[do] iframe ambulatório não apareceu. iframes=", JSON.stringify(iframes), "url=", page.url());
      throw new Error("login_invalido: iframe_ambulatorio_ausente");
    }

    const element = await frameHandle.asElement();
    const frame = element ? await element.contentFrame() : null;
    if (frame) {
      await frame.waitForFunction(() => document.readyState === "complete", { timeout: 20_000 }).catch(() => null);
    }
    return frame;
  }

  async extractSessionId(page, frame) {
    const fromUrl = (value) => {
      if (!value) return null;
      const match = value.match(/[?&]_S_ID=([A-Za-z0-9._-]+)/i);
      return match?.[1] || null;
    };

    const fromFrameUrl = fromUrl(frame?.url?.());
    if (fromFrameUrl) return fromFrameUrl;

    const fromPageUrl = fromUrl(page.url());
    if (fromPageUrl) return fromPageUrl;

    const patternsSource = [
      /_S_ID["']?\s*[:=]\s*["']([^"']+)["']/.source,
      /name=["']_S_ID["']\s+value=["']([^"']+)["']/.source,
      /[?&]_S_ID=([A-Za-z0-9._-]+)/.source,
    ];

    const scan = async (ctx) =>
      ctx
        .evaluate((sources) => {
          const html = document.documentElement.outerHTML;
          for (const source of sources) {
            const match = html.match(new RegExp(source, "i"));
            if (match?.[1]) return match[1];
          }
          return null;
        }, patternsSource)
        .catch(() => null);

    return (frame && (await scan(frame))) || (await scan(page));
  }

  async rawLookup(cpf) {
    const baseUrl = (this.env.OPP_BASE_URL || "").replace(/\/+$/, "");
    const url = `${baseUrl}/ambulatorio/ambulatorio.dll/HandleEvent`;
    const referer = `${baseUrl}/ambulatorio/ambulatorio.dll/`;
    const cpfFmt = formatCpfMasked(cpf);
    const fp = `%26O1162%3D%25024%2502%2502${encodeURIComponent(cpfFmt)}`;
    const seq = this.nextSeq();

    const body =
      `Ajax=1&IsEvent=1&Obj=O117A&Evt=click&this=O117A` +
      `&_S_ID=${encodeURIComponent(this.session.sId)}` +
      `&fp=${fp}` +
      `&seq=${seq}` +
      `&uo=O112A`;

    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), HTTP_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, {
        method: "POST",
        signal: ac.signal,
        redirect: "follow",
        headers: {
          Accept: "*/*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36",
          Origin: new URL(referer).origin,
          Referer: referer,
          "X-Requested-With": "XMLHttpRequest",
          Cookie: jarToHeader(this.session.cookies),
        },
        body,
      });
    } finally {
      clearTimeout(t);
    }
    ingestSetCookies(res, this.session.cookies);
    const text = await res.text();
    console.log("[do] lookup", { status: res.status, seq, bodyLen: text.length });
    return text;
  }
}
