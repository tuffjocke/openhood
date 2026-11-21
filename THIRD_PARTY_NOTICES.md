# Third-party notices

Openhood is GPL-3.0. Parts of it come from, or are based on, the work below.

## discovery2-diag: Td5 fault memory map

`profiles/land-rover-td5/fault-map.ts` is ported from `src/d2diag/td5/faultmap.json` in
https://github.com/Leijoma/discovery2-diag, published under the MIT licence:

> Copyright (c) the discovery2-diag authors
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software
> and associated documentation files (the "Software"), to deal in the Software without
> restriction, including without limitation the rights to use, copy, modify, merge, publish,
> distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
> Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
> BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
> OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## td5keygen: Td5 security key algorithm

`profiles/land-rover-td5/keygen.ts` implements the algorithm from
https://github.com/pajacobson/td5keygen (BSD 2-Clause, Copyright (c) 2017, paul@discotd5.com).
It was written independently from the algorithm's description and checked against the project's
published test vector; no source was copied.

## KLineKWP1281Lib: KWP1281 protocol details, formulas and fault names

`core/kwp1281/protocol.ts` ports block titles, timings, the fault and measuring block layouts and
the measuring block formulas from https://github.com/domnulvlad/KLineKWP1281Lib (GPL-3.0, Copyright
domnulvlad), and `profiles/vw-audi-kwp1281/names.ts` is generated from its English fault code
descriptions. The library credits Blafusel.de for the protocol documentation, Alexander Grau for its
base code and Mike Naberezny for commands and parameters. GPL-3.0 is Openhood's own licence.

## kwp1281_tool: KWP1281 wake-up notes

Facts about the KWP1281 wake-up and baud rate detection in `core/link/kwp1281.ts` are from
https://github.com/mnaberez/vwradio (BSD 3-Clause, Copyright (c) 2016-2023, Mike Naberezny and
contributors). No code from it is included.

## Protocol facts

Volvo keyword D3 B0 bytes, module addresses and the raw-to-Volvo fault code tables in
`profiles/volvo-850/` are facts from jonesrh.info (and a copy of its code list on stonis-world.com),
which give no licence. No code or text from them is included; see `profiles/volvo-850/README.md`.

Request bytes, scalings and sniffed traces from Ekaitza_Itzali, SimonRafferty's Td5 diagnostics,
TD5-Dash and discotd5.com are used as facts about the ECU's protocol, with credit in
`profiles/land-rover-td5/README.md`. No code from those projects is included.
