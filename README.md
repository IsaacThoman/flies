# apple-tv-fly

A fruit fly that lives on your Apple TV. It isn't scripted: a simulation of
the fly's whole nervous system, 166,700 neurons wired as they are in the real
animal, decides what it does from what it sees, tastes and feels. Feed it,
startle it and watch it with the remote.

This is being built. `docs/architecture.md` describes the design.

```sh
npm install
npm run brain:fetch   # the packed connectome, 38 MB, once
npm run dev           # the game in a browser
```

The wiring is the [FlyEM male CNS connectome](https://male-cns.janelia.org/)
(Janelia Research Campus, CC-BY 4.0).
