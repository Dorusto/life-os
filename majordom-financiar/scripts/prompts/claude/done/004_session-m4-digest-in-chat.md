# Sesiunea următoare — M4.10: Daily digest în chat

## Context

Majordom trimite zilnic un push notification cu un mesaj bundled (financial summary + vehicle alerts + import nudge etc.). Userul vrea ca acest mesaj să apară și în interfața de chat atunci când deschide aplicația — ca și cum Majordom l-ar fi trimis direct în conversație.

## Stare curentă

- `run_daily_digest()` în `notification_service.py` — rulează la ora configurată, trimite un singur push
- `notification_log` în SQLite — stochează `rule_type="daily_digest"` + payload cu `parts_count`. **Nu stochează textul efectiv al mesajului.**
- Chat-ul este stateless — frontend trimite toate mesajele la fiecare request, nu există istoric persistent în DB

## Ce trebuie implementat (M4.10)

Când userul deschide chat-ul, dacă există un digest trimis azi, acesta apare ca primul mesaj al asistentului.

Componentele probabile:
1. **Backend** — salvează `body` (textul mesajului) în `notification_log` la trimitere; endpoint `GET /api/notifications/today` returnează textul digestului de azi dacă există
2. **Frontend** — la mount-ul `Chat.tsx`, fetch `GET /api/notifications/today`; dacă există răspuns, injectează ca mesaj `role: 'assistant'` la începutul listei

## IMPORTANT — nu porni implementarea direct

**Discută mai întâi cu userul:**

1. **Viziunea UX:** cum ar trebui să arate mesajul în chat? Ca un mesaj normal de asistent? Ca un card special (tip "daily briefing")? Cu timestamp?
2. **Frecvență:** apare la fiecare deschidere a chat-ului sau doar o dată pe sesiune?
3. **Istoric:** dacă userul deschide chat-ul a doua zi, mai vede mesajul de ieri sau dispare?
4. **Alternativă de discutat:** în loc de a inject mesajul la mount, Majordom îl trimite conversațional la prima interacțiune a zilei ("Good evening! Here's your daily summary: ...") — mai natural dar mai complex
5. **Edge case:** dacă digestul nu a fost trimis ăă (Ollama down, ora nu a venit), ce vede userul?

Clarifică aceste întrebări, propune abordarea tehnică concretă bazată pe răspunsuri, și pornește implementarea doar după confirmare.

## Fișiere relevante

- `backend/services/notification_service.py` — `run_daily_digest()` + `_check_financial_summary()`
- `backend/core/memory/database.py` — `log_notification()`, `get_last_notification()`
- `frontend/src/pages/Chat.tsx` — mount + `INITIAL_MESSAGES`
- `frontend/src/lib/api.ts` — funcții API

## Următoarele în ROADMAP după M4.10

- **M4.2** — Budget alert după fiecare tranzacție (notify când categoria depășește X% din buget)
- **M4.2** e mai complex — necesită un hook sau job periodic după fiecare `add_transaction`
