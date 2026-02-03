declare module 'commonmark' {
  export class Parser {
    parse(input: string): Node;
  }
  export interface Node {
    // CommonMark AST node
  }
}
