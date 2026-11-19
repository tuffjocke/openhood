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

## Protocol facts

Request bytes, scalings and sniffed traces from Ekaitza_Itzali, SimonRafferty's Td5 diagnostics,
TD5-Dash and discotd5.com are used as facts about the ECU's protocol, with credit in
`profiles/land-rover-td5/README.md`. No code from those projects is included.
