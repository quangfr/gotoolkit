import DOMPurify from 'dompurify';

type SanitizeUrlOptions = {
  allowRelative?: boolean;
};

const DEFAULT_ALLOWED_SCHEMES = ['http', 'https'];

export const sanitizeUrl = (
  rawValue: unknown,
  allowedSchemes: string[] = DEFAULT_ALLOWED_SCHEMES,
  options: SanitizeUrlOptions = {}
) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';

  const normalizedSchemes = new Set(
    (Array.isArray(allowedSchemes) ? allowedSchemes : [])
      .map((scheme) => String(scheme || '').trim().toLowerCase())
      .filter(Boolean)
  );
  const allowRelative = Boolean(options.allowRelative);

  if (allowRelative && /^(?:\/(?!\/)|\.{1,2}\/|#|\?)/.test(value)) {
    return value;
  }

  const schemeMatch = value.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!schemeMatch) {
    if (allowRelative) return value;
    return '';
  }

  const scheme = String(schemeMatch[1] || '').toLowerCase();
  if (!normalizedSchemes.has(scheme)) return '';

  if (scheme === 'data') {
    const mime = value.slice(5).split(';', 1)[0].trim().toLowerCase();
    const safeDataMime =
      mime.startsWith('image/') ||
      mime.startsWith('video/');
    return safeDataMime ? value : '';
  }

  return value;
};

export const sanitizeHtml = (rawHtml: unknown) => {
  const html = String(rawHtml || '');
  if (!html) return '';

  return DOMPurify.sanitize(html, {
    ADD_TAGS: ['mermaid-diagram', 'video', 'source', 'iframe'],
    ADD_ATTR: [
      'code',
      'data-type',
      'data-fit',
      'data-file-name',
      'data-mime-type',
      'data-document-id',
      'data-collapsed',
      'playsinline',
      'preload',
      'allowfullscreen',
      'referrerpolicy',
      'allow',
      'width',
      'height',
      'class',
      'id',
    ],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  });
};
