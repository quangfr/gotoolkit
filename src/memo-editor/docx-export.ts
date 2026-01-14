
import { 
  Document, 
  Packer, 
  Paragraph, 
  TextRun, 
  HeadingLevel, 
  Table, 
  TableRow, 
  TableCell, 
  VerticalAlign, 
  BorderStyle, 
  WidthType, 
  AlignmentType,
  ShadingType,
  ImageRun,
  ExternalHyperlink,
  UnderlineType
} from "docx";
import { saveAs } from "file-saver"; // I'll need to install file-saver or use Blob

/**
 * Exports Tiptap Editor content to DOCX
 */
export async function exportEditorToDocx(editor: any, title: string = "Memo") {
  const json = editor.getJSON();
  const content = json.content || [];

  const children: any[] = [];

  for (const node of content) {
    const docxNodes = await transformNode(node, editor);
    if (docxNodes) {
      if (Array.isArray(docxNodes)) {
        children.push(...docxNodes);
      } else {
        children.push(docxNodes);
      }
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

async function transformNode(node: any, editor: any): Promise<any> {
  switch (node.type) {
    case 'heading':
      return new Paragraph({
        text: node.content?.map((n: any) => n.text).join('') || '',
        heading: node.attrs.level === 1 ? HeadingLevel.HEADING_1 : 
                 node.attrs.level === 2 ? HeadingLevel.HEADING_2 : 
                 HeadingLevel.HEADING_3,
        spacing: { before: 240, after: 120 }
      });

    case 'paragraph': {
      const runs = await transformInlineContent(node.content || []);
      return new Paragraph({
        children: runs,
        spacing: { after: 120 }
      });
    }

    case 'blockquote': {
      // Handle Alerts and standard blockquotes
      const type = node.attrs?.type || 'default';
      const bgColor = getAlertColor(type);
      const isAlert = type !== 'default';
      
      const tableChildren: any[] = [];
      if (node.content) {
        for (const child of node.content) {
          const transformed = await transformNode(child, editor);
          if (transformed) tableChildren.push(transformed);
        }
      }

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: isAlert ? { fill: bgColor.replace('#', ''), type: ShadingType.CLEAR } : undefined,
                borders: {
                  left: { style: BorderStyle.SINGLE, size: 24, color: isAlert ? bgColor.replace('#', '') : "E2E8F0" },
                  top: { style: BorderStyle.NIL },
                  right: { style: BorderStyle.NIL },
                  bottom: { style: BorderStyle.NIL },
                },
                children: tableChildren,
                padding: { top: 100, bottom: 100, left: 200, right: 100 }
              })
            ]
          })
        ],
        spacing: { after: 240 }
      });
    }

    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
       const listItems: any[] = [];
       if (node.content) {
         for (const [index, item] of node.content.entries()) {
           const transformed = await transformListItem(item, node.type, index + 1, editor);
           listItems.push(...transformed);
         }
       }
       return listItems;
    }

    case 'horizontalRule':
      return new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "E2E8F0" } }
      });

    case 'templateCriteria': // Custom node sometimes used in grid/memos
      return new Paragraph({ text: "[Critères de modèle]" });

    case 'table': {
      const rows: TableRow[] = [];
      const tableContent = node.content || [];
      
      for (const rowNode of tableContent) {
        const cells: TableCell[] = [];
        for (const cellNode of rowNode.content || []) {
          const cellChildren: any[] = [];
          if (cellNode.content) {
            for (const child of cellNode.content) {
              const transformed = await transformNode(child, editor);
              if (transformed) cellChildren.push(transformed);
            }
          }
          
          const cellBg = cellNode.attrs?.backgroundColor;
          
          cells.push(new TableCell({
            children: cellChildren.length > 0 ? cellChildren : [new Paragraph("")],
            shading: cellBg ? { fill: cellBg.replace('#', ''), type: ShadingType.CLEAR } : undefined,
            verticalAlign: VerticalAlign.CENTER,
            padding: { top: 100, bottom: 100, left: 100, right: 100 }
          }));
        }
        rows.push(new TableRow({ children: cells }));
      }

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows,
        spacing: { after: 240 }
      });
    }

    case 'codeBlock': {
      const text = node.content?.map((n: any) => n.text).join('') || '';
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "1E293B", type: ShadingType.CLEAR },
                children: [
                  new Paragraph({
                    children: [new TextRun({ text, color: "E2E8F0", font: "Courier New", size: 18 })]
                  })
                ]
              })
            ]
          })
        ],
        spacing: { after: 240 }
      });
    }

    case 'mermaidDiagram': {
      // Find the SVG in the DOM
      // mermaidDiagram node usually has a unique ID or can be found by its code
      const code = node.attrs.code;
      const svgElements = document.querySelectorAll(".mermaid-svg-container svg");
      let targetSvg: SVGSVGElement | null = null;
      
      // Heuristic: try to find the one matching the code if possible, or just use the current order
      // (Better way would be to pass the SVG data in attrs, which we might want to do)
      // For now, let's try to find it by looking at the parent's data-code or similar
      for (const svg of Array.from(svgElements)) {
         // This is tricky without a direct link.
         // Let's assume we can find it.
         targetSvg = svg as SVGSVGElement;
         break; // Just take the first for now for testing
      }

      if (targetSvg) {
        try {
          const { array, width, height } = await svgToPng(targetSvg);
          
          // Limit width to roughly 450pt (Word page width)
          const maxWidth = 500;
          let scale = 1;
          if (width > maxWidth) {
            scale = maxWidth / width;
          }

          return new Paragraph({
            children: [
              new ImageRun({
                data: array,
                transformation: { 
                  width: width * scale, 
                  height: height * scale 
                },
              } as any)
            ],
            alignment: AlignmentType.CENTER
          });
        } catch (e) {
          return new Paragraph({ text: "[Erreur de rendu du diagramme]" });
        }
      }
      return new Paragraph({ text: "[Diagramme Mermaid]" });
    }

    default:
      console.log("Unhandled node type", node.type);
      return null;
  }
}

async function transformListItem(node: any, listType: string, _index: number, editor: any): Promise<any[]> {
  const children: any[] = [];
  const isTask = listType === 'taskList';
  const checked = node.attrs?.checked;

  if (node.content) {
    for (const child of node.content) {
      if (child.type === 'paragraph') {
        const runs = await transformInlineContent(child.content || []);
        if (isTask) {
          runs.unshift(new TextRun({ text: checked ? "☑ " : "☐ ", font: "MS Gothic" }));
        }
        children.push(new Paragraph({
          children: runs,
          numbering: listType === 'orderedList' ? { reference: 'main-numbering', level: 0 } : undefined,
          bullet: listType === 'bulletList' ? { level: 0 } : undefined,
        }));
      } else {
        const transformed = await transformNode(child, editor);
        if (transformed) {
            if (Array.isArray(transformed)) children.push(...transformed);
            else children.push(transformed);
        }
      }
    }
  }
  return children;
}

async function transformInlineContent(nodes: any[]): Promise<TextRun[]> {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = node.marks || [];
      const isBold = marks.some((m: any) => m.type === 'bold');
      const isItalic = marks.some((m: any) => m.type === 'italic');
      const isUnderline = marks.some((m: any) => m.type === 'underline');
      const isStrike = marks.some((m: any) => m.type === 'strike');
      const color = marks.find((m: any) => m.type === 'textStyle')?.attrs?.color;
      const highlight = marks.find((m: any) => m.type === 'highlight')?.attrs?.color;
      const isCode = marks.some((m: any) => m.type === 'code');

      runs.push(new TextRun({
        text: node.text,
        bold: isBold,
        italics: isItalic,
        underline: isUnderline ? { type: UnderlineType.SINGLE } : undefined,
        strike: isStrike,
        color: color ? color.replace('#', '') : undefined,
        highlight: highlight ? highlight.replace('#', '') : undefined,
        font: isCode ? "Courier New" : undefined,
        size: isCode ? 18 : undefined,
        shading: isCode ? { fill: "F1F5F9", type: ShadingType.CLEAR } : undefined
      }));
    } else if (node.type === 'hardBreak') {
        runs.push(new TextRun({ break: 1 }));
    }
  }
  return runs;
}

function getAlertColor(type: string): string {
  switch (type) {
    case 'NOTE': return '#3b82f6';
    case 'TIP': return '#22c55e';
    case 'IMPORTANT': return '#a855f7';
    case 'WARNING': return '#eab308';
    case 'CAUTION': return '#ef4444';
    default: return '#e2e8f0';
  }
}

async function svgToPng(svgElement: SVGSVGElement): Promise<{ array: Uint8Array, width: number, height: number }> {
  const svgData = new XMLSerializer().serializeToString(svgElement);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const img = new Image();
  
  const svgSize = svgElement.getBoundingClientRect();
  const width = svgSize.width;
  const height = svgSize.height;
  canvas.width = width * 2; // Better quality
  canvas.height = height * 2;

  return new Promise((resolve, reject) => {
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const array = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        array[i] = binary.charCodeAt(i);
      }
      resolve({ array, width, height });
    };
    img.onerror = reject;
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  });
}
