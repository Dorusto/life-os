# Majordom Wellness — Roadmap

> Modulul de sănătate din Sovereign Life OS.
> Prioritate: **2** (după Majordom Financiar)

---

## Viziune

Sistem self-hosted care înlocuiește Strava, MyFitnessPal, Apple Health etc.
Monitorizează și personalizează mișcarea, alimentația și sănătatea familiei.

---

## Funcționalități planificate

### Mișcare
- [ ] Sincronizare activități (alergare, ciclism, mers) via Garmin/Strava API sau import GPX
- [ ] Statistici săptămânale/lunare pe Telegram
- [ ] Obiective personalizate de mișcare (pași, km, calorii)
- [ ] Notificări motivaționale

### Alimentație
- [ ] Jurnal alimentar via Telegram (text liber → AI → macro-uri)
- [ ] Bază de date alimente cu valori nutriționale
- [ ] Planificare mese săptămânale
- [ ] Lista de cumpărături generată automat din planul de mese

### Sănătate
- [ ] Monitorizare greutate, tensiune, somn
- [ ] Integrare cu Home Assistant pentru senzori (cântar smart, etc.)
- [ ] Rapoarte periodice și tendințe
- [ ] Export date pentru medic

---

## Stack tehnic propus

| Componentă | Tehnologie | Motivație |
|---|---|---|
| Bot input | python-telegram-bot | Consistent cu Majordom Financiar |
| AI nutriție | Ollama (model local) | Offline, privat |
| Baza de date | PostgreSQL | Același server ca Financiar |
| Dashboard | Streamlit sau Grafana | De decis la implementare |
| Home Assistant | API REST | Integrare senzori fizici |

---

## Milestones

| Milestone | Scop | Status |
|---|---|---|
| **M0** | Docker setup + DB schema | ⬜ |
| **M1** | Jurnal alimentar via Telegram | ⬜ |
| **M2** | Tracking mișcare (import Garmin/GPX) | ⬜ |
| **M3** | Dashboard statistici | ⬜ |
| **M4** | Integrare Home Assistant | ⬜ |

---

## Integrări cu ceilalți Majordomii

- **← Financiar:** buget alocat alimentație → alerte dacă planul de mese depășește bugetul
- **→ Digital:** date sănătate vizibile în dashboard Home Assistant

---

*Creat: 2026-04-09 | Status: planificat*
