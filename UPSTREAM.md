# Upstream source

This project was adapted from [Chess by Sparsh](https://github.com/sparshsam/chess-by-sparsh),
MIT licensed, at commit `ee19f22519a4afb3ec3800dac6b430e56eb8f9ab`.

The source was imported through the connected GitHub interface because direct Git network
access was unavailable in the implementation environment.

The Intercept story is vendored from
[`inkle/the-intercept`](https://github.com/inkle/the-intercept) commit
`2a816b56e61ce4bf02bec1c638074645bdd871e3`. The runtime is InkJS v2.4.0 from
[`y-lohse/inkjs`](https://github.com/y-lohse/inkjs). Their exact artifacts are
checked by `npm run story:check`; license texts are in `THIRD_PARTY_NOTICES.md`.

The Tic-Tac-Toe rules, difficulty model, minimax approach, and accessibility
patterns were adapted into the project's TypeScript game boundary from
[`MrcDprm/tic-tac-toe`](https://github.com/MrcDprm/tic-tac-toe) commit
`84ffb2e4af5128eb41e821290827a3b40a7df78c`. Its UI, analytics, and storage
implementation are not bundled. The MIT notice is in `THIRD_PARTY_NOTICES.md`.
