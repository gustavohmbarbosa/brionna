import { ll1Table, productions } from "../gramma";
import { Token } from "../types";
import { SemanticObserver } from "./semantic";

/* ===================== PARSER LL(1) ===================== */
export class SyntacticParser {
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