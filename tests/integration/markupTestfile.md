This is a test
============

### Disclaimer

It is _only_ a test, for __sure__. I just wanted to see if the markup renders correctly on the page, even if I use **two asterisks** for bold text, instead of *one asterisk*.[^1]

# H1
## H2
### H3
#### H4
##### H5
###### H6

This file is full of ~errors~ opportunities to ~~mess up the formatting~~ check your markup parser.

You can even learn about [[mirepoix]], [[nkbip-03]], or [[roman catholic church|catholics]]

npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z wrote this. That's the same person as this one with a nostr prefix nostr:npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z and nprofile1qydhwumn8ghj7argv4nx7un9wd6zumn0wd68yvfwvdhk6tcpr3mhxue69uhkx6rjd9ehgurfd3kzumn0wd68yvfwvdhk6tcqyr7jprhgeregx7q2j4fgjmjgy0xfm34l63pqvwyf2acsd9q0mynuzp4qva3. That is a different person from npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz.

> This is important information

> This is multiple
> lines of
> important information
> with a second[^2] footnote.
[^2]: This is a "Test" of a longer footnote-reference, placed inline, including some punctuation. 1984.

This is a youtube link 
https://www.youtube.com/watch?v=9aqVxNCpx9s

And here is a link with tracking tokens:
https://arstechnica.com/science/2019/07/new-data-may-extend-norse-occupancy-in-north-america/?fbclid=IwAR1LOW3BebaMLinfkWFtFpzkLFi48jKNF7P6DV2Ux2r3lnT6Lqj6eiiOZNU

This is an unordered list:
* but
* not
* really

This is an unordered list with nesting:
* but
  * not
    * really
* but
  * yes,
    * really
    
## More testing

An ordered list:
1. first
2. second
3. third

Let's nest that:
1. first
   2. second indented
3. third
   4. fourth indented
      5. fifth indented even more
   6. sixth under the fourth
   7. seventh under the sixth
8. eighth under the third

This is ordered and unordered mixed:
1. first
   2. second indented
3. third
   * make this a bullet point
      4. fourth indented even more
   * second bullet point

Here is a horizontal rule:

---

Try embedded a nostr note with nevent:

nostr:nevent1qvzqqqqqqypzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqydhwumn8ghj7argv4nx7un9wd6zumn0wd68yvfwvdhk6tcpr3mhxue69uhkx6rjd9ehgurfd3kzumn0wd68yvfwvdhk6tcqyrzdyycehfwyekef75z5wnnygqeps6a4qvc8dunvumzr08g06svgcptkske

Here a note with no prefix

note1cnfpxxd6t3xdk204q4r5uezqxgvxhdgrxpm0ym8xcsme6r75rzxqcj9lmz

Here with a naddr:

nostr:naddr1qvzqqqr4gupzplfq3m5v3u5r0q9f255fdeyz8nyac6lagssx8zy4wugxjs8ajf7pqydhwumn8ghj7argv4nx7un9wd6zumn0wd68yvfwvdhk6tcpr3mhxue69uhkx6rjd9ehgurfd3kzumn0wd68yvfwvdhk6tcqzasj6ar9wd6xv6tvv5kkvmmj94kkzuntv3hhwmsu0ktnz

Here's a nonsense one:

nevent123

And a nonsense one with a prefix:

nostr:naddrwhatever

And some Nostr addresses that should be preserved and have a internal link appended:

https://lumina.rocks/note/note1sd0hkhxr49jsetkcrjkvf2uls5m8frkue6f5huj8uv4964p2d8fs8dn68z

https://primal.net/e/nevent1qqsqum7j25p9z8vcyn93dsd7edx34w07eqav50qnde3vrfs466q558gdd02yr

https://primal.net/p/nprofile1qqs06gywary09qmcp2249ztwfq3ue8wxhl2yyp3c39thzp55plvj0sgjn9mdk

URL with a tracking parameter, no markup:
https://example.com?utm_source=newsletter1&utm_medium=email&utm_campaign=sale

Image without markup:
https://upload.wikimedia.org/wikipedia/commons/f/f1/Heart_coraz%C3%B3n.svg

This is an implementation of [Nostr-flavored markup](https://github.com/nostrability/nostrability/issues/146) for #gitstuff issue notes.

You can even turn Alexandria URLs into embedded events, if they have hexids or bech32 addresses:
https://next-alexandria.gitcitadel.eu/events?id=nevent1qqstjcyerjx4laxlxc70cwzuxf3u9kkzuhdhgtu8pwrzvh7k5d5zdngpzemhxue69uhhyetvv9ujumn0wd68ytnzv9hxgq3qm3xdppkd0njmrqe2ma8a6ys39zvgp5k8u22mev8xsnqp4nh80srq0ylvuw

But not if they have d-tags:
https://next-alexandria.gitcitadel.eu/publication?d=relay-test-thecitadel-by-unknown-v-1

And within a markup tag: [markup link title](https://next-alexandria.gitcitadel.com/publication?id=84ad65f7a321404f55d97c2208dd3686c41724e6c347d3ee53cfe16f67cdfb7c).

And to localhost: http://localhost:4173/publication?id=c36b54991e459221f444612d88ea94ef5bb4a1b93863ef89b1328996746f6d25

https://next-alexandria.gitcitadel.eu/events?id=nprofile1qqs99d9qw67th0wr5xh05de4s9k0wjvnkxudkgptq8yg83vtulad30gxyk5sf

You can even include code inline, like `<div class="leather min-h-full w-full flex flex-col items-center">` or

```
in a code block
```

You can even use a multi-line code block, with a json tag.

```json
{
"created_at":1745038670,"content":"# This is a test\n\nIt is _only_ a test. I just wanted to see if the *markup* renders correctly on the page, even if I use **two asterisks** for bold text.[^1]\n\nnpub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z wrote this. That's the same person as nostr:npub1l5sga6xg72phsz5422ykujprejwud075ggrr3z2hwyrfgr7eylqstegx9z. That is a different person from npub1s3ht77dq4zqnya8vjun5jp3p44pr794ru36d0ltxu65chljw8xjqd975wz.\n\n> This is important information\n\n> This is multiple\n> lines of\n> important information\n> with a second[^2] footnote.\n\n* but\n* not\n* really\n\n## More testing\n\n1. first\n2. second\n3. third\n\nHere is a horizontal rule:\n\n---\n\nThis is an implementation of [Nostr-flavored markup](github.com/nostrability/nostrability/issues/146 ) for #gitstuff issue notes.\n\nYou can even include `code inline` or\n\n```\nin a code block\n```\n\nYou can even use a \n\n```json\nmultiline of json block\n```\n\n\n![Nostr logo](https://user-images.githubusercontent.com/99301796/219900773-d6d02038-e2a0-4334-9f28-c14d40ab6fe7.png)\n\n[^1]: this is a footnote\n[^2]: so is this","tags":[["subject","test"],["alt","git repository issue: test"],["a","30617:fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1:Alexandria","","root"],["p","fd208ee8c8f283780a9552896e4823cc9dc6bfd442063889577106940fd927c1"],["t","gitstuff"]],"kind":1621,"pubkey":"dd664d5e4016433a8cd69f005ae1480804351789b59de5af06276de65633d319","id":"e78a689369511fdb3c36b990380c2d8db2b5e62f13f6b836e93ef5a09611afe8","sig":"7a2b3a6f6f61b6ea04de1fe873e46d40f2a220f02cdae004342430aa1df67647a9589459382f22576c651b3d09811546bbd79564cf472deaff032f137e94a865"
}
```

C or C++:
```cpp
bool getBit(int num, int i) {
    return ((num & (1<<i)) != 0);
}
```

Asciidoc:
```adoc
= Header 1

preamble goes here

== Header 2 

some more text
```

Gherkin:
```gherkin
Feature: Account Holder withdraws cash
 
Scenario: Account has sufficient funds
    Given The account balance is $100
      And the card is valid
      And the machine contains enough money
     When the Account Holder requests $20
     Then the ATM should dispense $20
      And the account balance should be $80
      And the card should be returned
```

Go:
```go
package main

   import (
       "fmt"
       "bufio"
       "os"
   )

   func main() {
       scanner := bufio.NewScanner(os.Stdin)
       fmt.Print("Enter text: ")
       scanner.Scan()
       input := scanner.Text()
       fmt.Println("You entered:", input)
   }
```

or even markup:

```md
A H1 Header
============

Paragraphs are separated by a blank line.

2nd paragraph. *Italic*, **bold**, and `monospace`. Itemized lists
look like:

  * this one[^some reference text]
  * that one
  * the other one

Note that --- not considering the asterisk --- the actual text
content starts at 4-columns in.

> Block quotes are
> written like so.
>
> They can span multiple paragraphs,
> if you like.
```

Test out some emojis :heart: and :trophy:

#### Here is an image![^some reference text]

![Nostr logo](https://user-images.githubusercontent.com/99301796/219900773-d6d02038-e2a0-4334-9f28-c14d40ab6fe7.png)

### I went ahead and implemented tables, too.

A neat table[^some reference text]:

| Syntax      | Description |
| ----------- | ----------- |
| Header      | Title       |
| Paragraph   | Text        |

A messy table (should render the same as above):

| Syntax | Description |
| --- | ----------- |
| Header | Title |
| Paragraph | Text |

Here is a table without a header row:

| Sometimes | you don't |
| need a | header |
| just | pipes |

[^1]: this is a footnote
[^some reference text]: this is a footnote that isn't a number