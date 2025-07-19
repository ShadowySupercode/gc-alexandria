# This is a testfile for writing mathematic formulas in NostrMarkup

This document covers the rendering of formulas in TeX/LaTeX and AsciiMath notation, or some combination of those within the same page. It is meant to be rendered by clients utilizing MathJax.

If you want the entire document to be rendered as mathematics, place the entire thing in a backtick-codeblock, but know that this makes the document slower to load, it is harder to format the prose, and the result is less legible. It also doesn't increase portability, as it's easy to export markup as LaTeX files, or as PDFs, with the formulas rendered.

The general idea, is that anything placed within `single backticks` is inline code, and inline-code will all be scanned for typical mathematics statements and rendered with best-effort. (For more precise rendering, use Asciidoc.) We will not render text that is not marked as inline code, as mathematical formulas, as that is prose.

If you want the TeX to be blended into the surrounding text, wrap the text within single `$`. Otherwise, use double `$$` symbols, for display math, and it will appear on its own line.

## TeX Examples

Inline equation: `$\sqrt{x}$`

Same equation, in the display mode: `$$\sqrt{x}$$`

Something more complex, inline: `$\mathbb{N} = \{ a \in \mathbb{Z} : a > 0 \}$`

Something complex, in display mode: `$$P \left( A=2 \, \middle| \, \dfrac{A^2}{B}>4 \right)$$`

Another example of `$$\prod_{i=1}^{n} x_i - 1$$` inline formulas.

Function example:
`$$
f(x)=
\begin{cases}
1/d_{ij} & \quad \text{when $d_{ij} \leq 160$}\\
0 & \quad \text{otherwise}
\end{cases}

$$
`

And a matrix:
`
$$

M =
\begin{bmatrix}
\frac{5}{6} & \frac{1}{6} & 0 \\[0.3em]
\frac{5}{6} & 0 & \frac{1}{6} \\[0.3em]
0 & \frac{5}{6} & \frac{1}{6}
\end{bmatrix}

$$
`

LaTeX ypesetting won't be rendered. Use NostrMarkup delimeter tables for this sort of thing.

`\\begin{tabular}{|c|c|c|l|r|}
\\hline
\\multicolumn{3}{|l|}{test} & A & B \\\\
\\hline
1 & 2 & 3 & 4 & 5 \\\\
\\hline
\\end{tabular}`

We also recognize common LaTeX statements:

`\[
\begin{array}{ccccc}
1 & 2 & 3 & 4 & 5 \\
\end{array}
\]`

`\[ x^n + y^n = z^n \]`

`\sqrt{x^2+1}`

Greek letters are a snap: `$\Psi$`, `$\psi$`, `$\Phi$`, `$\phi$`.

Equations within text are easy--- A well known Maxwell thermodynamic relation is `$\left.{\partial T \over \partial P}\right|_{s} = \left.{\partial v \over \partial s}\right|_{P}$`.

You can also set aside equations like so: `\begin{eqnarray} du &=& T\ ds -P\ dv, \qquad \mbox{first law.}\label{fl}\\ ds &\ge& {\delta q \over T}.\qquad  \qquad \mbox{second law.} \label{sl} \end {eqnarray}`

## And some good ole Asciimath

Asciimath doesn't use `$` or `$$` delimiters, but we are using it to make mathy stuff easier to find. If you want it inline, include it inline. If you want it on a separate line, put a hard-return before and after.

Inline text example here `$E=mc^2$` and another `$1/(x+1)$`; very simple.

Displaying on a separate line:

`$$sum_(k=1)^n k = 1+2+ cdots +n=(n(n+1))/2$$`

`$$int_0^1 x^2 dx$$`

`$$x = (-6 +- sqrt((-6)^2 - 4 (1)(4)))/(2 xx 1)$$`

`$$|x|= {(x , if x ge 0 text(,)),(-x , if x <0.):}$$`

Displaying with wider spacing:

`$a=3, \ \ \ b=-3,\ \ $` and `$ \ \ c=2$`.

Thus `$(a+b)(c+b)=0$`.

Displaying with indentations:

Using the quadratic formula, the roots of `$x^2-6x+4=0$` are

`$$x = (-6 +- sqrt((-6)^2 - 4 (1)(4)))/(2 xx 1)$$`

`$$ \ \ = (-6 +- sqrt(36 - 16))/2$$`

`$$ \ \ =(-6 +- sqrt(20))/2$$`

`$$ \ \ = -0.8 or 2.2 \ \ \ $$` to 1 decimal place.

Advanced alignment and matrices looks like this:

A `$3xx3$` matrix, `$$((1,2,3),(4,5,6),(7,8,9))$$` and a `$2xx1$` matrix, or vector, `$$((1),(0))$$`.

The outer brackets determine the delimiters e.g. `$|(a,b),(c,d)|=ad-bc$`.

A general `$m xx n$` matrix `$$((a_(11), cdots , a_(1n)),(vdots, ddots, vdots),(a_(m1), cdots , a_(mn)))$$`

## Mixed Examples

Here are some examples mixing LaTeX and AsciiMath:

- LaTeX inline: `$\frac{1}{2}$` vs AsciiMath inline: `$1/2$`
- LaTeX display: `$$\sum_{i=1}^n x_i$$` vs AsciiMath display: `$$sum_(i=1)^n x_i$$`
- LaTeX matrix: `$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$` vs AsciiMath matrix: `$$((a,b),(c,d))$$`

## Edge Cases

- Empty math: `$$`
- Just delimiters: `$ $`
- Dollar signs in text: The price is $10.50
- Currency: `$19.99`
- Shell command: `echo "Price: $100"`
- JavaScript template: `const price = \`$${amount}\``
- CSS with dollar signs: `color: $primary-color`

This document should demonstrate that:
1. LaTeX is processed within inline code blocks with proper delimiters
2. AsciiMath is processed within inline code blocks with proper delimiters
3. Regular code blocks remain unchanged
4. Mixed content is handled correctly
5. Edge cases are handled gracefully
$$
