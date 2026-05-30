/**
 * RoboExx proje tipi.
 *
 * `filename` alanı dosya sistemi tarafından kullanılır:
 * - İlk kayıtta proje adından sanitize edilerek üretilir, ID ile çakışma engellenir
 * - Sonraki kayıtlarda aynı dosyanın üstüne yazılır
 * - Yeniden adlandırma şu anda desteklenmiyor (gelecek özelliği)
 */
export interface Project {
  id: string;
  name: string;
  filename?: string; // dosya adı (uzantısız, sanitize edilmiş)
  mode: 'blocks' | 'code';
  blocksState: object | null;
  code: string | null;
  createdAt: number;
  updatedAt: number;
}
