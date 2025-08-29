// analisador.ts — Parser LL(1) + Semântica dirigida por sintaxe
// Atualizações:
// - Validação semântica: break/continue só dentro de laço while.
// - Padronização de erros SEMÂNTICOS com posição (linha:coluna), semelhante ao sintático.
// - Helper semError(message, tok?) para formatar e lançar erros.
// - Todas as checagens semânticas chamam semError com o token relevante.
// - (Mantidos) modo de parâmetros formais, detecção robusta de corpos de fn/proc, avaliação de expressões, etc.

import { readFile } from "fs";
import { testCases } from "./tests/tests.ts";

function removeComments(code: string) {
  return code.replace(/\/\/.*$/gm, "");
}

const tokenSpecs: [string, RegExp][] = [
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

interface Token { value: string; type: string; position: string; }

interface SymbolEntryLegacy {
  token: Token;
  category?: "variable" | "function" | "procedure" | "parameter";
  returnType?: string;
  params?: SymbolEntryLegacy[];
  scope?: string;
}
const symbolTable: SymbolEntryLegacy[] = [];

/* ===================== LÉXICO ===================== */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = removeComments(source).split("\n");

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    let pos = 0;

    while (pos < line.length) {
      let match: string | null = null;
      let tokenType = "";

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
        console.error("> " + line);
        console.error("  " + " ".repeat(pos) + "^");
        return [];
      }

      if (tokenType !== "SKIP") {
        const position = `${lineNum + 1}:${pos + 1}`;
        console.log(`${position}  ${tokenType.padEnd(10)} ${match}`);
        const token: Token = { value: match, type: tokenType, position };
        tokens.push(token);
        if (tokenType === "ID") symbolTable.push({ token });
      }
      pos += match.length;
    }
  }
  return tokens;
}

/* ===================== GRAMÁTICA ===================== */
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
  46: ["LPAREN", "args", "RPAREN"],

  47: ["BREAK", "SEMI"],
  48: ["CONTINUE", "SEMI"],
};

/* ===================== TABELA LL(1) ===================== */
const ll1Table: Map<string, Map<string, number>> = new Map([
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

/* ===================== Semântica dirigida ===================== */
type TypeName = "int" | "bool";
type SymKind = "variable" | "function" | "procedure" | "parameter";
interface SymParam { name: string; type: TypeName; }
interface Sym {
  name: string;
  kind: SymKind;
  type?: TypeName;       // var/parâmetro
  returnType?: TypeName; // função
  params?: SymParam[];   // fn/proc
}

class Scope {
  private map = new Map<string, Sym>();
  add(sym: Sym) {
    if (this.map.has(sym.name)) throw new Error(`Erro semântico: '${sym.name}' já declarado neste escopo`);
    this.map.set(sym.name, sym);
  }
  get(n: string) { return this.map.get(n); }
}
class SymTable {
  private stack: Scope[] = [new Scope()];
  push() { this.stack.push(new Scope()); }
  pop() { this.stack.pop(); }
  add(sym: Sym) { this.stack[this.stack.length - 1].add(sym); }
  lookup(name: string): Sym | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const s = this.stack[i].get(name);
      if (s) return s;
    }
    return undefined;
  }
}

class SemanticObserver {
  private st = new SymTable();
  private currentFunc: { name: string; returnType: TypeName } | null = null;

  private declVarBuffer: { ids: string[] } | null = null;
  private declProcSig: { name: string; params: SymParam[] } | null = null;
  private declFuncSig: { name: string; ret: TypeName; params: SymParam[] } | null = null;

  private exprMode: null | { startPos: number; end: "SEMI" | "RPAREN" | "COMMA"; sink: (t: TypeName) => void } = null;
  private blockDepth = 0;

  private _tokAt: (i: number) => Token | undefined;
  private inFormalParams: null | "func" | "proc" = null;

  private loopDepth = 0;

  constructor(tokAt: (i: number) => Token | undefined) {
    this._tokAt = tokAt; // absoluto
  }

  /* ===== Helper de erro com posição padronizada ===== */
  private semError(message: string, tok?: Token): never {
    const pos = tok?.position ?? "?";
    throw new Error(`Erro semântico: ${message} na posição ${pos}`);
  }

  private beginFormalParams(kind: "func" | "proc") { this.inFormalParams = kind; }
  private endFormalParams() { this.inFormalParams = null; }

  private tokenTypeToExprType(tok: Token): TypeName {
    if (tok.type === "NUMBER") return "int";
    if (tok.type === "TRUE" || tok.type === "FALSE") return "bool";
    if (tok.type === "ID") {
      const s = this.st.lookup(tok.value);
      if (!s) this.semError(`identificador '${tok.value}' não declarado`, tok);
      if (s!.kind === "variable" || s!.kind === "parameter") return s!.type as TypeName;
      if (s!.kind === "function") return s!.returnType as TypeName;
      this.semError(`'${tok.value}' não é um valor`, tok);
    }
    this.semError(`token '${tok.type}' inválido em expressão`, tok);
  }

  private evalFunctionCallFrom(pos: number): { retType: TypeName; endPos: number } {
    const idTok = this._tokAt(pos)!;
    const calSym = this.st.lookup(idTok.value);
    if (!calSym) this.semError(`identificador '${idTok.value}' não declarado`, idTok);
    if (calSym!.kind !== "function") this.semError(`'${idTok.value}' não é função`, idTok);
    const lp = this._tokAt(pos + 1);
    if (!lp || lp.type !== "LPAREN") this.semError("chamada de função inválida (esperado '(')", this._tokAt(pos + 1));

    const params = calSym!.params ?? [];
    const argTypes: TypeName[] = [];
    let i = pos + 2; // após '('
    if (this._tokAt(i)?.type !== "RPAREN") {
      let keep = true;
      while (keep) {
        const { type, endPos } = this.evalExprTypeFrom(i, "COMMA");
        argTypes.push(type);
        i = endPos;
        if (this._tokAt(i)?.type === "COMMA") { i++; keep = true; }
        else keep = false;
      }
    }
    const rp = this._tokAt(i);
    if (!rp || rp.type !== "RPAREN") this.semError("')' esperado ao final da chamada", rp ?? this._tokAt(i - 1));

    if (params.length !== argTypes.length) {
      this.semError(
        `chamada a '${calSym!.name}' com ${argTypes.length} args; esperado ${params.length}`,
        rp
      );
    }
    for (let k = 0; k < params.length; k++) {
      if (params[k].type !== argTypes[k]) {
        this.semError(
          `argumento #${k + 1} de '${calSym!.name}' incompatível. Esperado ${params[k].type}, obtido ${argTypes[k]}`,
          this._tokAt(pos) // posição do id da função (melhor esforço)
        );
      }
    }
    return { retType: calSym!.returnType!, endPos: i + 1 };
  }

  evalExprTypeFrom(pos: number, endKind: "SEMI" | "RPAREN" | "COMMA"): { type: TypeName; endPos: number } {
    const ops: string[] = [];
    const vals: TypeName[] = [];
    const prec = (op: string) => {
      if (op === "NOT") return 4;
      if (op === "MULT" || op === "DIV" || op === "AND") return 3;
      if (op === "PLUS" || op === "MINUS" || op === "OR") return 2;
      if (op === "REL_OP") return 1;
      return 0;
    };
    const apply = (opTok: Token) => {
      const op = opTok.type;
      if (op === "NOT") {
        const a = vals.pop(); if (!a) this.semError("expressão inválida", this._tokAt(pos));
        if (a !== "bool") this.semError("'not' exige bool", this._tokAt(pos));
        vals.push("bool"); return;
      }
      const b = vals.pop(), a = vals.pop();
      if (!a || !b) this.semError("expressão inválida", this._tokAt(pos));
      if (op === "PLUS" || op === "MINUS" || op === "MULT" || op === "DIV") {
        if (a !== "int" || b !== "int") this.semError("operação aritmética exige int", this._tokAt(pos));
        vals.push("int");
      } else if (op === "AND" || op === "OR") {
        if (a !== "bool" || b !== "bool") this.semError("operação lógica exige bool", this._tokAt(pos));
        vals.push("bool");
      } else if (op === "REL_OP") {
        if (a !== b) this.semError("comparação requer lados do mesmo tipo", this._tokAt(pos));
        vals.push("bool");
      } else {
        this.semError(`operador desconhecido: ${op}`, this._tokAt(pos));
      }
    };

    let i = pos;
    const parenStack: string[] = [];

    while (true) {
      const tk = this._tokAt(i);
      if (!tk) this.semError("fim inesperado de expressão", this._tokAt(i - 1));

      const isDelim =
        (endKind === "SEMI"   && tk.type === "SEMI"   && parenStack.length === 0) ||
        (endKind === "RPAREN" && tk.type === "RPAREN" && parenStack.length === 0) ||
        (endKind === "COMMA"  && (tk.type === "COMMA" || tk.type === "RPAREN") && parenStack.length === 0);

      if (isDelim) break;

      if (tk.type === "LPAREN") { parenStack.push("("); ops.push("LPAREN"); i++; continue; }
      if (tk.type === "RPAREN") {
        while (ops.length && ops[ops.length - 1] !== "LPAREN") {
          apply({ type: ops.pop() as any, value: "", position: tk.position } as Token);
        }
        if (!ops.length) this.semError("parêntese desbalanceado", tk);
        ops.pop(); parenStack.pop(); i++; continue;
      }

      if (tk.type === "NUMBER" || tk.type === "TRUE" || tk.type === "FALSE" || tk.type === "ID") {
        if (tk.type === "ID" && this._tokAt(i + 1)?.type === "LPAREN") {
          const { retType, endPos } = this.evalFunctionCallFrom(i);
          vals.push(retType);
          i = endPos;
        } else {
          vals.push(this.tokenTypeToExprType(tk));
          i++;
        }
        continue;
      }

      if (tk.type === "NOT") {
        while (ops.length && prec(ops[ops.length - 1]) > prec("NOT")) {
          apply({ type: ops.pop() as any, value: "", position: tk.position } as Token);
        }
        ops.push("NOT"); i++; continue;
      }

      if (["PLUS","MINUS","MULT","DIV","AND","OR","REL_OP"].includes(tk.type)) {
        while (ops.length && prec(ops[ops.length - 1]) >= prec(tk.type)) {
          apply({ type: ops.pop() as any, value: "", position: tk.position } as Token);
        }
        ops.push(tk.type === "REL_OP" ? "REL_OP" : tk.type);
        i++; continue;
      }

      this.semError(`token inesperado em expressão: ${tk.type} '${tk.value}'`, tk);
    }

    while (ops.length) {
      const top = ops.pop()!;
      if (top === "LPAREN") this.semError("parêntese desbalanceado", this._tokAt(i - 1));
      apply({ type: top as any, value: "", position: this._tokAt(i - 1)?.position ?? "?" } as Token);
    }
    if (vals.length !== 1) this.semError("expressão malformada", this._tokAt(i - 1));
    return { type: vals[0], endPos: i };
  }

  // blocos/escopos
  onLBRACE() { this.blockDepth++; this.st.push(); }
  onRBRACE() { this.blockDepth--; this.st.pop(); if (this.blockDepth === 0) { this.endFNbody(); this.endPROCbody(); } }

  // controle de laços
  onWhileEnter() { this.loopDepth++; }
  onWhileExit() { if (this.loopDepth > 0) this.loopDepth--; }

  // program
  onProgramHeaderSeen() { this.st.add({ name: "main", kind: "procedure", params: [] }); }

  // decl var
  onStartDeclVars() { this.declVarBuffer = { ids: [] }; }
  addVarId(tok: Token) { this.declVarBuffer?.ids.push(tok.value); }
  onDeclVarType(tpTok: Token) {
    if (!this.declVarBuffer) return; // só efetiva se estávamos em 'let'
    const tp: TypeName = tpTok.type === "INT" ? "int" : "bool";
    for (const name of this.declVarBuffer.ids) this.st.add({ name, kind: "variable", type: tp });
    this.declVarBuffer = null;
  }

  // decl proc
  onStartProc(nameTok: Token) { this.declProcSig = { name: nameTok.value, params: [] }; }
  commitProcBeforeBody() { if (this.declProcSig) this.st.add({ name: this.declProcSig.name, kind: "procedure", params: this.declProcSig.params }); }
  endPROCbody() { this.declProcSig = null; }

  // decl func
  onStartFunc(nameTok: Token, retTok: Token) {
    const ret: TypeName = retTok.type === "INT" ? "int" : "bool";
    this.declFuncSig = { name: nameTok.value, ret, params: [] };
  }
  commitFuncBeforeBody() {
    if (this.declFuncSig) {
      this.st.add({ name: this.declFuncSig.name, kind: "function", returnType: this.declFuncSig.ret, params: this.declFuncSig.params });
      this.currentFunc = { name: this.declFuncSig.name, returnType: this.declFuncSig.ret };
    }
  }
  endFNbody() { this.currentFunc = null; this.declFuncSig = null; }

  // parâmetros formais
  onParamPiece(idTok: Token, typeTok: Token) {
    if (!this.inFormalParams) return; // evita contar "fib : int" como parâmetro
    const type: TypeName = typeTok.type === "INT" ? "int" : "bool";
    if (this.declProcSig) this.declProcSig.params.push({ name: idTok.value, type });
    if (this.declFuncSig) this.declFuncSig.params.push({ name: idTok.value, type });
  }
  injectParamsToScope() {
    const sig = this.declProcSig ?? (this.declFuncSig ? { name: this.declFuncSig.name, params: this.declFuncSig.params } : null);
    if (!sig) return;
    for (const p of sig.params) this.st.add({ name: p.name, kind: "parameter", type: p.type });
  }

  // comandos
  beginAssign(targetTok: Token, exprStartPos: number) {
    const s = this.st.lookup(targetTok.value);
    if (!s) this.semError(`identificador '${targetTok.value}' não declarado`, targetTok);
    if (s!.kind !== "variable" && s!.kind !== "parameter") this.semError(`'${targetTok.value}' não é variável`, targetTok);
    this.exprMode = {
      startPos: exprStartPos,
      end: "SEMI",
      sink: (t) => {
        const expected = s!.type as TypeName;
        if (expected !== t) this.semError(`atribuição incompatível. Esperado ${expected}, obtido ${t}`, this._tokAt(exprStartPos));
      }
    };
  }

  startIfExpr(exprStartPos: number) {
    this.exprMode = {
      startPos: exprStartPos,
      end: "RPAREN",
      sink: (t) => { if (t !== "bool") this.semError("condição do if deve ser bool", this._tokAt(exprStartPos)); }
    };
  }
  startWhileExpr(exprStartPos: number) {
    this.exprMode = {
      startPos: exprStartPos,
      end: "RPAREN",
      sink: (t) => { if (t !== "bool") this.semError("condição do while deve ser bool", this._tokAt(exprStartPos)); }
    };
  }
  onREAD(idTok: Token) {
    const s = this.st.lookup(idTok.value);
    if (!s) this.semError(`identificador '${idTok.value}' não declarado`, idTok);
    if (s!.kind !== "variable" && s!.kind !== "parameter") this.semError(`read espera variável; '${idTok.value}' não é variável`, idTok);
  }
  startWRITEexpr(exprStartPos: number) {
    this.exprMode = { startPos: exprStartPos, end: "RPAREN", sink: () => {} };
  }
  startRETURNexpr(exprStartPos: number) {
    if (!this.currentFunc) this.semError("'return' fora de função", this._tokAt(exprStartPos - 1));
    const expected = this.currentFunc!.returnType;
    this.exprMode = {
      startPos: exprStartPos,
      end: "SEMI",
      sink: (t) => {
        if (t !== expected) this.semError(`retorno incompatível em '${this.currentFunc!.name}'. Esperado ${expected}, obtido ${t}`, this._tokAt(exprStartPos));
      }
    };
  }
  startProcCallStmt(nameTok: Token) {
    const sym = this.st.lookup(nameTok.value);
    if (!sym) this.semError(`identificador '${nameTok.value}' não declarado`, nameTok);
    if (sym!.kind !== "procedure") this.semError(`'${nameTok.value}' não é procedimento`, nameTok);
  }

  onBREAK(tok: Token) {
    if (this.loopDepth <= 0) this.semError("'break' fora de laço", tok);
  }
  onCONTINUE(tok: Token) {
    if (this.loopDepth <= 0) this.semError("'continue' fora de laço", tok);
  }

  onMaybeCloseExpression(parser: { pos: number; tokens: Token[] }) {
    if (!this.exprMode) return;
    const cur = parser.tokens[parser.pos];
    const ok =
      (this.exprMode.end === "SEMI"   && cur.type === "SEMI") ||
      (this.exprMode.end === "RPAREN" && cur.type === "RPAREN");
    if (!ok) return;

    const { startPos, end, sink } = this.exprMode;
    const { type } = this.evalExprTypeFrom(startPos, end);
    sink(type);
    this.exprMode = null;
  }

  // Expostos ao Parser para controle de ( )
  public exposedBeginFormalParams(kind: "func" | "proc") { this.beginFormalParams(kind); }
  public exposedEndFormalParams() { this.endFormalParams(); }
}

/* ===================== PARSER LL(1) ===================== */
class Parser {
  public tokens: Token[];
  public pos = 0;
  public currentToken: Token;
  private stack: string[] = [];
  private sem: SemanticObserver;

  // profundidade de parênteses da lista formal (fn/proc)
  private formalDepth = 0;

  // rastreamento do tipo de bloco para saber quando sair de while
  private blockKindStack: Array<"func" | "proc" | "if" | "while" | null> = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
    this.currentToken = this.tokens[0];
    const tokAt = (i: number) => this.tokens[i]; // absoluto
    this.sem = new SemanticObserver(tokAt);
  }

  private advance() {
    this.pos++;
    if (this.pos < this.tokens.length) {
      this.currentToken = this.tokens[this.pos];
    } else {
      console.log("Fim dos tokens, definindo EOF");
      this.currentToken = { type: "$", value: "$", position: "EOF" } as any;
    }
  }

  private findMatchingRParen(startIndex: number): number | null {
    let depth = 0;
    for (let i = startIndex; i < this.tokens.length; i++) {
      const t = this.tokens[i];
      if (t.type === "LPAREN") depth++;
      if (t.type === "RPAREN") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return null;
  }

  private findOpeningLParenForBlock(pos: number): number | null {
    let i = pos - 1;
    if (this.tokens[i]?.type !== "RPAREN") return null;
    let depth = 0;
    for (; i >= 0; i--) {
      const t = this.tokens[i];
      if (t.type === "RPAREN") depth++;
      else if (t.type === "LPAREN") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return null;
  }

  private classifyHeaderBeforeLBrace(pos: number): "func" | "proc" | "if" | "while" | null {
    const lp = this.findOpeningLParenForBlock(pos);
    if (lp === null) return null;
    const before = this.tokens[lp - 1];
    if (!before) return null;

    if (before.type === "IF") return "if";
    if (before.type === "WHILE") return "while";
    if (before.type === "INT" || before.type === "BOOL") return "func";

    if (before.type === "ID") {
      for (let i = lp - 2; i >= 0; i--) {
        const tt = this.tokens[i].type;
        if (tt === "PROC") return "proc";
        if (tt === "SEMI" || tt === "LBRACE" || tt === "RBRACE" || tt === "FN") break;
      }
    }
    return null;
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
      }

      console.log(`Analisando: ${top}`);
      if (this.isTerminal(top)) {
        if (top === this.currentToken.type) {
          const tk = this.currentToken;
          const next = this.tokens[this.pos + 1];

          if (top === "FN" && next?.type === "MAIN") this.sem.onProgramHeaderSeen();
          if (top === "LET") this.sem.onStartDeclVars();

          if (top === "ID") {
            const ahead = this.tokens.slice(this.pos);
            const colonIdx = ahead.findIndex((x) => x.type === "COLON");
            const semiIdx = ahead.findIndex((x) => x.type === "SEMI");
            if (colonIdx !== -1 && (semiIdx === -1 || colonIdx < semiIdx)) {
              try { this.sem.addVarId(tk); } catch {}
            }
          }

          // tipo após ':'
          if ((top === "INT" || top === "BOOL") && this.tokens[this.pos - 1]?.type === "COLON") {
            this.sem.onDeclVarType(tk); // efetiva 'let' se for o caso

            // detectar fn id : type (...)
            const pre3 = this.tokens[this.pos - 3];       // ... FN está 3 atrás do tipo
            if (pre3?.type === "FN") {
              const nameTok = this.tokens[this.pos - 2];  // ... ID do nome da função
              if (nameTok?.type === "ID") this.sem.onStartFunc(nameTok, tk);
            }
          }

          // início de PROC
          if (top === "ID" && this.tokens[this.pos - 1]?.type === "PROC") {
            this.sem.onStartProc(tk);
          }

          // parâmetro formal: id : type  (só será aceito se inFormalParams estiver ativo)
          if (top === "ID" && next?.type === "COLON") {
            const typeTok = this.tokens[this.pos + 2];
            if (typeTok && (typeTok.type === "INT" || typeTok.type === "BOOL")) {
              this.sem.onParamPiece(tk, typeTok);
            }
          }

          // LPAREN
          if (top === "LPAREN") {
            if (this.tokens[this.pos - 1]?.type === "IF")    this.sem.startIfExpr(this.pos + 1);
            if (this.tokens[this.pos - 1]?.type === "WHILE") this.sem.startWhileExpr(this.pos + 1);
            if (this.tokens[this.pos - 1]?.type === "WRITE") this.sem.startWRITEexpr(this.pos + 1);

            // ENTRADA em parâmetros formais de PROC: "proc ID ( ... )"
            if (this.tokens[this.pos - 1]?.type === "ID" && this.tokens[this.pos - 2]?.type === "PROC") {
              if (this.formalDepth === 0) this.sem.exposedBeginFormalParams("proc");
              this.formalDepth++;
            }
            // ENTRADA em parâmetros formais de FUNC: "fn ID : (INT|BOOL) ( ... )"
            if ((this.tokens[this.pos - 1]?.type === "INT" || this.tokens[this.pos - 1]?.type === "BOOL")
                && this.tokens[this.pos - 2]?.type === "COLON"
                && this.tokens[this.pos - 3]?.type === "ID"
                && this.tokens[this.pos - 4]?.type === "FN") {
              if (this.formalDepth === 0) this.sem.exposedBeginFormalParams("func");
              this.formalDepth++;
            }
          }

          // RPAREN
          if (top === "RPAREN") {
            if (this.formalDepth > 0) {
              this.formalDepth--;
              if (this.formalDepth === 0) this.sem.exposedEndFormalParams();
            }
          }

          // abertura de bloco '{'
          if (top === "LBRACE") {
            const kind = this.classifyHeaderBeforeLBrace(this.pos);
            if (kind === "func") this.sem.commitFuncBeforeBody();
            else if (kind === "proc") this.sem.commitProcBeforeBody();

            this.sem.onLBRACE();
            this.sem.injectParamsToScope();

            // rastrear o tipo de bloco; se 'while', entra em laço
            this.blockKindStack.push(kind ?? null);
            if (kind === "while") this.sem.onWhileEnter();
          }

          if (top === "RBRACE") {
            this.sem.onRBRACE();
            const kind = this.blockKindStack.pop() ?? null;
            if (kind === "while") this.sem.onWhileExit();
          }

          // ATRIBUIÇÃO
          if (top === "ASSIGN") {
            const targetTok = this.tokens[this.pos - 1];
            if (targetTok?.type === "ID") this.sem.beginAssign(targetTok, this.pos + 1);
          }

          // RETURN
          if (top === "RETURN") this.sem.startRETURNexpr(this.pos + 1);

          // BREAK/CONTINUE (checagem semântica imediata)
          if (top === "BREAK")    this.sem.onBREAK(tk);
          if (top === "CONTINUE") this.sem.onCONTINUE(tk);

          // chamada de procedimento como comando
          if (top === "ID" && next?.type === "LPAREN") {
            const prev = this.tokens[this.pos - 1];
            const allowAsCommandAfter = ["SEMI","LBRACE","RBRACE","IF","ELSE","WHILE","READ","WRITE","RETURN","LET"];
            const isDeclHeader = prev && (prev.type === "PROC" || prev.type === "FN");
            const prevIsCmdBoundary = !prev || allowAsCommandAfter.includes(prev.type);

            const rparenPos = this.findMatchingRParen(this.pos + 1);
            const followsSemi = rparenPos !== null && this.tokens[rparenPos + 1]?.type === "SEMI";
            if (prevIsCmdBoundary && !isDeclHeader && followsSemi) this.sem.startProcCallStmt(tk);
          }

          // fechamento de expressão
          if (top === "SEMI" || top === "RPAREN") this.sem.onMaybeCloseExpression(this);

          // consumir
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
      "NOT", "OR", "AND", "RETURN", "BREAK", "CONTINUE", "REL_OP", "ASSIGN", "PLUS", "MINUS", "MULT", "DIV",
      "LPAREN", "RPAREN", "LBRACE", "RBRACE", "COLON", "SEMI", "COMMA", "NUMBER", "ID",
    ];
    return terminals.includes(symbol);
  }

  private error(message: string) {
    console.error(`Erro sintático: ${message} na posição ${this.currentToken.position}`);
  }
}

/* ===================== MAIN ===================== */
function main(code: string): void {
  const tokens = tokenize(code);
  if (tokens.length === 0) return;

  const parser = new Parser(tokens);
  if (parser.parse()) {
    console.log("\nAnálise sintática + semântica concluída com sucesso!");
  } else {
    console.error("\nErros foram encontrados na análise.");
  }
}

const [, , filePath] = process.argv;
if (!filePath) {
  console.log("RUNNING TESTS");
  for (const test of testCases) {
    console.log(`\n=== ${test.name} ===`);
    try { main(test.code); } catch (e) { console.error(String(e)); }
  }
} else {
  readFile(filePath, { encoding: "utf-8" }, (err, data) => {
    if (err) {
      console.error(`Erro ao ler ou processar o arquivo: ${err.message}`);
      process.exit(1);
    }
    console.log(`Lendo arquivo: ${filePath}\n`);
    try { main(data); } catch (e) { console.error(String(e)); process.exit(1); }
  });
}
