export interface Token { value: string; type: string; position: string; }

export type TypeName = "int" | "bool";

export type SymKind = "variable" | "function" | "procedure" | "parameter";

export interface SymParam { name: string; type: TypeName; }

export interface Sym {
  name: string;
  kind: SymKind;
  type?: TypeName;       // var/parâmetro
  returnType?: TypeName; // função
  params?: SymParam[];   // fn/proc
}

export type TACValue = string | number | boolean;

export type TACOp =
  | "assign" | "add" | "sub" | "mul" | "div"
  | "and" | "or" | "not"
  | "cmp" // result = (arg1 relop arg2) => 0/1
  | "ifgoto" | "goto" | "label"
  | "read" | "write"
  | "param" | "call" | "ret"
  | "enter" | "leave"; // marcações de início/fim de função/procedimento

export interface TACInstr {
  op: TACOp;
  // 3-address slots
  result?: string;        // destino
  arg1?: TACValue;        // fonte 1
  arg2?: TACValue;        // fonte 2
  // extras
  relop?: "==" | "!=" | "<" | "<=" | ">" | ">=";
  label?: string;
  target?: string;        // para ifgoto/goto
  func?: string;          // nome função/procedimento
  argc?: number;          // número de parâmetros
  comment?: string;
}

export interface IfFrame {
  lTrue: string;
  lFalse: string;
  lEnd: string;
  // Para saber se ELSE foi aberto:
  hasElse: boolean;
}

export interface WhileFrame {
  lTest: string;
  lBody: string;
  lEnd: string;
}