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
