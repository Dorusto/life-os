# Reguli pentru agentii OpenHands care lucreaza pe acest repo

- Niciodata commit sau push direct pe `main`. Inainte de orice task, sincronizeaza local (`git fetch origin && git checkout main && git pull --ff-only origin main`), apoi creeaza un branch nou dintr-un nume scurt descriptiv al task-ului (ex. `agents-md-bootstrap`, nu `fix` sau `update`).
- Mesajul de commit are intotdeauna subiect + corp explicativ (niciodata doar un titlu, un rand). Corpul explica DE CE, nu doar ce s-a schimbat.
- La final de task: push branch-ul creat (`git push -u origin <branch>`). NU deschide Pull Request singur -- Doru il deschide manual din GitHub UI cand revizuieste.
- Daca task-ul schimba ceva vizual (UI/frontend): foloseste browser_tool_set sa faci un screenshot real si verifica-l inainte sa consideri task-ul gata -- nu presupune ca arata corect doar din cod.
- Daca intalnesti o decizie de design/produs fara o alegere evidenta, ceva cu cost real (bani, timp semnificativ) sau greu de intors, sau ceva ce ar expune date in afara retelei locale -- NU decide singur, scrie explicit in raportul final ca e o intrebare deschisa pentru Doru.