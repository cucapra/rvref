# The Best RISC-V Instruction Set Reference Manual

…or it will be eventually, we hope!
We're building a modern, navigable, one-page-per-instruction reference for the [RISC-V ISA][riscv] based on on [the RISC-V Unified Database (UDB)][udb].
It's a static website generated using [Eleventy][11ty].

While the official RISC-V reference materials are comprehensive, they are hard to navigate.
The details for each instruction are spread across multiple sections.
Especially in an educational context, it can be cumbersome to find *all* the information you need about any specific instruction.

The idea in this reference is to generate one page per instruction, including things like the mnemonics and assembly syntax; the instruction encoding; some natural-language documentation; and so on.

## Setup Instructions

This project uses [Node.js][node] and npm, so install those first.

Get the source code:

```bash
git clone git@github.com:cucapra/riscv.fyi.git
cd riscv.fyi
git submodule update --init
```

That last step clones [the `riscv-unified-db` repository][udb] as a submodule.
Notice that we don't use the `--recursive` flag; the UDB repository has some large submodules of its own that we don't need for this project.

Then, install the Node dependencies and build the static HTML files:

```bash
npm install
npm run build
```

Or, run a development server to preview the site:

```bash
npm run serve
```

[node]: https://nodejs.org/
[udb]: https://github.com/riscv-software-src/riscv-unified-db
[riscv]: https://riscv.org
[11ty]: https://www.11ty.dev
