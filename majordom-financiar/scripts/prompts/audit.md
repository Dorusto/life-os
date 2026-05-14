Citește ARCHITECTURE.md și ROADMAP.md.

Fă un audit al codului actual față de principiile din ARCHITECTURE.md.
Verifică:
1. Logică de business în frontend în loc de backend
2. Date financiare în SQLite unde nu ar trebui
3. Async/sync — cod sync apelat direct în funcții async
4. Dead code — fișiere sau funcții neutilizate
5. Tool registry — starea față de target structure

Pentru fiecare problemă: fișier, linie, severitate (bug/cleanup/architectural),
ce trebuie făcut. La final, actualizează ROADMAP.md cu problemele noi găsite.

Nu implementa nimic. Răspunde în română.
