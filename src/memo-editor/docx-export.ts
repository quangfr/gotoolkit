
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
  UnderlineType,
  SectionType
} from "docx";
import { saveAs } from "file-saver"; // I'll need to install file-saver or use Blob
import { ALERT_TYPES } from "./blockquote-node";

const DEFAULT_FONT = "Tahoma";
const DEFAULT_LINE_SPACING = 360; // 1.5 line height (240 * 1.5)

/**
 * Exports Tiptap Editor content to DOCX
 */
export async function exportEditorToDocx(editor: any, _title: string = "Memo") {
  const json = editor.getJSON();
  const content = json.content || [];
  const context = createDocxExportContext(editor);

  const children: any[] = [];

  for (const node of content) {
    const docxNodes = await transformNode(node, editor, context);
    if (docxNodes) {
      if (Array.isArray(docxNodes)) {
        children.push(...docxNodes);
      } else {
        children.push(docxNodes);
      }
    }
  }

  const doc = new Document({
    features: {
      updateFields: true,
    },
    footnotes: undefined,
    comments: undefined,
    styles: {
      default: {
        document: {
          run: {
            font: DEFAULT_FONT,
            size: 22, // 11pt
          },
          paragraph: {
            spacing: { line: DEFAULT_LINE_SPACING, after: 120 },
          },
        },
      },
      paragraphStyles: [
        {
          id: "Heading1",
          name: "Heading 1",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 36, // 18pt
            bold: true,
            color: "000000",
            font: DEFAULT_FONT,
          },
          paragraph: {
            spacing: { before: 240, after: 120, line: DEFAULT_LINE_SPACING },
          },
        },
        {
          id: "Heading2",
          name: "Heading 2",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 30, // 15pt
            bold: true,
            color: "000000",
            font: DEFAULT_FONT,
          },
          paragraph: {
            spacing: { before: 240, after: 120, line: DEFAULT_LINE_SPACING },
          },
        },
        {
          id: "Heading3",
          name: "Heading 3",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: {
            size: 24, // 12pt
            bold: true,
            color: "000000",
            font: DEFAULT_FONT,
          },
          paragraph: {
            spacing: { before: 240, after: 120, line: DEFAULT_LINE_SPACING },
          },
        },
      ],
    },
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
        },
        children: children,
      },
    ],
    numbering: {
      config: [
        {
          reference: "main-numbering",
          levels: [
            {
              level: 0,
              format: "decimal",
              text: "%1.",
              alignment: AlignmentType.LEFT,
              start: 1,
            },
          ],
        },
      ],
    },
  });

  const blob = await Packer.toBlob(doc);
  return blob;
}

async function transformNode(node: any, editor: any, context: any): Promise<any> {
  switch (node.type) {
    case 'heading': {
      const level = node.attrs?.level || 1;
      const runs = await transformInlineContent(node.content || [], { font: DEFAULT_FONT, color: "000000" });
      
      return new Paragraph({
        children: runs,
        heading: level === 1 ? HeadingLevel.HEADING_1 : 
                 level === 2 ? HeadingLevel.HEADING_2 : 
                 level === 3 ? HeadingLevel.HEADING_3 : 
                 level === 4 ? HeadingLevel.HEADING_4 : HeadingLevel.HEADING_5,
        spacing: { before: 240, after: 120 }
      });
    }

    case 'paragraph': {
      const runs = await transformInlineContent(node.content || []);
      return new Paragraph({
        children: runs,
        spacing: { after: 120, line: DEFAULT_LINE_SPACING }
      });
    }

    case 'blockquote': {
      // Handle Alerts and standard blockquotes
      const type = node.attrs?.type || 'default';
      const colors = getAlertColors(type);

      const emojiMap: Record<string, string> = {
        'NOTE': 'ℹ️ ',
        'TIP': '💡 ',
        'IMPORTANT': '✅ ',
        'WARNING': '⚠️ ',
        'CAUTION': '🚨 ',
        'default': '❞ '
      };
      
      const emoji = emojiMap[type] || '';
      const tableChildren: any[] = [];
      
      if (node.content) {
        for (let i = 0; i < node.content.length; i++) {
          const child = node.content[i];
          const transformed = await transformNode(child, editor, context);
          if (transformed) {
            // Prepend emoji to the first paragraph of content
            if (i === 0 && emoji && (transformed instanceof Paragraph)) {
              const children = (transformed as any).root && (transformed as any).root[1] ? (transformed as any).root[1] : [];
              if (Array.isArray(children)) {
                children.unshift(new TextRun({ text: emoji, font: DEFAULT_FONT }));
              }
            }

            if (Array.isArray(transformed)) tableChildren.push(...transformed);
            else tableChildren.push(transformed);
          }
        }
      }

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                borders: {
                  left: { style: BorderStyle.SINGLE, size: 24, color: isAlert(type) ? colors.border.replace('#', '') : "E2E8F0" },
                  top: { style: BorderStyle.NIL },
                  right: { style: BorderStyle.NIL },
                  bottom: { style: BorderStyle.NIL },
                },
                children: tableChildren,
                margins: { top: 120, bottom: 120, left: 240, right: 120 }
              })
            ]
          })
        ],
      });
    }

    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
       const listItems: any[] = [];
       if (node.content) {
         for (const [index, item] of node.content.entries()) {
           const transformed = await transformListItem(item, node.type, index + 1, editor, context);
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
              const transformed = await transformNode(child, editor, context);
              if (transformed) {
                if (Array.isArray(transformed)) cellChildren.push(...transformed);
                else cellChildren.push(transformed);
              }
            }
          }
          
          const cellBg = cellNode.attrs?.backgroundColor;
          
          cells.push(new TableCell({
            children: cellChildren.length > 0 ? cellChildren : [new Paragraph({ children: [], spacing: { line: DEFAULT_LINE_SPACING } })],
            shading: cellBg ? { fill: cellBg.replace('#', ''), type: ShadingType.CLEAR } : undefined,
            verticalAlign: VerticalAlign.CENTER,
            margins: { top: 120, bottom: 120, left: 120, right: 120 }
          }));
        }
        rows.push(new TableRow({ children: cells }));
      }

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: rows,
      });
    }

    case 'codeBlock': {
      const lines = node.content?.map((n: any) => n.text).join('') || '';
      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: "1E293B", type: ShadingType.CLEAR },
                children: lines.split('\n').map((line: string) => new Paragraph({
                  children: [new TextRun({ text: line, color: "E2E8F0", font: "Courier New", size: 18 })],
                  spacing: { line: 240, after: 0 } 
                })),
                margins: { top: 120, bottom: 120, left: 120, right: 120 }
              })
            ]
          })
        ],
      });
    }

    case 'mermaidDiagram': {
      const targetSvg = context?.mermaidSvgs?.[context.mermaidIndex++] || null;

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

    case 'image': {
      const src = String(node?.attrs?.src || '').trim();
      if (!src) return null;
      try {
        const data = await imageSourceToUint8Array(src);
        if (!data) {
          return new Paragraph({ text: "[Image indisponible]" });
        }

        const natural = await getImageNaturalSize(src);
        const fallbackWidth = natural.width || 640;
        const fallbackHeight = natural.height || 360;
        const desiredWidth = parseNodePixels(node?.attrs?.width) || fallbackWidth;
        const desiredHeight = parseNodePixels(node?.attrs?.height)
          || Math.round((fallbackHeight / Math.max(1, fallbackWidth)) * desiredWidth);

        const maxWidth = 520;
        const scale = desiredWidth > maxWidth ? (maxWidth / desiredWidth) : 1;
        const finalWidth = Math.max(80, Math.round(desiredWidth * scale));
        const finalHeight = Math.max(60, Math.round(desiredHeight * scale));

        return new Paragraph({
          children: [
            new ImageRun({
              data,
              transformation: {
                width: finalWidth,
                height: finalHeight,
              },
            } as any),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 120, after: 120 },
        });
      } catch (err) {
        return new Paragraph({ text: "[Image indisponible]" });
      }
    }

    case 'videoEmbed': {
      const src = String(node?.attrs?.src || '').trim();
      if (!src) return null;
      const title = String(node?.attrs?.title || node?.attrs?.fileName || '').trim() || 'Vidéo';
      const mimeType = String(node?.attrs?.mimeType || '').toLowerCase();
      const isMp4 = mimeType.includes('mp4') || /\.mp4([?#].*)?$/i.test(src);
      const isWebm = mimeType.includes('webm') || /\.webm([?#].*)?$/i.test(src);
      const labelSuffix = isMp4 ? 'MP4' : (isWebm ? 'WebM' : 'Vidéo');
      const label = `${title} (${labelSuffix})`;

      // Word cannot embed playable HTML5 video reliably in this export path.
      // Export as a clear hyperlink block when the source is URL-based.
      if (/^https?:\/\//i.test(src)) {
        return new Paragraph({
          children: [
            new TextRun({
              text: "▶ ",
              bold: true,
            }),
            new ExternalHyperlink({
              link: src,
              children: [
                new TextRun({
                  text: label,
                  style: "Hyperlink",
                }),
              ],
            }),
          ],
          spacing: { before: 120, after: 120, line: DEFAULT_LINE_SPACING },
        });
      }

      if (/^data:video\//i.test(src)) {
        return new Paragraph({
          children: [
            new TextRun({
              text: `▶ ${label} (fichier intégré, non exportable en média Word)`,
            }),
          ],
          spacing: { before: 120, after: 120, line: DEFAULT_LINE_SPACING },
        });
      }

      return new Paragraph({
        children: [
          new TextRun({
            text: `▶ ${label}`,
          }),
        ],
        spacing: { before: 120, after: 120, line: DEFAULT_LINE_SPACING },
      });
    }

    case 'externalVideoEmbed': {
      const src = String(node?.attrs?.src || '').trim();
      if (!src) return null;
      const provider = String(node?.attrs?.provider || '').trim().toLowerCase();
      const title = String(node?.attrs?.title || '').trim() || 'Vidéo intégrée';
      const providerLabel = provider ? provider.toUpperCase() : 'VIDEO';
      const label = `${title} (${providerLabel})`;

      return new Paragraph({
        children: [
          new TextRun({
            text: "▶ ",
            bold: true,
          }),
          new ExternalHyperlink({
            link: src,
            children: [
              new TextRun({
                text: label,
                style: "Hyperlink",
              }),
            ],
          }),
        ],
        spacing: { before: 120, after: 120, line: DEFAULT_LINE_SPACING },
      });
    }

    default:
      return null;
  }
}

async function transformListItem(node: any, listType: string, _index: number, editor: any, context: any): Promise<any[]> {
  const children: any[] = [];
  const isTask = listType === 'taskList';
  const checked = node.attrs?.checked;

  if (node.content) {
    for (const child of node.content) {
      if (child.type === 'paragraph') {
        const runs = await transformInlineContent(child.content || [], { font: DEFAULT_FONT });
        if (isTask) {
          runs.unshift(new TextRun({ text: checked ? "☑ " : "☐ ", font: "MS Gothic" }));
        }
        children.push(new Paragraph({
          children: runs,
          numbering: listType === 'orderedList' ? { reference: 'main-numbering', level: 0 } : undefined,
          bullet: listType === 'bulletList' ? { level: 0 } : undefined,
          spacing: { line: DEFAULT_LINE_SPACING }
        }));
      } else {
        const transformed = await transformNode(child, editor, context);
        if (transformed) {
            if (Array.isArray(transformed)) children.push(...transformed);
            else children.push(transformed);
        }
      }
    }
  }
  return children;
}

async function transformInlineContent(nodes: any[], defaults: { font?: string, color?: string } = {}): Promise<TextRun[]> {
  const runs: TextRun[] = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      const marks = node.marks || [];
      const isBold = marks.some((m: any) => m.type === 'bold');
      const isItalic = marks.some((m: any) => m.type === 'italic');
      const isUnderline = marks.some((m: any) => m.type === 'underline');
      const isStrike = marks.some((m: any) => m.type === 'strike');
      const color = resolveDocxColor(marks.find((m: any) => m.type === 'textStyle')?.attrs?.color);
      const highlight = resolveDocxColor(marks.find((m: any) => m.type === 'highlight')?.attrs?.color);
      const isCode = marks.some((m: any) => m.type === 'code');

      runs.push(new TextRun({
        text: node.text,
        bold: isBold,
        italics: isItalic,
        underline: isUnderline ? { type: UnderlineType.SINGLE } : undefined,
        strike: isStrike,
        color: color ? color.replace('#', '') : (defaults.color ? defaults.color.replace('#', '') : undefined),
        highlight: highlight ? highlight.replace('#', '') : undefined,
        font: isCode ? "Consolas" : (defaults.font || DEFAULT_FONT),
        size: isCode ? 18 : undefined,
        shading: isCode ? { fill: "F1F5F9", type: ShadingType.CLEAR } : undefined
      }));
    } else if (node.type === 'hardBreak') {
        runs.push(new TextRun({ break: 1 }));
    }
  }
  return runs;
}

function resolveDocxColor(raw?: string): string | undefined {
  if (!raw) return undefined;
  const normalized = raw.trim();
  if (!normalized) return undefined;
  if (normalized.startsWith('#')) {
    return normalized;
  }
  if (normalized.startsWith('var(')) {
    const name = normalized.slice(4, -1).trim();
    if (typeof document !== 'undefined') {
      const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return resolveDocxColor(value);
    }
  }
  if (normalized.startsWith('rgb')) {
    const match = normalized.match(/rgba?\(([^)]+)\)/);
    if (!match) return undefined;
    const parts = match[1].split(',').map(part => Number(part.trim()));
    if (parts.length < 3 || parts.some(part => Number.isNaN(part))) return undefined;
    return `#${parts.slice(0, 3).map(part => part.toString(16).padStart(2, '0')).join('')}`;
  }
  return undefined;
}

function isAlert(type: string): boolean {
  return type !== 'default';
}

function getAlertColors(type: string): { border: string, bg: string } {
  switch (type) {
    case 'NOTE': return { border: '#3b82f6', bg: '#eff6ff' };
    case 'TIP': return { border: '#eab308', bg: '#fefce8' }; // Yellow
    case 'IMPORTANT': return { border: '#22c55e', bg: '#f0fdf4' }; // Green
    case 'WARNING': return { border: '#eab308', bg: '#fefce8' };
    case 'CAUTION': return { border: '#ef4444', bg: '#fef2f2' };
    default: return { border: '#e2e8f0', bg: '#f8fafc' };
  }
}

function createDocxExportContext(editor: any) {
  const root: HTMLElement | null = editor?.view?.dom || null;
  const mermaidSvgs: SVGSVGElement[] = [];
  if (root) {
    const diagrams = root.querySelectorAll('mermaid-diagram');
    diagrams.forEach((diagram) => {
      const svg = diagram.querySelector('.mermaid-svg-container svg, svg');
      if (svg && svg instanceof SVGSVGElement) {
        mermaidSvgs.push(svg);
      }
    });
  }
  return {
    mermaidSvgs,
    mermaidIndex: 0,
  };
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

function parseNodePixels(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const match = text.match(/^(\d+(\.\d+)?)/);
  if (!match) return null;
  const parsed = Number.parseFloat(match[1]);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

async function imageSourceToUint8Array(src: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (err) {
    return null;
  }
}

async function getImageNaturalSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({
      width: img.naturalWidth || 0,
      height: img.naturalHeight || 0,
    });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = src;
  });
}
