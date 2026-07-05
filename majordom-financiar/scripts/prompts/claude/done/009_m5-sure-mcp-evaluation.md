# Sesiunea următoare — M5: evaluare MCP server pentru Sure

## Context

Checklist-ul M5 din `docs/roadmap.md` ("Sure test checklist, before any integration work") are 2 puncte nebifate:
- [ ] Test budget allocation — verify parity with AB categories
- [ ] Evaluate MCP server (`github.com/we-promise/sure-mcp-server`)

Această sesiune se ocupă **doar de al doilea punct** (evaluarea MCP server-ului lui Sure) — cerut explicit de user pe 2026-07-05, ca task separat "clar pentru Claude, nu pentru DeepSeek" (evaluare arhitecturală, nu implementare well-defined). Testul de parity al bugetului rămâne un task separat, nescopat aici.

**De ce acum:** userul a confirmat 2026-07-05 că declanșatorul de migrare din `docs/decisions.md#sure-adoption` ("Portfolio tracking becomes an active need") s-a activat — vrea să-și vadă investițiile în Majordom. DAR a spus explicit că vrea să testeze **și Ghostfolio în paralel** cu Sure, și că "poate raman cu ab si ghostfolio intr-un final, nu stiu" — deci **nu e o decizie luată de migrare la Sure**, doar o evaluare care informează decizia. Nu trata această sesiune ca "hai să construim integrarea Sure" — e strict evaluare.

## Nu confunda cu #58

Există deja un issue separat, **#58 "feat: OpenClaw / external agent integration via MCP"** (M5.7 în roadmap, tier-3) — ăla e despre Majordom **expunându-și propriul** server MCP către agenți externi (OpenClaw, Claude API). Sesiunea asta e opusul: Majordom **consumând/evaluând** serverul MCP al lui Sure ca sursă externă. Nu le amesteca.

## Ce trebuie evaluat

1. Ce expune de fapt `sure-mcp-server` (`github.com/we-promise/sure-mcp-server`) — ce tool-uri/resurse oferă, ce date de portofoliu/investiții sunt accesibile prin el.
2. Are Majordom vreun beneficiu concret consumând acel server (ex. ca sursă de date pentru un viitor tool `finance__get_portfolio_status` sau similar), sau e doar arhitectură de referință utilă de citit, fără integrare directă imediată?
3. Dacă userul testează și Ghostfolio în paralel — Ghostfolio are un echivalent MCP/API relevant de comparat? (nu presupune, verifică — poate nu are, caz în care asta e un punct în favoarea Sure dacă MCP chiar aduce valoare).
4. Concluzie clară: recomandare da/nu pentru a continua evaluarea Sure spre integrare, sau semnale că Ghostfolio + AB rămâne varianta mai simplă.

## Protocol — nu uita

- Aceasta e o sesiune de **evaluare/cercetare**, nu de implementare — nu scrie cod de integrare fără o discuție de arhitectură separată și confirmare explicită a userului, chiar dacă evaluarea iese pozitivă.
- Verifică `docs/decisions.md#sure-adoption` pentru condițiile complete de migrare înainte de a trage concluzii — nu presupune că un singur punct bifat înseamnă "gata, migrăm".
- La final, actualizează checklist-ul din `docs/roadmap.md` (bifează "Evaluate MCP server" indiferent de concluzie — evaluarea s-a făcut, chiar dacă răspunsul e "nu, nu merită").
- Dacă concluzia e clar negativă sau pozitivă, adaugă o intrare nouă în `docs/decisions.md` (nu edita `#sure-adoption` direct — regulă ADR/append-only) care documentează ce s-a găsit și ce înseamnă pentru direcția AB vs. Sure vs. Ghostfolio.
- Protocol complet de final din `CLAUDE.md`: entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`. Nu închide niciun issue GitHub specific pentru asta decât dacă se deschide unul dedicat în timpul sesiunii.
