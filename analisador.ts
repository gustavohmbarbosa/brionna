const code = `
fn main() {
    let x: int;
    let y, z: bool;
    proc soma(a: int, b: int) {
        write(x);
    }
    if (x == 10) { // teste comment
        read(y);
    } else {
        write(z);
    }
    // teste contar linha comentário
    // teste contar linha comentário
    // z = @;  // erro proposital
}
`;

function removeComments(code) {
    return code.replace(/\/\/.*$/gm, ''); // remove // ... até o fim da linha
  }
  
const tokenSpecs = [
    // palavras-reservadas
    ['MAIN',      /\bfn main\b/],
    ['FN',        /\bfn\b/],
    ['LET',       /\blet\b/],
    ['PROC',      /\bproc\b/],
    ['INT',       /\bint\b/],
    ['BOOL',      /\bbool\b/],
    ['IF',        /\bif\b/],
    ['ELSE',      /\belse\b/],
    ['WHILE',     /\bwhile\b/],
    ['READ',      /\bread\b/],
    ['WRITE',     /\bwrite\b/],
    ['TRUE',      /\btrue\b/],
    ['FALSE',     /\bfalse\b/],
    ['NOT',       /\bnot\b/],
    ['OR',        /\bor\b/],
    ['AND',       /\band\b/],
    ['RETURN',    /\breturn\b/],

    // operadores relacionais (multi-caractere antes do simples)
    ['REL_OP',    /!=|==|<=|>=|<|>/],
    ['ASSIGN',    /=/],
  
    // operadores aritméticos
    ['PLUS',      /\+/],
    ['MINUS',     /-/],
    ['MULT',      /\*/],
    ['DIV',       /\//],
  
    // pontuação
    ['LPAREN',    /\(/],
    ['RPAREN',    /\)/],
    ['LBRACE',    /\{/],
    ['RBRACE',    /\}/],
    ['COLON',     /:/],
    ['SEMI',      /;/],
    ['COMMA',     /,/],
  
    // literais
    ['NUMBER',    /\b\d+\b/],
    ['ID',        /[a-zA-Z_]\w*\b/],    // <- corrigido
  
    // espaços
    ['SKIP',      /[ \t]+/],
  ];

interface Token {
    value: string,
    type: string,
    position: string
}

var tokens: Token[] = [];

// === Função de análise léxica ===
function tokenize(source) {
    const lines = removeComments(source).split('\n');
    const storedLines = [...lines];

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
                return;
            }

            if (tokenType !== 'SKIP') {
                let position = `${lineNum + 1}:${pos + 1}`;
                console.log(`${position}  ${tokenType.padEnd(10)} ${match}`);
                tokens.push({
                    value: match,
                    type: tokenType,
                    position: position
                });
            }

            pos += match.length;
        }
    }

    return storedLines;
}

// === Executa ===
tokenize(code);
console.log(tokens)
