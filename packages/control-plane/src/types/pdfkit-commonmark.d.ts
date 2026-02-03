declare module 'pdfkit-commonmark' {
  import PDFDocument from 'pdfkit';
  import { Node } from 'commonmark';

  class CommonmarkPDFRenderer {
    render(doc: typeof PDFDocument, parsed: Node): void;
  }
  export default CommonmarkPDFRenderer;
}
