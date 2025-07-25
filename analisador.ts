import { readFile } from "fs";
import { testCases } from "./tests/tests.ts";

function removeComments(code) {
    return code.replace(/\/\/.*$/gm, ''); // remove // ... até o fim da linha
}

const tokenSpecs: [string, RegExp][] = [
    ['MAIN', /\bmain\b/],
    ['FN', /\bfn\b/],
    ['LET', /\blet\b/],
    ['PROC', /\bproc\b/],
    ['INT', /\bint\b/],
    ['BOOL', /\bbool\b/],
    ['IF', /\bif\b/],
    ['ELSE', /\belse\b/],
    ['WHILE', /\bwhile\b/],
    ['READ', /\bread\b/],
    ['WRITE', /\bwrite\b/],
    ['TRUE', /\btrue\b/],
    ['FALSE', /\bfalse\b/],
    ['NOT', /\bnot\b/],
    ['OR', /\bor\b/],
    ['AND', /\band\b/],
    ['RETURN', /\breturn\b/],

    // operadores relacionais (multi-caractere antes do simples)
    ['REL_OP', /!=|==|<=|>=|<|>/],
    ['ASSIGN', /=/],

    // operadores aritméticos
    ['PLUS', /\+/],
    ['MINUS', /-/],
    ['MULT', /\*/],
    ['DIV', /\//],

    // pontuação
    ['LPAREN', /\(/],
    ['RPAREN', /\)/],
    ['LBRACE', /\{/],
    ['RBRACE', /\}/],
    ['COLON', /:/],
    ['SEMI', /;/],
    ['COMMA', /,/],

    // literais
    ['NUMBER', /\b\d+\b/],
    ['ID', /[a-zA-Z_]\w*\b/],

    // espaços
    ['SKIP', /[ \t]+/],
];


interface Token {
    value: string,
    type: string,
    position: string
}

interface SymbolEntry {
  token: Token
  category?: "variable" | "function" | "procedure" | "parameter"
  returnType?: string
  params?: SymbolEntry[]
  scope?: string; // "global" ou nome da função/procedimento
}

const symbolTable: SymbolEntry[] = [];

// Função de análise léxica
function tokenize(source: string): Token[] {
    var tokens: Token[] = [];
    const lines = removeComments(source).split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum];
        let pos = 0;

        while (pos < line.length) {
            let match: string | null = null;
            let tokenType: string = '';

            for (const [type, regex] of tokenSpecs) {
                regex.lastIndex = 0;
                const result = regex.exec(line.slice(pos));
                if (result && result.index === 0) {
                    match = result[0];
                    tokenType = type;
                    break;
                }
            }

            if (!match) {
                const errorChar = line[pos];
                console.error(`Erro léxico na linha ${lineNum + 1}, coluna ${pos + 1}: caractere inválido "${errorChar}"`);
                console.error('> ' + line);
                console.error('  ' + ' '.repeat(pos) + '^');
                return [];
            }

            if (tokenType !== 'SKIP') {
                let position = `${lineNum + 1}:${pos + 1}`;
                console.log(`${position}  ${tokenType.padEnd(10)} ${match}`);

                const token = {
                    value: match,
                    type: tokenType,
                    position: position
                };
                tokens.push(token);
                
                if (tokenType === 'ID') {
                    symbolTable.push({
                        token: token
                    });
                }
            }

            pos += match.length;
        }
    }

    return tokens;
}

// Representa a estrutura de cada produção da gramática numerada
const productions: { [key: number]: string[] } = {
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
    46: ["LPAREN", "args", "RPAREN"]
};

// Tabela LL(1)
const ll1Table: Map<string, Map<string, number>> = new Map([
    ["program", new Map([["FN", 1]])],

    ["stmt", new Map([
        ["LET", 2], ["PROC", 2], ["FN", 2],
        ["ID", 2], ["IF", 2], ["WHILE", 2],
        ["READ", 2], ["WRITE", 2], ["RETURN", 2],
        ["RBRACE", 43]
    ])],

    ["stmt'", new Map([
        ["LET", 34], ["PROC", 34], ["FN", 34],
        ["ID", 34], ["IF", 34], ["WHILE", 34],
        ["READ", 34], ["WRITE", 34], ["RETURN", 34],
        ["RBRACE", 43]
    ])],

    ["stmt-item", new Map([
        ["LET", 35], ["PROC", 35], ["FN", 35],
        ["ID", 36], ["IF", 36], ["WHILE", 36],
        ["READ", 36], ["WRITE", 36], ["RETURN", 36]
    ])],

    ["decl", new Map([["LET", 3], ["PROC", 6], ["FN", 7]])],

    ["command", new Map([
        ["ID", 10],
        ["IF", 13],
        ["WHILE", 14],
        ["READ", 15],
        ["WRITE", 16],
        ["RETURN", 17]
    ])],
    ["command'", new Map([
        ["ASSIGN", 11],
        ["LPAREN", 12]
    ])],

    ["condicional-else", new Map([
        ["ELSE", 38], ["RBRACE", 43],
        ["LET", 43], ["PROC", 43], ["FN", 43],
        ["ID", 43], ["IF", 43], ["WHILE", 43],
        ["READ", 43], ["WRITE", 43], ["RETURN", 43],
    ])],

    ["type", new Map([["INT", 5], ["BOOL", 37]])],

    ["params", new Map([["ID", 8], ["RPAREN", 43]])],
    ["params'", new Map([["COMMA", 9], ["RPAREN", 43]])],
    ["decl-var'", new Map([["COMMA", 4], ["COLON", 43]])],

    ["expr", new Map([
        ["MINUS", 39], ["ID", 39], ["NUMBER", 39],
        ["LPAREN", 39], ["TRUE", 39], ["FALSE", 39],
        ["NOT", 39]
    ])],
    ["expr'", new Map([
        ["REL_OP", 40],
        ["SEMI", 43], ["RPAREN", 43],
        ["COMMA", 43]
    ])],
    ["expr-simple", new Map([
        ["MINUS", 41], ["ID", 42], ["NUMBER", 42],
        ["LPAREN", 42], ["TRUE", 42], ["FALSE", 42],
        ["NOT", 42]
    ])],
    ["expr-simple'", new Map([
        ["PLUS", 21], ["MINUS", 22], ["OR", 23],
        ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
        ["COMMA", 43]
    ])],

    ["term", new Map([
        ["MINUS", 24], ["ID", 24], ["NUMBER", 24],
        ["LPAREN", 24], ["TRUE", 24], ["FALSE", 24],
        ["NOT", 24]
    ])],
    ["term'", new Map([
        ["MULT", 25], ["DIV", 26], ["AND", 27],
        ["PLUS", 43], ["MINUS", 43], ["OR", 43],
        ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
        ["COMMA", 43]
    ])],

    ["factor", new Map([
        ["ID", 28], ["NUMBER", 29], ["LPAREN", 30],
        ["TRUE", 31], ["FALSE", 32], ["NOT", 33]
    ])],
    ["factor'", new Map([
        ["LPAREN", 46],
        ["MULT", 43], ["DIV", 43], ["AND", 43],
        ["PLUS", 43], ["MINUS", 43], ["OR", 43],
        ["SEMI", 43], ["RPAREN", 43], ["REL_OP", 43],
        ["COMMA", 43]
    ])],

    ["args", new Map([
        ["MINUS", 44], ["ID", 44], ["NUMBER", 44],
        ["LPAREN", 44], ["TRUE", 44], ["FALSE", 44],
        ["NOT", 44], ["RPAREN", 43]
    ])],
    ["args'", new Map([
        ["COMMA", 45],
        ["RPAREN", 43]
    ])]

]);

// Pilha de análise sintática LL(1)
class Parser {
    private tokens: Token[];
    private pos: number = 0;
    private currentToken: Token;
    private stack: string[] = [];

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.currentToken = this.tokens[0];
    }

    private advance() {
        this.pos++;
        if (this.pos < this.tokens.length) {
            this.currentToken = this.tokens[this.pos];
        } else {
            console.log("Fim dos tokens, definindo EOF");
            this.currentToken = { type: "$", value: "$", position: "EOF" };
        }
    }

    public parse(): boolean {
        this.stack.push("$");
        this.stack.push("program");

        while (this.stack.length > 0) {
            console.log("------------------");
            console.log("Pilha atual:", this.stack);
            const top = this.stack.pop();
            if (!top || top === "$") {
                console.log("Pilha vazia, finalizando análise");
                break;
            };

            console.log(`Analisando: ${top}`);
            if (this.isTerminal(top)) {
                if (top === this.currentToken.type) {
                    this.advance();
                } else {
                    this.error(`Esperado '${top}' mas encontrado '${this.currentToken.type}'`);
                    return false;
                }
            } else {
                const rule = this.getProduction(top, this.currentToken.type);
                if (!rule) {
                    this.error(`Token inesperado '${this.currentToken.type}' no contexto de '${top}'`);
                    return false;
                }
                const production = productions[rule];
                for (let i = production.length - 1; i >= 0; i--) {
                    if (production[i] !== "ε" && production[i] !== "") this.stack.push(production[i]);
                }
            }
        }

        return this.currentToken.type === "$";
    }

    private getProduction(nonTerminal: string, lookahead: string): number | undefined {
        console.log(`Analisando producao: ${nonTerminal} com lookahead: ${lookahead}`);
        return ll1Table.get(nonTerminal)?.get(lookahead);
    }

    private isTerminal(symbol: string): boolean {
        const terminals = [
            "FN", "MAIN", "LET", "PROC", "INT", "BOOL", "IF", "ELSE", "WHILE", "READ", "WRITE", "TRUE", "FALSE",
            "NOT", "OR", "AND", "RETURN", "REL_OP", "ASSIGN", "PLUS", "MINUS", "MULT", "DIV",
            "LPAREN", "RPAREN", "LBRACE", "RBRACE", "COLON", "SEMI", "COMMA", "NUMBER", "ID"
        ];
        return terminals.includes(symbol);
    }

    private error(message: string) {
        console.error(`Erro sintático: ${message} na posição ${this.currentToken.position}`);
    }
}

function main(code: string): void {
    // > gera tokens
    const tokens = tokenize(code);
    if (tokens.length === 0) {
        return;
    }

    // > roda o parser
    const parser = new Parser(tokens);
    if (parser.parse()) {
        console.log('\nAnálise sintática concluída com sucesso!');
    } else {
        console.error('\nErros foram encontrados na análise sintática.');
    }
}

const [, , filePath] = process.argv;
if (!filePath) {
    console.log("RUNNING TESTS");
    for (const test of testCases) {
        console.log(`\n=== ${test.name} ===`);
        main(test.code);
    }
} else {
    readFile(filePath, { encoding: 'utf-8' }, (err, data) => {
        if (err) {
            console.error(`Erro ao ler ou processar o arquivo: ${err.message}`);
            process.exit(1);
        }
        console.log(`Lendo arquivo: ${filePath}\n`);
        main(data);
    });
}
