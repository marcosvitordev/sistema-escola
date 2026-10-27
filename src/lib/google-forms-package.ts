import { unzipSync, strFromU8 } from 'fflate';
import { z } from 'zod';

export type ImportAsset = { id: string; bytes: Uint8Array<ArrayBuffer>; mimeType: 'image/png' | 'image/jpeg' };
const assetSchema = z.object({ id: z.string().uuid(), path: z.string().regex(/^imagens\/[a-f0-9-]{36}\.(png|jpe?g)$/i) });
const manifestSchema = z.object({ _aprenderAssets: z.array(assetSchema).max(200).default([]) }).passthrough();

export function readGoogleFormsPackage(bytes: Uint8Array, filename: string): { source: unknown; assets: ImportAsset[] } {
  const zip = filename.toLowerCase().endsWith('.zip');
  if (bytes.byteLength > (zip ? 30_000_000 : 5_000_000)) throw new Error(zip ? 'O pacote ZIP deve ter até 30 MB.' : 'O arquivo JSON deve ter até 5 MB.');
  let files: Record<string, Uint8Array> = {};
  let json: string;
  if (zip) {
    let total = 0; let count = 0; const seen = new Set<string>();
    files = unzipSync(bytes, { filter(file) {
      if (file.name === 'imagens/' && file.originalSize === 0) return false;
      if (seen.has(file.name)) throw new Error('O pacote contém arquivos duplicados. Exporte novamente.');
      seen.add(file.name);
      if (file.name !== 'formulario.json' && !/^imagens\/[a-f0-9-]{36}\.(png|jpe?g)$/i.test(file.name)) throw new Error('O pacote contém arquivos não reconhecidos. Use o ZIP gerado pelo exportador.');
      if (++count > 201 || file.originalSize > 5_000_000 || (total += file.originalSize) > 50_000_000) throw new Error('O pacote ultrapassa os limites de quantidade ou tamanho. Cada imagem aceita até 5 MB.');
      return true;
    } });
    if (!files['formulario.json']) throw new Error('O ZIP não contém formulario.json. Use o pacote do exportador.');
    json = strFromU8(files['formulario.json']);
  } else {
    if (!filename.toLowerCase().endsWith('.json')) throw new Error('Selecione um ZIP ou JSON do Google Forms.');
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  }
  let source: unknown;
  try { source = JSON.parse(json.replace(/^\uFEFF/, '')); } catch { throw new Error('O arquivo não contém um JSON válido. Exporte novamente.'); }
  const manifest = manifestSchema.safeParse(source);
  if (!manifest.success) throw new Error('A lista de imagens do pacote é inválida. Exporte novamente.');
  const ids = new Set<string>(); const paths = new Set<string>();
  const assets = manifest.data._aprenderAssets.map(asset => {
    if (ids.has(asset.id) || paths.has(asset.path)) throw new Error('Há referências de imagens duplicadas no pacote.');
    ids.add(asset.id); paths.add(asset.path);
    const file = files[asset.path];
    if (!file || !file.byteLength) throw new Error('Uma imagem não foi encontrada. Envie o ZIP completo, sem extrair os arquivos.');
    const png = file.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, i) => file[i] === value);
    const jpeg = file[0] === 255 && file[1] === 216 && file[2] === 255;
    if (!png && !jpeg) throw new Error('O pacote contém uma imagem inválida. São aceitas imagens PNG e JPEG.');
    return { id: asset.id, bytes: new Uint8Array(file), mimeType: png ? 'image/png' as const : 'image/jpeg' as const };
  });
  if (Object.keys(files).some(path => path !== 'formulario.json' && !paths.has(path))) throw new Error('O pacote contém imagens sem referência no formulário. Exporte novamente.');
  return { source, assets };
}
