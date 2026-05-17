"""
SpokenMED Agent — mantém a sessão do Fiorilli/OPP sempre quente no Worker.

Roda em loop infinito no PC do usuário:
  1. Faz GET na tela de login do Fiorilli → captura o _S_ID inicial.
  2. POST do "cinfo" (handshake que o uniGUI faz logo após carregar).
  3. POST do clique no botão Entrar com usuário/senha.
  4. Manda o _S_ID + cookies pro endpoint /session/update do Worker Cloudflare.
  5. Dorme INTERVAL_MINUTES. Repete.

Tudo em HTTP puro com `requests` — sem Selenium, sem browser, sem Chromium.
"""
from __future__ import annotations

import logging
import os
import re
import sys
import time
import traceback
import urllib.parse as up
from logging.handlers import RotatingFileHandler
from pathlib import Path

import requests

# ─────────────────────────────────────────────────────────────────────────────
# Configuração (hardcoded — comodato pro cliente; basta recompilar pra trocar)
# ─────────────────────────────────────────────────────────────────────────────
WORKER_URL     = "https://spokenmed.meyssiner.workers.dev"
# WORKER_API_KEY é lido de agent.cfg (ao lado do .exe) — vide _read_api_key().
OPP_BASE       = "https://saudeteresopolis.oppcloud.com.br"
OPP_LOGIN_PATH = "/sis/"
OPP_HANDLE     = "/sis/sis.dll/HandleEvent"
OPP_USERNAME   = "admin"
OPP_PASSWORD   = "123"

INTERVAL_MINUTES = 30
HTTP_TIMEOUT     = 30

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36")

# ─────────────────────────────────────────────────────────────────────────────
# Logging — arquivo ao lado do .exe, rotaciona em 1 MB, mantém 3 backups.
# ─────────────────────────────────────────────────────────────────────────────
def _log_dir() -> Path:
    """Pasta onde gravar logs e ler o agent.cfg.
    Se rodando dentro de uma subpasta 'runtime/', usa a pasta-mãe (onde estão
    os launchers .bat/.vbs); caso contrário, usa a pasta do próprio script/.exe."""
    if getattr(sys, "frozen", False):
        base = Path(sys.executable).parent
    else:
        base = Path(__file__).resolve().parent
    if base.name.lower() == "runtime":
        base = base.parent
    return base


def _read_api_key() -> str:
    """Lê WORKER_API_KEY de agent.cfg (formato KEY=VALOR) ao lado do .exe."""
    cfg_path = _log_dir() / "agent.cfg"
    if not cfg_path.exists():
        print(f"\n❌ Arquivo agent.cfg não encontrado em {cfg_path}\n"
              f"   Crie um arquivo com o conteúdo:\n\n"
              f"   WORKER_API_KEY=SuaApiKeyAqui\n", file=sys.stderr)
        sys.exit(3)
    for raw in cfg_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            if k.strip() == "WORKER_API_KEY":
                v = v.strip().strip('"').strip("'")
                if v:
                    return v
    print(f"\n❌ WORKER_API_KEY não definido em {cfg_path}\n", file=sys.stderr)
    sys.exit(3)


WORKER_API_KEY = _read_api_key()

log = logging.getLogger("spokenmed-agent")
log.setLevel(logging.INFO)
_fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")
_console = logging.StreamHandler(sys.stdout)
_console.setFormatter(_fmt)
log.addHandler(_console)
try:
    _file = RotatingFileHandler(_log_dir() / "agent.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    _file.setFormatter(_fmt)
    log.addHandler(_file)
except Exception as e:  # pasta read-only? só console então.
    log.warning("não foi possível abrir agent.log: %s", e)


# ─────────────────────────────────────────────────────────────────────────────
# Lock file — evita 2 instâncias simultâneas.
# ─────────────────────────────────────────────────────────────────────────────
_LOCK_PATH = _log_dir() / "agent.lock"

def _acquire_lock() -> None:
    if _LOCK_PATH.exists():
        try:
            pid = int(_LOCK_PATH.read_text().strip() or "0")
        except Exception:
            pid = 0
        # melhor esforço: se PID antigo não existir mais, sobrescreve.
        try:
            os.kill(pid, 0)
            log.error("Já existe uma instância rodando (PID %s). Saindo.", pid)
            sys.exit(2)
        except OSError:
            pass
    _LOCK_PATH.write_text(str(os.getpid()))

def _release_lock() -> None:
    try:
        if _LOCK_PATH.exists():
            _LOCK_PATH.unlink()
    except Exception:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# Fluxo de login no uniGUI/Fiorilli
# ─────────────────────────────────────────────────────────────────────────────
def _sess() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": UA,
        "Accept-Language": "pt-BR,pt;q=0.9",
    })
    return s

def _ajax_headers() -> dict[str, str]:
    # Replica EXATAMENTE o que o Chrome manda (vide HAR). Sem _s_id/unisessionid
    # como header — o uniGUI rejeita com 401 se vierem. A sessão vai só no body.
    return {
        "X-Requested-With": "XMLHttpRequest",
        "Referer": OPP_BASE + OPP_LOGIN_PATH,
        "Origin": OPP_BASE,
        "Accept": "*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    }

def _looks_logged_in(text: str) -> bool:
    """Sinais de que o login deu certo (uniGUI manda JS pra montar a tela principal)."""
    if not text:
        return False
    low = text.lower()
    bad = ("usuário ou senha", "usuario ou senha", "senha inválida", "senha invalida",
           "credenciais inválidas", "credenciais invalidas")
    if any(b in low for b in bad):
        return False
    # qualquer resposta não-vazia sem mensagem de erro vinda do uniGUI é sucesso.
    return ("ext." in low or "_cdo_" in low or "ajaxsuccess" in low
            or low.startswith("{") or '"success":true' in low)


def login_e_captura_sid() -> tuple[str, str] | None:
    """Executa o fluxo completo de login e devolve (_S_ID, cookies). None em caso de falha."""
    s = _sess()

    # 1) GET inicial — o uniGUI já cospe o _S_ID dentro do HTML
    log.info("→ GET %s", OPP_LOGIN_PATH)
    r = s.get(OPP_BASE + OPP_LOGIN_PATH, timeout=HTTP_TIMEOUT)
    if r.status_code != 200:
        log.error("GET inicial falhou: status=%s", r.status_code)
        return None
    m = re.search(r'_S_ID=([A-Za-z0-9]+)', r.text)
    if not m:
        log.error("não achei _S_ID no HTML inicial (len=%s)", len(r.text))
        return None
    sid = m.group(1)
    log.info("   _S_ID inicial = %s…%s", sid[:4], sid[-4:])

    headers = _ajax_headers()

    def _post(seq: int, body: str, label: str) -> requests.Response | None:
        log.info("→ POST %s (seq=%s)", label, seq)
        rr = s.post(OPP_BASE + OPP_HANDLE, data=body, headers=headers, timeout=HTTP_TIMEOUT)
        if rr.status_code >= 400:
            log.error("%s falhou: status=%s len=%s", label, rr.status_code, len(rr.text))
            log.debug("body: %s", rr.text[:400])
            return None
        return rr

    # 2) cinfo — formato EXATO do navegador (ver HAR)
    #    ci=br=33;os=4;bv=146;ww=1920;wh=1080 (url-encoded)
    ci_val = up.quote("br=33;os=4;bv=146;ww=1920;wh=1080", safe="")
    cinfo = (
        f"Ajax=1&IsEvent=1&Obj=O0&Evt=cinfo"
        f"&ci={ci_val}&_S_ID={sid}&_seq_=0&_uo_=O0"
    )
    if _post(0, cinfo, "cinfo") is None:
        return None

    # 3) activate
    activate = f"Ajax=1&IsEvent=1&Obj=O0&Evt=activate&this=O0&_S_ID={sid}&_seq_=1&_uo_=O0"
    if _post(1, activate, "activate") is None:
        return None

    # 4) show
    show = f"Ajax=1&IsEvent=1&Obj=O0&Evt=show&this=O0&_S_ID={sid}&_seq_=2&_uo_=O0"
    if _post(2, show, "show") is None:
        return None

    # 5) clique no botão Entrar (O40). _fp_ no formato uniGUI:
    #    &O30=<STX>0<STX><STX>admin&O34=<STX>0<STX><STX>123
    #    O '0' antes do segundo STX é o contador de revisões (0 = primeira escrita).
    STX = "\x02"
    fp_raw = f"&O30={STX}0{STX}{STX}{OPP_USERNAME}&O34={STX}0{STX}{STX}{OPP_PASSWORD}"
    fp = up.quote(fp_raw, safe="")
    click = (
        f"Ajax=1&IsEvent=1&Obj=O40&Evt=click&this=O40"
        f"&_S_ID={sid}&_fp_={fp}&_seq_=3&_uo_=O0"
    )
    r3 = _post(3, click, "login click")
    if r3 is None:
        return None
    if not _looks_logged_in(r3.text):
        log.error("login NÃO autenticado — resposta sugere credencial inválida.")
        log.debug("body: %s", r3.text[:600])
        return None

    cookies = "; ".join(f"{c.name}={c.value}" for c in s.cookies)
    log.info("✓ login OK — sessão pronta")
    return sid, cookies


# ─────────────────────────────────────────────────────────────────────────────
# Comunicação com o Worker
# ─────────────────────────────────────────────────────────────────────────────
def manda_sessao_pro_worker(sid: str, cookies: str) -> bool:
    url = f"{WORKER_URL.rstrip('/')}/session/update?api_key={up.quote(WORKER_API_KEY)}"
    try:
        r = requests.post(url, json={"cookies": cookies, "s_id": sid},
                          headers={"Content-Type": "application/json"},
                          timeout=HTTP_TIMEOUT)
    except requests.RequestException as e:
        log.error("POST /session/update — rede: %s", e)
        return False
    if not (200 <= r.status_code < 300):
        log.error("POST /session/update — status=%s body=%s", r.status_code, r.text[:200])
        return False
    log.info("✓ Worker atualizado: %s", r.text[:200])
    return True


def sessao_atual_do_worker_ainda_vale() -> bool:
    """Heurística: pergunta ao Worker se a sessão atual ainda responde.
    Faz um lookup de CPF dummy (00000000000) e considera 'sessao_expirada' como morto."""
    try:
        r = requests.get(
            f"{WORKER_URL.rstrip('/')}/cpf",
            params={"cpf": "00000000000", "api_key": WORKER_API_KEY},
            timeout=HTTP_TIMEOUT,
        )
        if r.status_code != 200:
            return False
        body = r.json() if r.headers.get("content-type","").startswith("application/json") else {}
        # se o erro for 'sessao_expirada' ou 'sessao_ausente', precisa relogar
        err = body.get("error")
        if err in ("sessao_expirada", "sessao_ausente", "unauthorized"):
            log.info("Worker reporta sessão %s — relogar.", err)
            return False
        # qualquer outro resultado (ok=true OU cpf_nao_encontrado etc) significa
        # que a sessão tá funcionando.
        return True
    except Exception as e:
        log.warning("check de sessão falhou (%s) — vou relogar pra garantir.", e)
        return False


# ─────────────────────────────────────────────────────────────────────────────
# Loop principal
# ─────────────────────────────────────────────────────────────────────────────
def ciclo() -> bool:
    """Um ciclo: SEMPRE faz login novo e atualiza o Worker.

    A checagem 'sessao_atual_ainda_vale' foi removida porque o uniGUI às vezes
    responde 'cpf_nao_encontrado' mesmo com sessão morta, mascarando a expiração.
    Login fresco a cada 30min custa ~1s e garante que o Worker nunca sirva uma
    sessão zumbi pro frontend."""
    creds = login_e_captura_sid()
    if not creds:
        return False
    sid, cookies = creds
    return manda_sessao_pro_worker(sid, cookies)


def main() -> None:
    log.info("════════════════════════════════════════════════════════════")
    log.info("SpokenMED Agent iniciado (intervalo=%s min, worker=%s)",
             INTERVAL_MINUTES, WORKER_URL)
    log.info("Logs em: %s", _log_dir() / "agent.log")
    log.info("════════════════════════════════════════════════════════════")

    _acquire_lock()
    try:
        backoff = 60  # segundos em caso de falha
        while True:
            try:
                ok = ciclo()
            except Exception:
                log.error("erro inesperado no ciclo:\n%s", traceback.format_exc())
                ok = False

            if ok:
                sleep_s = INTERVAL_MINUTES * 60
                backoff = 60
            else:
                sleep_s = backoff
                backoff = min(backoff * 2, INTERVAL_MINUTES * 60)
                log.warning("ciclo falhou — tentando de novo em %ss (backoff)", sleep_s)

            time.sleep(sleep_s)
    except KeyboardInterrupt:
        log.info("Encerrando por Ctrl+C.")
    finally:
        _release_lock()


if __name__ == "__main__":
    main()
