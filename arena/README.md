# Token Arena (prototype)

A top-down team shooter where each team is a token. A Colyseus match server (`server/`) runs the whole match (movement, shooting,
hits, rounds, bots that fill empty seats); a Phaser page (`client/`) draws it and sends the player's input. Play money only: the
server never touches a wallet, and a finished match is only logged (`reportResult`) until a rules engine is connected.

    cd server && npm i && node index.js          # the match server on :2567
    cd client && npm i && npx vite --host         # the page; add ?server=ws://host:2567 to point it elsewhere
    cd server && node --test game.test.js         # the rules, bots and rounds on their own

Rules: two teams of up to 32 seats each, bots fill empty seats, 80 s rounds, first team to win two rounds takes the match.
