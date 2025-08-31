import type { IfFrame, TACInstr, TACOp, Token, WhileFrame } from "./types";

class TempGen {
  private c = 0;
  next() { this.c++; return `t${this.c}`; }
}
class LabelGen {
  private c = 0;
  next() { this.c++; return `L${this.c}`; }
}

export class TACProgram {
  instrs: TACInstr[] = [];
  toString() {
    return this.instrs.map(i => {
      if (i.op === "label") return `${i.label}:`;
      if (i.op === "goto") return `    goto ${i.target}`;
      if (i.op === "ifgoto") return `    if ${i.arg1} goto ${i.target}`;
      if (i.op === "assign") return `    ${i.result} = ${i.arg1}`;
      if (i.op === "add") return `    ${i.result} = ${i.arg1} + ${i.arg2}`;
      if (i.op === "sub") return `    ${i.result} = ${i.arg1} - ${i.arg2}`;
      if (i.op === "mul") return `    ${i.result} = ${i.arg1} * ${i.arg2}`;
      if (i.op === "div") return `    ${i.result} = ${i.arg1} / ${i.arg2}`;
      if (i.op === "and") return `    ${i.result} = ${i.arg1} and ${i.arg2}`;
      if (i.op === "or")  return `    ${i.result} = ${i.arg1} or ${i.arg2}`;
      if (i.op === "not") return `    ${i.result} = not ${i.arg1}`;
      if (i.op === "cmp") return `    ${i.result} = (${i.arg1} ${i.relop} ${i.arg2})`;
      if (i.op === "read") return `    read ${i.arg1}`;
      if (i.op === "write") return `    write ${i.arg1}`;
      if (i.op === "param") return `    param ${i.arg1}`;
      if (i.op === "call") {
        if (i.result) return `    ${i.result} = call ${i.func}, ${i.argc}`;
        return `    call ${i.func}, ${i.argc}`;
      }
      if (i.op === "ret") return `    ret ${i.arg1}`;
      if (i.op === "enter") return `\n# enter ${i.func}`;
      if (i.op === "leave") return `# leave ${i.func}\n`;
      return `    ; ${JSON.stringify(i)}`;
    }).join("\n");
  }
}

/**
 * CodegenObserver — ganchos equivalentes aos do analisador semântico.
 * Integração recomendada:
 *  - Instancie com (tokAt, getTokens, getPos).
 *  - Dispare os métodos nos mesmos lugares onde você chama o semântico.
 */
export class CodegenObserver {
  private prog = new TACProgram();
  private tmps = new TempGen();
  private labels = new LabelGen();

  // Para o parser nos indicar como ler tokens/posições
  private tokAt: (i: number) => Token | undefined;

  // Expressão corrente (a ser fechada em ';' ou ')')
  private exprMode: null | {
    startPos: number;
    end: "SEMI" | "RPAREN";
    sinkAssign?: { target: string }; // para x = expr;
    sinkWrite?: boolean;             // para write(expr)
    sinkReturn?: boolean;            // para return expr
    sinkIf?: { lTrue: string; lFalse: string };   // if (...)
    sinkWhile?: { lBody: string; lEnd: string };  // while (...)
  } = null;

  // Pilhas de controle
  private ifStack: IfFrame[] = [];
  private whileStack: WhileFrame[] = [];

  // Declarações
  private currentProcOrFunc: string | null = null;

  constructor(
    tokAt: (i: number) => Token | undefined,
  ) {
    this.tokAt = tokAt;
  }

  /* =========== API para o mundo externo =========== */
  public getProgram(): TACProgram { return this.prog; }
  public dump(): string { return this.prog.toString(); }

  /* =========== Helpers de emissão =========== */
  private emit(i: TACInstr) { this.prog.instrs.push(i); }
  private newTemp() { return this.tmps.next(); }
  private newLabel() { return this.labels.next(); }

  private err(msg: string, tok?: Token): never {
    const pos = tok?.position ?? "?";
    throw new Error(`Erro de geração de código: ${msg} na posição ${pos}`);
  }

  /* =========== EXPRESSION ENGINE (shunting-yard -> TAC) =========== */
  // Converte expressão [pos..delim) para TAC, retornando o "place" (temp ou id) e o endPos do delimitador
  private evalExprToPlace(pos: number, end: "SEMI"|"RPAREN"|"COMMA"): { place: string; endPos: number } {
    const prec = (op: string) => {
      if (op === "NOT") return 5;
      if (op === "MULT" || op === "DIV") return 4;
      if (op === "PLUS" || op === "MINUS") return 3;
      if (op === "AND" || op === "OR") return 2;
      if (op === "REL_OP") return 1;
      return 0;
    };
    const rightAssoc = (op: string) => op === "NOT";
    const ops: Token[] = [];
    const vals: string[] = [];
    const apply = (opTok: Token) => {
      const op = opTok.type;
      if (op === "NOT") {
        const a = vals.pop(); if (!a) this.err("expressão inválida", opTok);
        const t = this.newTemp();
        this.emit({ op: "not", result: t, arg1: a });
        vals.push(t);
        return;
      }
      const b = vals.pop(), a = vals.pop();
      if (!a || !b) this.err("expressão inválida", opTok);
      if (op === "PLUS" || op === "MINUS" || op === "MULT" || op === "DIV" || op === "AND" || op === "OR") {
        const t = this.newTemp();
        const map: Record<string, TACOp> = { PLUS: "add", MINUS: "sub", MULT: "mul", DIV: "div", AND: "and", OR: "or" };
        this.emit({ op: map[op], result: t, arg1: a, arg2: b });
        vals.push(t);
      } else if (op === "REL_OP") {
        // REL_OP está no token.value (==, !=, <, <=, >, >=)
        const rel = opTok.value as any;
        const t = this.newTemp();
        this.emit({ op: "cmp", result: t, arg1: a, arg2: b, relop: rel });
        vals.push(t);
      } else {
        this.err(`operador desconhecido: ${op}`, opTok);
      }
    };

    let i = pos;
    const parenStack: string[] = [];
    while (true) {
      const tk = this.tokAt(i);
      if (!tk) this.err("fim inesperado de expressão", this.tokAt(i - 1));

      const isDelim =
        (end === "SEMI"   && tk.type === "SEMI"   && parenStack.length === 0) ||
        (end === "RPAREN" && tk.type === "RPAREN" && parenStack.length === 0) ||
        (end === "COMMA"  && (tk.type === "COMMA" || tk.type === "RPAREN") && parenStack.length === 0);

      if (isDelim) break;

      if (tk.type === "LPAREN") { parenStack.push("("); ops.push(tk); i++; continue; }
      if (tk.type === "RPAREN") {
        while (ops.length && ops[ops.length - 1].type !== "LPAREN") apply(ops.pop()!);
        if (!ops.length) this.err("parêntese desbalanceado", tk);
        ops.pop(); parenStack.pop(); i++; continue;
      }

      if (tk.type === "NUMBER" || tk.type === "TRUE" || tk.type === "FALSE") {
        vals.push(tk.value);
        i++; continue;
      }

      // chamada de função: ID '(' ...
      if (tk.type === "ID" && this.tokAt(i + 1)?.type === "LPAREN") {
        const { place, endPos } = this.evalFunctionCallToPlace(i);
        vals.push(place);
        i = endPos;
        continue;
      }

      if (tk.type === "ID") { vals.push(tk.value); i++; continue; }

      if (tk.type === "NOT") {
        while (ops.length && (prec(ops[ops.length - 1].type) > prec("NOT"))) apply(ops.pop()!);
        ops.push(tk); i++; continue;
      }

      if (["PLUS","MINUS","MULT","DIV","AND","OR","REL_OP"].includes(tk.type)) {
        while (
          ops.length &&
          ops[ops.length - 1].type !== "LPAREN" &&
          (prec(ops[ops.length - 1].type) > prec(tk.type) ||
           (prec(ops[ops.length - 1].type) === prec(tk.type) && !rightAssoc(tk.type)))
        ) {
          apply(ops.pop()!);
        }
        ops.push(tk); i++; continue;
      }

      this.err(`token inesperado em expressão: ${tk.type} '${tk.value}'`, tk);
    }

    while (ops.length) {
      const top = ops.pop()!;
      if (top.type === "LPAREN") this.err("parêntese desbalanceado", this.tokAt(i - 1));
      apply(top);
    }
    if (vals.length !== 1) this.err("expressão malformada", this.tokAt(i - 1));
    return { place: vals[0], endPos: i };
  }

  // Função em expressão: gera param/param/.../call, captura retorno
  private evalFunctionCallToPlace(pos: number): { place: string; endPos: number } {
    const idTok = this.tokAt(pos)!; // ID
    const lp = this.tokAt(pos + 1)!; // '('
    if (lp.type !== "LPAREN") this.err("esperado '(' após nome de função", lp);

    let i = pos + 2; // depois de '('
    let argc = 0;
    if (this.tokAt(i)?.type !== "RPAREN") {
      // há argumentos
      let keep = true;
      while (keep) {
        const { place, endPos } = this.evalExprToPlace(i, "COMMA");
        this.emit({ op: "param", arg1: place });
        argc++;
        i = endPos;
        if (this.tokAt(i)?.type === "COMMA") { i++; keep = true; } else keep = false;
      }
    }
    const rp = this.tokAt(i);
    if (!rp || rp.type !== "RPAREN") this.err("')' esperado ao final da chamada", rp ?? this.tokAt(i - 1));

    const t = this.newTemp();
    this.emit({ op: "call", func: idTok.value, argc, result: t });
    return { place: t, endPos: i + 1 };
  }

  /* =========== Blocos/escopos (para controle de rótulos) =========== */
  onLBRACE() {
    // nada especial para código aqui; if/while amarram via stacks
  }
  onRBRACE() {
    // fechamento de IF: se não houve 'else', materializa lFalse->end
    if (this.ifStack.length) {
      const top = this.ifStack[this.ifStack.length - 1];
      if (!top.hasElse) {
        // Fechou o bloco THEN sem else:
        this.emit({ op: "label", label: top.lFalse });
        this.emit({ op: "label", label: top.lEnd });
        this.ifStack.pop();
        return;
      } else {
        // Se saímos de um bloco ELSE e chegamos aqui, já havíamos marcado end.
        // Nada a fazer neste hook.
      }
    }
    // fechamento de WHILE: quando o RBRACE for do corpo do while, voltamos ao teste e rotulamos end
    if (this.whileStack.length) {
      const top = this.whileStack[this.whileStack.length - 1];
      // heurística: RBRACE do while deve ser o mais interno loop aberto
      // Emissão do salto ao teste e rótulo de saída
      this.emit({ op: "goto", target: top.lTest });
      this.emit({ op: "label", label: top.lEnd });
      this.whileStack.pop();
      return;
    }
  }

  /* =========== Programa / Declarações =========== */
  onProgramHeaderSeen() {
    // main como procedimento (sem retorno)
    // sem "enter"/"leave" aqui; faremos quando FN main {...} abrir/fechar
  }

  onStartProc(nameTok: Token) {
    this.currentProcOrFunc = nameTok.value;
  }
  commitProcBeforeBody() {
    if (!this.currentProcOrFunc) return;
    this.emit({ op: "enter", func: this.currentProcOrFunc });
    this.emit({ op: "label", label: this.currentProcOrFunc });
  }
  endPROCbody() {
    if (!this.currentProcOrFunc) return;
    this.emit({ op: "leave", func: this.currentProcOrFunc });
    this.currentProcOrFunc = null;
  }

  onStartFunc(nameTok: Token, _retTok: Token) {
    this.currentProcOrFunc = nameTok.value;
  }
  commitFuncBeforeBody() {
    if (!this.currentProcOrFunc) return;
    this.emit({ op: "enter", func: this.currentProcOrFunc });
    this.emit({ op: "label", label: this.currentProcOrFunc });
  }
  endFNbody() {
    if (!this.currentProcOrFunc) return;
    this.emit({ op: "leave", func: this.currentProcOrFunc });
    this.currentProcOrFunc = null;
  }

  // parâmetros formais: no TAC simples não precisamos emitir nada aqui.
  onParamPiece(_idTok: Token, _typeTok: Token) {}
  injectParamsToScope() {}

  /* =========== Comandos / Construções =========== */
  // x = ...
  beginAssign(targetTok: Token, exprStartPos: number) {
    this.exprMode = { startPos: exprStartPos, end: "SEMI", sinkAssign: { target: targetTok.value } };
  }

  // read(x);
  onREAD(idTok: Token) {
    this.emit({ op: "read", arg1: idTok.value });
  }

  // write(expr)
  startWRITEexpr(exprStartPos: number) {
    this.exprMode = { startPos: exprStartPos, end: "RPAREN", sinkWrite: true };
  }

  // return expr;
  startRETURNexpr(exprStartPos: number) {
    this.exprMode = { startPos: exprStartPos, end: "SEMI", sinkReturn: true };
  }

  // chamada de procedimento em forma de comando (stmt-terminada por ';')
  startProcCallStmt(nameTok: Token) {
    // Nada ainda — a gente consome no fechamento do ')', mas como o parser
    // não chama aqui, tratamos no shunting yard quando ver ID '(' ... ')'
    // em contexto de statement. Para garantir, não fazemos nada especial.
    // (Se quiser forçar, poderíamos checar no fechamento do ';' anterior.)
    // Dica: já está coberto por evalFunctionCallToPlace para funções.
  }

  // IF ( ... ) { ... } [ else { ... } ]
  startIfExpr(exprStartPos: number) {
    // Lógicos viram 0/1; depois pulamos com ifgoto
    const lTrue = this.newLabel();
    const lFalse = this.newLabel();
    const lEnd = this.newLabel();
    this.ifStack.push({ lTrue, lFalse, lEnd, hasElse: false });
    this.exprMode = { startPos: exprStartPos, end: "RPAREN", sinkIf: { lTrue, lFalse } };
  }
  // Depois de ver o ')' do IF, o parser abre '{' e entra no bloco.
  // Nós emitimos label do THEN no momento que o '{' abrir (onLBRACE)? Já resolvemos
  // logo ao fechar a expressão (ver onMaybeCloseExpression) com um goto para lTrue/lFalse
  // e aqui apenas marcamos a entrada THEN:
  enterIfThenBlock() {
    const top = this.ifStack[this.ifStack.length - 1];
    if (!top) return;
    this.emit({ op: "label", label: top.lTrue });
  }
  // Ao encontrar "ELSE", fechou o THEN:
  beginElseBlock() {
    const top = this.ifStack[this.ifStack.length - 1];
    if (!top) return;
    // fim do THEN: pula para fim
    this.emit({ op: "goto", target: top.lEnd });
    // entra no ELSE
    this.emit({ op: "label", label: top.lFalse });
    top.hasElse = true;
  }
  // Ao terminar o ELSE (ou se não houver ELSE, fechamos no onRBRACE):
  endIfAll() {
    const top = this.ifStack.pop();
    if (!top) return;
    // Se havia ELSE, ainda precisamos marcar o fim:
    if (top.hasElse) this.emit({ op: "label", label: top.lEnd });
  }

  // WHILE ( ... ) { ... }
  startWhileExpr(exprStartPos: number) {
    const lTest = this.newLabel();
    const lBody = this.newLabel();
    const lEnd = this.newLabel();
    // Colocamos rótulo do teste imediatamente:
    this.emit({ op: "label", label: lTest });
    this.whileStack.push({ lTest, lBody, lEnd });
    this.exprMode = { startPos: exprStartPos, end: "RPAREN", sinkWhile: { lBody, lEnd } };
  }
  // Quando o corpo abre, aterrissamos no rótulo lBody
  enterWhileBody() {
    const top = this.whileStack[this.whileStack.length - 1];
    if (!top) return;
    this.emit({ op: "label", label: top.lBody });
  }
  // O fechamento do corpo (RBRACE) é tratado em onRBRACE (salta a lTest e rotula lEnd).

  /* =========== Fechamento de expressão em ';' ou ')' =========== */
  onMaybeCloseExpression(parserLike: { pos: number; tokens: Token[] }) {
    if (!this.exprMode) return;
    const cur = parserLike.tokens[parserLike.pos];
    const ok =
      (this.exprMode.end === "SEMI"   && cur.type === "SEMI") ||
      (this.exprMode.end === "RPAREN" && cur.type === "RPAREN");
    if (!ok) return;

    const { startPos, end, sinkAssign, sinkWrite, sinkReturn, sinkIf, sinkWhile } = this.exprMode;
    const { place } = this.evalExprToPlace(startPos, end);

    // materializa sinks
    if (sinkAssign) {
      this.emit({ op: "assign", result: sinkAssign.target, arg1: place });
    }
    if (sinkWrite) {
      this.emit({ op: "write", arg1: place });
    }
    if (sinkReturn) {
      this.emit({ op: "ret", arg1: place });
    }
    if (sinkIf) {
      // if (place) goto lTrue else goto lFalse
      this.emit({ op: "ifgoto", arg1: place, target: sinkIf.lTrue });
      this.emit({ op: "goto", target: sinkIf.lFalse });
      // o THEN marca label lTrue em enterIfThenBlock()
    }
    if (sinkWhile) {
      // while (place) -> if place goto lBody else goto lEnd
      this.emit({ op: "ifgoto", arg1: place, target: sinkWhile.lBody });
      this.emit({ op: "goto", target: sinkWhile.lEnd });
      // ao abrir o corpo chamamos enterWhileBody()
    }

    this.exprMode = null;
  }
}
