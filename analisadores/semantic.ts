import { SymTable } from "../SymbolTable";
import { SymParam, Token, TypeName } from "../types";

export class SemanticObserver {
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