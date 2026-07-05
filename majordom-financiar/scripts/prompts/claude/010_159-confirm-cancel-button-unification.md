# Sesiunea următoare — #159: unificare pattern buton Confirm/Cancel din card-urile de acțiune

## Context

Găsit în timpul auditului #143 (2026-07-05, sesiunea de cod audit). ~9-10 componente React "action card" din `frontend/src/components/` reimplementează aceeași structură de rând de butoane Confirm/Cancel (boolean de loading, două butoane, icoane `Check`/`X`, clase Tailwind aproape identice) în loc să folosească o componentă comună:

- `BalanceAdjustmentCard.tsx:56-73`
- `VehicleStatusCard.tsx:48-56`
- `GoalProposalCard.tsx:82-90`
- `AccountTransferCard.tsx:160-168`
- `BudgetRebalanceCard.tsx:115-123`
- `BudgetCopyCard.tsx:94-102`
- `CategoryActionCard.tsx:227-237`
- `ProposalCard.tsx:138-145`
- `VehicleLogActionCard.tsx:55-63`
- `VehicleReminderCard.tsx:168-176`

(Numerele de linie sunt din 2026-07-05 — verifică din nou înainte de a te baza pe ele, fișierele s-au putut schimba între timp.)

Stilizarea diferă puțin per card (culori, `whitespace-nowrap`, opacitate disabled 40 vs 50), și fiecare card are efecte de confirm/cancel diferite — deci nu e copy-paste pur, dar forma comună e reală și merită o singură componentă parametrizată.

## De ce contează

Aceeași clasă de problemă documentată în `docs/decisions.md#93-code-audit` și secțiunea "Duplication & dead-code prevention" din `CLAUDE.md`: logică/structură duplicată în 2+ locuri deviază silențios (un card primește un fix UX, celelalte nu) fără nicio eroare care să reveleze mismatch-ul.

## Ce trebuie decis (discuție de arhitectură înainte de cod)

1. **Forma componentei comune** — propunere de discutat: `ActionCardButtons` cu props `onConfirm`/`onCancel`/`loading`/`confirmLabel`/`cancelLabel` + un mecanism pentru variantele de culoare (ex. `variant: "default" | "danger" | ...` sau props explicite de culoare). Verifică întâi toate cele 10 fișiere ca să vezi exact ce variază, nu presupune din exemplul de mai sus.
2. **Migrăm toate cele 10 deodată, sau componenta nouă + migrare treptată?** Riscul: 10 fișiere de retestat vizual dintr-o dată vs. o componentă nefolosită încă de nimeni până se face migrarea completă. Prezintă trade-off-ul, nu decide unilateral.
3. Verifică dacă între timp (de la 2026-07-05) au apărut card-uri noi cu același pattern — grep rapid înainte de a începe, lista de mai sus poate fi incompletă.

## Protocol — nu uita

- **Nu începe direct implementarea.** Prezintă planul (structura componentei + strategia de migrare) în 2-3 linii, cere confirmare explicită înainte de cod — regula "Architecture trade-offs before implementation" din `CLAUDE.md`.
- Verifică `docs/architecture.md` regula 20 (helper-e comune de reutilizat) — deși regula vorbește de helper-e backend, principiul e identic pentru componente frontend.
- Testează live fiecare card modificat (`docker compose build majordom-web && docker compose up -d majordom-web`) — un card de acțiune greșit (buton care nu mai declanșează confirmarea) e un bug tăcut, nu doar cosmetic.
- Protocol complet de final din `CLAUDE.md`: self-check reguli aplicate, commit (weekend = ora reală; weekday = 18-23), `gh issue close 159 -c "..."`, entry în `docs/sessions/` săptămâna curentă + rând în `INDEX.md`.
