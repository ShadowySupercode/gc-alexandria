export interface ImageMeta {
  url: string;
  mimeType: string;
  hash: string;
  blurhash?: string;
  dimensions?: string;
  alt?: string;
}

export function extractImageMeta(tags: string[][]): ImageMeta[] {
  return tags
    .filter(tag => tag[0] === 'imeta')
    .map(tag => {
      const meta: ImageMeta = {
        url: '',
        mimeType: '',
        hash: '',
      };

      tag.forEach((item, index) => {
        if (item.startsWith('url ')) meta.url = item.substring(4);
        if (item.startsWith('m ')) meta.mimeType = item.substring(2);
        if (item.startsWith('x ')) meta.hash = item.substring(2);
        if (item.startsWith('blurhash ')) meta.blurhash = item.substring(9);
        if (item.startsWith('dim ')) meta.dimensions = item.substring(4);
        if (item.startsWith('alt ')) meta.alt = item.substring(4);
      });

      return meta;
    });
}