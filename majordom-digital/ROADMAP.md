# Majordom Digital — Roadmap

> Modulul de gestiune digitală și automatizare casă din Sovereign Life OS.
> Prioritate: **3** (după Majordom Wellness)

---

## Viziune

Sistem self-hosted care înlocuiește Google Photos, Plex/Netflix, home automation cloud etc.
Controlează casa, energia, arhiva personală și biblioteca media — toate pe hardware propriu.

---

## Funcționalități planificate

### Poze personale
- [ ] Self-hosted photo management (Immich sau PhotoPrism)
- [ ] Backup automat de pe telefoane
- [ ] Căutare în poze cu AI (facial recognition, locație, obiecte)
- [ ] Organizare automată pe evenimente/persoane

### Documente & Arhivă
- [ ] Scanare și OCR documente (Paperless-ngx)
- [ ] Căutare full-text în arhiva personală
- [ ] Organizare automată pe categorii (facturi, contracte, medical, etc.)
- [ ] Acces via bot Telegram ("caută contractul de chirie")

### Control casă & Energie
- [ ] Home Assistant ca hub central
- [ ] Monitorizare consum energie (solar, grid, aparate)
- [ ] Automatizări (lumini, termostat, alarme)
- [ ] Dashboard energie integrat cu Majordom Financiar (cost real lunar)
- [ ] Integrare date sănătate din Majordom Wellness

### Bibliotecă media
- [ ] Jellyfin pentru filme și muzică self-hosted
- [ ] Organizare automată colecție
- [ ] Acces din rețea locală și remote via VPN

---

## Stack tehnic propus

| Componentă | Tehnologie | Motivație |
|---|---|---|
| Poze | Immich | Open source, mobile app bună |
| Documente | Paperless-ngx | OCR + full-text search |
| Home automation | Home Assistant | Standard industrie, open source |
| Media | Jellyfin | Open source Plex |
| Bot acces | python-telegram-bot | Consistent cu ceilalți Majordomii |
| Hardware | Proxmox + Coolify | Deja funcțional în homelab |

---

## Milestones

| Milestone | Scop | Status |
|---|---|---|
| **M0** | Home Assistant setup pe Proxmox | ⬜ |
| **M1** | Senzori energie + dashboard | ⬜ |
| **M2** | Immich — backup automat poze | ⬜ |
| **M3** | Paperless-ngx — arhivă documente | ⬜ |
| **M4** | Jellyfin — bibliotecă media | ⬜ |
| **M5** | Bot Telegram pentru căutare arhivă | ⬜ |
| **M6** | Integrare date din Financiar + Wellness | ⬜ |

---

## Note MCP (pentru viitor)

Când Majordom Digital va fi funcțional, poate fi expus ca **MCP server** pentru Claude Code:
- Claude poate căuta în arhiva de documente direct din conversație
- Claude poate citi starea casei (energie, temperatură) și face sugestii
- Necesită: server MCP custom în Python + transport stdio sau SSE

**Teren de pregătit înainte:**
1. Home Assistant cu API REST activat
2. Paperless-ngx cu token API
3. Python MCP SDK (`pip install mcp`)

---

## Integrări cu ceilalți Majordomii

- **← Financiar:** cost energie real → buget utilități actualizat automat
- **← Wellness:** date activitate fizică → afișate pe dashboard Home Assistant

---

*Creat: 2026-04-09 | Status: planificat*
