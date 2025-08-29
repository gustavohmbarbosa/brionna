export const tokenSpecs: [string, RegExp][] = [
  ["MAIN", /\bmain\b/],
  ["FN", /\bfn\b/],
  ["LET", /\blet\b/],
  ["PROC", /\bproc\b/],
  ["INT", /\bint\b/],
  ["BOOL", /\bbool\b/],
  ["IF", /\bif\b/],
  ["ELSE", /\belse\b/],
  ["WHILE", /\bwhile\b/],
  ["READ", /\bread\b/],
  ["WRITE", /\bwrite\b/],
  ["TRUE", /\btrue\b/],
  ["FALSE", /\bfalse\b/],
  ["NOT", /\bnot\b/],
  ["OR", /\bor\b/],
  ["AND", /\band\b/],
  ["RETURN", /\breturn\b/],
  ["BREAK", /\bbreak\b/],
  ["CONTINUE", /\bcontinue\b/],
  ["REL_OP", /!=|==|<=|>=|<|>/],
  ["ASSIGN", /=/],
  ["PLUS", /\+/],
  ["MINUS", /-/],
  ["MULT", /\*/],
  ["DIV", /\//],
  ["LPAREN", /\(/],
  ["RPAREN", /\)/],
  ["LBRACE", /\{/],
  ["RBRACE", /\}/],
  ["COLON", /:/],
  ["SEMI", /;/],
  ["COMMA", /,/],
  ["NUMBER", /\b\d+\b/],
  ["ID", /[a-zA-Z_]\w*\b/],
  ["SKIP", /[ \t]+/],
];

export const productions: { [key: number]: string[] } = {
  1: ["FN", "MAIN", "LPAREN", "RPAREN", "LBRACE", "stmt", "RBRACE"],
  2: ["stmt-item", "stmt'"],
  3: ["LET", "ID", "decl-var'", "COLON", "type", "SEMI"],
  4: ["COMMA", "ID"],
  5: ["INT"],
  6: ["PROC", "ID", "LPAREN", "params", "RPAREN", "LBRACE", "stmt", "RBRACE"],
  7: ["FN", "ID", "COLON", "type", "LPAREN", "params", "RPAREN", "LBRACE", "stmt", "RBRACE"],
  8: ["ID", "COLON", "type", "params'"],
  9: ["COMMA", "params"],

  10: ["ID", "command'"],
  11: ["ASSIGN", "expr", "SEMI"],
  12: ["LPAREN", "args", "RPAREN", "SEMI"],

  13: ["IF", "LPAREN", "expr", "RPAREN", "LBRACE", "stmt", "RBRACE", "condicional-else"],
  14: ["WHILE", "LPAREN", "expr", "RPAREN", "LBRACE", "stmt", "RBRACE"],
  15: ["READ", "LPAREN", "ID", "RPAREN", "SEMI"],
  16: ["WRITE", "LPAREN", "expr", "RPAREN", "SEMI"],
  17: ["RETURN", "expr", "SEMI"],

  18: ["expr-simple", "relopExpr?"],
  19: ["REL_OP", "expr-simple"],
  20: ["term", "expr-simple'"],
  21: ["PLUS", "term", "expr-simple'"],
  22: ["MINUS", "term", "expr-simple'"],
  23: ["OR", "term", "expr-simple'"],

  24: ["factor", "term'"],
  25: ["MULT", "factor", "term'"],
  26: ["DIV", "factor", "term'"],
  27: ["AND", "factor", "term'"],

  28: ["ID", "factor'"],
  29: ["NUMBER"],
  30: ["LPAREN", "expr", "RPAREN"],
  31: ["TRUE"],
  32: ["FALSE"],
  33: ["NOT", "factor"],

  34: ["stmt-item", "stmt'"],
  35: ["decl"],
  36: ["command"],
  37: ["BOOL"],
  38: ["ELSE", "LBRACE", "stmt", "RBRACE"],

  39: ["expr-simple", "expr'"],
  40: ["REL_OP", "expr-simple"],
  41: ["MINUS", "term", "expr-simple'"],
  42: ["term", "expr-simple'"],
  43: [], // ε
  44: ["expr", "args'"],
  45: ["COMMA", "expr", "args'"],
  46: ["LPAREN", "args", "RPAREN"],

  47: ["BREAK", "SEMI"],
  48: ["CONTINUE", "SEMI"],
};

/* ===================== TABELA LL(1) ===================== */
export const ll1Table: Map<string, Map<string, number>> = new Map([
  ["program", new Map([["FN", 1]])],

  ["stmt", new Map([
    ["LET", 2], ["PROC", 2], ["FN", 2],
    ["ID", 2], ["IF", 2], ["WHILE", 2],
    ["READ", 2], ["WRITE", 2], ["RETURN", 2],
    ["BREAK", 2], ["CONTINUE", 2],
    ["RBRACE", 43],
  ])],

  ["stmt'", new Map([
    ["LET", 34], ["PROC", 34], ["FN", 34],
    ["ID", 34], ["IF", 34], ["WHILE", 34],
    ["READ", 34], ["WRITE", 34], ["RETURN", 34],
    ["BREAK", 34], ["CONTINUE", 34],
    ["RBRACE", 43],
  ])],

  ["stmt-item", new Map([
    ["LET", 35], ["PROC", 35], ["FN", 35],
    ["ID", 36], ["IF", 36], ["WHILE", 36],
    ["READ", 36], ["WRITE", 36], ["RETURN", 36],
    ["BREAK", 36], ["CONTINUE", 36],
  ])],

  ["decl", new Map([["LET", 3], ["PROC", 6], ["FN", 7]])],

  ["command", new Map([
    ["ID", 10], ["IF", 13], ["WHILE", 14],
    ["READ", 15], ["WRITE", 16], ["RETURN", 17],
    ["BREAK", 47], ["CONTINUE", 48],
  ])],
  ["command'", new Map([["ASSIGN", 11], ["LPAREN", 12]])],

  ["condicional-else", new Map([
    ["ELSE", 38], ["RBRACE", 43],
    ["LET", 43], ["PROC", 43], ["FN", 43],
    ["ID", 43], ["IF", 43], ["WHILE", 43],
    ["READ", 43], ["WRITE", 43], ["RETURN", 43],
    ["BREAK", 43], ["CONTINUE", 43],
  ])],

  ["type", new Map([["INT", 5], ["BOOL", 37]])],

  ["params", new Map([["ID", 8], ["RPAREN", 43]])],
  ["params'", new Map([["COMMA", 9], ["RPAREN", 43]])],
  ["decl-var'", new Map([["COMMA", 4], ["COLON", 43]])],

  ["expr", new Map([
    ["MINUS", 39], ["ID", 39], ["NUMBER", 39],
    ["LPAREN", 39], ["TRUE", 39], ["FALSE", 39],
    ["NOT", 39],
  ])],
  ["expr'", new Map([["REL_OP", 40], ["SEMI", 43], ["RPAREN", 43], ["COMMA", 43]])],
  ["expr-simple", new Map([
    ["MINUS", 41], ["ID", 42], ["NUMBER", 42],
    ["LPAREN", 42], ["TRUE", 42], ["FALSE", 42],
    ["NOT", 42],
  ])],
  ["expr-simple'", new Map([
    ["PLUS", 21], ["MINUS", 22], ["OR", 23],
    ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
    ["COMMA", 43],
  ])],

  ["term", new Map([
    ["MINUS", 24], ["ID", 24], ["NUMBER", 24],
    ["LPAREN", 24], ["TRUE", 24], ["FALSE", 24],
    ["NOT", 24],
  ])],
  ["term'", new Map([
    ["MULT", 25], ["DIV", 26], ["AND", 27],
    ["PLUS", 43], ["MINUS", 43], ["OR", 43],
    ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
    ["COMMA", 43],
  ])],

  ["factor", new Map([
    ["ID", 28], ["NUMBER", 29], ["LPAREN", 30],
    ["TRUE", 31], ["FALSE", 32], ["NOT", 33],
  ])],
  ["factor'", new Map([
    ["LPAREN", 46],
    ["MULT", 43], ["DIV", 43], ["AND", 43],
    ["PLUS", 43], ["MINUS", 43], ["OR", 43],
    ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
    ["COMMA", 43],
  ])],

  ["args", new Map([
    ["MINUS", 44], ["ID", 44], ["NUMBER", 44],
    ["LPAREN", 44], ["TRUE", 44], ["FALSE", 44],
    ["NOT", 44], ["RPAREN", 43],
  ])],
  ["args'", new Map([["COMMA", 45], ["RPAREN", 43]])],
]);