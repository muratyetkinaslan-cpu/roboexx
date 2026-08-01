/**
 * Eğitmen alanı şifre koruması.
 *
 * Sabit şifre: ROBOGPT16.  (sondaki nokta olmadan "ROBOGPT16" da kabul
 * edilir; büyük/küçük harf duyarsız — sınıf ortamında yazım kolaylığı için).
 *
 * Doğrulama oturum bazlıdır (sessionStorage): tarayıcı sekmesi kapanınca
 * şifre tekrar istenir. Öğrenci rolündeki hiç kimse eğitmen alanını göremez.
 */

const TEACHER_PASSWORD_RE = /^robogpt16\.?$/i;
const SESSION_KEY = 'roboexx.teacherAuth';

/** Girilen şifre doğru mu? */
export function checkTeacherPassword(input: string): boolean {
  return TEACHER_PASSWORD_RE.test((input || '').trim());
}

/** Bu oturumda eğitmen şifresi doğrulanmış mı? */
export function isTeacherAuthed(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

/** Eğitmen doğrulamasını bu oturum için işaretle. */
export function setTeacherAuthed(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // sessionStorage yoksa (çok eski tarayıcı) sessizce geç
  }
}

/** Doğrulamayı temizle (çıkış yapınca). */
export function clearTeacherAuthed(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {}
}
